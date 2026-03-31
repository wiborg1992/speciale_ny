/**
 * Måler tid til første SSE-"meta", første "chunk" og "done" for POST /api/visualize.
 *
 * Kræver: kørende api-server med ANTHROPIC_API_KEY (og DATABASE_URL hvis routes kræver det).
 *
 * Kør:
 *   pnpm --filter @workspace/api-server run benchmark:viz
 *   pnpm --filter @workspace/api-server run benchmark:viz:auto
 *   pnpm --filter @workspace/api-server run benchmark:viz:eval-e2e
 *
 * Miljø:
 *   BENCHMARK_BASE_URL — default http://127.0.0.1:3000
 *   BENCHMARK_MODELS — default haiku,sonnet,opus (eval-e2e bruger kun første model medmindre BENCHMARK_EVAL_ALL_MODELS=1)
 *   BENCHMARK_SUITE — fixed | auto | both | eval-e2e
 *   BENCHMARK_JSON — skriv samlet resultat-JSON til sti (fx benchmark-results/e2e.json)
 *   BENCHMARK_TIMEOUT_MS — default 180000
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:3000";
const SUITE = (process.env.BENCHMARK_SUITE ?? "fixed").toLowerCase();
const MODELS = (process.env.BENCHMARK_MODELS ?? "haiku,sonnet,opus")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EVAL_ALL_MODELS = process.env.BENCHMARK_EVAL_ALL_MODELS === "1";

/** Nok ord til at passere server-side viz-gate (Auto). */
const WORKFLOW_TRANSCRIPT = `[Facilitator]: We need a simple workflow for pump commissioning including mount the pump on the base plate then wire the motor according to the diagram then fill the system slowly then run the startup wizard and finally verify all alarms appear correctly in the SCADA list.`;

const PUMP_TRANSCRIPT = `We need to present the Alpha GO pump at the product review meeting. The pump has the circular LED ring around the control face showing operating mode. Next to it show the Grundfos GO app panel with flow rate and energy. The motor is IE5 class inline pump with DN25 flanges for the demo.`;

function loadEvaluationScenarios() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const p = path.join(dir, "evaluation-scenarios.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

async function pingHealth() {
  const tryPaths = ["/api/healthz", "/api/health"];
  for (const p of tryPaths) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 2500);
      const r = await fetch(`${BASE}${p}`, { signal: ac.signal });
      clearTimeout(t);
      if (r.ok) return p;
    } catch {
      /* next */
    }
  }
  return null;
}

async function benchmarkOne(label, body) {
  const t0 = performance.now();
  /** @type {number|null} */
  let firstMetaMs = null;
  /** @type {string|null} */
  let metaFamily = null;
  /** @type {number|null} */
  let firstChunkMs = null;
  /** @type {number|null} */
  let doneMs = null;
  let errorMsg = null;
  let skipped = false;

  const maxWait = Number(process.env.BENCHMARK_TIMEOUT_MS ?? 180000);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), maxWait);

  let resp;
  try {
    resp = await fetch(`${BASE}/api/visualize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 500)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Intet response body");

  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";

    for (const line of parts) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const elapsed = performance.now() - t0;
      if (parsed.type === "meta" && firstMetaMs == null) {
        firstMetaMs = elapsed;
        metaFamily =
          parsed.classification?.family != null
            ? String(parsed.classification.family)
            : null;
      }
      if (parsed.type === "chunk" && firstChunkMs == null) firstChunkMs = elapsed;
      if (parsed.type === "done") doneMs = elapsed;
      if (parsed.type === "error") errorMsg = String(parsed.error ?? "error");
      if (parsed.type === "skipped") {
        skipped = true;
        errorMsg = `skipped:${parsed.reason ?? ""}`;
        doneMs = elapsed;
      }
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  return {
    label,
    metaFamily,
    firstMetaMs: firstMetaMs != null ? Math.round(firstMetaMs) : null,
    firstChunkMs: firstChunkMs != null ? Math.round(firstChunkMs) : null,
    doneMs: doneMs != null ? Math.round(doneMs) : null,
    metaToChunkMs:
      firstMetaMs != null && firstChunkMs != null
        ? Math.round(firstChunkMs - firstMetaMs)
        : null,
    totalMs,
    skipped,
    error: errorMsg,
  };
}

function buildFixedJobs() {
  const jobs = [];
  for (const vizModel of MODELS) {
    jobs.push({
      label: `fixed vizType=workflow | ${vizModel}`,
      body: {
        transcript: WORKFLOW_TRANSCRIPT,
        vizType: "workflow",
        vizModel,
        freshStart: true,
        workspaceDomain: "grundfos",
      },
    });
  }
  if (MODELS.includes("opus")) {
    jobs.push({
      label: "fixed vizType=product (pump) | opus",
      body: {
        transcript: PUMP_TRANSCRIPT,
        vizType: "product",
        vizModel: "opus",
        freshStart: true,
        workspaceDomain: "grundfos",
      },
    });
  }
  return jobs;
}

function buildAutoJobs() {
  const jobs = [];
  for (const vizModel of MODELS) {
    jobs.push({
      label: `auto-detect (workflow-lignende transskript) | ${vizModel}`,
      body: {
        transcript: WORKFLOW_TRANSCRIPT,
        vizType: null,
        vizModel,
        freshStart: true,
        workspaceDomain: "grundfos",
      },
    });
  }
  if (MODELS.includes("opus")) {
    jobs.push({
      label: "auto-detect (pumpe-transskript) | opus",
      body: {
        transcript: PUMP_TRANSCRIPT,
        vizType: null,
        vizModel: "opus",
        freshStart: true,
        workspaceDomain: "grundfos",
      },
    });
  }
  return jobs;
}

function buildEvalE2EJobs() {
  const file = loadEvaluationScenarios();
  const modelsForEval = EVAL_ALL_MODELS ? MODELS : MODELS.slice(0, 1);
  if (modelsForEval.length === 0) throw new Error("BENCHMARK_MODELS tom");

  /** @type {{ label: string, body: Record<string, unknown>, expectedFamily: string }[]} */
  const jobs = [];
  for (const s of file.scenarios) {
    const domains = s.domains ?? ["grundfos", "gabriel"];
    for (const domain of domains) {
      const expected = s.expectedFamily?.[domain];
      if (expected == null) continue;
      for (const vizModel of modelsForEval) {
        jobs.push({
          label: `eval-e2e ${s.id} | ${domain} | ${vizModel}`,
          body: {
            transcript: s.transcript,
            vizType: null,
            vizModel,
            freshStart: true,
            workspaceDomain: domain,
          },
          expectedFamily: expected,
        });
      }
    }
  }
  return jobs;
}

async function main() {
  console.log("Benchmark visualize —", BASE, "| suite:", SUITE);
  const okPath = await pingHealth();
  if (!okPath) {
    console.error(
      "\nKunne ikke nå API (health). Start serveren (PORT=3000 eller sæt BENCHMARK_BASE_URL).\n"
    );
    process.exitCode = 1;
    return;
  }
  console.log("Health OK:", okPath, "\n");

  /** @type {{ label: string, body: Record<string, unknown>, expectedFamily?: string }[]} */
  let jobs = [];
  if (SUITE === "auto") jobs = buildAutoJobs();
  else if (SUITE === "both") jobs = [...buildFixedJobs(), ...buildAutoJobs()];
  else if (SUITE === "fixed") jobs = buildFixedJobs();
  else if (SUITE === "eval-e2e") jobs = buildEvalE2EJobs();
  else {
    console.error('BENCHMARK_SUITE skal være "fixed", "auto", "both" eller "eval-e2e".');
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  /** @type {Record<string, unknown>[]} */
  const results = [];
  let classifyMatchPass = 0;
  let classifyMatchFail = 0;

  for (const job of jobs) {
    try {
      const r = await benchmarkOne(job.label, job.body);
      let classifyMatch = null;
      if (job.expectedFamily != null && r.metaFamily != null) {
        classifyMatch = r.metaFamily === job.expectedFamily;
        if (classifyMatch) classifyMatchPass++;
        else classifyMatchFail++;
      }
      const row = { ...r, expectedFamily: job.expectedFamily ?? null, classifyMatch };
      results.push(row);
      console.log(JSON.stringify(row, null, 2));
    } catch (e) {
      const err = { label: job.label, error: String(e.message || e) };
      results.push(err);
      console.error(JSON.stringify(err));
    }
    console.log("---");
  }

  const summary = {
    kind: "benchmark_visualize",
    suite: SUITE,
    baseUrl: BASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    jobs: results.length,
    classifyMatch: { pass: classifyMatchPass, fail: classifyMatchFail },
    results,
  };

  const out = process.env.BENCHMARK_JSON;
  if (out) {
    const dir = path.dirname(path.resolve(out));
    mkdirSync(dir, { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
    console.log("Skrev:", out);
  }

  console.log(
    "Forklaring: metaFamily = serverklassifikation (Auto). firstMeta / firstChunk / done i ms. Server logger viz_perf (pino) pr. request."
  );

  if (classifyMatchFail > 0) {
    console.error(`Advarsel: ${classifyMatchFail} klassifikations-afvigelser ift. evaluation-scenarios.json (SSE meta vs forventet).`);
  }
}

main();
