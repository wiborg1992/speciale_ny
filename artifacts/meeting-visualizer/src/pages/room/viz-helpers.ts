import type { VizDebugInfo } from "@/types/viz-debug";

export function extractVizName(html: string): string | null {
  const div = document.createElement("div");
  div.innerHTML = html;
  const h1 = div.querySelector("h1");
  if (h1 && h1.textContent && h1.textContent.trim().length > 2)
    return h1.textContent.trim().slice(0, 42);
  const h2 = div.querySelector("h2");
  if (h2 && h2.textContent && h2.textContent.trim().length > 2)
    return h2.textContent.trim().slice(0, 42);
  return null;
}

/** Til /api/actions: ingen prompts, ingen lang inputText — kun hvad modellen skal forklare alment. */
export function slimVizTraceForReasoning(
  info: VizDebugInfo | null | undefined,
): Record<string, unknown> | null {
  if (!info) return null;
  const c = info.classification;
  const base: Record<string, unknown> = {
    vizType: info.vizType,
    vizModel: info.vizModel,
    resolvedFamily: info.resolvedFamily ?? undefined,
    workspaceDomain: info.workspaceDomain ?? undefined,
    isIncremental: info.isIncremental,
    isRefinement: info.isRefinement,
    hasPreviousHtml: info.hasPreviousHtml,
    focusSegment: info.focusSegment ?? undefined,
    refinementDirective: info.refinementDirective ?? undefined,
    userPickedType: info.userPickedType,
    transcriptTotalWords: info.transcriptTotalWords,
  };
  if (c) {
    base.classification = {
      family: c.family,
      topic: c.topic,
      ambiguous: c.ambiguous,
      lead: c.lead,
      inputMode: c.inputMode,
      inputWords: c.inputWords,
      totalWords: c.totalWords,
      topScores: [...(c.allScores ?? [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((s) => ({ family: s.family, score: s.score })),
    };
  }
  return base;
}

export function cloneVizDebug(
  info: VizDebugInfo | null | undefined,
): VizDebugInfo | null {
  if (!info) return null;
  try {
    return structuredClone(info) as VizDebugInfo;
  } catch {
    try {
      return JSON.parse(JSON.stringify(info)) as VizDebugInfo;
    } catch {
      return { ...info };
    }
  }
}
