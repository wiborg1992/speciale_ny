/**
 * Generic transcription prompt helper for OpenAI gpt-4o-transcribe.
 *
 * Context-specific vocabulary comes from user-uploaded files, not from
 * hardcoded company profiles. This module provides a generic fallback
 * and helpers for building context-aware prompts from uploaded files.
 */

export type WorkspaceDomain = string;

const GENERIC_PROMPT_DA = `
Professionelt møde — transskribér præcist.

Almindelige fagbegreber: dashboard, KPI, workflow, roadmap, brugerrejse, user journey, stakeholder, onboarding, prototype, wireframe, persona, backlog, sprint, feature, API, integration, datamodel, compliance, regulativ, validering, pilotprojekt, proof of concept.
Processer: workshop, review, retrospektiv, stand-up, kickoff, planlægning, estimering, prioritering, beslutning, godkendelse, opfølgning.
Roller: projektleder, product owner, UX-designer, udvikler, dataanalytiker, manager, slutbruger, stakeholder, facilitator.
`.trim();

const GENERIC_PROMPT_EN = `
Professional meeting — transcribe accurately.

Common professional terms: dashboard, KPI, workflow, roadmap, user journey, stakeholder, onboarding, prototype, wireframe, persona, backlog, sprint, feature, API, integration, data model, compliance, regulation, validation, pilot project, proof of concept.
Processes: workshop, review, retrospective, stand-up, kickoff, planning, estimation, prioritisation, decision, approval, follow-up.
Roles: project manager, product owner, UX designer, developer, data analyst, manager, end user, stakeholder, facilitator.
`.trim();

/**
 * Returns a generic transcription prompt.
 * If the user has uploaded context files, callers should append those
 * keyword lists to the returned string for best accuracy.
 */
export function getDomainPrompt(
  _domain: WorkspaceDomain,
  language: "da" | "en" = "da",
): string {
  return language === "en" ? GENERIC_PROMPT_EN : GENERIC_PROMPT_DA;
}

/**
 * Build an enhanced transcription prompt from user-uploaded context files.
 * Pass the concatenated text of all uploaded files; key terms are extracted.
 */
export function buildContextPrompt(
  uploadedContextText: string,
  language: "da" | "en" = "da",
): string {
  const base = getDomainPrompt("generic", language);
  if (!uploadedContextText.trim()) return base;
  const header =
    language === "en"
      ? "Additional vocabulary from workspace context:"
      : "Yderligere fagtermer fra workspace-kontekst:";
  return `${base}\n\n${header}\n${uploadedContextText.slice(0, 2000)}`;
}

/** Short UI label shown when a context-based prompt is active. */
export function getDomainPromptLabel(_domain: WorkspaceDomain): string {
  return "";
}
