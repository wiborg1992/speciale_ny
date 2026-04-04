import { useState, useCallback, useRef } from "react";
import type { VisualizeRequest } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import type { SessionEvalStreamDiagnostic } from "@/lib/session-eval-report";
import type { VizDebugInfo } from "@/types/viz-debug";
import type { NeedIntentPayload } from "@/types/need-intent";

const BASE = import.meta.env.BASE_URL;

/** VisualizeRequest udvidet med disambiguation-felt (ikke i genereret API-klient) */
export type VisualizeRequestWithIntent = VisualizeRequest & {
  userVizIntent?: "fresh" | "refine";
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
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<VizDebugInfo | null>(null);
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
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      setIsGenerating(true);
      setStreamedHtml("");
      setError(null);
      setMeta(null);
      setDebugInfo(null);
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
                } else if (parsed.type === "debug") {
                  setDebugInfo((prev) => ({ ...prev, ...parsed }));
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
                  if (parsed.meta) setMeta(parsed.meta);
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
        if (completeHtml.trim().length > 50) {
          setStreamedHtml(completeHtml);
        }
        if (!streamFailed && completeHtml.trim().length > 50) {
          options?.onStreamComplete?.(completeHtml.trim());
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
    error,
    debugInfo,
  };
}
