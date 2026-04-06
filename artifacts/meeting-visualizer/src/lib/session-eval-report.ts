/**
 * Struktureret session-rapport til evaluering/forbedring efter mødet.
 * JSON kan gemmes i speciale-mappe eller sendes videre — ingen PII ud over transskript-snippets.
 */

import type { VizDebugInfo } from "@/types/viz-debug";

/** Diagnostik fra visualize-stream (skipped / fejl). */
export type SessionEvalStreamDiagnostic =
  | { type: "skipped"; payload: Record<string, unknown> }
  | { type: "stream_error"; message: string }
  | { type: "request_error"; message: string };

export type SessionEvalVizSource = "local_stream" | "sse_peer";

/** Manuel facit pr. visualisering — dine tre spor (inkrementel vs ny, indhold vs. tale, legacy). */
export type SessionEvalExpectedIntent = "incremental" | "new_viz" | "unsure";

export type SessionEvalLegacyHypothesis =
  | "previous_html"
  | "transcript_window"
  | "room_reload"
  | "other";

export interface SessionEvalVizFacit {
  /** P1: hvad du forventede */
  expectedIntent?: SessionEvalExpectedIntent;
  /** P1: hvad der skete / observation */
  actualIntentNotes?: string;
  /** P1: om disambiguation-dialog blev vist */
  disambiguationShown?: boolean;
  disambiguationNotes?: string;
  /** P2: hvad transskriptet ifølge dig skulle afspejles */
  transcriptClaims?: string;
  /** P2: hvad figuren faktisk viser */
  figureObserved?: string;
  /** P3: fri tekst om legacy / gammelt indhold */
  legacySuspicion?: string;
  legacyHypothesis?: SessionEvalLegacyHypothesis;
  /** P3: kort uddrag du mener var “sandheden” for denne viz */
  transcriptSnippetUser?: string;
  severity?: "p0" | "p1" | "p2" | "p3";
}

/** Én visualiseringshændelse med klassifikations-metadata (fra server debug). */
export interface SessionEvalVisualizationEvent {
  kind: "visualization";
  at: string; // ISO
  source: SessionEvalVizSource;
  version: number;
  vizName: string;
  htmlChars: number;
  /** Reduceret debug — ingen fuld systemprompt. */
  debug: ReturnType<typeof sanitizeDebugForExport>;
  /** Udfyldes ved eksport fra session-eval UI (valgfrit). */
  facit?: SessionEvalVizFacit;
}

export interface SessionEvalSkippedEvent {
  kind: "skipped";
  at: string;
  reason?: string;
  wordCount?: number;
  minWords?: number;
  hint?: string;
}

export interface SessionEvalErrorEvent {
  kind: "stream_error" | "request_error";
  at: string;
  message: string;
}

export interface SessionEvalIntentDecisionEvent {
  kind: "intent_decision";
  at: string;
  disambiguationReason: string;
  defaultChoice: "fresh" | "refine";
  actualChoice: "fresh" | "refine";
  detectedFamily: string | null;
  currentFamily: string | null;
  /** Top-4 klassifikationsscores på beslutnings-tidspunktet */
  scores: Array<{ family: string; score: number }>;
}

/** Registrerer brugerens valg i retningskort-dialogen (første viz i sessionen). */
export interface SessionEvalDirectionPickEvent {
  kind: "direction_pick";
  at: string;
  /** De familier der blev vist som kort. */
  shownFamilies: string[];
  /** Den familie brugeren valgte — null hvis de trykkede "Lad AI bestemme". */
  pickedFamily: string | null;
  /** true hvis brugeren sprang over med "Lad AI bestemme". */
  skipped: boolean;
  /** Den faktisk genererede familie — udfyldes efter generering (null = afventer). */
  finalFamily: string | null;
  /** Om den genererede familie matchede det valgte kort — null = afventer eller skipped. */
  matchedPick: boolean | null;
}

export type SessionEvalEvent =
  | SessionEvalVisualizationEvent
  | SessionEvalSkippedEvent
  | SessionEvalErrorEvent
  | SessionEvalIntentDecisionEvent
  | SessionEvalDirectionPickEvent;

export interface SessionEvalReport {
  /** 2 = understøtter `facit` på visualization-events + uændret resten. */
  schemaVersion: 1 | 2;
  exportedAt: string;
  session: {
    roomId: string;
    meetingTitle: string;
    workspaceDomain: string;
    sessionStartedAt: string;
    sessionEndedAt: string;
  };
  summary: {
    transcriptWordCountApprox: number;
    segmentCount: number;
    participantNames: string[];
    visualizationEventCount: number;
    skippedCount: number;
    errorCount: number;
  };
  /** Fritekst til manuel facit/kommentar efter gennemgang. */
  reviewerNotes: string;
  events: SessionEvalEvent[];
}

/** Fjern tunge/unnødvendige felter til eksport. */
export function sanitizeDebugForExport(
  info: VizDebugInfo | null | undefined,
): Record<string, unknown> | null {
  if (!info) return null;
  const c = info.classification;
  const out: Record<string, unknown> = {
    timestamp: info.timestamp ?? null,
    resolvedFamily: info.resolvedFamily ?? null,
    userPickedType: info.userPickedType ?? null,
    vizType: info.vizType ?? null,
    vizModel: info.vizModel ?? null,
    isIncremental: info.isIncremental ?? null,
    isRefinement: info.isRefinement ?? null,
    refinementDirective: info.refinementDirective
      ? String(info.refinementDirective).slice(0, 500)
      : null,
    hasPreviousHtml: info.hasPreviousHtml ?? null,
    focusSegment: info.focusSegment
      ? String(info.focusSegment).slice(0, 280)
      : null,
    workspaceDomain: info.workspaceDomain ?? null,
    transcriptTotalWords: info.transcriptTotalWords ?? null,
    roomId: info.roomId ?? null,
    performanceMs: info.performanceMs ?? null,
  };
  if (c) {
    out.classification = {
      inputMode: c.inputMode,
      inputWords: c.inputWords,
      totalWords: c.totalWords,
      inputText: c.inputText ? String(c.inputText).slice(0, 600) : "",
      family: c.family,
      topic: c.topic,
      lead: c.lead,
      ambiguous: c.ambiguous,
      topScores: (c.allScores ?? []).slice(0, 6),
    };
  }
  return out;
}

function facitHasContent(f: SessionEvalVizFacit | undefined): boolean {
  if (!f) return false;
  return Object.values(f).some((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === "boolean") return true;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
}

/** Tilføj/redigér facit pr. versionsnummer før eksport. */
export function mergeFacitIntoEvents(
  events: SessionEvalEvent[],
  facitByVersion: Record<number, SessionEvalVizFacit>,
): SessionEvalEvent[] {
  return events.map((e) => {
    if (e.kind !== "visualization") return e;
    const patch = facitByVersion[e.version];
    if (!patch || !facitHasContent(patch)) return e;
    const merged: SessionEvalVizFacit = { ...e.facit, ...patch };
    return { ...e, facit: merged };
  });
}

export function buildSessionEvalReport(params: {
  roomId: string;
  meetingTitle: string;
  workspaceDomain: string;
  sessionStartedAt: number;
  reviewerNotes: string;
  events: SessionEvalEvent[];
  transcriptWordCountApprox: number;
  segmentCount: number;
  participantNames: string[];
}): SessionEvalReport {
  const now = Date.now();
  const vizN = params.events.filter((e) => e.kind === "visualization").length;
  const skipN = params.events.filter((e) => e.kind === "skipped").length;
  const errN = params.events.filter(
    (e) => e.kind === "stream_error" || e.kind === "request_error",
  ).length;

  const hasFacit = params.events.some(
    (e) => e.kind === "visualization" && facitHasContent(e.facit),
  );

  return {
    schemaVersion: hasFacit ? 2 : 1,
    exportedAt: new Date(now).toISOString(),
    session: {
      roomId: params.roomId,
      meetingTitle: params.meetingTitle || "",
      workspaceDomain: params.workspaceDomain,
      sessionStartedAt: new Date(params.sessionStartedAt).toISOString(),
      sessionEndedAt: new Date(now).toISOString(),
    },
    summary: {
      transcriptWordCountApprox: params.transcriptWordCountApprox,
      segmentCount: params.segmentCount,
      participantNames: params.participantNames,
      visualizationEventCount: vizN,
      skippedCount: skipN,
      errorCount: errN,
    },
    reviewerNotes: params.reviewerNotes.trim(),
    events: params.events,
  };
}

export function downloadSessionEvalJson(report: SessionEvalReport): void {
  const safeTitle = (report.session.meetingTitle || "session")
    .replace(/[^a-zA-Z0-9æøåÆØÅ_-]+/g, "_")
    .slice(0, 48);
  const slug = `session-eval_${safeTitle}_${formatExportStamp()}.json`;
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = slug;
  a.click();
  URL.revokeObjectURL(url);
}

function formatExportStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
