/**
 * Kør: pnpm --filter @workspace/meeting-visualizer run test:session-eval
 */
import assert from "node:assert/strict";

import {
  mergeFacitIntoEvents,
  buildSessionEvalReport,
  type SessionEvalVisualizationEvent,
  type SessionEvalEvent,
} from "./session-eval-report.ts";

function viz(
  version: number,
  overrides: Partial<SessionEvalVisualizationEvent> = {},
): SessionEvalVisualizationEvent {
  return {
    kind: "visualization",
    at: "2026-01-01T00:00:00.000Z",
    source: "local_stream",
    version,
    vizName: "Test",
    htmlChars: 100,
    debug: null,
    ...overrides,
  };
}

function baseReportParams(events: SessionEvalEvent[]) {
  return {
    roomId: "room-x",
    meetingTitle: "Møde",
    workspaceDomain: "grundfos",
    sessionStartedAt: 1_700_000_000_000,
    reviewerNotes: "  note  ",
    events,
    transcriptWordCountApprox: 42,
    segmentCount: 3,
    participantNames: ["A"],
  };
}

// mergeFacitIntoEvents: tom patch → uændret
{
  const ev: SessionEvalEvent[] = [viz(1)];
  const out = mergeFacitIntoEvents(ev, {});
  assert.equal(out.length, 1);
  assert.equal((out[0] as SessionEvalVisualizationEvent).facit, undefined);
}

// mergeFacitIntoEvents: patch med indhold → facit på version
{
  const ev: SessionEvalEvent[] = [viz(1)];
  const out = mergeFacitIntoEvents(ev, {
    1: { expectedIntent: "new_viz", actualIntentNotes: "forkert familie" },
  });
  const row = out[0] as SessionEvalVisualizationEvent;
  assert.equal(row.facit?.expectedIntent, "new_viz");
  assert.equal(row.facit?.actualIntentNotes, "forkert familie");
}

// mergeFacitIntoEvents: eksisterende facit + patch
{
  const ev: SessionEvalEvent[] = [
    { ...viz(2), facit: { severity: "p2" } },
  ];
  const out = mergeFacitIntoEvents(ev, {
    2: { expectedIntent: "incremental" },
  });
  const row = out[0] as SessionEvalVisualizationEvent;
  assert.equal(row.facit?.severity, "p2");
  assert.equal(row.facit?.expectedIntent, "incremental");
}

// mergeFacitIntoEvents: tom streng i patch → facitHasContent false for den nøgle alene — hele patch skal have mindst ét felt med indhold
{
  const ev: SessionEvalEvent[] = [viz(3)];
  const out = mergeFacitIntoEvents(ev, {
    3: { actualIntentNotes: "   " },
  });
  assert.equal((out[0] as SessionEvalVisualizationEvent).facit, undefined);
}

// schemaVersion 1 uden facit
{
  const r = buildSessionEvalReport(baseReportParams([viz(1)]));
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.reviewerNotes, "note");
}

// schemaVersion 2 med facit på viz
{
  const merged = mergeFacitIntoEvents([viz(1)], {
    1: { expectedIntent: "unsure" },
  });
  const r = buildSessionEvalReport(baseReportParams(merged));
  assert.equal(r.schemaVersion, 2);
}

// summary tællere
{
  const events: SessionEvalEvent[] = [
    viz(1),
    { kind: "skipped", at: "2026-01-01T00:00:00.000Z", reason: "x" },
    { kind: "stream_error", at: "2026-01-01T00:00:00.000Z", message: "e" },
  ];
  const r = buildSessionEvalReport(baseReportParams(events));
  assert.equal(r.summary.visualizationEventCount, 1);
  assert.equal(r.summary.skippedCount, 1);
  assert.equal(r.summary.errorCount, 1);
}

console.log("session-eval-report tests: OK");
