import { GoogleGenAI } from "@google/genai";
import type { VizFamily } from "./classifier.js";

export interface LlmRoutingResult {
  family: VizFamily;
  isRefinement: boolean;
  confidence: number;
  reason: string;
}

const VALID_FAMILIES: VizFamily[] = [
  "hmi_interface",
  "user_journey",
  "workflow_process",
  "physical_product",
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

const ROUTING_SYSTEM = `You are a visualization routing classifier for Grundfos pump workshop meetings.
Given recent transcript text and context about the current visualization, decide:
1. Which visualization family best matches what the participants are CURRENTLY discussing
2. Whether this is a REFINEMENT of the existing visualization or a NEW TOPIC

Visualization families:
- hmi_interface: Digital screen UI, menus, navigation, touch screen, operator interface, display layout
- user_journey: Customer experience map, touchpoints, journey stages, pain points, experience flow
- workflow_process: Process flow, steps, decision points, swimlanes, business process, operations
- physical_product: Physical pump hardware, front panel, buttons, LEDs, housing, control face, device appearance
- requirements_matrix: Requirements list, traceability, MoSCoW prioritization, acceptance criteria
- management_summary: Executive summary, timeline, Gantt, KPIs, decisions, milestones
- engagement_analytics: Digital analytics, CTR, retention, CRM, CDP, GDPR, marketing metrics
- persona_research: User personas, research insights, empathy maps, interviews, user profiles
- service_blueprint: Service layers, touchpoints, backstage processes, stakeholder maps
- comparison_evaluation: Comparison matrix, SWOT, scoring, evaluation, trade-off analysis
- design_system: Component library, color palette, typography, spacing, UI kit
- ux_prototype: Interactive prototype, clickable mockup, wireframe, screen flow
- generic: None of the above / unclear

IMPORTANT RULES:
- Focus on what participants are discussing RIGHT NOW, not earlier topics
- "front panel", "buttons", "LED", "display on the pump", "physical device" → physical_product
- "screen layout", "what the user sees on screen", "menu navigation" → hmi_interface
- If the user is clearly asking to modify/improve the CURRENT visualization → isRefinement=true
- If the user is talking about a NEW topic different from the current viz → isRefinement=false
- Confidence 0.0–1.0: how certain you are about the family choice`;

const ROUTING_TIMEOUT_MS = 4000;

let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (_geminiClient) return _geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

export async function llmRouteDecision(params: {
  recentTranscript: string;
  meetingEssenceBullets: string[];
  lastFamily: VizFamily | null;
  lastVizTitle: string | null;
  classificationScores: Array<{ family: string; score: number }>;
}): Promise<LlmRoutingResult | null> {
  const client = getGeminiClient();
  if (!client) {
    console.warn("[llm-router] No GEMINI_API_KEY — skipping LLM routing");
    return null;
  }

  const topScores = params.classificationScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => `${s.family}: ${s.score}`)
    .join(", ");

  const essenceBlock =
    params.meetingEssenceBullets.length > 0
      ? `Meeting context bullets:\n${params.meetingEssenceBullets.map((b) => `- ${b}`).join("\n")}`
      : "No meeting context available yet.";

  const userPrompt = `Current visualization: ${params.lastFamily ?? "none"} — "${params.lastVizTitle ?? "no title"}"
Keyword classifier top scores: ${topScores || "none"}
${essenceBlock}

Recent transcript (last ~500 words):
"""
${params.recentTranscript.slice(-3000)}
"""

Respond with ONLY a JSON object (no markdown, no backticks):
{"family": "<family_id>", "isRefinement": true/false, "confidence": 0.0-1.0, "reason": "<brief explanation>"}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ROUTING_TIMEOUT_MS,
    );

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userPrompt,
      config: {
        systemInstruction: ROUTING_SYSTEM,
        maxOutputTokens: 150,
        temperature: 0.1,
        abortSignal: controller.signal,
      },
    });

    clearTimeout(timeout);

    const text = response.text?.trim();
    if (!text) {
      console.warn("[llm-router] Empty response from Gemini");
      return null;
    }

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (
      !parsed.family ||
      typeof parsed.isRefinement !== "boolean" ||
      typeof parsed.confidence !== "number"
    ) {
      console.warn("[llm-router] Invalid response structure:", cleaned);
      return null;
    }

    if (!VALID_FAMILIES.includes(parsed.family)) {
      console.warn(
        `[llm-router] Unknown family "${parsed.family}" — ignoring`,
      );
      return null;
    }

    const result: LlmRoutingResult = {
      family: parsed.family as VizFamily,
      isRefinement: parsed.isRefinement,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: String(parsed.reason ?? "").slice(0, 200),
    };

    console.log(
      `[llm-router] family=${result.family} isRefinement=${result.isRefinement} confidence=${result.confidence} reason="${result.reason}"`,
    );
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.warn(`[llm-router] Timed out after ${ROUTING_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[llm-router] Error: ${msg}`);
    }
    return null;
  }
}
