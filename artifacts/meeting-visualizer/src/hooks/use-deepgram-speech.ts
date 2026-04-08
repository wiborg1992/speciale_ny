import { useState, useRef, useCallback, useEffect } from "react";

interface DeepgramWord {
  word: string;
  speaker?: number;
  start?: number;
  end?: number;
}

interface DeepgramResult {
  type: string;
  is_final: boolean;
  speech_final: boolean;
  channel?: {
    alternatives: { transcript: string; words: DeepgramWord[] }[];
  };
}

export interface UseDeepgramSpeechProps {
  onSegmentFinalized: (text: string, speakerLabel: string) => void;
  language?: string;
  keywords?: string[];
  speakerNames?: Record<number, string>;
}

const FILLER_PATTERNS = /\b(øh+|uhm+|hmm+|uh+|nå+h?|umm+|ahh+|huh)\b/gi;

function cleanTranscript(raw: string): string {
  return raw.replace(FILLER_PATTERNS, " ").replace(/\s{2,}/g, " ").trim();
}

function getDominantSpeaker(words: DeepgramWord[]): number {
  const counts: Record<number, number> = {};
  words.forEach((w) => {
    if (w.speaker !== undefined) counts[w.speaker] = (counts[w.speaker] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (entries.length === 0) return 0;
  return parseInt(entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]);
}

export function useDeepgramSpeech({
  onSegmentFinalized,
  language = "da-DK",
  keywords = [],
  speakerNames = {},
}: UseDeepgramSpeechProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detectedSpeakers, setDetectedSpeakers] = useState<number[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);

  const onSegmentFinalizedRef = useRef(onSegmentFinalized);
  useEffect(() => { onSegmentFinalizedRef.current = onSegmentFinalized; }, [onSegmentFinalized]);

  const speakerNamesRef = useRef(speakerNames);
  useEffect(() => { speakerNamesRef.current = speakerNames; }, [speakerNames]);

  const pendingBufferRef = useRef<{ transcript: string; speaker: number }[]>([]);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxAgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vent så længe efter sidste is_final før vi committer til transskriptet.
  // Længere vindue ⇒ færre, længere segmenter (typisk 1–2 blokke pr. ytring i stedet for mange små).
  const SILENCE_MS = 14_000;
  // Tvangs-commit under lang monolog så UI/SSE ikke venter for evigt
  const MAX_BUFFER_MS = 90_000;

  const getSpeakerLabel = useCallback((speakerId: number): string => {
    return speakerNamesRef.current[speakerId] ?? `Speaker ${speakerId + 1}`;
  }, []);

  const flushBuffer = useCallback(() => {
    if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
    if (maxAgeTimerRef.current) { clearTimeout(maxAgeTimerRef.current); maxAgeTimerRef.current = null; }
    const items = [...pendingBufferRef.current];
    pendingBufferRef.current = [];
    if (items.length === 0) return;

    // Group consecutive items by same speaker and emit one segment per group
    const groups: { transcript: string; speaker: number }[] = [];
    items.forEach((item) => {
      const last = groups[groups.length - 1];
      if (last && last.speaker === item.speaker) {
        last.transcript += " " + item.transcript;
      } else {
        groups.push({ transcript: item.transcript, speaker: item.speaker });
      }
    });

    groups.forEach((g) => {
      const cleaned = cleanTranscript(g.transcript);
      const wordCount = cleaned.split(/\s+/).filter((w) => w.length > 1).length;
      if (wordCount >= 2) {
        onSegmentFinalizedRef.current(cleaned, getSpeakerLabel(g.speaker));
      }
    });
    setInterimText("");
  }, [getSpeakerLabel]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
    if (maxAgeTimerRef.current) { clearTimeout(maxAgeTimerRef.current); maxAgeTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, "User stopped");
    }
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    flushBuffer();
    setIsRecording(false);
    setInterimText("");
  }, [flushBuffer]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch Deepgram API key from our own backend
      const tokenRes = await fetch("/api/deepgram-token");
      if (!tokenRes.ok) throw new Error("Could not fetch Deepgram token from server");
      const { key } = await tokenRes.json();

      // 2. Request microphone — lad Deepgram håndtere støjfiltrering selv
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 48000, min: 16000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 3. Build Deepgram WebSocket URL
      const lang = language.split("-")[0]; // "da-DK" → "da"
      // nova-3 only supports English; for Danish (and other non-EN) use nova-2
      const model = lang === "en" ? "nova-3" : "nova-2";
      const params = new URLSearchParams({
        model,
        language: lang,
        diarize: "true",
        interim_results: "true",
        smart_format: "true",
        numerals: "true",
        utterance_end_ms: "5000",
        vad_events: "true",
      });

      // Keywords boosting er kun dokumenteret for nova-2/1/Enhanced/Base.
      // Vi bruger nova-3 for engelsk, så undgår at sende keywords i det tilfælde.
      if (model === "nova-2" && keywords.length > 0) {
        keywords.forEach((kw) => params.append("keywords", kw));
      }

      // 4. Open WebSocket with token auth via subprotocol
      const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
      console.info(`[deepgram] Connecting: model=${model} lang=${lang} keywords=${keywords.length} url_len=${wsUrl.length}`);
      const ws = new WebSocket(wsUrl, ["token", key]);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isRecordingRef.current) { ws.close(); return; }

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (ws.readyState === WebSocket.OPEN && e.data.size > 0) {
            ws.send(e.data);
          }
        };
        recorder.start(250);
      };

      ws.onmessage = (event) => {
        try {
          const data: DeepgramResult = JSON.parse(event.data as string);

          if (data.type === "Results") {
            const alt = data.channel?.alternatives?.[0];
            if (!alt) return;

            const transcript = alt.transcript?.trim();
            if (!transcript) return;

            const words: DeepgramWord[] = alt.words ?? [];
            const dominantSpeaker = getDominantSpeaker(words);

            // Track which speakers have been detected
            setDetectedSpeakers((prev) => {
              if (prev.includes(dominantSpeaker)) return prev;
              return [...prev, dominantSpeaker].sort((a, b) => a - b);
            });

            if (data.is_final) {
              pendingBufferRef.current.push({ transcript, speaker: dominantSpeaker });

              // Nulstil stilhedstimer ved hvert nyt is_final — først commit efter SILENCE_MS uden nye finals.
              if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
              commitTimerRef.current = setTimeout(flushBuffer, SILENCE_MS);

              // Én max-alder-timer fra første chunk i denne “blok”
              if (!maxAgeTimerRef.current) {
                maxAgeTimerRef.current = setTimeout(flushBuffer, MAX_BUFFER_MS);
              }

              const speakerLabel = getSpeakerLabel(dominantSpeaker);
              const pending = pendingBufferRef.current.map((b) => b.transcript).join(" ");
              setInterimText(`[${speakerLabel}] ${pending}`);
            } else {
              // Show live interim preview
              const pending = pendingBufferRef.current.map((b) => b.transcript).join(" ");
              const speakerLabel = getSpeakerLabel(dominantSpeaker);
              setInterimText(`[${speakerLabel}] ${[pending, transcript].filter(Boolean).join(" ")}`);
            }
          }
          // UtteranceEnd bruges ikke til flush: den giver mange korte segmenter.
          // Vi samler flere is_final-chunks og committer ved SILENCE_MS / MAX_BUFFER_MS / stop.
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = (ev) => {
        console.error("[deepgram] WebSocket onerror:", ev);
        // onerror always fires before onclose — let onclose set the message
      };

      ws.onclose = (ev) => {
        console.warn("[deepgram] WebSocket closed — code:", ev.code, "reason:", ev.reason);
        if (ev.code === 1000) return; // clean close by us
        let msg = `Deepgram disconnected (code ${ev.code})`;
        if (ev.code === 1008 || ev.reason?.toLowerCase().includes("auth") || ev.reason?.toLowerCase().includes("invalid")) {
          msg = "Deepgram: invalid API key. Update the key in Replit Secrets and restart the API server.";
        } else if (ev.code === 1006) {
          msg = "Deepgram: network error — could not connect. Check internet connection.";
        } else if (ev.reason) {
          msg = `Deepgram: ${ev.reason} (code ${ev.code})`;
        }
        if (isRecordingRef.current) {
          setError(msg);
          stopRecording();
        }
      };

      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err: any) {
      console.error("[deepgram] Start error:", err);
      setError(err?.message ?? "Could not start Deepgram recording");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsRecording(false);
    }
  }, [language, keywords, flushBuffer, stopRecording, getSpeakerLabel]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  return {
    isRecording,
    interimText,
    error,
    toggleRecording,
    stopRecording,
    detectedSpeakers,
  };
}
