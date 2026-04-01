import { useState, useCallback } from "react";
import type { VisualizeRequest } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

export interface VizDebugInfo {
  timestamp?: string;
  classification?: {
    inputMode: string;
    inputWords: number;
    totalWords: number;
    inputText: string;
    family: string;
    topic: string;
    lead: number;
    ambiguous: boolean;
    allScores: Array<{ family: string; score: number }>;
  } | null;
  userPickedType?: boolean;
  vizType?: string;
  resolvedFamily?: string | null;
  vizModel?: string;
  isIncremental?: boolean;
  isRefinement?: boolean;
  refinementDirective?: string | null;
  hasPreviousHtml?: boolean;
  focusSegment?: string | null;
  workspaceDomain?: string | null;
  transcriptTotalWords?: number;
  roomId?: string | null;
  prompt?: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    maxTokens: number;
  } | null;
  performanceMs?: number | null;
}

export function useVisualizeStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedHtml, setStreamedHtml] = useState<string>("");
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<VizDebugInfo | null>(null);

  const generate = useCallback(async (request: VisualizeRequest) => {
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
          }
          else if (raw) detail = `: ${raw.slice(0, 280)}`;
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

      while (true) {
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
                setStreamedHtml(completeHtml);
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
                  setStreamedHtml(completeHtml);
                }
                if (parsed.meta) setMeta(parsed.meta);
                setDebugInfo((prev) => prev ? { ...prev, performanceMs: Math.round(performance.now() - genStartTime) } : prev);
              } else if (parsed.type === "skipped") {
                const wc = typeof parsed.wordCount === "number" ? parsed.wordCount : "?";
                const min = typeof parsed.minWords === "number" ? parsed.minWords : "";
                toast({
                  title: "Visualisering sprunget over",
                  description:
                    parsed.hint ||
                    `Transskriptet har for få ord (${wc}${min !== "" ? `, minimum ca. ${min}` : ""}).`,
                });
              } else if (parsed.type === "error") {
                setError(parsed.error || "Generation failed");
              }
            } catch {
              // ignore parse errors on non-data lines
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate visualization");
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generate,
    isGenerating,
    streamedHtml,
    meta,
    error,
    debugInfo,
  };
}
