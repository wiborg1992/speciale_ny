/**
 * Orchestrator-centric viz decision module.
 *
 * Kalder Claude Haiku med fuld kontekst (session summary + transcript tail + viz-metadata)
 * og returnerer en Zod-valideret beslutning før resolveFamily kør.
 *
 * Feature-flag: ORCHESTRATOR_VIZ=1
 * Token-budget: session summary ≤ 300 tokens, transcript tail ≤ 800 tokens, viz-metadata ≤ 200 tokens.
 * Timeout: 4000ms. Retry: én gang ved schema-fejl.
 * Confidence-zoner:
 *   < 0.45  → ask_user
 *   0.45–0.72 → auto med rationale logget
 *   > 0.72  → auto stille
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { VizFamily } from "./classifier.js";

// Default ON — zæt ORCHESTRATOR_VIZ=0 i .env for at slå fra.
const ORCHESTRATOR_VIZ_FLAG = process.env.ORCHESTRATOR_VIZ !== "0";

export function isOrchestratorEnabled(): boolean {
  return ORCHESTRATOR_VIZ_FLAG;
}

const VALID_VIZ_FAMILIES: VizFamily[] = [
  "hmi_interface",
  "user_journey",
  "workflow_process",
  "physical_product",
  "mobile_app",
  "requirements_matrix",
  "management_summary",
  "engagement_analytics",
  "persona_research",
  "service_blueprint",
  "comparison_evaluation",
  "design_system",
  "ux_prototype",
  "generic",
];

export const OrchestratorDecisionSchema = z.object({
  vizFamily: z.enum([
    "hmi_interface",
    "user_journey",
    "workflow_process",
    "physical_product",
    "mobile_app",
    "requirements_matrix",
    "management_summary",
    "engagement_analytics",
    "persona_research",
    "service_blueprint",
    "comparison_evaluation",
    "design_system",
    "ux_prototype",
    "generic",
  ]),
  mode: z.enum(["fresh", "refine", "skip", "ask_user"]),
  refinementNote: z.string().max(300).optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
  sessionSummaryUpdate: z.string().max(500).optional(),
});

export type OrchestratorDecision = z.infer<typeof OrchestratorDecisionSchema>;

export interface OrchestratorInput {
  transcriptTail: string;
  sessionSummary: string | null;
  lastFamily: VizFamily | null;
  lastVizTitle: string | null;
  classifierTop: Array<{ family: string; score: number }>;
  hasPreviousViz: boolean;
  refinementDetected: boolean;
  isColdStart: boolean;
}

const ORCHESTRATOR_SYSTEM = `You are a visualization orchestrator for a real-time meeting AI tool.
Your job: given a short meeting transcript tail, session context, and classifier hints, decide:
1. Which visualization family fits best NOW
2. Whether to refine the existing visualization, create a fresh one, skip, or ask the user

Visualization families:
- hmi_interface: Digital screen UI, HMI/SCADA, operator panels, tabs, screens
- user_journey: Customer/user journey map, touchpoints, experience stages, pain points
- workflow_process: Process flow, flowchart, swimlanes, decision diamonds, BPMN
- physical_product: Physical hardware device, front panel, LEDs, enclosure, device illustration (NOT an app)
- mobile_app: Mobile application screens, phone app UI, app navigation, app features
- requirements_matrix: Requirements list, MoSCoW, traceability, kravspec
- management_summary: Executive summary, timeline, Gantt, milestones, decision log
- engagement_analytics: Digital analytics, CTR, traffic, dashboards, CRM metrics
- persona_research: User personas, empathy maps, research insights, user profiles
- service_blueprint: Service layers, stakeholder maps, information architecture
- comparison_evaluation: Comparison matrix, SWOT, scoring, trade-off analysis
- design_system: Component library, color palette, typography, UI kit, tokens
- ux_prototype: Clickable prototype, wireframe, screen flow, interactive mockup
- generic: None of the above / unclear

━━━ DISAMBIGUATION RULES — COMMONLY CONFUSED FAMILY PAIRS ━━━

RULE A — mobile_app vs physical_product:
  • mobile_app: discussion focuses on app screens, navigation, gestures, in-app features, notifications, or the software experience ON a phone. Example: "the GO app shows the pump status and lets you change setpoints from your phone."
  • physical_product: discussion focuses on the physical enclosure, front panel buttons, LED indicators, display mounted ON the device, or the hardware itself. Example: "the control unit has a 4-line LCD and three push buttons on the front face."
  • AMBIGUOUS / insufficient signal: mentions of "app" or "phone" without describing screens → do NOT choose mobile_app based on a single word alone. A front-panel UI described without any mobile context → physical_product, not hmi_interface.

RULE B — user_journey vs workflow_process:
  • user_journey: named actors (customer, installer, end-user) experiencing a sequence of emotional stages, touchpoints, pain points, or opportunities over time. The perspective is human experience. Example: "the installer feels frustrated when the commissioning takes more than 30 minutes."
  • workflow_process: process steps, decision diamonds, swim lanes, BPMN-style logic, system triggers, or procedural flows without a named actor's emotional perspective. Example: "the alarm triggers a relay check, then the system logs the fault code."
  • Key differentiator: Is there a named human actor whose subjective experience is the focus? → user_journey. Is it a process or system flow with decisions? → workflow_process.

RULE C — hmi_interface vs ux_prototype:
  • hmi_interface: operational/runtime UI for monitoring and controlling a live industrial system (SCADA, control panel, real-time dashboards, operator screens). Context: the UI IS the product for plant operators.
  • ux_prototype: a design-phase mockup, wireframe, or clickable prototype being reviewed in a design meeting. Context: designers or product managers discussing what screens SHOULD look like.
  • Key differentiator: Is the team operating the system, or designing it? Operating → hmi_interface. Designing/reviewing mockups → ux_prototype.

RULE D — service_blueprint vs user_journey:
  • service_blueprint: multi-layer diagram showing frontstage, backstage, and support processes simultaneously — typically used by service designers mapping an entire service system. Includes line of visibility, internal processes, and technology layers.
  • user_journey: single-actor lens through phases of an experience — no explicit backstage/frontstage layer distinction.
  • Key differentiator: multiple service layers + internal processes → service_blueprint. Single actor experience arc → user_journey.

RULE E — management_summary vs requirements_matrix:
  • management_summary: strategic overview for executives — timelines, decisions, milestones, KPIs, Gantt, roadmap. Audience: decision-makers.
  • requirements_matrix: structured list of specific functional/non-functional requirements with priority, owner, and status. Audience: engineers and project managers.
  • Key differentiator: "what did we decide and when" → management_summary. "what must the system do, at what priority" → requirements_matrix.

━━━ REFINE CONSTRAINT — STRUCTURAL INCOMPATIBILITY ━━━
The following family pairs are structurally incompatible: their HTML layouts cannot be incrementally updated
into each other without producing corrupt output. When mode would be refine but vizFamily differs from
lastFamily AND the pair is in this list, you MUST return mode=fresh instead:

INCOMPATIBLE PAIRS (order-independent):
  • user_journey ↔ physical_product
  • user_journey ↔ mobile_app
  • physical_product ↔ mobile_app
  • hmi_interface ↔ physical_product

Note: workflow_process is intentionally excluded — it can often be refined to/from many families.

If the new vizFamily and lastFamily form one of the above pairs: return mode=fresh (not refine).

Mode rules:
- fresh: new topic or cold start, OR incompatible family shift (see REFINE CONSTRAINT above)
- refine: same family (or compatible families), user wants to modify existing viz
- skip: not enough signal (use sparingly)
- ask_user: confidence < 0.45 OR genuinely ambiguous with existing viz

CRITICAL RULES:
- Focus on the MOST RECENT content in the transcript — older context is background
- If session summary shows established family and transcript continues same topic → refine
- If transcript clearly pivots to a new family → fresh
- Confidence reflects how sure you are about the vizFamily choice
- refinementNote: brief instruction for the incremental viz generation (only when mode=refine); format MUST start with ADD:, UPDATE:, REMOVE:, or FOCUS: followed by specific instruction
- sessionSummaryUpdate: max 500 chars, updated meeting context summary (include dominant topic, family chosen, any key decisions)

Respond ONLY with a JSON object matching this exact schema (no markdown, no backticks):
{
  "vizFamily": "<family_id>",
  "mode": "fresh|refine|skip|ask_user",
  "refinementNote": "<optional, only for refine mode — MUST start with ADD:, UPDATE:, REMOVE:, or FOCUS:>",
  "confidence": 0.0-1.0,
  "rationale": "<brief explanation, max 2 sentences>",
  "sessionSummaryUpdate": "<updated session summary, max 500 chars>"
}`;

const ORCHESTRATOR_TIMEOUT_MS = 4000;
const MAX_TRANSCRIPT_TAIL_CHARS = 3200;
const MAX_SESSION_SUMMARY_CHARS = 1200;
const MAX_VIZ_METADATA_CHARS = 800;

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  try {
    if (_anthropicClient) return _anthropicClient;
    _anthropicClient = new Anthropic();
    return _anthropicClient;
  } catch {
    return null;
  }
}

function buildOrchestratorPrompt(input: OrchestratorInput): string {
  const lines: string[] = [];

  if (input.isColdStart) {
    lines.push("COLD START: No meeting history yet — this is the first visualization.\n");
  } else if (input.sessionSummary) {
    const summary = input.sessionSummary.slice(0, MAX_SESSION_SUMMARY_CHARS);
    lines.push(`SESSION SUMMARY (orchestrator-managed):\n${summary}\n`);
  }

  const vizMeta: string[] = [];
  if (input.lastFamily) vizMeta.push(`Current viz family: ${input.lastFamily}`);
  if (input.lastVizTitle) vizMeta.push(`Current viz title: "${input.lastVizTitle}"`);
  if (input.hasPreviousViz) vizMeta.push("Previous visualization exists");
  if (input.refinementDetected) vizMeta.push("Refinement signal detected in speech");
  if (input.classifierTop.length > 0) {
    const topScores = input.classifierTop
      .slice(0, 5)
      .map((s) => `${s.family}:${s.score}`)
      .join(", ");
    vizMeta.push(`Keyword classifier top scores: ${topScores}`);
  }
  if (vizMeta.length > 0) {
    // Join all metadata items first, then truncate by character budget (not array element count)
    const vizMetaStr = vizMeta.join("\n").slice(0, MAX_VIZ_METADATA_CHARS);
    lines.push(`VIZ CONTEXT:\n${vizMetaStr}\n`);
  }

  const tail = input.transcriptTail.slice(-MAX_TRANSCRIPT_TAIL_CHARS);
  lines.push(`RECENT TRANSCRIPT:\n"""\n${tail}\n"""`);

  return lines.join("\n");
}

/** Discriminated result to distinguish schema-parse failures from hard errors (timeout/network) */
type OrchestratorCallResult =
  | { ok: true; data: OrchestratorDecision }
  | { ok: false; reason: "schema_error"; error: unknown }
  | { ok: false; reason: "timeout" | "network" | "empty" };

async function callOrchestratorOnce(prompt: string): Promise<OrchestratorCallResult> {
  const client = getAnthropicClient();
  if (!client) {
    console.warn("[orchestrator-viz] No Anthropic client available");
    return { ok: false, reason: "network" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 400,
        temperature: 0.1,
        system: ORCHESTRATOR_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!text) {
      console.warn("[orchestrator-viz] Empty response");
      return { ok: false, reason: "empty" };
    }

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch (jsonErr) {
      console.warn("[orchestrator-viz] JSON parse failed:", jsonErr);
      return { ok: false, reason: "schema_error", error: jsonErr };
    }

    const parsed = OrchestratorDecisionSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[orchestrator-viz] Schema validation failed:", parsed.error.flatten());
      return { ok: false, reason: "schema_error", error: parsed.error };
    }

    return { ok: true, data: parsed.data };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError") || msg.toLowerCase().includes("timeout")) {
      console.warn(`[orchestrator-viz] Timed out after ${ORCHESTRATOR_TIMEOUT_MS}ms`);
      return { ok: false, reason: "timeout" };
    }
    console.warn(`[orchestrator-viz] Network/API error: ${msg}`);
    return { ok: false, reason: "network" };
  }
}

/**
 * Kald orchestratoren og returner en valideret beslutning.
 * Retrier KUN ved schema-fejl (LLM producerede invalid JSON/schema).
 * Timeout og netværksfejl returnerer null øjeblikkeligt — ingen retry.
 * Hard timeout: 4000ms per forsøg.
 */
export async function orchestratorVizDecision(
  input: OrchestratorInput,
): Promise<OrchestratorDecision | null> {
  if (!ORCHESTRATOR_VIZ_FLAG) return null;

  const prompt = buildOrchestratorPrompt(input);

  const inputHash = createHash("sha256")
    .update(input.transcriptTail.slice(-500))
    .digest("hex")
    .slice(0, 12);

  const t0 = Date.now();

  const first = await callOrchestratorOnce(prompt);

  let result: OrchestratorDecision | null = null;

  if (first.ok) {
    result = first.data;
  } else if (first.reason === "schema_error") {
    // Kun schema-fejl → retry (LLM output var malformt, men API var tilgængelig)
    console.log(`[orchestrator-viz] Schema error — retrying once (inputHash=${inputHash})`);
    const second = await callOrchestratorOnce(prompt);
    if (second.ok) {
      result = second.data;
    } else {
      console.warn(`[orchestrator-viz] Retry also failed (reason=${second.reason}, inputHash=${inputHash})`);
    }
  } else {
    // timeout/network/empty → null øjeblikkeligt, ingen retry
    console.warn(`[orchestrator-viz] Hard failure (reason=${first.reason}, inputHash=${inputHash}) — falling back to P1-P8`);
  }

  const elapsed = Date.now() - t0;

  if (result) {
    const zone =
      result.confidence < 0.45
        ? "ask_user"
        : result.confidence <= 0.72
          ? "auto_medium"
          : "auto_high";

    console.log(
      JSON.stringify({
        event: "orchestrator-viz-decision",
        inputHash,
        vizFamily: result.vizFamily,
        mode: result.mode,
        confidence: result.confidence,
        confidenceZone: zone,
        rationale: result.rationale.slice(0, 120),
        elapsedMs: elapsed,
      }),
    );
  } else {
    // Null/failure path: structured trace matches success shape for consistent observability.
    console.warn(
      JSON.stringify({
        event: "orchestrator-viz-fallback",
        inputHash,
        vizFamily: null,
        mode: null,
        confidence: null,
        confidenceZone: null,
        rationale: null,
        elapsedMs: elapsed,
        fallback: "P1-P8",
      }),
    );
  }

  return result;
}

/**
 * Validates the format of a refinementNote returned by the orchestrator.
 * Valid format: must contain at least one directive keyword (ADD:, UPDATE:, REMOVE:, or FOCUS:)
 * followed by non-empty content.
 *
 * Returns { note, valid: true } on match.
 * Returns { note: fallback, valid: false } with console.warn on format violation.
 * Never throws — visualization always continues regardless of note validity.
 */
export function parseRefinementNote(raw: string | undefined): {
  note: string;
  valid: boolean;
} {
  if (!raw || raw.trim().length === 0) {
    return { note: "", valid: false };
  }

  const REFINEMENT_NOTE_PATTERN = /^(?:ADD|UPDATE|REMOVE|FOCUS):\s*.+$/i;
  if (REFINEMENT_NOTE_PATTERN.test(raw)) {
    return { note: raw.trim(), valid: true };
  }

  console.warn(
    `[orchestrator-viz] refinementNote format invalid (no ADD:/UPDATE:/REMOVE:/FOCUS: directive) — falling back to raw note. raw="${raw.slice(0, 80)}"`,
  );
  return { note: raw.trim(), valid: false };
}

/**
 * Structurally incompatible family pairs.
 * When mode=refine and the chosen vizFamily + lastFamily form one of these pairs,
 * the HTML structures are incompatible and refine would produce corrupt output.
 *
 * Note: workflow_process is intentionally excluded — it can often be refined to/from many families.
 */
export const INCOMPATIBLE_FAMILY_PAIRS: ReadonlyArray<
  readonly [string, string]
> = [
  ["user_journey", "physical_product"],
  ["user_journey", "mobile_app"],
  ["physical_product", "mobile_app"],
  ["hmi_interface", "physical_product"],
] as const;

/**
 * Applies a structural guard on the orchestrator decision.
 * If mode=refine but vizFamily and lastFamily are structurally incompatible,
 * forces mode=fresh and clears effectivePreviousHtml.
 *
 * Returns a new decision object (OrchestratorDecision remains immutable) plus a flag
 * indicating whether the guard was applied.
 */
export function applyStructureGuard(
  decision: OrchestratorDecision,
  lastFamily: VizFamily | null,
): { decision: OrchestratorDecision; guardApplied: boolean } {
  if (decision.mode !== "refine" || !lastFamily) {
    return { decision, guardApplied: false };
  }

  const isIncompatible = INCOMPATIBLE_FAMILY_PAIRS.some(
    ([a, b]) =>
      (decision.vizFamily === a && lastFamily === b) ||
      (decision.vizFamily === b && lastFamily === a),
  );

  if (!isIncompatible) {
    return { decision, guardApplied: false };
  }

  console.log(
    JSON.stringify({
      event: "structural_guard_overrides_refine",
      vizFamily: decision.vizFamily,
      lastFamily,
      originalMode: "refine",
      forcedMode: "fresh",
      reason: `Incompatible family pair: ${decision.vizFamily} ↔ ${lastFamily}`,
    }),
  );

  const overriddenDecision: OrchestratorDecision = {
    ...decision,
    mode: "fresh",
    refinementNote: undefined,
  };

  return { decision: overriddenDecision, guardApplied: true };
}

export type { VizFamily };
