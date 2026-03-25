/**
 * Server-side transcript classification engine.
 * Scores the transcript tail against weighted keyword signals to determine
 * the most appropriate visualization family BEFORE calling the AI.
 * This eliminates ambiguity and dramatically sharpens type selection.
 */

export type VizFamily =
  | "hmi_interface"
  | "user_journey"
  | "workflow_process"
  | "physical_product"
  | "requirements_matrix"
  | "management_summary"
  | "generic";

export interface ClassificationResult {
  family: VizFamily;
  topic: string;
  scores: Array<{ id: string; label: string; score: number }>;
  ambiguous: boolean;
  lead: number;
  runnerUp: string | null;
}

const VIZ_CLASSIFY_TAIL_CHARS = 12_000;
const CLASSIFY_MIN_TOTAL = 8;
const CLASSIFY_MIN_LEAD  = 4;

const FAMILY_PRIORITY_ORDER: VizFamily[] = [
  "hmi_interface",
  "user_journey",
  "workflow_process",
  "physical_product",
  "requirements_matrix",
  "management_summary",
  "generic",
];

/**
 * terms: [substring, weight]
 * Longer/domain-specific phrases first with higher weights.
 * Prevents false positives via MIN_LEAD gap requirement.
 */
const VIZ_FAMILY_SIGNALS: Array<{
  id: VizFamily;
  label: string;
  terms: Array<[string, number]>;
}> = [
  {
    id:    "hmi_interface",
    label: "HMI / SCADA interface",
    terms: [
      ["human machine interface", 22],
      ["hmi interface",           22],
      ["menneske maskine",        14],
      ["navigationstab",          20],
      ["navigation tab",          20],
      ["navigation tabs",         20],
      ["navigationstabs",         18],
      ["grafisk brugergrænseflade", 16],
      ["brugergrænseflade",       10],
      ["procesbillede",           16],
      ["process image",           16],
      ["synoptisk billede",       14],
      ["synoptic",                12],
      ["alarmvisning",            14],
      ["alarm view",              14],
      ["alarm list",              12],
      ["hændelseslog",            12],
      ["event list",              12],
      ["live values",             12],
      ["live værdier",            12],
      ["setpoint",                10],
      ["setpunkt",                10],
      ["operator screen",         14],
      ["operator panel",          14],
      ["betjeningspanel",         14],
      ["kontrolpanel",            12],
      ["touch panel",             12],
      ["touch screen",            12],
      ["touchskærm",              12],
      ["isolutions",              18],
      ["i solutions",             14],
      ["plc",                      8],
      ["scada",                   16],
      ["supervisory",             10],
      ["hmi",                     12],
      ["trending",                 8],
      ["trendkurve",               8],
      ["mimic diagram",           12],
      ["control room",            10],
      ["driftsskærm",             12],
      ["overvågningssystem",      12],
      ["navigationspanel",        14],
      ["drift tab",               14],
      ["sikkerhedstab",           14],
      ["settings tab",            12],
      ["we are building an interface", 18],
      ["vi laver et interface",   18],
      ["app interface",           14],
      ["tab interface",           14],
    ],
  },
  {
    id:    "user_journey",
    label: "User journey / service design",
    terms: [
      ["user journey map",        22],
      ["customer journey map",    22],
      ["user journey",            20],
      ["customer journey",        20],
      ["journey map",             20],
      ["journey mapping",         18],
      ["brugerrejse",             20],
      ["service blueprint",       18],
      ["empathy map",             18],
      ["touchpoint",              14],
      ["touchpoints",             14],
      ["touch points",            12],
      ["persona",                 12],
      ["personas",                12],
      ["pain point",              14],
      ["painpoint",               12],
      ["moments of truth",        14],
      ["swimlane",                12],
      ["swim lane",               12],
      ["swimlanes",               12],
      ["onboarding flow",         14],
      ["onboarding",              10],
      ["brugerflow",              14],
      ["customer experience",     12],
      ["cx design",               10],
      ["user flow",               12],
      ["storyboard",              10],
      ["what happens when",       12],
      ["hvad sker der når",       12],
      ["hvad sker der",           10],
      ["as a user",               10],
      ["som bruger",              10],
    ],
  },
  {
    id:    "workflow_process",
    label: "Process / workflow / flowchart",
    terms: [
      ["value stream map",              20],
      ["value stream mapping",          20],
      ["value stream",                  14],
      ["business process model",        16],
      ["forretningsproces",             16],
      ["forretningsprocess",            14],
      ["bpmn",                          18],
      ["process mining",                14],
      ["approval workflow",             14],
      ["approval flow",                 12],
      ["godkendelsesflow",              14],
      ["procesflow",                    14],
      ["process flow",                  14],
      ["workflow engine",               12],
      ["workflow",                      10],
      ["sop ",                           8],
      ["standard operating procedure",  14],
      ["raci",                          12],
      ["handover",                      10],
      ["overdragelse",                  10],
      ["six sigma",                     12],
      ["lean ",                          8],
      ["bottleneck analysis",           12],
      ["flowchart",                     14],
      ["flowdiagram",                   14],
      ["decision diamond",              14],
      ["if x then y",                   12],
      ["if this then",                  10],
      ["hvad er processen",             14],
      ["how does the process work",     14],
    ],
  },
  {
    id:    "physical_product",
    label: "Physical product / pump hardware",
    terms: [
      ["cirkulationspumpe",       18],
      ["centrifugalpumpe",        18],
      ["centrifugal pump",        16],
      ["centrifugal",             12],
      ["npsh",                    18],
      ["impeller",                16],
      ["impelleren",              14],
      ["wet end",                 16],
      ["volute",                  12],
      ["alpha go",                18],
      ["alpha2",                  14],
      ["alpha 2",                 14],
      ["magna3",                  14],
      ["magna 3",                 14],
      ["cr pump",                 14],
      ["cr-n",                    10],
      ["grundfos go",             16],
      ["go app",                  14],
      ["bluetooth pump",          14],
      ["led ring",                14],
      ["control face",            12],
      ["cu 200",                  14],
      ["cu 300",                  14],
      ["cu200",                   14],
      ["cu300",                   14],
      ["dedicated controls",      14],
      ["pump model",              12],
      ["pumpe model",             12],
      ["pumpe",                    8],
      ["pump curve",              12],
      ["pump ",                    6],
      ["motor size",              10],
      ["ie3",                      8],
      ["ie4",                      8],
      ["ie5",                      8],
      ["m3/h",                    10],
      ["kubikmeter i timen",      10],
      ["tryk bar",                10],
      ["pressure bar",            10],
      ["sku",                      8],
      ["product cutaway",         12],
      ["hardware revision",       10],
      ["what does it look like",  14],
      ["hvad ser det ud",         14],
      ["how does it look",        12],
    ],
  },
  {
    id:    "requirements_matrix",
    label: "Requirements / traceability",
    terms: [
      ["traceability matrix",           18],
      ["requirements traceability",     18],
      ["kravspecifikation",             18],
      ["krav specifikation",            16],
      ["kravspec",                      16],
      ["moscow",                        14],
      ["acceptance criteria",           16],
      ["user story",                    12],
      ["user stories",                  12],
      ["functional requirement",        14],
      ["non-functional requirement",    14],
      ["verification and validation",   16],
      ["verification validation",       14],
      [" ieee ",                         8],
      ["srs document",                  12],
      ["requirement id",                12],
      ["requirements baseline",         14],
      ["krav matrix",                   14],
    ],
  },
  {
    id:    "management_summary",
    label: "Management / timeline / roadmap",
    terms: [
      ["executive summary",     16],
      ["steering committee",    14],
      ["roadmap",               14],
      ["gantt",                 16],
      ["milestone",             12],
      ["milepæl",               12],
      ["quarterly",             10],
      ["budget",                10],
      ["portfolio",             10],
      ["program office",        12],
      ["stakeholder",           10],
      ["risk register",         12],
      ["risikoregister",        12],
      ["go live date",          12],
      ["decision log",          12],
      ["kanban",                12],
      ["backlog",               10],
      ["sprint",                10],
      ["vi besluttede",         12],
      ["we decided",            12],
      ["beslutning",            10],
    ],
  },
];

/** Label lookup for human-readable output */
export const VIZ_FAMILY_LABEL: Record<VizFamily, string> = {
  hmi_interface:       "HMI / SCADA interface",
  user_journey:        "User Journey Map",
  workflow_process:    "Workflow / Process Diagram",
  physical_product:    "Physical Product / Pump Hardware",
  requirements_matrix: "Requirements Matrix",
  management_summary:  "Management Summary / Timeline",
  generic:             "General visualization",
};

function normalizeForClassification(text: string): string {
  let s = text.toLowerCase().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
  // Fix common ASR misrecognitions that derail classification
  const fixes: Array<[string, string]> = [
    ["grundfoss", "grundfos"],
    ["i dagens face", "interface"],
    ["dagens face", "interface"],
    ["todays face", "interface"],
    ["enter face", "interface"],
    ["userinterface", "user interface"],
    ["alfa go", "alpha go"],
    ["alfa 2", "alpha 2"],
    ["alfa2", "alpha2"],
    ["isolution", "isolutions"],
    ["i solution", "isolutions"],
  ];
  for (const [a, b] of fixes) s = s.split(a).join(b);
  return s.trim();
}

/**
 * Recency zone boundaries (chars from end of transcript tail).
 * Zone 1 (RECENT):  last 3000 chars — what the speaker is saying RIGHT NOW → 2.5x multiplier
 * Zone 2 (MIDDLE):  3000–7000 chars  — recent context → 1.0x multiplier
 * Zone 3 (DISTANT): 7000–12000 chars — earlier background → 0.3x multiplier
 *
 * This ensures that "we talked about journey maps for 8 minutes, but now
 * switched to building an interface" correctly classifies as hmi_interface.
 */
const ZONE_RECENT_CHARS  = 3000;
const ZONE_MIDDLE_CHARS  = 7000;
const ZONE_RECENT_MULT   = 2.5;
const ZONE_MIDDLE_MULT   = 1.0;
const ZONE_DISTANT_MULT  = 0.3;

/** If zone-1-only score for a family exceeds this, it wins outright (topic shift override) */
const RECENT_ZONE_OVERRIDE_THRESHOLD = 20;

/**
 * Explicit topic-shift phrases that act as HARD OVERRIDES (auto-win).
 * If the RECENT zone contains one of these, the target family wins outright
 * regardless of accumulated scores from earlier speech.
 *
 * These capture the moment when a speaker says "ok now let's do X" —
 * that's a direct instruction, not a statistical signal.
 */
const TOPIC_SHIFT_OVERRIDES: Array<{ pattern: string; target: VizFamily }> = [
  // Danish: interface / HMI
  { pattern: "nu laver vi et interface",           target: "hmi_interface" },
  { pattern: "lad os lave et interface",            target: "hmi_interface" },
  { pattern: "nu skal vi lave et interface",        target: "hmi_interface" },
  { pattern: "vis mig et interface",                target: "hmi_interface" },
  { pattern: "vis et interface",                    target: "hmi_interface" },
  { pattern: "det skal være et interface",          target: "hmi_interface" },
  { pattern: "det her skal være et interface",      target: "hmi_interface" },
  { pattern: "lav et interface",                    target: "hmi_interface" },
  { pattern: "skal være interface",                 target: "hmi_interface" },
  { pattern: "det er et interface",                 target: "hmi_interface" },
  { pattern: "vi laver et hmi",                     target: "hmi_interface" },
  { pattern: "lad os lave et hmi",                  target: "hmi_interface" },
  { pattern: "vi bygger et interface",              target: "hmi_interface" },
  { pattern: "vi designer et interface",            target: "hmi_interface" },
  // English: interface / HMI
  { pattern: "show me an interface",                target: "hmi_interface" },
  { pattern: "let's build an interface",            target: "hmi_interface" },
  { pattern: "now let's make the interface",        target: "hmi_interface" },
  { pattern: "we need an interface",                target: "hmi_interface" },
  { pattern: "it should be an interface",           target: "hmi_interface" },
  { pattern: "this should be an interface",         target: "hmi_interface" },
  { pattern: "make it an interface",                target: "hmi_interface" },
  { pattern: "build the interface",                 target: "hmi_interface" },
  // Danish: user journey
  { pattern: "det skal være en user journey",       target: "user_journey" },
  { pattern: "vis mig en user journey",             target: "user_journey" },
  { pattern: "lad os se en brugerrejse",            target: "user_journey" },
  { pattern: "vis mig en brugerrejse",              target: "user_journey" },
  { pattern: "lav en brugerrejse",                  target: "user_journey" },
  { pattern: "det skal være en brugerrejse",        target: "user_journey" },
  { pattern: "vis en journey map",                  target: "user_journey" },
  // English: user journey
  { pattern: "show me a user journey",              target: "user_journey" },
  { pattern: "make it a journey map",               target: "user_journey" },
  { pattern: "it should be a user journey",         target: "user_journey" },
  { pattern: "this should be a journey",            target: "user_journey" },
  // Danish: workflow
  { pattern: "vis mig et workflow",                 target: "workflow_process" },
  { pattern: "vis mig et flowchart",                target: "workflow_process" },
  { pattern: "det skal være et workflow",           target: "workflow_process" },
  { pattern: "lav et flowchart",                    target: "workflow_process" },
  { pattern: "det skal være et flowdiagram",        target: "workflow_process" },
  { pattern: "vis mig processen som et flowchart",  target: "workflow_process" },
  // English: workflow
  { pattern: "show me a flowchart",                 target: "workflow_process" },
  { pattern: "make it a workflow",                  target: "workflow_process" },
  { pattern: "it should be a workflow",             target: "workflow_process" },
  // Danish: pump / product
  { pattern: "vis mig pumpen",                      target: "physical_product" },
  { pattern: "vis mig produktet",                   target: "physical_product" },
  { pattern: "det skal være en pumpe",              target: "physical_product" },
  { pattern: "vis pumpe hardware",                  target: "physical_product" },
  // English: pump / product
  { pattern: "show me the pump",                    target: "physical_product" },
  { pattern: "it should be a pump",                 target: "physical_product" },
  { pattern: "show the pump hardware",              target: "physical_product" },
  // Danish: timeline / management
  { pattern: "vis mig en timeline",                 target: "management_summary" },
  { pattern: "vis mig en roadmap",                  target: "management_summary" },
  { pattern: "det skal være en timeline",           target: "management_summary" },
  { pattern: "lav en gantt",                        target: "management_summary" },
  // English: timeline / management
  { pattern: "show me a timeline",                  target: "management_summary" },
  { pattern: "make it a roadmap",                   target: "management_summary" },
  // Danish: requirements
  { pattern: "det skal være en kravspec",           target: "requirements_matrix" },
  { pattern: "vis mig kravene",                     target: "requirements_matrix" },
  { pattern: "lav en kravspecifikation",             target: "requirements_matrix" },
  // English: requirements
  { pattern: "show me the requirements",            target: "requirements_matrix" },
  { pattern: "make it a requirements matrix",       target: "requirements_matrix" },
];

function scoreZone(
  normText: string,
  signals: typeof VIZ_FAMILY_SIGNALS,
  multiplier: number
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const fam of signals) {
    let total = 0;
    for (const [term, weight] of fam.terms) {
      if (term && normText.includes(term)) total += weight;
    }
    scores.set(fam.id, total * multiplier);
  }
  return scores;
}

export function classifyVisualizationIntent(transcript: string): ClassificationResult {
  const tail = transcript.slice(-VIZ_CLASSIFY_TAIL_CHARS);

  // Split tail into three recency zones
  const recentRaw  = tail.slice(-ZONE_RECENT_CHARS);
  const middleRaw  = tail.slice(-ZONE_MIDDLE_CHARS, -ZONE_RECENT_CHARS);
  const distantRaw = tail.slice(0, Math.max(0, tail.length - ZONE_MIDDLE_CHARS));

  const recentNorm  = normalizeForClassification(recentRaw);
  const middleNorm  = normalizeForClassification(middleRaw);
  const distantNorm = normalizeForClassification(distantRaw);

  // Score each zone with its multiplier
  const recentScores  = scoreZone(recentNorm,  VIZ_FAMILY_SIGNALS, ZONE_RECENT_MULT);
  const middleScores  = scoreZone(middleNorm,  VIZ_FAMILY_SIGNALS, ZONE_MIDDLE_MULT);
  const distantScores = scoreZone(distantNorm, VIZ_FAMILY_SIGNALS, ZONE_DISTANT_MULT);

  // Merge all zone scores
  const mergedMap = new Map<string, number>();
  for (const fam of VIZ_FAMILY_SIGNALS) {
    mergedMap.set(
      fam.id,
      (recentScores.get(fam.id) ?? 0) +
      (middleScores.get(fam.id) ?? 0) +
      (distantScores.get(fam.id) ?? 0)
    );
  }

  // ─── HARD OVERRIDE: topic-shift phrases in RECENT zone auto-win ────────────
  // Scan the RECENT zone for explicit directives like "det skal være et interface".
  // If found, the target family wins outright — no further scoring needed.
  // We scan from end-to-start so the LAST override wins if multiple are present.
  let hardOverrideFamily: VizFamily | null = null;
  let hardOverridePos = -1;
  for (const shift of TOPIC_SHIFT_OVERRIDES) {
    const pos = recentNorm.lastIndexOf(shift.pattern);
    if (pos !== -1 && pos > hardOverridePos) {
      hardOverridePos = pos;
      hardOverrideFamily = shift.target;
    }
  }
  if (hardOverrideFamily) {
    const overrideFam = VIZ_FAMILY_SIGNALS.find(f => f.id === hardOverrideFamily)!;
    const scored = VIZ_FAMILY_SIGNALS.map((fam) => ({
      id:    fam.id,
      label: fam.label,
      score: fam.id === hardOverrideFamily ? 999 : Math.round((mergedMap.get(fam.id) ?? 0) * 10) / 10,
    }));
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    return {
      family:   hardOverrideFamily,
      topic:    overrideFam.label + " (explicit override)",
      scores:   sorted,
      ambiguous: false,
      lead:     999,
      runnerUp: sorted[1]?.id ?? null,
    };
  }

  // Check for RECENT zone override: if one family dominates the most recent speech
  // it wins outright, regardless of accumulated earlier scores
  let recentOverride: VizFamily | null = null;
  const recentEntries = [...recentScores.entries()];
  recentEntries.sort((a, b) => b[1] - a[1]);
  if (recentEntries.length > 0) {
    const [topRecentId, topRecentScore] = recentEntries[0];
    const secondRecentScore = recentEntries[1]?.[1] ?? 0;
    // Raw score (before multiplier) = topRecentScore / ZONE_RECENT_MULT
    const rawRecent = topRecentScore / ZONE_RECENT_MULT;
    if (rawRecent >= RECENT_ZONE_OVERRIDE_THRESHOLD && topRecentScore > secondRecentScore * 1.5) {
      recentOverride = topRecentId as VizFamily;
    }
  }

  // Build scored array
  const scored = VIZ_FAMILY_SIGNALS.map((fam) => ({
    id:    fam.id,
    label: fam.label,
    score: Math.round((mergedMap.get(fam.id) ?? 0) * 10) / 10,
  }));

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top    = sorted[0];
  const second = sorted[1] ?? { id: null, label: "", score: 0 };
  const lead   = Math.round((top.score - second.score) * 10) / 10;

  // If recent zone has a clear override, use it
  if (recentOverride) {
    const overrideFam = VIZ_FAMILY_SIGNALS.find(f => f.id === recentOverride)!;
    return {
      family:   recentOverride,
      topic:    overrideFam.label,
      scores:   sorted,
      ambiguous: false,
      lead,
      runnerUp: top.id === recentOverride ? (second.id ?? null) : top.id,
    };
  }

  const ambiguous = top.score < CLASSIFY_MIN_TOTAL || lead < CLASSIFY_MIN_LEAD;

  if (ambiguous || top.score === 0) {
    return {
      family:   "generic",
      topic:    "General visualization",
      scores:   sorted,
      ambiguous: true,
      lead,
      runnerUp: top.score > 0 ? top.id : (second.id ?? null),
    };
  }

  // Break ties by FAMILY_PRIORITY_ORDER
  const tied = sorted.filter((s) => s.score === top.score);
  if (tied.length > 1) {
    tied.sort((a, b) => {
      const ia = FAMILY_PRIORITY_ORDER.indexOf(a.id as VizFamily);
      const ib = FAMILY_PRIORITY_ORDER.indexOf(b.id as VizFamily);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    const win = tied[0];
    return {
      family:   win.id as VizFamily,
      topic:    win.label,
      scores:   sorted,
      ambiguous: false,
      lead,
      runnerUp: second.id ?? null,
    };
  }

  return {
    family:   top.id as VizFamily,
    topic:    top.label,
    scores:   sorted,
    ambiguous: false,
    lead,
    runnerUp: second.id ?? null,
  };
}
