import { useState, useCallback, useRef } from "react";
import type { VisualizeRequest } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import type { SessionEvalStreamDiagnostic } from "@/lib/session-eval-report";
import type { VizDebugInfo } from "@/types/viz-debug";
import type { NeedIntentPayload } from "@/types/need-intent";

const BASE = import.meta.env.BASE_URL;

/** VisualizeRequest udvidet med disambiguation-, sketch- og force-felter (ikke i genereret API-klient) */
export type VisualizeRequestWithIntent = VisualizeRequest & {
  userVizIntent?: "fresh" | "refine";
  sketchId?: string;
  /** Bypass server-side ord-tærskel-check — sættes ved annotation-trigger */
  forceVisualize?: boolean;
  /** Sand: skitsen er annotation oven på eksisterende viz — AI bruger separat prompt */
  isAnnotation?: boolean;
};

export type VisualizeGenerateOptions = {
  /** Session-eval: skipped, stream parse errors, request failures. */
  onSessionDiagnostic?: (e: SessionEvalStreamDiagnostic) => void;
  /** Kaldes synkront når stream er færdig (før isGenerating=false) så UI ikke et øjeblik viser forrige viz. */
  onStreamComplete?: (html: string) => void;
  /**
   * Kaldes når serveren sender need_intent — brugeren skal vælge "fresh" eller "refine".
   * isGenerating sættes til false umiddelbart efter dette kald.
   * originalRequest indeholder den request der skal gen-sendes med userVizIntent sat.
   */
  onNeedIntent?: (
    payload: NeedIntentPayload,
    originalRequest: VisualizeRequestWithIntent,
  ) => void;
};

export type { VizDebugInfo };
export type { NeedIntentPayload };

export function useVisualizeStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedHtml, setStreamedHtml] = useState<string>("");
  const [meta, setMeta] = useState<any>(null);
  const [orchestratorMeta, setOrchestratorMeta] = useState<{ rationale: string; mode: string; confidence: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<VizDebugInfo | null>(null);
  /**
   * Viz family resolved from the earliest SSE event — drives the loading skeleton variant.
   * Precedence (earliest to most authoritative): meta.classification.family
   *   → thinking.classification.family → debug.classification.family → debug.resolvedFamily.
   * Reset to null at the start of each generation; exposed alongside isGenerating.
   */
  const [streamFamily, setStreamFamily] = useState<string | null>(null);
  const streamFlushRafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const generate = useCallback(
    async (
      request: VisualizeRequestWithIntent,
      options?: VisualizeGenerateOptions,
    ) => {
      const diag = options?.onSessionDiagnostic;
      if (streamFlushRafRef.current != null) {
        cancelAnimationFrame(streamFlushRafRef.current);
        streamFlushRafRef.current = null;
      }
      if (abortRef.current) {
        console.error("[viz] generate() called while a generation was in progress — ABORTING previous fetch!");
        console.trace("[viz] caller stack:");
        abortRef.current.abort();
      }
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      setIsGenerating(true);
      setStreamedHtml("");
      setError(null);
      setMeta(null);
      setOrchestratorMeta(null);
      setDebugInfo(null);
      setStreamFamily(null);
      const genStartTime = performance.now();

      try {
        const response = await fetch(`${BASE}api/visualize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          if (response.status === 503) {
            toast({
              title: "Server midlertidigt overbelastet",
              description: "Prøv igen om et øjeblik — visualiseringen kunne ikke starte.",
            });
            diag?.({ type: "request_error", message: "503 Service Unavailable" });
            return;
          }
          let detail = "";
          try {
            const raw = await response.text();
            const parsed = raw
              ? (JSON.parse(raw) as { error?: string; hint?: string })
              : null;
            if (parsed?.error) {
              detail = `: ${parsed.error}`;
              if (parsed.hint) detail += ` — ${parsed.hint}`;
            } else if (raw) detail = `: ${raw.slice(0, 280)}`;
          } catch {
            /* ignore */
          }
          throw new Error(`Server responded with ${response.status}${detail}`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completeHtml = "";
        let streamFailed = false;

        const scheduleStreamFlush = () => {
          if (streamFlushRafRef.current != null) return;
          streamFlushRafRef.current = requestAnimationFrame(() => {
            streamFlushRafRef.current = null;
            setStreamedHtml(completeHtml);
          });
        };

        while (true) {
          if (signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            break;
          }
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "chunk" && parsed.text) {
                  completeHtml += parsed.text;
                  scheduleStreamFlush();
                } else if (parsed.type === "meta") {
                  // meta arrives before any chunks — grab family for skeleton immediately
                  // precedence: resolvedFamily > classification.family
                  if (parsed.resolvedFamily) {
                    setStreamFamily(parsed.resolvedFamily);
                  } else if (parsed.classification?.family) {
                    setStreamFamily((prev) => prev ?? parsed.classification.family);
                  }
                  // Persist orchestrator reasoning from early meta events so the UI
                  // panel is populated even for ask_user/skip early-return flows
                  // (which never reach the done event).
                  if (parsed.orchestrator) {
                    setOrchestratorMeta(parsed.orchestrator);
                  }
                } else if (parsed.type === "thinking") {
                  // future-proofing: backend may rename meta→thinking per task spec
                  if (parsed.resolvedFamily) {
                    setStreamFamily(parsed.resolvedFamily);
                  } else if (parsed.classification?.family) {
                    setStreamFamily((prev) => prev ?? parsed.classification.family);
                  }
                } else if (parsed.type === "debug") {
                  setDebugInfo((prev) => ({ ...prev, ...parsed }));
                  // debug carries resolvedFamily — more authoritative than meta/thinking classification.family
                  if (parsed.resolvedFamily) {
                    setStreamFamily(parsed.resolvedFamily);
                  } else if (parsed.classification?.family) {
                    setStreamFamily((prev) => prev ?? parsed.classification.family);
                  }
                } else if (parsed.type === "debug_prompt") {
                  setDebugInfo((prev) => ({
                    ...prev,
                    prompt: {
                      systemPrompt: parsed.systemPrompt,
                      userMessage: parsed.userMessage,
                      model: parsed.model,
                      maxTokens: parsed.maxTokens,
                    },
                  }));
                } else if (parsed.type === "done") {
                  if (parsed.html) {
                    completeHtml = parsed.html;
                  }
                  if (streamFlushRafRef.current != null) {
                    cancelAnimationFrame(streamFlushRafRef.current);
                    streamFlushRafRef.current = null;
                  }
                  setStreamedHtml(completeHtml);
                  if (parsed.meta) {
                    setMeta(parsed.meta);
                    // done.meta.orchestrator is included for replay/debug snapshot consistency
                    if (parsed.meta.orchestrator) {
                      setOrchestratorMeta(parsed.meta.orchestrator);
                    }
                  }
                  setDebugInfo((prev) =>
                    prev
                      ? {
                          ...prev,
                          performanceMs: Math.round(
                            performance.now() - genStartTime,
                          ),
                        }
                      : prev,
                  );
                } else if (parsed.type === "skipped") {
                  const wc =
                    typeof parsed.wordCount === "number"
                      ? parsed.wordCount
                      : "?";
                  const min =
                    typeof parsed.minWords === "number" ? parsed.minWords : "";
                  diag?.({
                    type: "skipped",
                    payload: {
                      reason:
                        typeof parsed.reason === "string"
                          ? parsed.reason
                          : undefined,
                      wordCount: parsed.wordCount,
                      minWords: parsed.minWords,
                      hint:
                        typeof parsed.hint === "string"
                          ? parsed.hint
                          : undefined,
                    },
                  });
                  toast({
                    title: "Visualisering sprunget over",
                    description:
                      parsed.hint ||
                      `Transskriptet har for få ord (${wc}${min !== "" ? `, minimum ca. ${min}` : ""}).`,
                  });
                } else if (parsed.type === "need_intent") {
                  if (options?.onNeedIntent) {
                    const payload: NeedIntentPayload = {
                      disambiguationReason: parsed.disambiguationReason,
                      defaultChoice: parsed.defaultChoice,
                      explanation: parsed.explanation ?? "",
                      detectedFamily: parsed.detectedFamily ?? null,
                      currentFamily: parsed.currentFamily ?? null,
                      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
                    };
                    options.onNeedIntent(payload, request);
                  }
                  return;
                } else if (parsed.type === "error") {
                  const msg = parsed.error || "Generation failed";
                  streamFailed = true;
                  diag?.({ type: "stream_error", message: msg });
                  setError(msg);
                }
              } catch {
                // ignore parse errors on non-data lines
              }
            }
          }
        }

        if (streamFlushRafRef.current != null) {
          cancelAnimationFrame(streamFlushRafRef.current);
          streamFlushRafRef.current = null;
        }
        if (signal.aborted) {
          setStreamedHtml("");
          return;
        }
        const htmlTrimmed = completeHtml.trim();
        const isCompleteEnough = htmlTrimmed.length > 50 && htmlTrimmed.includes("<");
        if (isCompleteEnough) {
          setStreamedHtml(completeHtml);
        } else if (!streamFailed && htmlTrimmed.length > 0) {
          // Stream afsluttede men HTML er ufærdig
          const msg = "Visualisering afbrudt — ufærdig HTML modtaget";
          diag?.({ type: "stream_error", message: msg });
          toast({
            title: "Visualisering ufærdig",
            description: "Streamen sluttede inden HTML var komplet. Prøv igen.",
          });
          setError(msg);
        }
        if (!streamFailed && isCompleteEnough) {
          options?.onStreamComplete?.(htmlTrimmed);
        }
      } catch (err: unknown) {
        const aborted =
          err instanceof Error && err.name === "AbortError";
        if (aborted) {
          setStreamedHtml("");
          setError(null);
          toast({
            title: "Generering stoppet",
            description: "Visualiseringen blev afbrudt.",
          });
        } else {
          console.error(err);
          const msg =
            err instanceof Error ? err.message : "Failed to generate visualization";
          diag?.({ type: "request_error", message: msg });
          setError(msg);
        }
      } finally {
        if (streamFlushRafRef.current != null) {
          cancelAnimationFrame(streamFlushRafRef.current);
          streamFlushRafRef.current = null;
        }
        abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [],
  );

  return {
    generate,
    cancelGeneration,
    isGenerating,
    streamedHtml,
    meta,
    orchestratorMeta,
    error,
    debugInfo,
    streamFamily,
  };
}
