/**
 * Kvalitets-gate før tunge visualization-kald — mindsker støj, pris og "jitter"
 * fra meget korte transskripter uden meningsfuldt indhold.
 */

/** Minimum ord i normaliseret transskript før Claude kaldes (medmindre bypass). */
export const MIN_WORDS_FOR_VISUALIZATION = 5;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export type VisualizationQualitySkipReason = "too_few_words";

export type VisualizationQualityResult =
  | { ok: true; wordCount: number }
  | { ok: false; reason: VisualizationQualitySkipReason; wordCount: number };

export type VizQualityOptions = {
  /** Refinement (fx "zoom ind") skal altid kunne køre med kort tekst. */
  bypassForRefinement: boolean;
  /** Bruger har valgt konkret visualization-type — undgå at blokere korte test-input. */
  userPickedVisualizationType: boolean;
};

/**
 * Vurder om der er nok substans til at starte et visualization-kald.
 * Kører på allerede normaliseret transskript (som i visualize-ruten).
 */
export function evaluateVisualizationInput(
  normalizedTranscript: string,
  options: VizQualityOptions
): VisualizationQualityResult {
  const wc = wordCount(normalizedTranscript.trim());
  if (options.bypassForRefinement || options.userPickedVisualizationType) {
    return { ok: true, wordCount: wc };
  }
  if (wc < MIN_WORDS_FOR_VISUALIZATION) {
    return { ok: false, reason: "too_few_words", wordCount: wc };
  }
  return { ok: true, wordCount: wc };
}
