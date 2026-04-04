import { useCallback, useState, type MutableRefObject } from "react";
import {
  buildSessionEvalReport,
  downloadSessionEvalJson,
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

export function useSessionEvalLog(params: {
  roomId: string | undefined;
  meetingTitle: string;
  workspaceDomain: string;
  sessionStartedAtRef: MutableRefObject<number>;
  getTranscriptWordCount: () => number;
  getSegmentCount: () => number;
  getParticipantNames: () => string[];
}) {
  const [events, setEvents] = useState<SessionEvalEvent[]>([]);
  const [reviewerNotes, setReviewerNotes] = useState("");

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

  const exportJson = useCallback(() => {
    const roomId = params.roomId ?? "unknown";
    const report = buildSessionEvalReport({
      roomId,
      meetingTitle: params.meetingTitle,
      workspaceDomain: params.workspaceDomain,
      sessionStartedAt: params.sessionStartedAtRef.current,
      reviewerNotes,
      events,
      transcriptWordCountApprox: params.getTranscriptWordCount(),
      segmentCount: params.getSegmentCount(),
      participantNames: params.getParticipantNames(),
    });
    downloadSessionEvalJson(report);
  }, [params, reviewerNotes, events]);

  const clearLog = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    recordVisualization,
    recordIntentDecision,
    onStreamDiagnostic,
    exportJson,
    clearLog,
    reviewerNotes,
    setReviewerNotes,
    eventCount: events.length,
    events,
  };
}
