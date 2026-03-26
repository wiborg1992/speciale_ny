import { useState, useEffect, useRef, useCallback } from "react";

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  }
}

export interface UseSpeechProps {
  onSegmentFinalized: (text: string) => void;
  language?: string;
}

const COMMIT_DELAY_MS = 4500;

const MIN_MEANINGFUL_WORDS = 2;

const FILLER_PATTERNS = /\b(øh+|uhm+|hmm+|uh+|nå+h?|umm+|ahh+|huh)\b/gi;

function cleanTranscript(raw: string): string {
  let cleaned = raw.replace(FILLER_PATTERNS, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function countMeaningfulWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 1).length;
}

export function useSpeech({ onSegmentFinalized, language = "da-DK" }: UseSpeechProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isRecordingRef = useRef(false);
  const intentionalStopRef = useRef(false);

  // Stable ref for the callback — never causes hook recreation
  const onSegmentFinalizedRef = useRef(onSegmentFinalized);
  useEffect(() => { onSegmentFinalizedRef.current = onSegmentFinalized; }, [onSegmentFinalized]);

  // Buffer: accumulate final results and wait COMMIT_DELAY_MS of silence before emitting
  const pendingTextRef = useRef("");
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const raw = pendingTextRef.current.trim();
    pendingTextRef.current = "";
    if (!raw) return;
    const cleaned = cleanTranscript(raw);
    if (countMeaningfulWords(cleaned) >= MIN_MEANINGFUL_WORDS) {
      onSegmentFinalizedRef.current(cleaned);
    }
  }, []);

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const raw = pendingTextRef.current.trim();
      pendingTextRef.current = "";
      if (!raw) return;
      const cleaned = cleanTranscript(raw);
      if (countMeaningfulWords(cleaned) >= MIN_MEANINGFUL_WORDS) {
        onSegmentFinalizedRef.current(cleaned);
      }
    }, COMMIT_DELAY_MS);
  }, []);

  // Create/recreate the recognition object only when language changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Web Speech API not supported. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          const finalText = result[0].transcript;
          if (finalText.trim()) {
            // Append to pending buffer and (re)start the commit timer
            pendingTextRef.current = (pendingTextRef.current + " " + finalText).trim();
            scheduleCommit();
          }
        } else {
          currentInterim += result[0].transcript;
        }
      }

      // Show interim text + pending buffer so the user sees everything in progress
      const display = [pendingTextRef.current, currentInterim].filter(Boolean).join(" ");
      setInterimText(display);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setError("Mikrofonadgang nægtet. Tillad mikrofon i browseren.");
        setIsRecording(false);
        isRecordingRef.current = false;
      } else if (event.error === "no-speech") {
        // Silence — not fatal
      } else {
        setError(`Talegenkendelse fejl: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setInterimText("");
      // Auto-restart if still supposed to be recording
      if (isRecordingRef.current && !intentionalStopRef.current) {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      } else {
        // Flush any pending buffer on intentional stop
        flushPending();
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      isRecordingRef.current = false;
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [language, scheduleCommit, flushPending]);

  const toggleRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("Talegenkendelse ikke tilgængelig. Brug Chrome eller Edge.");
      return;
    }

    if (isRecordingRef.current) {
      intentionalStopRef.current = true;
      isRecordingRef.current = false;
      setIsRecording(false);
      setInterimText("");
      recognition.stop();
      // Flush any accumulated text immediately on manual stop
      flushPending();
    } else {
      setError(null);
      intentionalStopRef.current = false;
      isRecordingRef.current = true;
      pendingTextRef.current = "";
      setIsRecording(true);
      try {
        recognition.start();
      } catch {
        setError("Kunne ikke starte optagelse. Prøv igen.");
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  }, [flushPending]);

  return { isRecording, interimText, error, toggleRecording };
}
