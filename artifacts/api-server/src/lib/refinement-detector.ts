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

const REFINEMENT_PATTERNS: RefinementPattern[] = [
  // Engelsk / internationalt mødesprog — uddybe og forbedre eksisterende viz
  {
    pattern: /(?:^|\b)(?:focus|focusing)\s+on\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `FOCUS: Expand and emphasize "${sanitizeDirective(m[1])}" — give it more visual weight.`,
  },
  {
    pattern: /(?:^|\b)(?:concentrate|concentrating)\s+on\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `FOCUS: Concentrate the visualization on "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:^|\b)(?:emphasize|emphasise|highlight)\s+(?:the\s+)?(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `EMPHASIS: Highlight "${sanitizeDirective(m[1])}" more prominently in the diagram.`,
  },
  {
    pattern: /(?:drill\s+down\s+into|drill\s+down\s+on|(?:^|\b)drill\s+into)\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `DEEP DIVE: Add more detail for "${sanitizeDirective(m[1])}" (drill-down).`,
  },
  {
    pattern: /double\s+down\s+on\s+(.{3,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `EXPAND: Go deeper on "${sanitizeDirective(m[1])}" while keeping the current structure.`,
  },
  {
    pattern: /(?:give|giv)\s+more\s+(?:attention|weight)\s+to\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `FOCUS: Give more visual weight to "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:elaborate|elaborating)\s+(?:on|upon)\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `ELABORATE: Add nuance and detail to "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:^|\b)(?:refine|polish|improve|tighten)\s+(?:the\s+)?(?:viz(?:ualization)?|diagram|chart|map|section)\s*(?::|—|-|–)?\s*(.{0,120})/i,
    weight: 2,
    extractDirective: (m) =>
      `REFINE: Improve the visualization${m[1]?.trim() ? ` regarding "${sanitizeDirective(m[1])}"` : ""}.`,
  },
  // Dansk / nordisk tale
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
    weight: 2,
    extractDirective: (m) =>
      `FORBEDRE: Forbedr visualiseringen vedr. "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /ser\s+(?:nærmere|lige)\s+på\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `DYK NED: Uddyb "${sanitizeDirective(m[1])}" i samme stil som nu.`,
  },
  {
    pattern: /kig(?:ge(?:r)?)?\s+nærmere\s+på\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `DYK NED: Kig nærmere på "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /kan\s+vi\s+(?:lige\s+)?(?:uddyb|udbyg|udfolde)\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `UDDYB: Uddyb "${sanitizeDirective(m[1])}" — behold den nuværende struktur hvor muligt.`,
  },
  // Svensk/norsk “fokusera på” i grænseløse workshops
  {
    pattern: /(?:fokus(?:era|ere)|fokuserer)\s+på\s+(.{3,120})/i,
    weight: 3,
    extractDirective: (m) =>
      `FOCUS: Lägg tyngdpunkt på "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:zoom|zoome?)\s+(?:ind|in)\s+(?:på|on)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `ZOOM IN: Expand and show more detail on "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:tilføj|indsæt|insert)\s+(?:en\s+)?(?:kolonne|column|felt|field|sektion|section|panel|række|row)\s+(?:med|with|for|til)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `ADD COLUMN/SECTION: Add a new column or section for "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:behold|bevar|preserve)\s+(?:formatet|layoutet|strukturen|format|layout|structure|designet|design)\s+(?:men|but|og|and)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `KEEP FORMAT + MODIFY: Preserve the current layout and visual style, but: ${sanitizeDirective(m[1])}.`,
  },
  {
    pattern: /(?:behold|bevar)\s+(?:det\s+)?(?:hele|alt)\s+(?:men|og)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `KEEP ALL + MODIFY: Keep everything as-is but: ${sanitizeDirective(m[1])}.`,
  },
  {
    pattern: /(?:fokuser|fokusér)\s+(?:på|mere\s+på)\s+(.{3,80})/i,
    weight: 3,
    extractDirective: (m) => `FOCUS: Expand and emphasize "${sanitizeDirective(m[1])}" — give it more visual weight.`,
  },
  {
    pattern: /(?:udvid|expand|elabor(?:ate|er))\s+(?:den?\s+)?(?:del|sektion|section|part|område|area)\s+(?:om|about|med|with|for)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `EXPAND: Make the section about "${sanitizeDirective(m[1])}" larger and more detailed.`,
  },
  {
    pattern: /(?:mere\s+detalje|more\s+detail|flere\s+detaljer|more\s+details)\s+(?:om|about|på|on|for|i|in)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `MORE DETAIL: Add more granularity to "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:fjern|slet)\s+(?:den?\s+)?(?:del|sektion|section|part|kolonne|column)\s+(?:om|about|med|with|for)\s+(.{3,60})/i,
    weight: 2,
    extractDirective: (m) => `REMOVE: Remove the section about "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:opdel|split|del\s+op|break\s+down|nedbryd)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `BREAK DOWN: Split "${sanitizeDirective(m[1])}" into more granular sub-items.`,
  },
  {
    pattern: /(?:lad\s+os\s+(?:se|kigge)\s+(?:nærmere\s+)?på)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `DEEP DIVE: Explore "${sanitizeDirective(m[1])}" in more depth.`,
  },
  {
    pattern: /(?:kan\s+(?:du|vi))\s+(?:tilføje|vise|inkludere)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `ADD: Include "${sanitizeDirective(m[1])}" in the visualization.`,
  },
  {
    pattern: /(?:gør|make)\s+(?:det|den|it)\s+(?:mere|more)\s+(\w[\w\s]{2,40})/i,
    weight: 2,
    extractDirective: (m) => `STYLE: Make the visualization more "${sanitizeDirective(m[1])}".`,
  },
  {
    pattern: /(?:sammenlign|compare)\s+(.{3,80})\s+(?:med|with)\s+(.{3,60})/i,
    weight: 2,
    extractDirective: (m) => `COMPARE: Add a comparison between "${sanitizeDirective(m[1])}" and "${sanitizeDirective(m[2])}".`,
  },
  {
    pattern: /(?:vis|fremhæv)\s+(?:sammenhængen|forbindelsen)\s+(?:mellem|between)\s+(.{3,80})/i,
    weight: 2,
    extractDirective: (m) => `SHOW RELATIONSHIP: Highlight the connections between ${sanitizeDirective(m[1])}.`,
  },
];

const RECENT_CHARS_WINDOW = 2000;

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
    const len = match[0].length;
    if (weight > bestWeight || (weight === bestWeight && len > bestMatchLen)) {
      bestWeight = weight;
      bestMatchLen = len;
      bestDirective = extractDirective(match);
      bestPhrase = match[0].trim();
    }
  }

  const detected = bestWeight >= 2;

  const confidence: RefinementResult["confidence"] =
    bestWeight >= 3 ? "high" : bestWeight >= 2 ? "medium" : "low";

  return {
    detected,
    directive: detected ? bestDirective : null,
    phrases: bestPhrase && detected ? [bestPhrase] : [],
    confidence,
  };
}
