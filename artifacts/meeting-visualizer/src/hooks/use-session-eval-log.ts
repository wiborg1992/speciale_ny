import { useCallback, useState } from "react";
import {
  sanitizeDebugForExport,
  type SessionEvalErrorEvent,
  type SessionEvalEvent,
  type SessionEvalIntentDecisionEvent,
  type SessionEvalSkippedEvent,
  type SessionEvalStreamDiagnostic,
  type SessionEvalVizSource,
  type SessionEvalVisualizationEvent,
} from "@/lib/session-eval-report";
import type { VizDebugInfo } from "@/types/viz-debug";

export type { SessionEvalStreamDiagnostic } from "@/lib/session-eval-report";

export function useSessionEvalLog() {
  const [events, setEvents] = useState<SessionEvalEvent[]>([]);

  const recordVisualization = useCallback(
    (args: {
      version: number;
      vizName: string;
      html: string;
      debugSnapshot: VizDebugInfo | null | undefined;
      source: SessionEvalVizSource;
    }) => {
      const ev: SessionEvalVisualizationEvent = {
        kind: "visualization",
        at: new Date().toISOString(),
        source: args.source,
        version: args.version,
        vizName: args.vizName,
        htmlChars: args.html.length,
        debug: sanitizeDebugForExport(args.debugSnapshot ?? null),
      };
      setEvents((prev) => [...prev, ev]);
    },
    [],
  );

  const onStreamDiagnostic = useCallback((d: SessionEvalStreamDiagnostic) => {
    const at = new Date().toISOString();
    if (d.type === "skipped") {
      const p = d.payload;
      const ev: SessionEvalSkippedEvent = {
        kind: "skipped",
        at,
        reason: typeof p.reason === "string" ? p.reason : undefined,
        wordCount: typeof p.wordCount === "number" ? p.wordCount : undefined,
        minWords: typeof p.minWords === "number" ? p.minWords : undefined,
        hint: typeof p.hint === "string" ? p.hint : undefined,
      };
      setEvents((prev) => [...prev, ev]);
    } else {
      const ev: SessionEvalErrorEvent = {
        kind: d.type,
        at,
        message: d.message.slice(0, 500),
      };
      setEvents((prev) => [...prev, ev]);
    }
  }, []);

  const recordIntentDecision = useCallback(
    (args: {
      disambiguationReason: string;
      defaultChoice: "fresh" | "refine";
      actualChoice: "fresh" | "refine";
      detectedFamily: string | null;
      currentFamily: string | null;
      scores: Array<{ family: string; score: number }>;
    }) => {
      const ev: SessionEvalIntentDecisionEvent = {
        kind: "intent_decision",
        at: new Date().toISOString(),
        ...args,
      };
      setEvents((prev) => [...prev, ev]);
    },
    [],
  );

  const clearLog = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    recordVisualization,
    recordIntentDecision,
    onStreamDiagnostic,
    clearLog,
    eventCount: events.length,
    events,
  };
}
