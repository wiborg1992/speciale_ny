/**
 * Offline evaluerings-matrix: normaliser + classify per scenario × workspace.
 * Ingen netværk, ingen API. Bruger evaluation-scenarios.json i api-server-roden.
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
      s.domains ?? (["grundfos", "gabriel"] as WorkspaceDomain[]);

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
    console.error(`\n${failN} fejl — juster forventninger i evaluation-scenarios.json eller klassifikator.`);
    process.exit(1);
  }

  console.log(`\nAlle ${passN} klassifikationschecks OK.`);
}

main();
