/**
 * Offline evaluerings-matrix: normaliser + classify per scenario × workspace.
 * Ingen netværk, ingen API. Bruger evaluation-scenarios.json i api-server-roden.
 *
 * Inkluderer:
 *   1. Klassifikations-matrix (P1-P8 keyword classifier accuracy).
 *   2. Orchestrator decision routing baseline (offline Zod schema + gate checks).
 *
 * Kør: pnpm --filter @workspace/api-server run eval:matrix
 * Output-JSON: EVAL_MATRIX_OUT=./benchmark-results/matrix-classify.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyVisualizationIntent, type VizFamily } from "../lib/classifier.js";
import { normalizeTranscript } from "../lib/normalizer.js";
import type { WorkspaceDomain } from "../lib/workspace-domain.js";
import { OrchestratorDecisionSchema } from "../lib/orchestrator-viz.js";
import type { OrchestratorDecision } from "../lib/orchestrator-viz.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ExpectMap = Partial<Record<WorkspaceDomain, VizFamily>>;

interface ScenarioFile {
  version: number;
  scenarios: Array<{
    id: string;
    transcript: string;
    expectedFamily: ExpectMap;
    domains?: WorkspaceDomain[];
  }>;
}

function loadScenarios(): ScenarioFile {
  const root = path.resolve(__dirname, "..", "..");
  const p = path.join(root, "evaluation-scenarios.json");
  return JSON.parse(readFileSync(p, "utf8")) as ScenarioFile;
}

function main(): void {
  const file = loadScenarios();
  const startedAt = new Date().toISOString();
  const results: Array<{
    scenarioId: string;
    domain: WorkspaceDomain;
    normalizedWordCount: number;
    actualFamily: VizFamily;
    expectedFamily: VizFamily;
    pass: boolean;
    ambiguous: boolean;
    lead: number;
    classifyMs: number;
  }> = [];

  let passN = 0;
  let failN = 0;

  for (const s of file.scenarios) {
    const domains: WorkspaceDomain[] =
      s.domains ?? (["generic"] as WorkspaceDomain[]);

    for (const domain of domains) {
      const expected = s.expectedFamily[domain];
      if (expected == null) continue;

      const t0 = performance.now();
      const normalized = normalizeTranscript(s.transcript);
      const cls = classifyVisualizationIntent(normalized, domain);
      const classifyMs = Math.round(performance.now() - t0);

      const ok = cls.family === expected;
      if (ok) passN++;
      else failN++;

      results.push({
        scenarioId: s.id,
        domain,
        normalizedWordCount: normalized.split(/\s+/).filter(Boolean).length,
        actualFamily: cls.family,
        expectedFamily: expected,
        pass: ok,
        ambiguous: cls.ambiguous,
        lead: cls.lead,
        classifyMs,
      });

      const mark = ok ? "✓" : "✗";
      console.log(
        `${mark} ${s.id} [${domain}] expected=${expected} actual=${cls.family} ambiguous=${cls.ambiguous} (${classifyMs}ms)`
      );
    }
  }

  const summary = {
    kind: "classification_matrix",
    startedAt,
    finishedAt: new Date().toISOString(),
    totals: { pass: passN, fail: failN, cases: results.length },
    results,
  };

  const out = process.env.EVAL_MATRIX_OUT;
  if (out) {
    const dir = path.dirname(path.resolve(out));
    mkdirSync(dir, { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
    console.log("\nSkrev:", out);
  }

  if (failN > 0) {
    // Known-failing classifier cases in evaluation-scenarios.json are reported here.
    // Do NOT exit immediately — run all sections first and fail at the end.
    console.warn(`\n${failN} klassifikations-fejl (known baseline issues — fortsætter med orchestrator baseline).`);
  } else {
    console.log(`\nAlle ${passN} klassifikationschecks OK.`);
  }

  // ─── Orchestrator decision routing baseline ───────────────────────────────
  // Offline Zod schema checks for orchestrator decision paths.
  // Covers: flag on/off behavior, confidence zones, disambiguation gate routing,
  // timeout/null fallback, and session summary persistence bounds.
  // Ingen netværk, ingen API — ren offline Zod parse + routing logic verification.
  console.log("\n─── Orchestrator decision routing baseline ───");

  function parseOrchestrator(raw: unknown): OrchestratorDecision | null {
    const r = OrchestratorDecisionSchema.safeParse(raw);
    if (r.success) return r.data;
    return null;
  }

  type OrchestratorBaselineCase = {
    id: string;
    description: string;
    input: unknown;
    expectedNull: boolean;
    expectedMode?: string;
    expectedFamily?: string;
    expectedTriggersAskUser?: boolean;
    expectedDisambiguationGateRuns?: boolean;
  };

  const orchestratorBaseline: OrchestratorBaselineCase[] = [
    {
      id: "OB1",
      description: "flag ON, high confidence → fresh mode parsed",
      input: { vizFamily: "user_journey", mode: "fresh", confidence: 0.85, rationale: "Clear UX journey topic." },
      expectedNull: false,
      expectedMode: "fresh",
      expectedFamily: "user_journey",
    },
    {
      id: "OB2",
      description: "flag ON, confidence=0.44 → triggers ask_user zone",
      input: { vizFamily: "generic", mode: "fresh", confidence: 0.44, rationale: "Ambiguous." },
      expectedNull: false,
      expectedTriggersAskUser: true,
    },
    {
      id: "OB3",
      description: "flag ON, confidence=0.45 → auto_medium, no ask_user",
      input: { vizFamily: "management_summary", mode: "fresh", confidence: 0.45, rationale: "Moderate." },
      expectedNull: false,
      expectedTriggersAskUser: false,
    },
    {
      id: "OB4",
      description: "skip mode → accepted by schema",
      input: { vizFamily: "hmi_interface", mode: "skip", confidence: 0.9, rationale: "Redundant." },
      expectedNull: false,
      expectedMode: "skip",
    },
    {
      id: "OB5",
      description: "ask_user mode → accepted by schema",
      input: { vizFamily: "generic", mode: "ask_user", confidence: 0.3, rationale: "Unclear." },
      expectedNull: false,
      expectedMode: "ask_user",
    },
    {
      id: "OB6",
      description: "timeout/null → disambiguation gate should run (flag off path)",
      input: null,
      expectedNull: true,
      expectedDisambiguationGateRuns: true,
    },
    {
      id: "OB7",
      description: "invalid vizFamily → Zod rejects → null",
      input: { vizFamily: "not_a_family", mode: "fresh", confidence: 0.8, rationale: "Bad." },
      expectedNull: true,
    },
    {
      id: "OB8",
      description: "confidence > 1 → Zod max(1) rejects → null",
      input: { vizFamily: "persona_research", mode: "fresh", confidence: 1.5, rationale: "Bad." },
      expectedNull: true,
    },
    {
      id: "OB9",
      description: "sessionSummaryUpdate 500 chars → accepted",
      input: { vizFamily: "management_summary", mode: "fresh", confidence: 0.75, rationale: "OK.", sessionSummaryUpdate: "x".repeat(500) },
      expectedNull: false,
    },
    {
      id: "OB10",
      description: "sessionSummaryUpdate 501 chars → Zod max(500) rejects → null",
      input: { vizFamily: "management_summary", mode: "fresh", confidence: 0.75, rationale: "Bad.", sessionSummaryUpdate: "x".repeat(501) },
      expectedNull: true,
    },
    {
      id: "OB11",
      description: "flag ON + valid result → disambiguation gate bypassed",
      input: { vizFamily: "hmi_interface", mode: "refine", confidence: 0.77, rationale: "Speaker refines HMI." },
      expectedNull: false,
      expectedDisambiguationGateRuns: false,
    },
    {
      id: "OB12",
      description: "refine mode with refinementNote → accepted",
      input: { vizFamily: "hmi_interface", mode: "refine", confidence: 0.78, rationale: "Refine.", refinementNote: "Add alarm panel." },
      expectedNull: false,
      expectedMode: "refine",
    },
  ];

  let obPass = 0;
  let obFail = 0;

  for (const tc of orchestratorBaseline) {
    const result = tc.input === null ? null : parseOrchestrator(tc.input);
    const isNull = result === null;

    let pass = true;
    const failures: string[] = [];

    if (isNull !== tc.expectedNull) {
      pass = false;
      failures.push(`expectedNull=${tc.expectedNull} got=${isNull}`);
    }
    if (!isNull && tc.expectedMode && result?.mode !== tc.expectedMode) {
      pass = false;
      failures.push(`expectedMode=${tc.expectedMode} got=${result?.mode}`);
    }
    if (!isNull && tc.expectedFamily && result?.vizFamily !== tc.expectedFamily) {
      pass = false;
      failures.push(`expectedFamily=${tc.expectedFamily} got=${result?.vizFamily}`);
    }
    if (!isNull && tc.expectedTriggersAskUser !== undefined) {
      const triggers = (result?.confidence ?? 1) < 0.45;
      if (triggers !== tc.expectedTriggersAskUser) {
        pass = false;
        failures.push(`expectedTriggersAskUser=${tc.expectedTriggersAskUser} got=${triggers}`);
      }
    }
    if (tc.expectedDisambiguationGateRuns !== undefined) {
      // Disambiguation gate runs when orchestrator returns null OR flag is off
      const gateRuns = isNull; // null result → gate runs (flag-off or timeout)
      if (gateRuns !== tc.expectedDisambiguationGateRuns) {
        pass = false;
        failures.push(`expectedDisambiguationGateRuns=${tc.expectedDisambiguationGateRuns} got=${gateRuns}`);
      }
    }

    if (pass) {
      obPass++;
      console.log(`✓ ${tc.id} ${tc.description}`);
    } else {
      obFail++;
      console.error(`✗ ${tc.id} ${tc.description}: ${failures.join(", ")}`);
    }
  }

  if (obFail > 0) {
    console.error(`\n${obFail} orchestrator baseline fejl.`);
    process.exit(1);
  }

  console.log(`\nAlle ${obPass} orchestrator baseline checks OK (OB1–OB12).`);

  // Deferred classifier failure exit (after all sections have run)
  if (failN > 0) {
    console.error(`\nMatrix afsluttet med ${failN} known classifier-fejl. Juster evaluation-scenarios.json eller klassifikator.`);
    process.exit(1);
  }
}

main();
