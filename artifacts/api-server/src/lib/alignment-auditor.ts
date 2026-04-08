/**
 * Alignment Auditor — rubric + LLM auditor for semantic correctness of visualizations.
 *
 * Task 1: evaluateAlignmentRubric — family-specific structural rules
 * Task 2: runLlmAlignmentAudit — claude-haiku semantic check (conditional)
 * Task 3: resolveAlignmentSeverity — §3b severity composition rules
 *
 * LLM auditor triggers ONLY when mode=refine OR orchestratorConfidence < 0.65.
 * Rubric severity caps at "warn" (structural-only can never reach "fail").
 * Timeout: 3s, no retry.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VizFamily } from "./classifier.js";

export type AlignmentSeverity = "ok" | "warn" | "fail";

export interface RubricResult {
  hits: string[];
  severity: "ok" | "warn";
  criticalHits: string[];
}

export interface LlmAuditResult {
  verdict: "ok" | "warn" | "fail";
  reason: string;
}

export interface AlignmentResult {
  severity: AlignmentSeverity;
  rubricHits: string[];
  llmVerdict: LlmAuditResult["verdict"] | null;
  /** true when trigger conditions matched (mode=refine or confidence<0.65) */
  llmTriggered: boolean;
  /** true when LLM call actually started (client available) and returned a verdict */
  llmCompleted: boolean;
}

// ─── Rubric definitions per family ──────────────────────────────────────────

/**
 * Returns patterns that constitute critical (structural/semantic) hits vs. cosmetic hits.
 * Critical hits: structurally or semantically wrong — a user_journey without lanes,
 * mobile_app with a pump P&ID as primary, etc.
 * Cosmetic hits: missing small elements (icon, subtitle) — style issues only.
 */

function checkUserJourney(html: string): RubricResult {
  const hits: string[] = [];
  const criticalHits: string[] = [];

  // Must have named actor lanes (swim lanes)
  const hasLanes =
    /swim[\s-]?lane|lane[\s-]?label|actor[\s-]?lane|<td[^>]*>\s*(Actor|User|Customer|System|Service|Touchpoint|Emotions?|Pain\s*Points?|Opportunit)/i.test(html) ||
    /class="[^"]*lane[^"]*"|data-lane|role="row".*Actor|swimlane/i.test(html);

  if (!hasLanes) {
    hits.push("user_journey: manglende navngivne aktør-lanes (swimlanes)");
    criticalHits.push("user_journey: manglende navngivne aktør-lanes (swimlanes)");
  }

  // Must not be a dark HMI-style dashboard (dark navy background = wrong family)
  const hasDarkHmi =
    /#0d1421|#111827|#080e1a|hmi|scada|control[\s-]room/i.test(html) &&
    !/(journey|touchpoint|persona|emotion)/i.test(html);
  if (hasDarkHmi) {
    hits.push("user_journey: HTML bruger HMI-farveskema (mørk navy) — forkert familie");
    criticalHits.push("user_journey: HTML bruger HMI-farveskema (mørk navy) — forkert familie");
  }

  // Must have phases (Awareness/Research/etc.) or column headers
  const hasPhases =
    /Awareness|Research|Purchase|Onboarding|Discovery|Consider|Evaluat|Decision|Retention|Renew|phase|Phase/i.test(html);
  if (!hasPhases) {
    hits.push("user_journey: ingen fasekolonner (Awareness, Research, Purchase mv.) detekteret");
  }

  return {
    hits,
    criticalHits,
    severity: hits.length === 0 ? "ok" : "warn",
  };
}

function checkMobileApp(html: string): RubricResult {
  const hits: string[] = [];
  const criticalHits: string[] = [];

  // Must have app chrome elements (status bar, nav bar, bottom nav, screen)
  const hasAppChrome =
    /status[\s-]?bar|nav[\s-]?bar|bottom[\s-]?nav|tab[\s-]?bar|screen|mobile[\s-]?frame|phone[\s-]?frame|app[\s-]?shell|iphone|android/i.test(html) ||
    /class="[^"]*screen[^"]*"|class="[^"]*mobile[^"]*"|class="[^"]*phone[^"]*"|class="[^"]*app[^"]*"/i.test(html);

  if (!hasAppChrome) {
    hits.push("mobile_app: mangler app-krom-elementer (status bar, nav bar, screen frame)");
    criticalHits.push("mobile_app: mangler app-krom-elementer (status bar, nav bar, screen frame)");
  }

  // Must NOT have pump SVG as primary content
  // Pump SVG = large complex SVG with pump-specific elements (CR, CM, Alpha GO, CU, P&ID, etc.)
  const hasPumpSvgPrimary =
    /pump|centrifugal|impeller|P&amp;ID|P&ID|pumphouse|booster[\s-]?station|alfa[\s-]?go|alpha[\s-]?go|CU[\s-]?200|CR[\s-]?series|CM[\s-]?series/i.test(html) &&
    /<svg[^>]*>[\s\S]{500,}<\/svg>/i.test(html) &&
    !/(screen|mobile[\s-]?frame|phone[\s-]?frame|app[\s-]?shell)/i.test(html);

  if (hasPumpSvgPrimary) {
    hits.push("mobile_app: pump SVG detekteret som primærindhold — forkert familie (brug physical_product)");
    criticalHits.push("mobile_app: pump SVG detekteret som primærindhold — forkert familie (brug physical_product)");
  }

  return {
    hits,
    criticalHits,
    severity: hits.length === 0 ? "ok" : "warn",
  };
}

function checkPhysicalProduct(html: string): RubricResult {
  const hits: string[] = [];
  const criticalHits: string[] = [];

  // Must have hardware visuals (SVG pump illustration, hardware components)
  const hasHardwareVisuals =
    /<svg[^>]*>[\s\S]{200,}<\/svg>/i.test(html) ||
    /hardware|pump|motor|enclosure|housing|LED|ring|panel|callout|CU|CR|CM|Alpha[\s-]?GO|front[\s-]?panel|mounting/i.test(html);

  if (!hasHardwareVisuals) {
    hits.push("physical_product: mangler hardware-visuals (SVG illustration, pump-komponenter, callout-linjer)");
    criticalHits.push("physical_product: mangler hardware-visuals (SVG illustration, pump-komponenter, callout-linjer)");
  }

  // Must NOT be a dark HMI dashboard as primary (no SVG pump + heavy HMI chrome)
  const isHmiInstead =
    /#0d1421|#111827|#080e1a/i.test(html) &&
    !/<svg[^>]*>[\s\S]{300,}<\/svg>/i.test(html);
  if (isHmiInstead) {
    hits.push("physical_product: HTML ligner HMI-dashboard uden hardware-SVG — mulig familifejl");
    criticalHits.push("physical_product: HTML ligner HMI-dashboard uden hardware-SVG — mulig familifejl");
  }

  return {
    hits,
    criticalHits,
    severity: hits.length === 0 ? "ok" : "warn",
  };
}

function checkHmiInterface(html: string): RubricResult {
  const hits: string[] = [];
  const criticalHits: string[] = [];

  // Must have screen elements (tabs, panels, dashboard chrome)
  const hasScreenElements =
    /tab|panel|dashboard|sidebar|topbar|nav|widget|metric|gauge|tile|screen|display|control/i.test(html);

  if (!hasScreenElements) {
    hits.push("hmi_interface: mangler skærmelementer (tabs, panels, dashboard, widgets)");
    criticalHits.push("hmi_interface: mangler skærmelementer (tabs, panels, dashboard, widgets)");
  }

  // Must have dark background (HMI style)
  const hasDarkBackground =
    /#0d1421|#111827|#080e1a|#141e2e|#0a0f1a|background[\s]*:[\s]*#[01]/i.test(html);

  if (!hasDarkBackground) {
    hits.push("hmi_interface: mangler mørk HMI-baggrund — mulig familifejl (lys layout er ikke HMI)");
  }

  return {
    hits,
    criticalHits,
    severity: hits.length === 0 ? "ok" : "warn",
  };
}

/**
 * Task 1: evaluateAlignmentRubric
 * Checks HTML output against family-specific structural requirements.
 * Returns { hits, severity } where severity is at most "warn" (rubric alone can never "fail").
 */
export function evaluateAlignmentRubric(
  html: string,
  vizFamily: VizFamily | string,
): RubricResult {
  switch (vizFamily) {
    case "user_journey":
      return checkUserJourney(html);
    case "mobile_app":
      return checkMobileApp(html);
    case "physical_product":
      return checkPhysicalProduct(html);
    case "hmi_interface":
      return checkHmiInterface(html);
    default:
      // No specific rubric for other families
      return { hits: [], criticalHits: [], severity: "ok" };
  }
}

// ─── LLM auditor ─────────────────────────────────────────────────────────────

const LLM_AUDIT_TIMEOUT_MS = 3000;

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

/**
 * Extract HTML headings and aria landmarks for LLM audit (avoid sending full HTML).
 */
function extractHtmlSample(html: string): string {
  const headings: string[] = [];
  const ariaLabels: string[] = [];

  // Extract headings
  const headingMatches = html.matchAll(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi);
  for (const m of headingMatches) {
    headings.push(m[1].trim().slice(0, 80));
    if (headings.length >= 12) break;
  }

  // Extract aria-label and role attributes
  const ariaMatches = html.matchAll(/aria-label="([^"]{3,60})"/gi);
  for (const m of ariaMatches) {
    ariaLabels.push(m[1].trim());
    if (ariaLabels.length >= 8) break;
  }

  // Extract title tags
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? `Title: ${titleMatch[1].trim()}` : "";

  const parts: string[] = [];
  if (pageTitle) parts.push(pageTitle);
  if (headings.length) parts.push(`Headings: ${headings.join(" | ")}`);
  if (ariaLabels.length) parts.push(`ARIA labels: ${ariaLabels.join(", ")}`);

  // Also capture first 200 chars of visible body text pattern
  const bodyTextMatch = html.match(/<body[^>]*>([\s\S]{1,200})/i);
  if (bodyTextMatch) {
    const stripped = bodyTextMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
    if (stripped.length > 20) parts.push(`Body preview: ${stripped}`);
  }

  return parts.join("\n");
}

const LLM_AUDIT_SYSTEM = `You are an alignment auditor for a meeting visualization tool.
Your job: given a meeting transcript tail, the intended visualization family, and HTML structure metadata, 
determine if the HTML output is semantically aligned with the transcript content.

Respond ONLY with JSON (no markdown, no backticks):
{"verdict": "ok"|"warn"|"fail", "reason": "<1-2 sentences max>"}

Verdict rules:
- "ok": HTML type matches transcript content well
- "warn": Partial mismatch — HTML type is plausible but may not optimally fit
- "fail": Clear semantic mismatch — HTML shows wrong content type for the transcript
         (e.g., user_journey HTML but transcript is about pump hardware specs, or mobile_app HTML but primary content is a P&ID diagram)

Be conservative: only "fail" for clear, unambiguous mismatches. Prefer "warn" when uncertain.`;

/**
 * Minimum chars of streamed HTML before triggering the LLM audit.
 * At ~800 chars we typically have the <head>, <title>, and first headings/structure.
 * The LLM call starts during streaming (overlaps with stream generation).
 */
export const LLM_AUDIT_EARLY_SAMPLE_CHARS = 800;

/**
 * Build the LLM audit prompt user message.
 * Called as soon as early HTML sample is available (during streaming).
 */
function buildLlmAuditMessage(
  transcript: string,
  vizFamily: VizFamily | string,
  htmlSample: string,
  refinementNote?: string | null,
): string {
  const transcriptTail = transcript.slice(-2000);
  return [
    `INTENDED VIZ FAMILY: ${vizFamily}`,
    refinementNote ? `REFINEMENT NOTE: ${refinementNote}` : null,
    `\nRECENT TRANSCRIPT (tail ~2000 chars):\n"""\n${transcriptTail}\n"""`,
    `\nHTML STRUCTURE METADATA (from early stream sample):\n${htmlSample}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Task 2: runLlmAlignmentAudit
 * Calls claude-haiku with transcript tail, family, HTML headers/aria, and refinementNote.
 * Timeout: 3s, no retry.
 * Triggered ONLY when mode=refine OR orchestratorConfidence < 0.65.
 *
 * htmlSample: pass the EARLY stream sample (first ~800+ chars) for parallelism,
 * or the full HTML metadata if called after streaming.
 */
export async function runLlmAlignmentAudit(
  transcript: string,
  vizFamily: VizFamily | string,
  html: string,
  refinementNote?: string | null,
): Promise<LlmAuditResult | null> {
  const client = getAnthropicClient();
  if (!client) {
    console.warn("[alignment-auditor] No Anthropic client — skipping LLM audit");
    return null;
  }

  const htmlSample = extractHtmlSample(html);
  const userMessage = buildLlmAuditMessage(transcript, vizFamily, htmlSample, refinementNote);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_AUDIT_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 120,
        temperature: 0.1,
        system: LLM_AUDIT_SYSTEM,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!text) return null;

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      ["ok", "warn", "fail"].includes(parsed.verdict) &&
      typeof parsed.reason === "string"
    ) {
      return { verdict: parsed.verdict as LlmAuditResult["verdict"], reason: parsed.reason };
    }

    console.warn("[alignment-auditor] LLM returned unexpected schema:", cleaned.slice(0, 100));
    return null;
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.toLowerCase().includes("timeout")) {
      console.warn("[alignment-auditor] LLM audit timed out after 3s — skipping");
    } else {
      console.warn("[alignment-auditor] LLM audit error:", msg.slice(0, 100));
    }
    return null;
  }
}

/**
 * Start an early LLM audit from a partial HTML sample captured during streaming.
 * Returns a Promise that resolves to LlmAuditResult | null.
 * The caller is responsible for starting this as soon as earlyHtmlSample is available
 * (e.g., once ~800 chars have streamed), so the Claude call overlaps with stream generation.
 */
export function startEarlyLlmAudit(
  transcript: string,
  vizFamily: VizFamily | string,
  earlyHtmlSample: string,
  refinementNote?: string | null,
): Promise<LlmAuditResult | null> {
  return runLlmAlignmentAudit(transcript, vizFamily, earlyHtmlSample, refinementNote);
}

// ─── Severity composition — §3b rules ────────────────────────────────────────

/**
 * Task 3: resolveAlignmentSeverity — §3b rule implementation.
 *
 * Rules (in priority order):
 *   LLM fail → fail
 *   LLM warn + critical rubric hit → fail
 *   LLM warn + rubric ok (no critical hits) → warn
 *   LLM ok → ok
 *   No LLM used, rubric hits → at most warn (rubric alone caps at warn)
 *   No LLM, no rubric hits → ok
 */
export function resolveAlignmentSeverity(
  rubric: RubricResult,
  llm: LlmAuditResult | null,
): AlignmentSeverity {
  if (!llm) {
    // No LLM: rubric alone, caps at warn
    return rubric.hits.length > 0 ? "warn" : "ok";
  }

  if (llm.verdict === "fail") {
    return "fail";
  }

  if (llm.verdict === "warn") {
    if (rubric.criticalHits.length > 0) {
      return "fail";
    }
    return "warn";
  }

  // LLM ok
  return "ok";
}
