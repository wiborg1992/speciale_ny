/**
 * Server-side transcript classification engine.
 * Scores the transcript tail against weighted keyword signals to determine
 * the most appropriate visualization family BEFORE calling the AI.
 * This eliminates ambiguity and dramatically sharpens type selection.
 */

import { normalizeWorkspaceDomain } from "./workspace-domain.js";

export type VizFamily =
  | "hmi_interface"
  | "user_journey"
  | "workflow_process"
  | "physical_product"
  | "requirements_matrix"
  | "management_summary"
  | "persona_research"
  | "service_blueprint"
  | "comparison_evaluation"
  | "design_system"
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
  "service_blueprint",
  "persona_research",
  "workflow_process",
  "physical_product",
  "requirements_matrix",
  "comparison_evaluation",
  "design_system",
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
    label: "User journey / experience map",
    terms: [
      ["user journey map",        22],
      ["customer journey map",    22],
      ["user journey",            20],
      ["customer journey",        20],
      ["journey map",             20],
      ["journey mapping",         18],
      ["brugerrejse",             20],
      ["kunderejse",              20],
      ["touchpoint",              14],
      ["touchpoints",             14],
      ["touch points",            12],
      ["berøringspunkt",          14],
      ["pain point",              14],
      ["painpoint",               12],
      ["smertepunkt",             14],
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
      ["experience map",          18],
      ["oplevelseskort",          16],
      ["emotion curve",           14],
      ["følelsesskala",           14],
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
      ["firmware requirements",         20],
      ["traceability ids",              18],
      ["traceability id",               16],
      ["compliance tracking",           16],
      ["must should could",             16],
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
      ["cra",                           14],
      ["cyber resilience act",          18],
      ["cyber resilience",              14],
      ["cyber resiliens",               14],
      ["eu 2024/2847",                  18],
      ["2024/2847",                     16],
      ["cybersecurity requirement",     16],
      ["cybersikkerhedskrav",           16],
      ["essential requirement",         14],
      ["væsentlige krav",               14],
      ["compliance requirement",        14],
      ["overensstemmelseskrav",         14],
      ["konformitetsvurdering",         16],
      ["conformity assessment",         16],
      ["ce-mærkning",                   14],
      ["ce marking",                    14],
      ["support period",                12],
      ["supportperiode",                12],
      ["vulnerability disclosure",      14],
      ["sårbarhedsrapportering",        14],
      ["sårbarhedshåndtering",          14],
      ["secure by default",             14],
      ["sikker standardkonfiguration",  16],
      ["adgangskontrol",               12],
      ["access control requirement",    16],
      ["software update requirement",   14],
      ["softwareopdateringskrav",       14],
      ["13 functions",                  14],
      ["13 funktioner",                 14],
      ["regulatory compliance",         14],
      ["regulatorisk overensstemmelse", 14],
      ["annex",                         8],
      ["bilag",                         8],
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
  {
    id:    "persona_research",
    label: "Persona / research insights",
    terms: [
      ["persona profile",           22],
      ["persona description",       20],
      ["user persona",              20],
      ["buyer persona",             18],
      ["persona",                   14],
      ["personas",                  14],
      ["empathy map",               22],
      ["empathy mapping",           20],
      ["empatikort",                20],
      ["user profile",              16],
      ["brugerprofil",              16],
      ["user research",             18],
      ["brugerresearch",            18],
      ["research findings",         18],
      ["research insight",          18],
      ["research results",          16],
      ["forskningsresultater",      16],
      ["indsigter",                 12],
      ["insight summary",           18],
      ["interview findings",        18],
      ["interview results",         16],
      ["interviewresultater",       16],
      ["usability test results",    18],
      ["usability findings",        16],
      ["brugertest",                16],
      ["user testing results",      16],
      ["test findings",             14],
      ["user needs",                14],
      ["brugerbehov",               14],
      ["customer needs",            14],
      ["kundebehov",                14],
      ["behavioral pattern",        14],
      ["adfærdsmønster",            14],
      ["mental model",              14],
      ["user motivation",           14],
      ["user frustration",          14],
      ["frustration",                6],
      ["motivation",                 5],
      ["user segment",              14],
      ["brugersegment",             14],
      ["demographic",               10],
      ["demografi",                 10],
      ["archetype",                 12],
      ["who is the user",           16],
      ["hvem er brugeren",          16],
      ["what does the user need",   16],
      ["hvad har brugeren brug for", 16],
      ["jobs to be done",           18],
      ["jtbd",                      16],
      ["problem statement",         14],
      ["validated problem",         14],
      ["valideret problem",         14],
    ],
  },
  {
    id:    "service_blueprint",
    label: "Service blueprint / experience architecture",
    terms: [
      ["service blueprint",         22],
      ["serviceblueprint",          22],
      ["service design",            18],
      ["servicedesign",             18],
      ["experience architecture",   22],
      ["oplevelsesarkitektur",      20],
      ["information architecture",  20],
      ["informationsarkitektur",    20],
      ["ia diagram",                16],
      ["sitemap",                   14],
      ["navigation structure",      16],
      ["navigationsstruktur",       16],
      ["content model",             14],
      ["indholdsmodel",             14],
      ["backstage process",         18],
      ["backstage",                 12],
      ["frontstage",                14],
      ["support process",           14],
      ["line of visibility",        16],
      ["line of interaction",       16],
      ["customer action",           12],
      ["onstage",                   10],
      ["system map",                14],
      ["systemkort",                14],
      ["ecosystem map",             16],
      ["økosystemkort",             16],
      ["stakeholder map",           16],
      ["interessentkort",           16],
      ["actor map",                 14],
      ["aktørkort",                 14],
      ["channel map",               14],
      ["kanalkort",                 14],
      ["service layer",             14],
      ["servicelag",                14],
      ["evidence",                  5],
      ["physical evidence",         14],
      ["fysisk bevis",              14],
    ],
  },
  {
    id:    "comparison_evaluation",
    label: "Comparison / evaluation / analysis",
    terms: [
      ["comparison matrix",         22],
      ["sammenligningsmatrix",      20],
      ["feature comparison",        22],
      ["feature matrix",            20],
      ["funktionssammenligning",    20],
      ["competitive analysis",      22],
      ["konkurrentanalyse",         20],
      ["competitor analysis",       20],
      ["benchmarking",              16],
      ["benchmark",                 14],
      ["swot analysis",             22],
      ["swot",                      16],
      ["pros and cons",             16],
      ["fordele og ulemper",        16],
      ["trade-off",                 14],
      ["tradeoff",                  14],
      ["afvejning",                 12],
      ["prioritization matrix",     22],
      ["prioriteringsmatrix",       20],
      ["impact effort matrix",      22],
      ["impact effort",             18],
      ["impact vs effort",          18],
      ["value complexity",          16],
      ["value vs complexity",       16],
      ["kano model",                18],
      ["kano",                      12],
      ["scorecard",                 16],
      ["scorekort",                 14],
      ["weighted scoring",          16],
      ["vægtet scoring",            14],
      ["evaluation criteria",       16],
      ["evalueringskriterier",      16],
      ["decision matrix",           18],
      ["beslutningsmatrix",         16],
      ["pugh matrix",               18],
      ["heuristic evaluation",      20],
      ["heuristisk evaluering",     18],
      ["usability evaluation",      18],
      ["design review",             14],
      ["designgennemgang",          14],
      ["compare these",             14],
      ["sammenlign disse",          14],
      ["which is better",           12],
      ["hvad er bedst",             12],
      ["option a vs option b",      16],
      ["alternativ a vs",           14],
      ["risk assessment",           16],
      ["risikovurdering",           14],
      ["opportunity assessment",    16],
      ["desirability assessment",   16],
      ["update the comparison",     16],
      ["update the matrix",         14],
      ["recalculate",               10],
      ["weighted score",            14],
      ["add new criteria",          14],
      ["add criteria",              12],
      ["additional criteria",       14],
      ["three options",             10],
      ["option a",                  8],
      ["option b",                  8],
      ["option c",                  8],
    ],
  },
  {
    id:    "design_system",
    label: "Design system / component spec",
    terms: [
      ["design system",             22],
      ["designsystem",              22],
      ["component library",         20],
      ["komponentbibliotek",        20],
      ["component spec",            18],
      ["komponentspecifikation",    18],
      ["design tokens",             20],
      ["design token",              18],
      ["style guide",               18],
      ["stilguide",                 18],
      ["pattern library",           18],
      ["mønsterbibliotek",          16],
      ["ui kit",                    16],
      ["ui components",             14],
      ["ui komponenter",            14],
      ["color palette",             14],
      ["farvepalet",                14],
      ["colour palette",            14],
      ["typography scale",          16],
      ["typografiskala",            14],
      ["spacing system",            14],
      ["spacing scale",             14],
      ["grid system",               14],
      ["gridsystem",                12],
      ["breakpoint",                10],
      ["responsive",                 5],
      ["design principle",          16],
      ["designprincip",             16],
      ["design principles",         16],
      ["designprincipper",          16],
      ["accessibility",             12],
      ["tilgængelighed",            12],
      ["a11y",                      12],
      ["wcag",                      14],
      ["component anatomy",         18],
      ["component state",           14],
      ["komponenttilstand",         14],
      ["variant",                   5],
      ["variants",                  5],
      ["varianter",                 5],
      ["atomic design",             16],
      ["design guideline",          16],
      ["designretningslinje",       14],
      ["brand guideline",           16],
      ["brandguide",                14],
      ["component documentation",   18],
      ["komponentdokumentation",    16],
      ["one component many combinations", 20],
      ["platform features",         14],
      ["platform design",           14],
    ],
  },
];

/** Label lookup for human-readable output */
export const VIZ_FAMILY_LABEL: Record<VizFamily, string> = {
  hmi_interface:         "HMI / SCADA interface",
  user_journey:          "User Journey / Experience Map",
  workflow_process:      "Workflow / Process Diagram",
  physical_product:      "Physical Product / Pump Hardware",
  requirements_matrix:   "Requirements Matrix",
  management_summary:    "Management Summary / Timeline",
  persona_research:      "Persona / Research Insights",
  service_blueprint:     "Service Blueprint / Experience Architecture",
  comparison_evaluation: "Comparison / Evaluation Matrix",
  design_system:         "Design System / Component Spec",
  generic:               "General visualization",
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
    ["cyber resilience act", "cra"],
    ["cyber resilience", "cra"],
    ["cyber resiliens", "cra"],
    ["c r a", "cra"],
    ["see are a ", "cra "],
    ["sea are a ", "cra "],
    ["c.r.a.", "cra"],
    ["access control", "adgangskontrol"],
    ["conformity assessment", "konformitetsvurdering"],
    ["vulnerability handling", "sårbarhedshåndtering"],
    ["ce marking", "ce-mærkning"],
    ["ce mark", "ce-mærkning"],
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
  // Additional Danish overrides — interface
  { pattern: "nu designer vi et interface",          target: "hmi_interface" },
  { pattern: "lad os bygge et interface",            target: "hmi_interface" },
  { pattern: "nu bygger vi et interface",            target: "hmi_interface" },
  { pattern: "vi skal lave et interface",            target: "hmi_interface" },
  { pattern: "vi vil gerne have et interface",       target: "hmi_interface" },
  { pattern: "vis det som et interface",             target: "hmi_interface" },
  { pattern: "generer et interface",                 target: "hmi_interface" },
  { pattern: "det skal visualiseres som interface",  target: "hmi_interface" },
  // Additional Danish overrides — journey
  { pattern: "nu laver vi en brugerrejse",           target: "user_journey" },
  { pattern: "det skal være en journey",             target: "user_journey" },
  { pattern: "vis det som en brugerrejse",           target: "user_journey" },
  { pattern: "lad os lave en journey map",           target: "user_journey" },
  { pattern: "generer en brugerrejse",               target: "user_journey" },
  // Additional Danish overrides — workflow
  { pattern: "nu laver vi et flowchart",             target: "workflow_process" },
  { pattern: "vis det som et flowchart",             target: "workflow_process" },
  { pattern: "generer et flowdiagram",               target: "workflow_process" },
  { pattern: "lad os lave et flowdiagram",           target: "workflow_process" },
  { pattern: "vis processen",                        target: "workflow_process" },
  // Additional Danish overrides — pump
  { pattern: "vis pumpen",                           target: "physical_product" },
  { pattern: "generer en pumpe",                     target: "physical_product" },
  { pattern: "vis produktet",                        target: "physical_product" },
  { pattern: "vis controlleren",                     target: "physical_product" },
  // Additional Danish overrides — timeline/management
  { pattern: "generer en timeline",                  target: "management_summary" },
  { pattern: "vis det som en roadmap",               target: "management_summary" },
  { pattern: "lav en timeline",                      target: "management_summary" },
  { pattern: "generer en gantt",                     target: "management_summary" },
  // Additional Danish overrides — requirements
  { pattern: "generer en kravspecifikation",         target: "requirements_matrix" },
  { pattern: "vis det som krav",                     target: "requirements_matrix" },
  { pattern: "lav en kravmatrix",                    target: "requirements_matrix" },
  // Additional English overrides — interface
  { pattern: "now let's design the interface",       target: "hmi_interface" },
  { pattern: "let's design an interface",            target: "hmi_interface" },
  { pattern: "now we're building an interface",      target: "hmi_interface" },
  { pattern: "we want an interface",                 target: "hmi_interface" },
  { pattern: "we need to build an interface",        target: "hmi_interface" },
  { pattern: "show it as an interface",              target: "hmi_interface" },
  { pattern: "generate an interface",                target: "hmi_interface" },
  { pattern: "visualize it as an interface",         target: "hmi_interface" },
  { pattern: "display it as an interface",           target: "hmi_interface" },
  { pattern: "create an interface",                  target: "hmi_interface" },
  { pattern: "make the interface",                   target: "hmi_interface" },
  { pattern: "design the interface",                 target: "hmi_interface" },
  { pattern: "show the interface",                   target: "hmi_interface" },
  { pattern: "it should be an hmi",                  target: "hmi_interface" },
  { pattern: "make it an hmi",                       target: "hmi_interface" },
  { pattern: "generate an hmi",                      target: "hmi_interface" },
  { pattern: "show an hmi dashboard",                target: "hmi_interface" },
  { pattern: "create a dashboard",                   target: "hmi_interface" },
  { pattern: "build a dashboard",                    target: "hmi_interface" },
  // Additional English overrides — journey
  { pattern: "now let's make a user journey",        target: "user_journey" },
  { pattern: "let's create a journey map",           target: "user_journey" },
  { pattern: "generate a user journey",              target: "user_journey" },
  { pattern: "show it as a journey map",             target: "user_journey" },
  { pattern: "visualize it as a journey",            target: "user_journey" },
  { pattern: "create a journey map",                 target: "user_journey" },
  { pattern: "display the user journey",             target: "user_journey" },
  { pattern: "build a journey map",                  target: "user_journey" },
  { pattern: "we need a user journey",               target: "user_journey" },
  { pattern: "show the journey",                     target: "user_journey" },
  { pattern: "it should be a journey map",           target: "user_journey" },
  // Additional English overrides — workflow
  { pattern: "now let's make a flowchart",           target: "workflow_process" },
  { pattern: "let's create a flowchart",             target: "workflow_process" },
  { pattern: "generate a flowchart",                 target: "workflow_process" },
  { pattern: "generate a workflow",                  target: "workflow_process" },
  { pattern: "show it as a flowchart",               target: "workflow_process" },
  { pattern: "show it as a workflow",                target: "workflow_process" },
  { pattern: "visualize it as a workflow",           target: "workflow_process" },
  { pattern: "create a workflow diagram",            target: "workflow_process" },
  { pattern: "build a flowchart",                    target: "workflow_process" },
  { pattern: "show the process",                     target: "workflow_process" },
  { pattern: "display the workflow",                 target: "workflow_process" },
  { pattern: "we need a flowchart",                  target: "workflow_process" },
  { pattern: "it should be a flowchart",             target: "workflow_process" },
  { pattern: "let's build a workflow",               target: "workflow_process" },
  // Additional English overrides — pump
  { pattern: "show the pump",                        target: "physical_product" },
  { pattern: "generate a pump",                      target: "physical_product" },
  { pattern: "show the product",                     target: "physical_product" },
  { pattern: "show the controller",                  target: "physical_product" },
  { pattern: "display the pump",                     target: "physical_product" },
  { pattern: "visualize the pump",                   target: "physical_product" },
  { pattern: "it should be a pump illustration",     target: "physical_product" },
  { pattern: "show me the hardware",                 target: "physical_product" },
  { pattern: "display the hardware",                 target: "physical_product" },
  { pattern: "generate pump hardware",               target: "physical_product" },
  { pattern: "create a pump illustration",           target: "physical_product" },
  { pattern: "looking at the hardware",              target: "physical_product" },
  { pattern: "looking at the front panel",           target: "physical_product" },
  { pattern: "redesign the hardware",                target: "physical_product" },
  { pattern: "redesign the appearance",              target: "physical_product" },
  { pattern: "redesign of the front",                target: "physical_product" },
  { pattern: "redesign the front panel",             target: "physical_product" },
  { pattern: "the front panel for the pump",         target: "physical_product" },
  { pattern: "the front face of the pump",           target: "physical_product" },
  { pattern: "front panel of the pump",              target: "physical_product" },
  { pattern: "front face of the pump",               target: "physical_product" },
  { pattern: "appearance of the hardware",           target: "physical_product" },
  { pattern: "redesign the appearance of the",       target: "physical_product" },
  { pattern: "we need to redesign",                  target: "physical_product" },
  { pattern: "moving towards the physical pump",     target: "physical_product" },
  { pattern: "looking at the physical pump",         target: "physical_product" },
  { pattern: "the display is and underneath",        target: "physical_product" },
  { pattern: "buttons for moving up",                target: "physical_product" },
  { pattern: "we need an extra button",              target: "physical_product" },
  { pattern: "need to see the buttons",              target: "physical_product" },
  { pattern: "control panel",                        target: "physical_product" },
  { pattern: "control paddle",                       target: "physical_product" },
  // Additional Danish overrides — pump (natural speech patterns)
  { pattern: "vi kigger på hardwaren",               target: "physical_product" },
  { pattern: "vi kigger på frontpanelet",            target: "physical_product" },
  { pattern: "vi kigger på pumpen",                  target: "physical_product" },
  { pattern: "redesigne frontpanelet",               target: "physical_product" },
  { pattern: "redesign af frontpanelet",             target: "physical_product" },
  { pattern: "redesign af pumpen",                   target: "physical_product" },
  { pattern: "udseendet af pumpen",                  target: "physical_product" },
  { pattern: "udseendet af hardwaren",               target: "physical_product" },
  { pattern: "knapperne på pumpen",                  target: "physical_product" },
  { pattern: "displayet på pumpen",                  target: "physical_product" },
  { pattern: "den fysiske pumpe",                    target: "physical_product" },
  // Natural speech — hmi_interface
  { pattern: "the screen layout",                    target: "hmi_interface" },
  { pattern: "what the user sees on screen",         target: "hmi_interface" },
  { pattern: "what the operator sees",               target: "hmi_interface" },
  { pattern: "the display should show",              target: "hmi_interface" },
  { pattern: "on the touch screen",                  target: "hmi_interface" },
  { pattern: "the operator needs to see",            target: "hmi_interface" },
  { pattern: "navigating through the screens",       target: "hmi_interface" },
  { pattern: "navigating through the menus",         target: "hmi_interface" },
  { pattern: "the alarm screen",                     target: "hmi_interface" },
  { pattern: "how the operator interacts",           target: "hmi_interface" },
  { pattern: "the screen with the values",           target: "hmi_interface" },
  { pattern: "the monitoring view",                  target: "hmi_interface" },
  { pattern: "the menu structure",                   target: "hmi_interface" },
  { pattern: "what appears on the display",          target: "hmi_interface" },
  { pattern: "the user interface for the",           target: "hmi_interface" },
  { pattern: "layout of the screen",                 target: "hmi_interface" },
  { pattern: "tabs on the screen",                   target: "hmi_interface" },
  { pattern: "the settings screen",                  target: "hmi_interface" },
  { pattern: "the home screen of the",               target: "hmi_interface" },
  { pattern: "how the screen looks",                 target: "hmi_interface" },
  { pattern: "designing the screen",                 target: "hmi_interface" },
  { pattern: "skærmen skal vise",                    target: "hmi_interface" },
  { pattern: "hvad operatøren ser",                  target: "hmi_interface" },
  { pattern: "hvad brugeren ser på skærmen",         target: "hmi_interface" },
  { pattern: "skærmlayoutet",                        target: "hmi_interface" },
  { pattern: "layoutet af skærmen",                  target: "hmi_interface" },
  { pattern: "menustrukturen",                       target: "hmi_interface" },
  { pattern: "navigere igennem skærmene",            target: "hmi_interface" },
  { pattern: "alarmbilledet",                        target: "hmi_interface" },
  { pattern: "overvågningsbilledet",                 target: "hmi_interface" },
  { pattern: "hvad der vises på displayet",          target: "hmi_interface" },
  { pattern: "fanerne på skærmen",                   target: "hmi_interface" },
  { pattern: "indstillingsskærmen",                  target: "hmi_interface" },
  { pattern: "designer skærmen",                     target: "hmi_interface" },
  // Natural speech — user_journey
  { pattern: "from the user's perspective",          target: "user_journey" },
  { pattern: "from the users perspective",           target: "user_journey" },
  { pattern: "from the customer's perspective",      target: "user_journey" },
  { pattern: "from the customers perspective",       target: "user_journey" },
  { pattern: "when the user first arrives",          target: "user_journey" },
  { pattern: "the user's experience",                target: "user_journey" },
  { pattern: "the users experience",                 target: "user_journey" },
  { pattern: "what the user goes through",           target: "user_journey" },
  { pattern: "the steps the user takes",             target: "user_journey" },
  { pattern: "through the user's eyes",              target: "user_journey" },
  { pattern: "through the users eyes",               target: "user_journey" },
  { pattern: "the customer experience",              target: "user_journey" },
  { pattern: "the touchpoints along the way",        target: "user_journey" },
  { pattern: "how the customer feels",               target: "user_journey" },
  { pattern: "the pain points in the journey",       target: "user_journey" },
  { pattern: "mapping the experience",               target: "user_journey" },
  { pattern: "mapping the journey",                  target: "user_journey" },
  { pattern: "map out the journey",                  target: "user_journey" },
  { pattern: "the stages of the journey",            target: "user_journey" },
  { pattern: "what happens at each stage",           target: "user_journey" },
  { pattern: "when the technician arrives",          target: "user_journey" },
  { pattern: "when the user arrives",                target: "user_journey" },
  { pattern: "the end to end experience",            target: "user_journey" },
  { pattern: "end to end journey",                   target: "user_journey" },
  { pattern: "fra brugerens perspektiv",             target: "user_journey" },
  { pattern: "fra kundens perspektiv",               target: "user_journey" },
  { pattern: "brugerens oplevelse",                  target: "user_journey" },
  { pattern: "kundens oplevelse",                    target: "user_journey" },
  { pattern: "hvad brugeren oplever",                target: "user_journey" },
  { pattern: "de trin brugeren tager",               target: "user_journey" },
  { pattern: "igennem brugerens øjne",               target: "user_journey" },
  { pattern: "kortlægge rejsen",                     target: "user_journey" },
  { pattern: "kortlæg oplevelsen",                   target: "user_journey" },
  { pattern: "touchpoints i rejsen",                 target: "user_journey" },
  { pattern: "smertepunkterne i rejsen",             target: "user_journey" },
  { pattern: "hele oplevelsen fra start til slut",   target: "user_journey" },
  { pattern: "når teknikeren ankommer",              target: "user_journey" },
  { pattern: "når brugeren ankommer",                target: "user_journey" },
  // Natural speech — workflow_process
  { pattern: "the sequence of steps",                target: "workflow_process" },
  { pattern: "first they do this then",              target: "workflow_process" },
  { pattern: "the process goes like this",           target: "workflow_process" },
  { pattern: "how the process works",                target: "workflow_process" },
  { pattern: "step by step how",                     target: "workflow_process" },
  { pattern: "the order of operations",              target: "workflow_process" },
  { pattern: "the approval process",                 target: "workflow_process" },
  { pattern: "the maintenance procedure",            target: "workflow_process" },
  { pattern: "the flow of the process",              target: "workflow_process" },
  { pattern: "how the flow works",                   target: "workflow_process" },
  { pattern: "the decision points in the process",   target: "workflow_process" },
  { pattern: "when they reach this step",            target: "workflow_process" },
  { pattern: "the branching logic",                  target: "workflow_process" },
  { pattern: "what triggers the next step",          target: "workflow_process" },
  { pattern: "the start of the process",             target: "workflow_process" },
  { pattern: "map out the process",                  target: "workflow_process" },
  { pattern: "mapping the process",                  target: "workflow_process" },
  { pattern: "the installation procedure",           target: "workflow_process" },
  { pattern: "the commissioning process",            target: "workflow_process" },
  { pattern: "the service procedure",                target: "workflow_process" },
  { pattern: "rækkefølgen af trin",                  target: "workflow_process" },
  { pattern: "processen fungerer sådan",             target: "workflow_process" },
  { pattern: "trin for trin hvordan",                target: "workflow_process" },
  { pattern: "godkendelsesprocessen",                target: "workflow_process" },
  { pattern: "vedligeholdelsesproceduren",           target: "workflow_process" },
  { pattern: "flowet i processen",                   target: "workflow_process" },
  { pattern: "beslutningspunkterne",                 target: "workflow_process" },
  { pattern: "hvad der trigger næste trin",          target: "workflow_process" },
  { pattern: "kortlæg processen",                    target: "workflow_process" },
  { pattern: "installationsproceduren",              target: "workflow_process" },
  { pattern: "idriftsættelsesprocessen",             target: "workflow_process" },
  { pattern: "serviceproceduren",                    target: "workflow_process" },
  // Natural speech — management_summary
  { pattern: "the project timeline",                 target: "management_summary" },
  { pattern: "when do we deliver",                   target: "management_summary" },
  { pattern: "the milestones for",                   target: "management_summary" },
  { pattern: "the deadline is",                      target: "management_summary" },
  { pattern: "planning the phases",                  target: "management_summary" },
  { pattern: "the project plan",                     target: "management_summary" },
  { pattern: "the delivery schedule",                target: "management_summary" },
  { pattern: "the sprint planning",                  target: "management_summary" },
  { pattern: "the release plan",                     target: "management_summary" },
  { pattern: "our development phases",               target: "management_summary" },
  { pattern: "the quarterly plan",                   target: "management_summary" },
  { pattern: "how much time do we have",             target: "management_summary" },
  { pattern: "when is the deadline",                 target: "management_summary" },
  { pattern: "resource allocation",                  target: "management_summary" },
  { pattern: "the rollout plan",                     target: "management_summary" },
  { pattern: "the implementation plan",              target: "management_summary" },
  { pattern: "projekttidslinjen",                    target: "management_summary" },
  { pattern: "hvornår skal vi levere",               target: "management_summary" },
  { pattern: "milepælene for",                       target: "management_summary" },
  { pattern: "deadlinen er",                         target: "management_summary" },
  { pattern: "planlægge faserne",                    target: "management_summary" },
  { pattern: "projektplanen",                        target: "management_summary" },
  { pattern: "leveringsplanen",                      target: "management_summary" },
  { pattern: "sprintplanlægningen",                  target: "management_summary" },
  { pattern: "releaseplanen",                        target: "management_summary" },
  { pattern: "vores udviklingsfaser",                target: "management_summary" },
  { pattern: "kvartalsplanen",                       target: "management_summary" },
  { pattern: "hvor lang tid har vi",                 target: "management_summary" },
  { pattern: "hvornår er deadline",                  target: "management_summary" },
  { pattern: "ressourceallokering",                  target: "management_summary" },
  { pattern: "udrulningsplanen",                     target: "management_summary" },
  { pattern: "implementeringsplanen",                target: "management_summary" },
  // Natural speech — requirements_matrix
  { pattern: "the requirements for",                 target: "requirements_matrix" },
  { pattern: "what needs to be compliant",           target: "requirements_matrix" },
  { pattern: "the regulation says",                  target: "requirements_matrix" },
  { pattern: "according to the standard",            target: "requirements_matrix" },
  { pattern: "what the standard requires",           target: "requirements_matrix" },
  { pattern: "compliance with the",                  target: "requirements_matrix" },
  { pattern: "the specification says",               target: "requirements_matrix" },
  { pattern: "regulatory requirements",              target: "requirements_matrix" },
  { pattern: "the functional requirements",          target: "requirements_matrix" },
  { pattern: "the non functional requirements",      target: "requirements_matrix" },
  { pattern: "the security requirements",            target: "requirements_matrix" },
  { pattern: "what must be fulfilled",               target: "requirements_matrix" },
  { pattern: "the acceptance criteria",              target: "requirements_matrix" },
  { pattern: "traceability of the requirements",     target: "requirements_matrix" },
  { pattern: "the cra requires",                     target: "requirements_matrix" },
  { pattern: "the cyber resilience act requires",    target: "requirements_matrix" },
  { pattern: "kravene til",                          target: "requirements_matrix" },
  { pattern: "hvad standarden kræver",               target: "requirements_matrix" },
  { pattern: "overensstemmelse med",                 target: "requirements_matrix" },
  { pattern: "specifikationen siger",                target: "requirements_matrix" },
  { pattern: "regulatoriske krav",                   target: "requirements_matrix" },
  { pattern: "de funktionelle krav",                 target: "requirements_matrix" },
  { pattern: "sikkerhedskravene",                    target: "requirements_matrix" },
  { pattern: "hvad der skal opfyldes",               target: "requirements_matrix" },
  { pattern: "acceptkriterierne",                    target: "requirements_matrix" },
  { pattern: "sporbarhed af kravene",                target: "requirements_matrix" },
  { pattern: "cra kræver at",                        target: "requirements_matrix" },
  { pattern: "cyber resilience act kræver",          target: "requirements_matrix" },
  // Natural speech — persona_research
  { pattern: "who is the user",                      target: "persona_research" },
  { pattern: "the typical user is",                  target: "persona_research" },
  { pattern: "their pain points are",                target: "persona_research" },
  { pattern: "what motivates the user",              target: "persona_research" },
  { pattern: "what the user needs",                  target: "persona_research" },
  { pattern: "their frustrations include",           target: "persona_research" },
  { pattern: "the user profile",                     target: "persona_research" },
  { pattern: "let's define who the user is",         target: "persona_research" },
  { pattern: "the technician's background",          target: "persona_research" },
  { pattern: "the technicians background",           target: "persona_research" },
  { pattern: "their daily challenges",               target: "persona_research" },
  { pattern: "what drives the user",                 target: "persona_research" },
  { pattern: "the user's goals and",                 target: "persona_research" },
  { pattern: "the users goals and",                  target: "persona_research" },
  { pattern: "empathy map for",                      target: "persona_research" },
  { pattern: "understanding the user",               target: "persona_research" },
  { pattern: "the interview findings show",          target: "persona_research" },
  { pattern: "the research shows that",              target: "persona_research" },
  { pattern: "hvem er brugeren",                     target: "persona_research" },
  { pattern: "den typiske bruger er",                target: "persona_research" },
  { pattern: "deres smertepunkter",                  target: "persona_research" },
  { pattern: "hvad der motiverer brugeren",          target: "persona_research" },
  { pattern: "hvad brugeren har brug for",           target: "persona_research" },
  { pattern: "brugerens frustrationer",              target: "persona_research" },
  { pattern: "brugerprofilen",                       target: "persona_research" },
  { pattern: "lad os definere hvem brugeren er",     target: "persona_research" },
  { pattern: "teknikerens baggrund",                 target: "persona_research" },
  { pattern: "deres daglige udfordringer",           target: "persona_research" },
  { pattern: "hvad der driver brugeren",             target: "persona_research" },
  { pattern: "brugerens mål og",                     target: "persona_research" },
  { pattern: "empatikort for",                       target: "persona_research" },
  { pattern: "forstå brugeren",                      target: "persona_research" },
  { pattern: "interviewresultaterne viser",          target: "persona_research" },
  { pattern: "researchen viser at",                  target: "persona_research" },
  // Natural speech — service_blueprint
  { pattern: "the system architecture",              target: "service_blueprint" },
  { pattern: "how the systems connect",              target: "service_blueprint" },
  { pattern: "the backend services",                 target: "service_blueprint" },
  { pattern: "the different layers",                 target: "service_blueprint" },
  { pattern: "frontstage and backstage",             target: "service_blueprint" },
  { pattern: "the touchpoints and channels",         target: "service_blueprint" },
  { pattern: "what happens behind the scenes",       target: "service_blueprint" },
  { pattern: "the support processes",                target: "service_blueprint" },
  { pattern: "the service layers",                   target: "service_blueprint" },
  { pattern: "how the service is delivered",         target: "service_blueprint" },
  { pattern: "the ecosystem around",                 target: "service_blueprint" },
  { pattern: "the stakeholders involved",            target: "service_blueprint" },
  { pattern: "who is involved in the service",       target: "service_blueprint" },
  { pattern: "the information flow between",         target: "service_blueprint" },
  { pattern: "how the data flows",                   target: "service_blueprint" },
  { pattern: "the integration points",               target: "service_blueprint" },
  { pattern: "systemarkitekturen",                   target: "service_blueprint" },
  { pattern: "hvordan systemerne forbindes",         target: "service_blueprint" },
  { pattern: "de forskellige lag",                   target: "service_blueprint" },
  { pattern: "hvad der sker bag kulisserne",         target: "service_blueprint" },
  { pattern: "supportprocesserne",                   target: "service_blueprint" },
  { pattern: "servicelagene",                        target: "service_blueprint" },
  { pattern: "hvordan servicen leveres",             target: "service_blueprint" },
  { pattern: "økosystemet omkring",                  target: "service_blueprint" },
  { pattern: "interessenterne involveret",           target: "service_blueprint" },
  { pattern: "hvem der er involveret i servicen",    target: "service_blueprint" },
  { pattern: "informationsflowet mellem",            target: "service_blueprint" },
  { pattern: "hvordan data flyder",                  target: "service_blueprint" },
  { pattern: "integrationspunkterne",                target: "service_blueprint" },
  // Natural speech — comparison_evaluation
  { pattern: "which option is better",               target: "comparison_evaluation" },
  { pattern: "comparing the alternatives",           target: "comparison_evaluation" },
  { pattern: "the pros and cons",                    target: "comparison_evaluation" },
  { pattern: "evaluate the options",                 target: "comparison_evaluation" },
  { pattern: "which one should we choose",           target: "comparison_evaluation" },
  { pattern: "weighing the options",                 target: "comparison_evaluation" },
  { pattern: "the trade offs between",               target: "comparison_evaluation" },
  { pattern: "how do they compare",                  target: "comparison_evaluation" },
  { pattern: "the strengths and weaknesses",         target: "comparison_evaluation" },
  { pattern: "scoring the alternatives",             target: "comparison_evaluation" },
  { pattern: "rank the options",                     target: "comparison_evaluation" },
  { pattern: "the evaluation criteria",              target: "comparison_evaluation" },
  { pattern: "rate the alternatives",                target: "comparison_evaluation" },
  { pattern: "impact versus effort",                 target: "comparison_evaluation" },
  { pattern: "cost benefit analysis",                target: "comparison_evaluation" },
  { pattern: "hvilken mulighed er bedst",            target: "comparison_evaluation" },
  { pattern: "sammenligne alternativerne",           target: "comparison_evaluation" },
  { pattern: "fordele og ulemper",                   target: "comparison_evaluation" },
  { pattern: "evaluer mulighederne",                 target: "comparison_evaluation" },
  { pattern: "hvilken skal vi vælge",                target: "comparison_evaluation" },
  { pattern: "afvejning af mulighederne",            target: "comparison_evaluation" },
  { pattern: "kompromiserne mellem",                 target: "comparison_evaluation" },
  { pattern: "hvordan sammenligner de",              target: "comparison_evaluation" },
  { pattern: "styrker og svagheder",                 target: "comparison_evaluation" },
  { pattern: "rangere mulighederne",                 target: "comparison_evaluation" },
  { pattern: "evalueringskriterierne",               target: "comparison_evaluation" },
  { pattern: "effekt versus indsats",                target: "comparison_evaluation" },
  { pattern: "cost benefit analyse",                 target: "comparison_evaluation" },
  // Natural speech — design_system
  { pattern: "the color scheme",                     target: "design_system" },
  { pattern: "the typography for",                   target: "design_system" },
  { pattern: "the button styles",                    target: "design_system" },
  { pattern: "the visual language",                  target: "design_system" },
  { pattern: "consistent components",                target: "design_system" },
  { pattern: "the spacing and layout rules",         target: "design_system" },
  { pattern: "the icon set",                         target: "design_system" },
  { pattern: "the design tokens for",                target: "design_system" },
  { pattern: "standardize the components",           target: "design_system" },
  { pattern: "the component specifications",         target: "design_system" },
  { pattern: "reusable components",                  target: "design_system" },
  { pattern: "the brand guidelines",                 target: "design_system" },
  { pattern: "the ui patterns we use",               target: "design_system" },
  { pattern: "document our design",                  target: "design_system" },
  { pattern: "farverne vi bruger",                   target: "design_system" },
  { pattern: "typografien for",                      target: "design_system" },
  { pattern: "knapstilene",                          target: "design_system" },
  { pattern: "det visuelle sprog",                   target: "design_system" },
  { pattern: "konsistente komponenter",              target: "design_system" },
  { pattern: "afstands og layoutregler",             target: "design_system" },
  { pattern: "ikonsættet",                           target: "design_system" },
  { pattern: "design tokens for",                    target: "design_system" },
  { pattern: "standardiser komponenterne",           target: "design_system" },
  { pattern: "komponentspecifikationerne",           target: "design_system" },
  { pattern: "genbrugelige komponenter",             target: "design_system" },
  { pattern: "brandretningslinjerne",                target: "design_system" },
  { pattern: "ui mønstre vi bruger",                 target: "design_system" },
  { pattern: "dokumenter vores design",              target: "design_system" },
  // Additional English overrides — timeline/management
  { pattern: "generate a timeline",                  target: "management_summary" },
  { pattern: "show it as a roadmap",                 target: "management_summary" },
  { pattern: "create a timeline",                    target: "management_summary" },
  { pattern: "generate a gantt",                     target: "management_summary" },
  { pattern: "build a timeline",                     target: "management_summary" },
  { pattern: "show the roadmap",                     target: "management_summary" },
  { pattern: "display a timeline",                   target: "management_summary" },
  { pattern: "visualize it as a timeline",           target: "management_summary" },
  { pattern: "it should be a timeline",              target: "management_summary" },
  { pattern: "let's make a roadmap",                 target: "management_summary" },
  { pattern: "we need a timeline",                   target: "management_summary" },
  { pattern: "create a gantt chart",                 target: "management_summary" },
  { pattern: "show a management summary",            target: "management_summary" },
  // Additional English overrides — requirements
  { pattern: "generate a requirements matrix",       target: "requirements_matrix" },
  { pattern: "show it as requirements",              target: "requirements_matrix" },
  { pattern: "create a requirements matrix",         target: "requirements_matrix" },
  { pattern: "build a requirements table",           target: "requirements_matrix" },
  { pattern: "display the requirements",             target: "requirements_matrix" },
  { pattern: "visualize it as requirements",         target: "requirements_matrix" },
  { pattern: "it should be a requirements table",    target: "requirements_matrix" },
  { pattern: "we need a requirements matrix",        target: "requirements_matrix" },
  { pattern: "let's make a requirements spec",       target: "requirements_matrix" },
  { pattern: "show a requirements spec",             target: "requirements_matrix" },
  { pattern: "show me the cra requirements",         target: "requirements_matrix" },
  { pattern: "vis mig cra kravene",                  target: "requirements_matrix" },
  { pattern: "vis cra kravene",                      target: "requirements_matrix" },
  { pattern: "show the cra compliance",              target: "requirements_matrix" },
  { pattern: "show the cybersecurity requirements",  target: "requirements_matrix" },
  { pattern: "vis cybersikkerhedskravene",           target: "requirements_matrix" },
  { pattern: "generate a cra matrix",                target: "requirements_matrix" },
  { pattern: "lav en cra oversigt",                  target: "requirements_matrix" },
  { pattern: "show me the 13 functions",             target: "requirements_matrix" },
  { pattern: "vis mig de 13 funktioner",             target: "requirements_matrix" },
  { pattern: "cra compliance status",                target: "requirements_matrix" },
  { pattern: "conformity assessment",                target: "requirements_matrix" },
  { pattern: "konformitetsvurdering",                target: "requirements_matrix" },
  { pattern: "show the eu regulation",               target: "requirements_matrix" },
  { pattern: "vis eu regulering",                    target: "requirements_matrix" },
  // Danish: persona / research
  { pattern: "vis mig en persona",                   target: "persona_research" },
  { pattern: "lav en persona",                       target: "persona_research" },
  { pattern: "generer en persona",                   target: "persona_research" },
  { pattern: "det skal være en persona",             target: "persona_research" },
  { pattern: "vis mig brugerprofilen",               target: "persona_research" },
  { pattern: "lav et empatikort",                    target: "persona_research" },
  { pattern: "vis mig et empathy map",               target: "persona_research" },
  { pattern: "vis research resultaterne",            target: "persona_research" },
  { pattern: "vis mig indsigterne",                  target: "persona_research" },
  { pattern: "vis mig brugerresearch",               target: "persona_research" },
  { pattern: "hvem er vores bruger",                 target: "persona_research" },
  { pattern: "lad os lave en persona",               target: "persona_research" },
  // English: persona / research
  { pattern: "show me a persona",                    target: "persona_research" },
  { pattern: "create a persona",                     target: "persona_research" },
  { pattern: "generate a persona",                   target: "persona_research" },
  { pattern: "make a persona",                       target: "persona_research" },
  { pattern: "show me an empathy map",               target: "persona_research" },
  { pattern: "create an empathy map",                target: "persona_research" },
  { pattern: "generate an empathy map",              target: "persona_research" },
  { pattern: "show the research findings",           target: "persona_research" },
  { pattern: "show the research results",            target: "persona_research" },
  { pattern: "show the user research",               target: "persona_research" },
  { pattern: "visualize the research",               target: "persona_research" },
  { pattern: "display the insights",                 target: "persona_research" },
  { pattern: "show user insights",                   target: "persona_research" },
  { pattern: "who is our user",                      target: "persona_research" },
  { pattern: "let's define the persona",             target: "persona_research" },
  { pattern: "we need a persona",                    target: "persona_research" },
  { pattern: "it should be a persona",               target: "persona_research" },
  { pattern: "show the interview findings",          target: "persona_research" },
  { pattern: "display the test results",             target: "persona_research" },
  // Danish: service blueprint
  { pattern: "vis mig et service blueprint",         target: "service_blueprint" },
  { pattern: "lav et service blueprint",             target: "service_blueprint" },
  { pattern: "generer et service blueprint",         target: "service_blueprint" },
  { pattern: "vis mig arkitekturen",                 target: "service_blueprint" },
  { pattern: "vis informationsarkitekturen",         target: "service_blueprint" },
  { pattern: "lav et sitemap",                       target: "service_blueprint" },
  { pattern: "vis mig et sitemap",                   target: "service_blueprint" },
  { pattern: "vis mig et systemkort",                target: "service_blueprint" },
  { pattern: "lav et økosystemkort",                 target: "service_blueprint" },
  { pattern: "vis mig et stakeholder map",           target: "service_blueprint" },
  { pattern: "vis mig et interessentkort",           target: "service_blueprint" },
  { pattern: "lad os lave et service blueprint",     target: "service_blueprint" },
  // English: service blueprint
  { pattern: "show me a service blueprint",          target: "service_blueprint" },
  { pattern: "create a service blueprint",           target: "service_blueprint" },
  { pattern: "generate a service blueprint",         target: "service_blueprint" },
  { pattern: "make a service blueprint",             target: "service_blueprint" },
  { pattern: "show the information architecture",    target: "service_blueprint" },
  { pattern: "show me the architecture",             target: "service_blueprint" },
  { pattern: "create a sitemap",                     target: "service_blueprint" },
  { pattern: "show me a sitemap",                    target: "service_blueprint" },
  { pattern: "generate a sitemap",                   target: "service_blueprint" },
  { pattern: "show me the ecosystem",                target: "service_blueprint" },
  { pattern: "create an ecosystem map",              target: "service_blueprint" },
  { pattern: "show a stakeholder map",               target: "service_blueprint" },
  { pattern: "create a stakeholder map",             target: "service_blueprint" },
  { pattern: "show me a system map",                 target: "service_blueprint" },
  { pattern: "we need a service blueprint",          target: "service_blueprint" },
  { pattern: "it should be a service blueprint",     target: "service_blueprint" },
  { pattern: "let's make a service blueprint",       target: "service_blueprint" },
  // Danish: comparison / evaluation
  { pattern: "vis mig en sammenligning",             target: "comparison_evaluation" },
  { pattern: "lav en sammenligning",                 target: "comparison_evaluation" },
  { pattern: "generer en sammenligning",             target: "comparison_evaluation" },
  { pattern: "lav en swot analyse",                  target: "comparison_evaluation" },
  { pattern: "vis mig en swot",                      target: "comparison_evaluation" },
  { pattern: "lav en konkurrentanalyse",             target: "comparison_evaluation" },
  { pattern: "vis mig en konkurrentanalyse",         target: "comparison_evaluation" },
  { pattern: "sammenlign disse",                     target: "comparison_evaluation" },
  { pattern: "lav en prioriteringsmatrix",           target: "comparison_evaluation" },
  { pattern: "vis mig en beslutningsmatrix",         target: "comparison_evaluation" },
  { pattern: "lav en evaluering",                    target: "comparison_evaluation" },
  { pattern: "vis mig en scorecard",                 target: "comparison_evaluation" },
  // English: comparison / evaluation
  { pattern: "show me a comparison",                 target: "comparison_evaluation" },
  { pattern: "create a comparison",                  target: "comparison_evaluation" },
  { pattern: "generate a comparison",                target: "comparison_evaluation" },
  { pattern: "make a comparison matrix",             target: "comparison_evaluation" },
  { pattern: "show me a swot",                       target: "comparison_evaluation" },
  { pattern: "create a swot analysis",               target: "comparison_evaluation" },
  { pattern: "generate a swot",                      target: "comparison_evaluation" },
  { pattern: "show me a competitive analysis",       target: "comparison_evaluation" },
  { pattern: "create a competitive analysis",        target: "comparison_evaluation" },
  { pattern: "compare these options",                target: "comparison_evaluation" },
  { pattern: "let's compare",                        target: "comparison_evaluation" },
  { pattern: "show me a prioritization matrix",      target: "comparison_evaluation" },
  { pattern: "create a decision matrix",             target: "comparison_evaluation" },
  { pattern: "show me a scorecard",                  target: "comparison_evaluation" },
  { pattern: "generate a scorecard",                 target: "comparison_evaluation" },
  { pattern: "it should be a comparison",            target: "comparison_evaluation" },
  { pattern: "we need a comparison",                 target: "comparison_evaluation" },
  { pattern: "show an impact effort matrix",         target: "comparison_evaluation" },
  { pattern: "create an impact effort",              target: "comparison_evaluation" },
  { pattern: "show a heuristic evaluation",          target: "comparison_evaluation" },
  { pattern: "update the comparison matrix",         target: "comparison_evaluation" },
  { pattern: "update the comparison",                target: "comparison_evaluation" },
  { pattern: "recalculate the scores",               target: "comparison_evaluation" },
  { pattern: "add criteria to the comparison",       target: "comparison_evaluation" },
  // Danish: design system
  { pattern: "vis mig design systemet",              target: "design_system" },
  { pattern: "lav en komponentspec",                 target: "design_system" },
  { pattern: "generer en komponentspec",             target: "design_system" },
  { pattern: "vis mig komponenterne",                target: "design_system" },
  { pattern: "lav en style guide",                   target: "design_system" },
  { pattern: "vis mig en style guide",               target: "design_system" },
  { pattern: "vis mig design tokens",                target: "design_system" },
  { pattern: "lav en farvepalet",                    target: "design_system" },
  { pattern: "vis mig designprincipper",             target: "design_system" },
  { pattern: "lad os dokumentere komponenterne",     target: "design_system" },
  // English: design system
  { pattern: "show me the design system",            target: "design_system" },
  { pattern: "show me a design system",             target: "design_system" },
  { pattern: "create a component spec",              target: "design_system" },
  { pattern: "generate a component spec",            target: "design_system" },
  { pattern: "show me the design tokens",            target: "design_system" },
  { pattern: "create a style guide",                 target: "design_system" },
  { pattern: "generate a style guide",               target: "design_system" },
  { pattern: "show me the component library",        target: "design_system" },
  { pattern: "show me the ui components",            target: "design_system" },
  { pattern: "create a color palette",               target: "design_system" },
  { pattern: "show the design principles",           target: "design_system" },
  { pattern: "document the components",              target: "design_system" },
  { pattern: "it should be a design system",         target: "design_system" },
  { pattern: "we need a design system",              target: "design_system" },
  { pattern: "show me a pattern library",            target: "design_system" },
  { pattern: "create a ui kit",                      target: "design_system" },
];

/**
 * Gabriel / møde-dataviz: ekstra hard overrides når mønstret findes i sidste segment
 * (eller ultra-recent zone) — samme “vinder med 999”-sti som øvrige TOPIC_SHIFT_OVERRIDES.
 */
const TOPIC_SHIFT_GABRIEL_OVERRIDES: Array<{ pattern: string; target: VizFamily }> = [
  { pattern: "excel fil", target: "management_summary" },
  { pattern: "excelark", target: "management_summary" },
  { pattern: "excel arket", target: "management_summary" },
  { pattern: "regnearket", target: "management_summary" },
  { pattern: "regneark", target: "management_summary" },
  { pattern: "pivottabel", target: "management_summary" },
  { pattern: "pivot table", target: "management_summary" },
  { pattern: "kpi rapport", target: "management_summary" },
  { pattern: "kpi board", target: "management_summary" },
  { pattern: "data dashboard", target: "management_summary" },
  { pattern: "marketing dashboard", target: "management_summary" },
  { pattern: "vis tallene i et", target: "management_summary" },
  { pattern: "visualisér data", target: "management_summary" },
  { pattern: "visualisere data", target: "management_summary" },
  { pattern: "søjlediagram", target: "management_summary" },
  { pattern: "linjediagram", target: "management_summary" },
  { pattern: "cirkeldiagram", target: "management_summary" },
  { pattern: "power bi", target: "management_summary" },
  { pattern: "lav en graf", target: "management_summary" },
  { pattern: "ny graf til", target: "management_summary" },
  { pattern: "som et diagram", target: "management_summary" },
  { pattern: "som en graf", target: "management_summary" },
  { pattern: "sammenlign de to kolonner", target: "comparison_evaluation" },
  { pattern: "sammenlign kolonner", target: "comparison_evaluation" },
  { pattern: "helt andet emne", target: "generic" },
  { pattern: "lad os skifte emne", target: "generic" },
  { pattern: "start forfra med visualisering", target: "generic" },
  { pattern: "ny session om", target: "generic" },
];

/** Ekstra score i seneste zone (3000 tegn) for Gabriel — uden at erstatte hard override. */
function gabrielRecentDatavizBoost(recentNorm: string): number {
  let b = 0;
  const terms: Array<[string, number]> = [
    ["excel", 44],
    ["regneark", 40],
    ["spreadsheet", 40],
    ["csv", 28],
    ["pivot", 36],
    ["kpi", 38],
    ["dashboard", 42],
    ["datavisualisering", 46],
    ["visualisering af data", 44],
    ["som graf", 24],
    ["diagram", 26],
    [" bar chart", 28],
    ["line chart", 28],
    ["campaign metrics", 30],
    ["social media", 26],
    ["reach og", 22],
    ["impressions", 24],
  ];
  for (const [t, w] of terms) {
    if (recentNorm.includes(t)) b += w;
  }
  return Math.min(b, 130);
}

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

export function classifyVisualizationIntent(
  transcript: string,
  workspaceDomain?: string | null
): ClassificationResult {
  const domain = normalizeWorkspaceDomain(workspaceDomain);
  const topicShiftOverrides =
    domain === "gabriel"
      ? [...TOPIC_SHIFT_OVERRIDES, ...TOPIC_SHIFT_GABRIEL_OVERRIDES]
      : TOPIC_SHIFT_OVERRIDES;

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

  if (domain === "gabriel") {
    const gb = gabrielRecentDatavizBoost(recentNorm);
    if (gb > 0) {
      mergedMap.set(
        "management_summary",
        (mergedMap.get("management_summary") ?? 0) + gb
      );
    }
  }

  // ─── HARD OVERRIDE: topic-shift phrases in LAST SEGMENT auto-win ───────────
  // The transcript is cumulative: "[Speaker]: old stuff\n[Speaker]: new stuff".
  // We extract the LAST speaker segment (everything after the final [Speaker]:)
  // because that's what was *just* said — regardless of how long the transcript is.
  // Priority: 1) last segment, 2) last 2 segments, 3) ultra-recent 1000 chars, 4) full recent zone.
  // We scan from end-to-start so the LAST override wins if multiple are present.

  const segmentMarkerRegex = /\n?\[[\w\s\-æøåÆØÅäöüÄÖÜ]+\]\s*:\s*/g;
  const segmentPositions: number[] = [];
  let segMatch: RegExpExecArray | null;
  while ((segMatch = segmentMarkerRegex.exec(tail)) !== null) {
    segmentPositions.push(segMatch.index + segMatch[0].length);
  }

  let hardOverrideFamily: VizFamily | null = null;
  let hardOverridePos = -1;

  // Priority 1: scan ONLY the last speaker segment
  if (segmentPositions.length > 0) {
    const lastSegStart = segmentPositions[segmentPositions.length - 1];
    const lastSegText = normalizeForClassification(tail.slice(lastSegStart));
    for (const shift of topicShiftOverrides) {
      const pos = lastSegText.lastIndexOf(shift.pattern);
      if (pos !== -1 && pos > hardOverridePos) {
        hardOverridePos = pos;
        hardOverrideFamily = shift.target;
      }
    }
  }

  // Priority 2: scan last 2 segments (in case the shift spans two turns)
  if (!hardOverrideFamily && segmentPositions.length > 1) {
    const secondLastSegStart = segmentPositions[segmentPositions.length - 2];
    const lastTwoSegsText = normalizeForClassification(tail.slice(secondLastSegStart));
    hardOverridePos = -1;
    for (const shift of topicShiftOverrides) {
      const pos = lastTwoSegsText.lastIndexOf(shift.pattern);
      if (pos !== -1 && pos > hardOverridePos) {
        hardOverridePos = pos;
        hardOverrideFamily = shift.target;
      }
    }
  }

  // Priority 3: ultra-recent 1000 chars (fallback for transcripts without [Speaker]: markers)
  if (!hardOverrideFamily) {
    const ultraRecentNorm = normalizeForClassification(tail.slice(-1000));
    hardOverridePos = -1;
    for (const shift of topicShiftOverrides) {
      const pos = ultraRecentNorm.lastIndexOf(shift.pattern);
      if (pos !== -1 && pos > hardOverridePos) {
        hardOverridePos = pos;
        hardOverrideFamily = shift.target;
      }
    }
  }

  // Priority 4: full recent zone (3000 chars)
  if (!hardOverrideFamily) {
    hardOverridePos = -1;
    for (const shift of topicShiftOverrides) {
      const pos = recentNorm.lastIndexOf(shift.pattern);
      if (pos !== -1 && pos > hardOverridePos) {
        hardOverridePos = pos;
        hardOverrideFamily = shift.target;
      }
    }
  }
  if (hardOverrideFamily) {
    const topicLabel =
      (VIZ_FAMILY_SIGNALS.find((f) => f.id === hardOverrideFamily)?.label ??
        VIZ_FAMILY_LABEL[hardOverrideFamily]) + " (explicit override)";
    const scored = VIZ_FAMILY_SIGNALS.map((fam) => ({
      id:    fam.id,
      label: fam.label,
      score: fam.id === hardOverrideFamily ? 999 : Math.round((mergedMap.get(fam.id) ?? 0) * 10) / 10,
    }));
    if (hardOverrideFamily === "generic") {
      scored.push({
        id:    "generic",
        label: VIZ_FAMILY_LABEL.generic,
        score: 999,
      });
    }
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    return {
      family:   hardOverrideFamily,
      topic:    topicLabel,
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
