export interface RefinementResult {
  detected: boolean;
  directive: string | null;
  phrases: string[];
  confidence: "high" | "medium" | "low";
}

interface RefinementPattern {
  pattern: RegExp;
  weight: number;
  extractDirective: (match: RegExpMatchArray) => string;
}

function sanitizeDirective(text: string): string {
  return text
    .replace(/[<>{}[\]`]/g, "")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 120);
}

// ─── Negation prefixes ──────────────────────────────────────────────────────
// If a refinement pattern match is preceded by one of these, suppress it.
const NEGATION_PREFIX_RE =
  /(?:don'?t|do\s+not|doesn'?t|does\s+not|shouldn'?t|should\s+not|won'?t|will\s+not|can'?t|cannot|not\s+going\s+to|never|no\s+need\s+to|ikke|aldrig|undlad|lad\s+v(?:ær|ae)re\s+med\s+at|skal\s+ikke|beh(?:ø|o)ver\s+ikke)\s+$/i;

// ─── Viz-context words ──────────────────────────────────────────────────────
// If a refinement match's captured group contains one of these, add +1 weight
// (makes "focus on the diagram" stronger than "focus on the customer").
const VIZ_CONTEXT_RE =
  /\b(?:viz|visual(?:isation|ization|isering)?|diagram(?:met)?|chart|figur(?:en)?|map|kort(?:et)?|graf(?:en)?|tabel(?:len)?|blueprint|overview|overblik|layout|tegning(?:en)?)\b/i;

const REFINEMENT_PATTERNS: RefinementPattern[] = [
  // ─── Explicit viz-modification verbs (high confidence) ─────────────────────
  // These ALWAYS imply the user wants to change the current visualization.
  {
    pattern: /(?:update|modify|change|adjust|tweak|fix|correct|redo)\s+(?:the\s+)?(?:viz(?:ualization)?|diagram|chart|figur(?:en)?|map|kort(?:et)?|graf(?:en)?|layout|blueprint|overview|overblik)\s*(?::|—|-|–|to|so|with)?\s*(.{0,120})/i,
    weight: 5,
    extractDirective: (m) =>
      `MODIFY VIZ: Update the visualization${m[1]?.trim() ? ` — ${sanitizeDirective(m[1])}` : ""}.`,
  },
  {
    pattern: /(?:ret|ændr|opdater|juster|tilpas)\s+(?:den?\s+)?(?:visual(?:iseringen)?|diagram(?:met)?|figur(?:en)?|kort(?:et)?|graf(?:en)?|layout(?:et)?|tegning(?:en)?)\s*(?::|—|-|–|til|så)?\s*(.{0,120})/i,
    weight: 5,
    extractDirective: (m) =>
      `RET VIZ: Opdater visualiseringen${m[1]?.trim() ? ` — ${sanitizeDirective(m[1])}` : ""}.`,
  },

  // ─── Structural modification patterns (high confidence) ────────────────────
  {
    pattern: /(?:tilføj|indsæt|insert)\s+(?:en\s+)?(?:kolonne|column|felt|field|sektion|section|panel|række|row)\s+(?:med|with|for|til)\s+(.{3,80})/i,
    weight: 4,
    extractDirective: (m) => `ADD COLUMN/SECTION: Add a new column or section for "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:fjern|slet)\s+(?:den?\s+)?(?:del|sektion|section|part|kolonne|column)\s+(?:om|about|med|with|for)\s+(.{3,60})/i,
    weight: 4,
    extractDirective: (m) => `REMOVE: Remove the section about "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:behold|bevar|preserve)\s+(?:formatet|layoutet|strukturen|format|layout|structure|designet|design)\s+(?:men|but|og|and)\s+(.{3,80})/i,
    weight: 4,
    extractDirective: (m) => `KEEP FORMAT + MODIFY: Preserve the current layout and visual style, but: ${sanitizeDirective(m[1])}.`,
  },
  {
    pattern: /(?:behold|bevar)\s+(?:det\s+)?(?:hele|alt)\s+(?:men|og)\s+(.{3,80})/i,
    weight: 4,
    extractDirective: (m) => `KEEP ALL + MODIFY: Keep everything as-is but: ${sanitizeDirective(m[1])}.`,
  },

  // ─── Zoom / drill-down patterns (medium-high confidence) ───────────────────
  {
    pattern: /(?:zoom|zoome?)\s+(?:ind|in)\s+(?:på|on)\s+(.{3,80})/i,
    weight: 4,
    extractDirective: (m) => `ZOOM IN: Expand and show more detail on "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:drill\s+down\s+into|drill\s+down\s+on|(?:^|\b)drill\s+into)\s+(.{3,120})/i,
    weight: 4,
    extractDirective: (m) =>
      `DEEP DIVE: Add more detail for "${sanitizeDirective(m[1])}" (drill-down).`,
  },

  // ─── Generic focus/elaborate patterns (medium confidence) ──────────────────
  // These are VERY common in natural speech ("focus on the customer", "elaborate
  // on the timeline") — weight 2 alone (below threshold), but VIZ_CONTEXT_RE
  // boosts +1 to reach threshold when the captured text mentions the viz.
  {
    pattern: /(?:^|\b)(?:focus|focusing)\s+on\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `FOCUS: Expand and emphasize "${sanitizeDirective(m[1])}" — give it more visual weight.`,
  },
  {
    pattern: /(?:^|\b)(?:concentrate|concentrating)\s+on\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `FOCUS: Concentrate the visualization on "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:^|\b)(?:emphasize|emphasise|highlight)\s+(?:the\s+)?(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `EMPHASIS: Highlight "${sanitizeDirective(m[1])}" more prominently in the diagram.`,
  },
  {
    pattern: /(?:elaborate|elaborating)\s+(?:on|upon)\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `ELABORATE: Add nuance and detail to "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /double\s+down\s+on\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `EXPAND: Go deeper on "${sanitizeDirective(m[1])}" while keeping the current structure.`,
  },
  {
    pattern: /(?:give|giv)\s+more\s+(?:attention|weight)\s+to\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `FOCUS: Give more visual weight to "${sanitizeDirective(m[1])}".`,
  },

  // ─── Explicit refine-the-viz pattern (medium) ─────────────────────────────
  {
    pattern: /(?:^|\b)(?:refine|polish|improve|tighten)\s+(?:the\s+)?(?:viz(?:ualization)?|diagram|chart|map|section)\s*(?::|—|-|–)?\s*(.{0,120})/i,
    weight: 4,
    extractDirective: (m) =>
      `REFINE: Improve the visualization${m[1]?.trim() ? ` regarding "${sanitizeDirective(m[1])}"` : ""}.`,
  },

  // ─── Dansk / nordisk tale ─────────────────────────────────────────────────
  {
    pattern: /(?:gå|ga)\s+(?:lidt\s+)?(?:mere\s+)?i\s+dybden\s+(?:med|om|omkring)\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `UDDYB: Gå mere i dybden med "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:uddyb|udbyg)\s+(?:lidt\s+)?(?:mere\s+)?(?:omkring|om|vedr\.?\s*)?\s*(.{3,120})/i,
    weight: 3,
    extractDirective: (m) => `UDDYB: Udbyg "${sanitizeDirective(m[1])}" med mere detalje.`,
  },
  {
    pattern: /forbedre\s+(?:(?:gerne|lige)\s+)?(?:visual(?:iseringen)?|diagram(?:met)?|figur(?:en)?)?\s*(?:—|,)?\s*(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `FORBEDRE: Forbedr visualiseringen vedr. "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /ser\s+(?:nærmere|lige)\s+på\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `DYK NED: Uddyb "${sanitizeDirective(m[1])}" i samme stil som nu.`,
  },
  {
    pattern: /kig(?:ge(?:r)?)?\s+nærmere\s+på\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `DYK NED: Kig nærmere på "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /kan\s+vi\s+(?:lige\s+)?(?:uddyb|udbyg|udfolde)\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `UDDYB: Uddyb "${sanitizeDirective(m[1])}" — behold den nuværende struktur hvor muligt.`,
  },
  {
    pattern: /(?:fokus(?:era|ere)|fokuserer)\s+på\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `FOCUS: Lägg tyngdpunkt på "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:fokuser|fokusér)\s+(?:på|mere\s+på)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `FOCUS: Expand and emphasize "${sanitizeDirective(m[1])}" — give it more visual weight.`,
  },

  // ─── Remaining structural patterns ────────────────────────────────────────
  {
    pattern: /(?:opdel|split|del\s+op|break\s+down|nedbryd)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `BREAK DOWN: Split "${sanitizeDirective(m[1])}" into more granular sub-items.`,
  },
  {
    pattern: /(?:udvid|expand|elabor(?:ate|er))\s+(?:den?\s+)?(?:del|sektion|section|part|område|area)\s+(?:om|about|med|with|for)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `EXPAND: Make the section about "${sanitizeDirective(m[1])}" larger and more detailed.`,
  },
  {
    pattern: /(?:mere\s+detalje|more\s+detail|flere\s+detaljer|more\s+details)\s+(?:om|about|på|on|for|i|in)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `MORE DETAIL: Add more granularity to "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:lad\s+os\s+(?:se|kigge)\s+(?:nærmere\s+)?på)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `DEEP DIVE: Explore "${sanitizeDirective(m[1])}" in more depth.`,
  },
  {
    pattern: /(?:kan\s+(?:du|vi))\s+(?:tilføje|vise|inkludere)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `ADD: Include "${sanitizeDirective(m[1])}" in the visualization.`,
  },
  {
    pattern: /(?:gør|make)\s+(?:det|den|it)\s+(?:mere|more)\s+(\w[\w\s]{2,40})/i,
    weight: 2,
    extractDirective: (m) => `STYLE: Make the visualization more "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:sammenlign|compare)\s+(.{3,80})\s+(?:med|with)\s+(.{3,60})/i,
    weight: 3,
    extractDirective: (m) => `COMPARE: Add a comparison between "${sanitizeDirective(m[1])}" and "${sanitizeDirective(m[2])}".`,
  },
  {
    pattern: /(?:vis|fremhæv)\s+(?:sammenhængen|forbindelsen)\s+(?:mellem|between)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `SHOW RELATIONSHIP: Highlight the connections between ${sanitizeDirective(m[1])}.`,
  },
];

const RECENT_CHARS_WINDOW = 2000;

/**
 * Check if the text immediately before a match contains a negation.
 * Looks at the 40 chars preceding the match start for negation patterns.
 */
function isNegated(fullText: string, matchIndex: number): boolean {
  const prefixStart = Math.max(0, matchIndex - 40);
  const prefix = fullText.slice(prefixStart, matchIndex);
  return NEGATION_PREFIX_RE.test(prefix);
}

/**
 * Check if the captured content of the match references viz/diagram concepts,
 * boosting confidence that the refinement is about the visualization itself.
 */
function hasVizContext(match: RegExpMatchArray): boolean {
  const captured = match.slice(1).join(" ");
  return VIZ_CONTEXT_RE.test(captured);
}

export function detectRefinementIntent(
  fullTranscript: string,
  previousVisualizationExists: boolean
): RefinementResult {
  if (!previousVisualizationExists) {
    return { detected: false, directive: null, phrases: [], confidence: "low" };
  }

  const recentText = fullTranscript.slice(-RECENT_CHARS_WINDOW);

  let bestWeight = 0;
  let bestDirective: string | null = null;
  let bestPhrase: string | null = null;
  let bestMatchLen = 0;

  for (const { pattern, weight, extractDirective } of REFINEMENT_PATTERNS) {
    const match = recentText.match(pattern);
    if (!match) continue;

    // Negation suppression: "don't focus on X" → skip
    if (isNegated(recentText, match.index ?? 0)) continue;

    // Viz-context bonus: "focus on the diagram" gets +1 over "focus on the customer"
    const vizBonus = hasVizContext(match) ? 1 : 0;
    const effectiveWeight = weight + vizBonus;

    const len = match[0].length;
    if (effectiveWeight > bestWeight || (effectiveWeight === bestWeight && len > bestMatchLen)) {
      bestWeight = effectiveWeight;
      bestMatchLen = len;
      bestDirective = extractDirective(match);
      bestPhrase = match[0].trim();
    }
  }

  // Threshold: >= 3 required. Generic "focus on X" (weight=2) alone doesn't
  // trigger unless the captured text mentions viz/diagram (+1 bonus → 3).
  const detected = bestWeight >= 3;

  const confidence: RefinementResult["confidence"] =
    bestWeight >= 5 ? "high" : bestWeight >= 3 ? "medium" : "low";

  return {
    detected,
    directive: detected ? bestDirective : null,
    phrases: bestPhrase && detected ? [bestPhrase] : [],
    confidence,
  };
}
