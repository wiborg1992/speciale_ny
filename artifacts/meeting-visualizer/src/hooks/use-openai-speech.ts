import { useState, useRef, useCallback, useEffect } from "react";

const PCM16_PROCESSOR_CODE = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._phase = 0;
    this._lastSample = 0;
    this._accumulated = [];
    // Send ~100ms chunks: 24000 samples/sec * 0.1 sec = 2400 samples
    this._sendEvery = 2400;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    // Downsample from native sampleRate to 24kHz via linear interpolation
    const step = sampleRate / 24000;
    while (this._phase < input.length) {
      const i = Math.floor(this._phase);
      const frac = this._phase - i;
      const a = i > 0 ? input[i - 1] : this._lastSample;
      const b = input[Math.min(i, input.length - 1)];
      const s = a + frac * (b - a);
      this._accumulated.push(
        Math.round(Math.max(-1, Math.min(1, s)) * 32767)
      );
      this._phase += step;
    }
    this._phase -= input.length;
    this._lastSample = input[input.length - 1];

    if (this._accumulated.length >= this._sendEvery) {
      const chunk = this._accumulated.splice(0, this._sendEvery);
      const int16 = new Int16Array(chunk);
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm16-downsampler", PCM16Processor);
`;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface UseOpenAISpeechProps {
  onSegmentFinalized: (text: string, speakerLabel?: string, latencyMs?: number) => void;
  language?: string;
  prompt?: string;
}

const FILLER_PATTERNS = /\b(øh+|uhm+|hmm+|uh+|nå+h?|umm+|ahh+|huh)\b/gi;

function cleanTranscript(raw: string): string {
  return raw.replace(FILLER_PATTERNS, " ").replace(/\s{2,}/g, " ").trim();
}

export function useOpenAISpeech({
  onSegmentFinalized,
  language = "da",
  prompt = "",
}: UseOpenAISpeechProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);

  const onSegmentFinalizedRef = useRef(onSegmentFinalized);
  useEffect(() => { onSegmentFinalizedRef.current = onSegmentFinalized; }, [onSegmentFinalized]);

  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  const promptRef = useRef(prompt);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  const cleanup = useCallback(() => {
    isRecordingRef.current = false;

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "User stopped");
      }
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    speechStartedAtRef.current = null;
    setIsRecording(false);
    setInterimText("");
  }, []);

  const stopRecording = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch ephemeral OpenAI client secret
      const tokenRes = await fetch("/api/openai-realtime-token");
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Could not fetch OpenAI Realtime token");
      }
      const tokenData = (await tokenRes.json()) as {
        clientSecret: string;
        expiresAt?: number;
        model?: string;
      };
      const { clientSecret } = tokenData;
      // Use the model the backend actually created the session with (keeps both in sync)
      const backendModel = tokenData.model || "gpt-4o-realtime-preview";

      if (!isRecordingRef.current) return; // stopped before token returned

      // 2. Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      if (!isRecordingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // 3. Create AudioContext + AudioWorklet for PCM16 at 24kHz
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const blob = new Blob([PCM16_PROCESSOR_CODE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      await audioCtx.audioWorklet.addModule(blobUrl);

      if (!isRecordingRef.current) { cleanup(); return; }

      const source = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, "pcm16-downsampler");
      workletNodeRef.current = workletNode;

      // Silencer: connect worklet to gain=0 so it runs without speaker feedback
      const silencer = audioCtx.createGain();
      silencer.gain.value = 0;
      source.connect(workletNode);
      workletNode.connect(silencer);
      silencer.connect(audioCtx.destination);

      // 4. Open WebSocket to OpenAI Realtime API with ephemeral key
      // backendModel comes from the token response — matches the session the backend created.
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${backendModel}`;
      const ws = new WebSocket(wsUrl, [
        "realtime",
        `openai-insecure-api-key.${clientSecret}`,
        "openai-beta.realtime-v1",
      ]);
      wsRef.current = ws;

      workletNode.port.onmessage = (e: MessageEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: toBase64(e.data as ArrayBuffer),
            })
          );
        }
      };

      ws.onopen = () => {
        if (!isRecordingRef.current) { ws.close(); return; }
        console.info("[openai-realtime] Connected — sending session.update");

        // OpenAI Realtime API caps input_audio_transcription.prompt at 1024 chars.
        const rawPrompt = promptRef.current ?? "";
        const prompt = rawPrompt.length > 1024 ? rawPrompt.slice(0, 1021) + "..." : rawPrompt;
        if (rawPrompt.length > 1024) {
          console.warn(`[openai-realtime] prompt truncated ${rawPrompt.length} → 1024 chars`);
        }

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text"],
              input_audio_format: "pcm16",
              input_audio_transcription: {
                model: "gpt-4o-transcribe",
                language: languageRef.current,
                ...(prompt ? { prompt } : {}),
              },
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 700,
                threshold: 0.5,
                prefix_padding_ms: 300,
                create_response: false,
              },
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          const msgType = msg.type as string;

          if (msgType === "input_audio_buffer.speech_started") {
            speechStartedAtRef.current = Date.now();
            setInterimText("...");
          } else if (msgType === "input_audio_buffer.speech_stopped") {
            // keep interim text until transcript arrives
          } else if (msgType === "conversation.item.input_audio_transcription.delta") {
            const delta = (msg.delta as string | undefined) ?? "";
            setInterimText((prev) => (prev === "..." ? delta : prev + delta));
          } else if (msgType === "conversation.item.input_audio_transcription.completed") {
            const transcript = ((msg.transcript as string | undefined) ?? "").trim();
            const latencyMs =
              speechStartedAtRef.current != null
                ? Date.now() - speechStartedAtRef.current
                : undefined;
            speechStartedAtRef.current = null;
            setInterimText("");

            if (transcript) {
              const cleaned = cleanTranscript(transcript);
              const wordCount = cleaned.split(/\s+/).filter((w) => w.length > 1).length;
              if (wordCount >= 2) {
                onSegmentFinalizedRef.current(cleaned, undefined, latencyMs);
              }
            }
          } else if (msgType === "error") {
            const errMsg = (msg.error as { message?: string } | undefined)?.message ?? "OpenAI Realtime error";
            console.error("[openai-realtime] API error:", msg);
            if (isRecordingRef.current) {
              setError(`OpenAI: ${errMsg}`);
              cleanup();
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = (ev) => {
        console.error("[openai-realtime] WebSocket error:", ev);
      };

      ws.onclose = (ev) => {
        console.warn("[openai-realtime] WebSocket closed — code:", ev.code, "reason:", ev.reason);
        if (ev.code === 1000) return;
        if (isRecordingRef.current) {
          let msg = `OpenAI Realtime disconnected (code ${ev.code})`;
          if (ev.code === 1008 || ev.reason?.toLowerCase().includes("auth")) {
            msg = "OpenAI: authentication failed. Check your OpenAI integration credentials.";
          } else if (ev.code === 1006) {
            msg = "OpenAI: network error — could not connect. Check internet connection.";
          } else if (ev.reason) {
            msg = `OpenAI: ${ev.reason} (code ${ev.code})`;
          }
          setError(msg);
          cleanup();
        }
      };

      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err: any) {
      console.error("[openai-realtime] Start error:", err);
      setError(err?.message ?? "Could not start OpenAI Realtime recording");
      cleanup();
    }
  }, [cleanup]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      isRecordingRef.current = true;
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  return {
    isRecording,
    interimText,
    error,
    toggleRecording,
    stopRecording,
  };
}
