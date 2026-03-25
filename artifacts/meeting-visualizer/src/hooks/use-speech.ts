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

export function useSpeech({ onSegmentFinalized, language = "en-US" }: UseSpeechProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isRecordingRef = useRef(false);
  const intentionalStopRef = useRef(false);

  // Use a ref for the callback so we never need to recreate the recognition object
  const onSegmentFinalizedRef = useRef(onSegmentFinalized);
  useEffect(() => {
    onSegmentFinalizedRef.current = onSegmentFinalized;
  }, [onSegmentFinalized]);

  // Create recognition object once on mount (or when language changes)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Web Speech API is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const finalText = event.results[i][0].transcript.trim();
          if (finalText) {
            onSegmentFinalizedRef.current(finalText);
          }
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimText(currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setError("Microphone access denied. Please allow microphone access in your browser.");
        setIsRecording(false);
        isRecordingRef.current = false;
      } else if (event.error === "no-speech") {
        // Not a fatal error — just silence
      } else {
        setError(`Speech recognition error: ${event.error}`);
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
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      isRecordingRef.current = false;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [language]); // Only recreate when language changes

  const toggleRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("Speech recognition not available. Please use Chrome or Edge.");
      return;
    }

    if (isRecordingRef.current) {
      intentionalStopRef.current = true;
      isRecordingRef.current = false;
      setIsRecording(false);
      setInterimText("");
      recognition.stop();
    } else {
      setError(null);
      intentionalStopRef.current = false;
      isRecordingRef.current = true;
      setIsRecording(true);
      try {
        recognition.start();
      } catch (err) {
        setError("Could not start recording. Please try again.");
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  }, []); // Stable — never changes

  return {
    isRecording,
    interimText,
    error,
    toggleRecording,
  };
}
