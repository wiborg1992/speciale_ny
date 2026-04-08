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
  | "mobile_app"
  | "requirements_matrix"
  | "management_summary"
  | "engagement_analytics"
  | "persona_research"
  | "service_blueprint"
  | "comparison_evaluation"
  | "design_system"
  | "ux_prototype"
  | "generic";

export interface ClassificationResult {
  family: VizFamily;
  topic: string;
  scores: Array<{ id: string; label: string; score: number }>;
  ambiguous: boolean;
  lead: number;
  runnerUp: string | null;
  /** true KUN når family-score === 999 — dvs. en TOPIC_SHIFT_OVERRIDE eller RECENT_ZONE_OVERRIDE slog til. */
  hardOverride: boolean;
}

const VIZ_CLASSIFY_TAIL_CHARS = 12_000;
const CLASSIFY_MIN_TOTAL = 8;
export const CLASSIFY_MIN_LEAD = 4;
/** Krævet lead for at skifte en ETABLERET familie (P6 i decision order). */
export const CLASSIFY_SWITCH_LEAD = 12;

const FAMILY_PRIORITY_ORDER: VizFamily[] = [
  "hmi_interface",
  "user_journey",
  "ux_prototype",
  "service_blueprint",
  "persona_research",
  // Mobilapp før fysisk produkt — Grundfos GO / mobil app skal IKKE blive physical_product
  "mobile_app",
  // Fysisk produkt før workflow — undgår at “handover/process”-ord slår hardware
  "physical_product",
  "workflow_process",
  "requirements_matrix",
  "comparison_evaluation",
  "design_system",
  "engagement_analytics",
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
    id: "hmi_interface",
    label: "HMI / SCADA interface",
    terms: [
      ["human machine interface", 22],
      ["hmi interface", 22],
      ["menneske maskine", 14],
      ["navigationstab", 20],
      ["navigation tab", 20],
      ["navigation tabs", 20],
      ["navigationstabs", 18],
      ["grafisk brugergrænseflade", 16],
      ["brugergrænseflade", 10],
      ["procesbillede", 16],
      ["process image", 16],
      ["synoptisk billede", 14],
      ["synoptic", 12],
      ["alarmvisning", 14],
      ["alarm view", 14],
      ["alarm list", 12],
      ["hændelseslog", 12],
      ["event list", 12],
      ["live values", 12],
      ["live værdier", 12],
      ["setpoint", 10],
      ["setpunkt", 10],
      ["operator screen", 14],
      ["operator panel", 14],
      ["betjeningspanel", 14],
      ["kontrolpanel", 12],
      ["touch panel", 12],
      ["touch screen", 12],
      ["touchskærm", 12],
      ["isolutions", 18],
      ["i solutions", 14],
      ["plc", 8],
      ["scada", 16],
      ["supervisory", 10],
      ["hmi", 12],
      ["trending", 8],
      ["trendkurve", 8],
      ["mimic diagram", 12],
      ["control room", 10],
      ["driftsskærm", 12],
      ["overvågningssystem", 12],
      ["navigationspanel", 14],
      ["drift tab", 14],
      ["sikkerhedstab", 14],
      ["settings tab", 12],
      ["we are building an interface", 18],
      ["vi laver et interface", 18],
      ["app interface", 14],
      ["tab interface", 14],
    ],
  },
  {
    id: "user_journey",
    label: "User journey / experience map",
    terms: [
      ["user journey mapping", 24],
      ["user journey map", 22],
      ["customer journey map", 22],
      ["user journey", 20],
      ["customer journey", 20],
      ["journey map", 20],
      ["journey mapping", 20],
      ["brugerrejse", 20],
      ["kunderejse", 20],
      ["touchpoint", 14],
      ["touchpoints", 14],
      ["touch points", 12],
      ["berøringspunkt", 14],
      ["pain point", 14],
      ["painpoint", 12],
      ["smertepunkt", 14],
      ["moments of truth", 14],
      ["swimlane", 12],
      ["swim lane", 12],
      ["swimlanes", 12],
      ["onboarding flow", 14],
      ["onboarding", 10],
      ["brugerflow", 14],
      ["customer experience", 12],
      ["cx design", 10],
      ["user flow", 12],
      ["storyboard", 10],
      ["what happens when", 12],
      ["hvad sker der når", 12],
      ["hvad sker der", 10],
      ["as a user", 10],
      ["som bruger", 10],
      ["experience map", 18],
      ["oplevelseskort", 16],
      ["emotion curve", 14],
      ["følelsesskala", 14],
      // Eskalering — journey-kontekst (alarm → vedligehold)
      ["eskaler", 10],
      ["eskaleres", 10],
      ["escalation", 10],
      ["escalate", 8],
    ],
  },
  {
    id: "workflow_process",
    label: "Process / workflow / flowchart",
    terms: [
      ["value stream map", 20],
      ["value stream mapping", 20],
      ["value stream", 14],
      ["business process model", 16],
      ["forretningsproces", 16],
      ["forretningsprocess", 14],
      ["bpmn", 18],
      ["process mining", 14],
      ["approval workflow", 14],
      ["approval flow", 12],
      ["godkendelsesflow", 14],
      ["procesflow", 14],
      ["process flow", 14],
      ["workflow engine", 12],
      ["workflow", 10],
      ["sop ", 8],
      ["standard operating procedure", 14],
      ["raci", 12],
      ["handover", 10],
      ["overdragelse", 10],
      ["six sigma", 12],
      ["lean ", 8],
      ["bottleneck analysis", 12],
      ["flowchart", 14],
      ["flowdiagram", 14],
      ["decision diamond", 14],
      ["if x then y", 12],
      ["if this then", 10],
      ["hvad er processen", 14],
      ["how does the process work", 14],
      // Swimlanes er også procesdiagram-artefakt (ikke kun user journey)
      ["swimlane", 10],
      ["swimlanes", 10],
      // Beslutningspunkter — dansk naturlig tale
      ["beslutningspunkt", 14],
      ["decision point", 14],
      // Produktions-/ERP-termer
      ["erp integration", 14],
      ["batchjob", 12],
      ["batch job", 12],
      ["qa godkender", 14],
      ["qa approval", 14],
      ["frigives til", 10],
      ["released to", 8],
    ],
  },
  {
    id: "physical_product",
    label: "Physical product / pump hardware",
    terms: [
      ["physical hardware", 28],
      ["the physical pump", 26],
      ["physical pump", 24],
      ["design the pump", 22],
      ["pump design", 20],
      ["front panel design", 26],
      ["front panel of the pump", 24],
      ["front panel for the pump", 24],
      ["front face of the pump", 24],
      ["on the pump face", 20],
      ["device face", 16],
      ["pin insert", 18],
      ["pump front", 18],
      ["hardware design", 20],
      ["physical device", 18],
      ["cirkulationspumpe", 18],
      ["centrifugalpumpe", 18],
      ["centrifugal pump", 16],
      ["centrifugal", 12],
      ["npsh", 18],
      ["impeller", 16],
      ["impelleren", 14],
      ["wet end", 16],
      ["volute", 12],
      ["alpha2", 14],
      ["alpha 2", 14],
      ["magna3", 14],
      ["magna 3", 14],
      ["cr pump", 14],
      ["cr-n", 10],
      ["bluetooth pump", 14],
      ["led ring", 14],
      ["control face", 12],
      ["cu 200", 14],
      ["cu 300", 14],
      ["cu200", 14],
      ["cu300", 14],
      ["dedicated controls", 14],
      ["pump model", 12],
      ["pumpe model", 12],
      ["pumpe", 8],
      ["pump curve", 12],
      ["pump ", 6],
      ["motor size", 10],
      ["ie3", 8],
      ["ie4", 8],
      ["ie5", 8],
      ["m3/h", 10],
      ["kubikmeter i timen", 10],
      ["tryk bar", 10],
      ["pressure bar", 10],
      ["sku", 8],
      ["product cutaway", 12],
      ["hardware revision", 10],
      ["what does it look like", 14],
      ["hvad ser det ud", 14],
      ["how does it look", 12],
      // Connector- og input-terminologi
      ["drejeknap", 14],
      ["rotary knob", 14],
      ["rj45", 14],
      ["ethernet connector", 12],
      ["panel connector", 10],
      ["kabelstik", 10],
      ["front panel hardware", 20],
      ["hardware på bordet", 14],
      ["hardware on the table", 12],
      ["sign of the pump", 18],
      ["separate display", 16],
      ["separate display for", 18],
      ["only for pin code", 16],
      ["pin code entry", 16],
      ["front panel", 14],
      ["the front panel", 16],
      ["frontpanelet", 16],
    ],
  },
  {
    id: "mobile_app",
    label: "Mobile App / Grundfos GO",
    terms: [
      ["grundfos go app", 24],
      ["grundfos go mobile", 24],
      ["grundfos go replace", 22],
      ["go replace", 18],
      ["grundfos go", 22],
      ["go app", 18],
      ["go appen", 18],
      ["alpha go", 20],
      ["mobil app", 20],
      ["mobilapp", 20],
      ["mobil applikation", 20],
      ["mobile app", 20],
      ["mobile application", 18],
      ["smartphone app", 18],
      ["phone app", 16],
      ["telefon app", 16],
      ["tablet app", 14],
      ["app store", 14],
      ["google play", 14],
      ["download appen", 16],
      ["download the app", 16],
      ["installer appen", 16],
      ["install the app", 16],
      ["opret forbindelse", 14],
      ["scan qr-kode", 14],
      ["scan qr code", 14],
      ["bluetooth forbindelse", 14],
      ["bluetooth connection", 14],
      ["wifi forbindelse til pumpe", 16],
      ["connect to pump", 14],
      ["forbind til pumpen", 14],
      ["opsætning af pumpe via app", 20],
      ["pump setup via app", 18],
      ["guidet opsætning", 16],
      ["guided setup", 14],
      ["go replace til cirkulationspumper", 20],
      ["produktindstillinger", 14],
      ["specificer dit produkt", 16],
      ["fejlfinding via app", 16],
      ["produktkatalog", 12],
      ["produkt katalog", 12],
      ["product catalog", 12],
      ["pump dashboard app", 18],
      ["driftspunkt", 12],
      ["operating point", 12],
      ["reguleringsform", 14],
      ["konstant flow", 12],
      ["konstantkurve", 12],
      ["cirkulatorrolle", 14],
      ["zonepumpe", 12],
      ["varmeemitter", 14],
      ["start udluftning", 14],
      ["pumpeudluftning", 14],
      ["demofunktion", 12],
      ["demo funktion", 12],
      ["afslut demo", 12],
      ["dan rapport", 12],
      ["bottom tab", 14],
      ["bottom navigation", 14],
      ["bundnavigation", 14],
      ["tab bar", 10],
      ["oversigt tab", 14],
      ["produkter tab", 14],
      ["app oversigt", 14],
      ["app screen", 12],
      ["app skærm", 12],
      ["trenddata", 12],
      ["app notification", 12],
      ["push notification", 12],
      ["push besked", 12],
    ],
  },
  {
    id: "requirements_matrix",
    label: "Requirements / traceability",
    terms: [
      // ONLY terms that are unambiguously about requirements traceability artefacts.
      // Generic compliance / product / workflow terms are intentionally excluded —
      // requirements_matrix is guarded by REQUIREMENTS_MATRIX_EXPLICIT_PHRASES below.
      ["traceability matrix", 22],
      ["requirements traceability", 22],
      ["traceability ids", 18],
      ["traceability id", 16],
      ["kravspecifikation", 22],
      ["krav specifikation", 18],
      ["kravspec", 18],
      ["krav matrix", 18],
      ["kravmatrix", 18],
      ["moscow priorit", 18],
      ["must should could won", 20],
      ["must have should have could have", 22],
      ["srs document", 14],
      ["requirement id", 14],
      ["requirements baseline", 16],
      ["sporbarhed af krav", 18],
      ["status pr. krav", 18],
      ["status per requirement", 16],
      ["iec62443", 16],
      ["eu 2024/2847", 20],
      ["2024/2847", 18],
      ["cybersikkerhedskrav", 18],
      ["cybersecurity requirement", 18],
      ["softwareopdateringskrav", 16],
      ["software update requirement", 16],
      ["sårbarhedsrapportering", 16],
      ["sårbarhedshåndtering", 16],
      ["konformitetsvurdering", 18],
      ["conformity assessment", 16],
      ["overensstemmelseskrav", 16],
      ["vulnerability disclosure", 16],
    ],
  },
  {
    id: "engagement_analytics",
    label: "Engagement analytics / traffic dashboard",
    terms: [
      ["engagement analytics", 40],
      ["engagement data", 38],
      ["pageviews", 36],
      ["page views", 34],
      ["bounce rate", 36],
      ["bounce-rate", 34],
      ["engaged time", 36],
      ["concurrent users", 38],
      ["concurrents", 32],
      ["unique visitors", 36],
      ["unikt besøgende", 36],
      ["realtime analytics", 40],
      ["real-time analytics", 38],
      ["real time analytics", 36],
      ["trafikdata", 36],
      ["trafik analyse", 36],
      ["trafikanalyse", 36],
      ["trafikkilder", 34],
      ["trafik kilde", 32],
      ["trafik rapport", 34],
      ["trafikrapport", 36],
      ["visitor frequency", 36],
      ["besøgsfrekvens", 34],
      ["device split", 36],
      ["mobile vs desktop", 34],
      ["traffic sources", 36],
      ["traffic by source", 38],
      ["referrers", 32],
      ["referrer", 28],
      ["social reach", 30],
      ["chartbeat", 38],
      ["google analytics", 34],
      ["sessions", 22],
      ["session data", 30],
      ["abonnenter", 28],
      ["subscribers", 26],
    ],
  },
  {
    id: "management_summary",
    label: "Management / timeline / roadmap",
    terms: [
      ["executive summary", 16],
      ["steering committee", 14],
      ["roadmap", 14],
      ["gantt", 16],
      ["milestone", 12],
      ["milepæl", 12],
      ["quarterly", 10],
      ["budget", 10],
      ["portfolio", 10],
      ["program office", 12],
      ["stakeholder", 10],
      ["risk register", 12],
      ["risikoregister", 12],
      ["go live date", 12],
      ["decision log", 12],
      ["kanban", 12],
      ["backlog", 10],
      ["sprint", 10],
      ["vi besluttede", 12],
      ["we decided", 12],
      ["beslutning", 10],
      // Dansk quarterly + opsummering
      ["kvartal", 10],
      ["opsummering", 12],
      ["resumé", 10],
      ["executive resume", 14],
      // Kapital og pilot
      ["kapitalbehov", 12],
      ["capital requirements", 12],
      ["pilot site", 10],
    ],
  },
  {
    id: "persona_research",
    label: "Persona / research insights",
    terms: [
      ["persona profile", 22],
      ["persona description", 20],
      ["user persona", 20],
      ["buyer persona", 18],
      ["persona", 14],
      ["personas", 14],
      ["empathy map", 22],
      ["empathy mapping", 20],
      ["empatikort", 20],
      ["user profile", 16],
      ["brugerprofil", 16],
      ["user research", 18],
      ["brugerresearch", 18],
      ["research findings", 18],
      ["research insight", 18],
      ["research results", 16],
      ["forskningsresultater", 16],
      ["indsigter", 12],
      ["insight summary", 18],
      ["interview findings", 18],
      ["interview results", 16],
      ["interviewresultater", 16],
      ["usability test results", 18],
      ["usability findings", 16],
      ["brugertest", 16],
      ["user testing results", 16],
      ["test findings", 14],
      ["user needs", 14],
      ["brugerbehov", 14],
      ["customer needs", 14],
      ["kundebehov", 14],
      ["behavioral pattern", 14],
      ["adfærdsmønster", 14],
      ["mental model", 14],
      ["user motivation", 14],
      ["user frustration", 14],
      ["frustration", 6],
      ["motivation", 5],
      ["user segment", 14],
      ["brugersegment", 14],
      ["demographic", 10],
      ["demografi", 10],
      ["archetype", 12],
      ["who is the user", 16],
      ["hvem er brugeren", 16],
      ["what does the user need", 16],
      ["hvad har brugeren brug for", 16],
      ["jobs to be done", 18],
      ["jtbd", 16],
      ["problem statement", 14],
      ["validated problem", 14],
      ["valideret problem", 14],
      // Stærke persona-formuleringer
      ["primær persona", 22],
      ["primary persona", 22],
      ["sekundær persona", 18],
      ["secondary persona", 18],
      // Værktøjer og daglig praksis
      ["tools they use", 12],
      ["værktøjer de bruger", 12],
      ["their daily tools", 10],
      ["tillid til alarmprioritering", 16],
      ["tillid til alarm", 12],
      ["trust in alarm prioritization", 12],
      ["trust in alarms", 10],
    ],
  },
  {
    id: "service_blueprint",
    label: "Service blueprint / experience architecture",
    terms: [
      ["service blueprint", 22],
      ["serviceblueprint", 22],
      ["service design", 18],
      ["servicedesign", 18],
      ["experience architecture", 22],
      ["oplevelsesarkitektur", 20],
      ["information architecture", 20],
      ["informationsarkitektur", 20],
      ["ia diagram", 16],
      ["sitemap", 14],
      ["navigation structure", 16],
      ["navigationsstruktur", 16],
      ["content model", 14],
      ["indholdsmodel", 14],
      ["backstage process", 18],
      ["backstage", 12],
      ["frontstage", 14],
      ["support process", 14],
      ["line of visibility", 16],
      ["line of interaction", 16],
      ["customer action", 12],
      ["onstage", 10],
      ["system map", 14],
      ["systemkort", 14],
      ["ecosystem map", 16],
      ["økosystemkort", 16],
      ["stakeholder map", 16],
      ["interessentkort", 16],
      ["actor map", 14],
      ["aktørkort", 14],
      ["channel map", 14],
      ["kanalkort", 14],
      ["service layer", 14],
      ["servicelag", 14],
      ["evidence", 5],
      ["physical evidence", 14],
      ["fysisk bevis", 14],
      // Aftermarket / support-kontekst
      ["supportlinje", 14],
      ["spare parts", 12],
      ["reservedele", 12],
      ["tier 2 tekniker", 14],
      ["tier 2 support", 14],
      ["tier 2 technician", 12],
      ["1. linje support", 12],
      ["first line support", 12],
      ["second line support", 14],
      ["anden linje support", 12],
    ],
  },
  {
    id: "comparison_evaluation",
    label: "Comparison / evaluation / analysis",
    terms: [
      ["comparison matrix", 22],
      ["sammenligningsmatrix", 20],
      ["feature comparison", 22],
      ["feature matrix", 20],
      ["funktionssammenligning", 20],
      ["competitive analysis", 22],
      ["konkurrentanalyse", 20],
      ["competitor analysis", 20],
      ["benchmarking", 16],
      ["benchmark", 14],
      ["swot analysis", 22],
      ["swot", 16],
      ["pros and cons", 16],
      ["fordele og ulemper", 16],
      ["trade-off", 14],
      ["tradeoff", 14],
      ["afvejning", 12],
      ["prioritization matrix", 22],
      ["prioriteringsmatrix", 20],
      ["impact effort matrix", 22],
      ["impact effort", 18],
      ["impact vs effort", 18],
      ["value complexity", 16],
      ["value vs complexity", 16],
      ["kano model", 18],
      ["kano", 12],
      ["scorecard", 16],
      ["scorekort", 14],
      ["weighted scoring", 16],
      ["vægtet scoring", 14],
      ["evaluation criteria", 16],
      ["evalueringskriterier", 16],
      ["decision matrix", 18],
      ["beslutningsmatrix", 16],
      ["pugh matrix", 18],
      ["heuristic evaluation", 20],
      ["heuristisk evaluering", 18],
      ["usability evaluation", 18],
      ["design review", 14],
      ["designgennemgang", 14],
      ["compare these", 14],
      ["sammenlign disse", 14],
      ["which is better", 12],
      ["hvad er bedst", 12],
      ["option a vs option b", 16],
      ["alternativ a vs", 14],
      ["risk assessment", 16],
      ["risikovurdering", 14],
      ["opportunity assessment", 16],
      ["desirability assessment", 16],
      ["update the comparison", 16],
      ["update the matrix", 14],
      ["recalculate", 10],
      ["weighted score", 14],
      ["add new criteria", 14],
      ["add criteria", 12],
      ["additional criteria", 14],
      ["three options", 10],
      ["option a", 8],
      ["option b", 8],
      ["option c", 8],
      // Vendor comparison / udbud
      ["vendor comparison", 20],
      ["vendor a vs", 16],
      ["leverandør a vs", 16],
      ["leverandørsammenligning", 18],
      ["tco", 14],
      ["total cost of ownership", 16],
      ["integration maturity", 14],
      ["integrationsmodenhed", 14],
    ],
  },
  {
    id: 'ux_prototype',
    label: 'UX prototype / clickable mockup',
    terms: [
      ['clickable prototype', 24],
      ['klikbar prototype', 24],
      ['klikke igennem', 22],
      ['click through', 20],
      ['click through the screens', 22],
      ['klikke sig igennem', 22],
      ['navigere mellem skærme', 20],
      ['navigate between screens', 20],
      ['prototype navigation', 20],
      ['multi screen prototype', 20],
      ['multi-screen prototype', 20],
      ['screen navigation', 18],
      ['skærmnavigation', 18],
      ['interactive prototype', 20],
      ['interaktiv prototype', 20],
      ['lo-fi prototype', 18],
      ['lofi prototype', 18],
      ['hi-fi prototype', 18],
      ['hifi prototype', 18],
      ['high fidelity prototype', 18],
      ['low fidelity prototype', 18],
      ['wireframe prototype', 18],
      ['prototype screens', 18],
      ['prototype skærme', 18],
      ['app prototype', 18],
      ['app prototypen', 18],
      ['web prototype', 16],
      ['prototype flow', 18],
      ['prototypeflow', 18],
      ['screen flow', 16],
      ['skærmflow', 16],
      ['prototype testing', 16],
      ['prototypetest', 16],
      ['test prototype', 16],
      ['user testing prototype', 18],
      ['figma', 12],
      ['klikbar mockup', 18],
      ['clickable mockup', 18],
      ['vi laver en prototype', 20],
      ['we are building a prototype', 20],
      ['lave en prototype', 20],
      ['build a prototype', 18],
      ['prototype af', 14],
    ],
  },
  {
    id: "design_system",
    label: "Design system / component spec",
    terms: [
      ["design system", 22],
      ["designsystem", 22],
      ["component library", 20],
      ["komponentbibliotek", 20],
      ["component spec", 18],
      ["komponentspecifikation", 18],
      ["design tokens", 20],
      ["design token", 18],
      ["style guide", 18],
      ["stilguide", 18],
      ["pattern library", 18],
      ["mønsterbibliotek", 16],
      ["ui kit", 16],
      ["ui components", 14],
      ["ui komponenter", 14],
      ["color palette", 14],
      ["farvepalet", 14],
      ["colour palette", 14],
      ["typography scale", 16],
      ["typografiskala", 14],
      ["spacing system", 14],
      ["spacing scale", 14],
      ["grid system", 14],
      ["gridsystem", 12],
      ["breakpoint", 10],
      ["responsive", 5],
      ["design principle", 16],
      ["designprincip", 16],
      ["design principles", 16],
      ["designprincipper", 16],
      ["accessibility", 12],
      ["tilgængelighed", 12],
      ["a11y", 12],
      ["wcag", 14],
      ["component anatomy", 18],
      ["component state", 14],
      ["komponenttilstand", 14],
      ["variant", 5],
      ["variants", 5],
      ["varianter", 5],
      ["atomic design", 16],
      ["design guideline", 16],
      ["designretningslinje", 14],
      ["brand guideline", 16],
      ["brandguide", 14],
      ["component documentation", 18],
      ["komponentdokumentation", 16],
      ["one component many combinations", 20],
      ["platform features", 14],
      ["platform design", 14],
      // Datagrid og harmonisering
      ["datagrid", 14],
      ["data grid", 14],
      ["ensret", 12],
      ["harmonize across", 14],
      ["standardize across", 14],
      ["ensretning", 12],
    ],
  },
];

/** Label lookup for human-readable output */
export const VIZ_FAMILY_LABEL: Record<VizFamily, string> = {
  hmi_interface: "HMI / SCADA interface",
  user_journey: "User Journey / Experience Map",
  workflow_process: "Workflow / Process Diagram",
  physical_product: "Physical Product / Pump Hardware",
  mobile_app: "Mobile App / Grundfos GO",
  requirements_matrix: "Requirements Matrix",
  management_summary: "Management Summary / Timeline",
  engagement_analytics: "Engagement Analytics Dashboard",
  persona_research: "Persona / Research Insights",
  service_blueprint: "Service Blueprint / Experience Architecture",
  comparison_evaluation: "Comparison / Evaluation Matrix",
  design_system: "Design System / Component Spec",
  ux_prototype: "UX Prototype / Clickable Mockup",
  generic: "General visualization",
};

function normalizeForClassification(text: string): string {
  let s = text.toLowerCase().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
  // Fix common ASR misrecognitions that derail classification
  const fixes: Array<[string, string]> = [
    // ── Grundfos brand terms ──
    ["grundfoss", "grundfos"],
    ["alfa go", "alpha go"],
    ["alfa 2", "alpha 2"],
    ["alfa2", "alpha2"],
    ["isolution", "isolutions"],
    ["i solution", "isolutions"],
    ["see you 200", "cu 200"],
    ["see you 352", "cu 352"],
    ["see you200", "cu 200"],

    // ── Interface / HMI ──
    ["i dagens face", "interface"],
    ["dagens face", "interface"],
    ["todays face", "interface"],
    ["enter face", "interface"],
    ["inter face", "interface"],
    ["inner face", "interface"],
    ["in a face", "interface"],
    ["userinterface", "user interface"],
    ["h m i", "hmi"],
    ["h.m.i.", "hmi"],
    ["h.m.i", "hmi"],
    ["age m i", "hmi"],
    ["aitch m i", "hmi"],
    ["hm i ", "hmi "],
    ["s c a d a", "scada"],
    ["s.c.a.d.a.", "scada"],
    ["scatter", "scada"],
    ["dash board", "dashboard"],

    // ── User journey ──
    ["user journee", "user journey"],
    ["user jurney", "user journey"],
    ["user jerney", "user journey"],
    ["user gerney", "user journey"],
    ["user journey- mapping", "user journey mapping"],
    ["user journey -mapping", "user journey mapping"],
    ["user journey - mapping", "user journey mapping"],
    ["user journey,mapping", "user journey mapping"],
    ["user journey, mapping", "user journey mapping"],
    ["user journey. mapping", "user journey mapping"],
    ["journey maping", "journey mapping"],
    ["journee mapping", "journey mapping"],
    ["journee map", "journey map"],
    ["journee", "journey"],
    ["jurney", "journey"],
    ["jerney", "journey"],
    ["gerney", "journey"],
    ["jarni", "journey"],
    ["jarny", "journey"],
    ["jorni", "journey"],
    ["customer jurney", "customer journey"],
    ["customer journee", "customer journey"],
    ["touch point", "touchpoint"],
    ["touch points", "touchpoints"],
    ["pain points", "pain point"],
    ["swim lane", "swimlane"],
    ["swim lanes", "swimlanes"],
    ["on boarding", "onboarding"],

    // ── Workflow / flowchart ──
    ["work flow", "workflow"],
    ["work flo", "workflow"],
    ["work low", "workflow"],
    ["flow chart", "flowchart"],
    ["flow shart", "flowchart"],
    ["flowshart", "flowchart"],
    ["flow diagram", "flowdiagram"],
    ["flow diagramme", "flowdiagram"],
    ["process flow", "process flow"],
    ["b p m n", "bpmn"],
    ["b.p.m.n.", "bpmn"],
    ["value stream maping", "value stream mapping"],
    ["value string", "value stream"],

    // ── Persona / research ──
    ["per sona", "persona"],
    ["per sonar", "persona"],
    ["personas", "persona"],
    ["empathy map", "empathy map"],
    ["empathi map", "empathy map"],
    ["emapthy", "empathy"],
    ["arche type", "archetype"],
    ["archtype", "archetype"],

    // ── Service blueprint ──
    ["blue print", "blueprint"],
    ["blue-print", "blueprint"],
    ["bluespring", "blueprint"],
    ["service blue print", "service blueprint"],
    ["information architecture", "information architecture"],
    ["information archi tecture", "information architecture"],
    ["info architecture", "information architecture"],
    ["site map", "sitemap"],
    ["eco system", "ecosystem"],
    ["stake holder", "stakeholder"],
    ["stakeholders", "stakeholder"],

    // ── Requirements ──
    ["requirements", "requirements"],
    ["require ments", "requirements"],
    ["trace ability", "traceability"],
    ["traceability", "traceability"],
    ["most cow", "moscow"],
    ["mos cow", "moscow"],
    ["moss cow", "moscow"],
    ["m.o.s.c.o.w.", "moscow"],
    ["m o s c o w", "moscow"],

    // ── Roadmap / timeline / management ──
    ["road map", "roadmap"],
    ["time line", "timeline"],
    ["time-line", "timeline"],
    ["gant", "gantt"],
    ["gan chart", "gantt chart"],
    ["gant chart", "gantt chart"],
    ["gantt chart", "gantt chart"],
    ["can ban", "kanban"],
    ["con bon", "kanban"],
    ["kanbon", "kanban"],
    ["mile stone", "milestone"],
    ["mile stones", "milestones"],

    // ── Comparison / SWOT ──
    ["s w o t", "swot"],
    ["s.w.o.t.", "swot"],
    ["swat analysis", "swot analysis"],
    ["swat analyse", "swot analysis"],
    ["swot analyse", "swot analysis"],
    ["score card", "scorecard"],
    ["prior itization", "prioritization"],
    ["prioritisation", "prioritization"],
    ["competitive analysis", "competitive analysis"],

    // ── Design system ──
    ["design system", "design system"],
    ["design tokens", "design tokens"],
    ["style guide", "style guide"],
    ["component spec", "component spec"],
    ["component specification", "component spec"],

    // ── Danish visualization terms ──
    ["bruger rejse", "brugerrejse"],
    ["kunde rejse", "kunderejse"],
    ["berørings punkt", "berøringspunkt"],
    ["smerte punkt", "smertepunkt"],
    ["arbejds gang", "arbejdsgang"],
    ["krav specifikation", "kravspecifikation"],
    ["krav spec", "kravspecifikation"],
    ["krav matrix", "kravmatrix"],
    ["tids linje", "tidslinje"],
    ["flow diagramme", "flowdiagram"],
    ["design systemet", "design system"],

    // ── Regulatory / CRA ──
    ["cyber resilience act", "cra"],
    ["cyber resilience", "cra"],
    ["cyber resiliens", "cra"],
    ["c r a", "cra"],
    ["see are a ", "cra "],
    ["sea are a ", "cra "],
    ["c.r.a.", "cra"],
    ["n i s 2", "nis2"],
    ["n.i.s.2", "nis2"],
    ["nice two", "nis2"],
    ["i e c 62443", "iec 62443"],
    ["access control", "adgangskontrol"],
    ["conformity assessment", "konformitetsvurdering"],
    ["vulnerability handling", "sårbarhedshåndtering"],
    ["ce marking", "ce-mærkning"],
    ["ce mark", "ce-mærkning"],

    // ── Generic command terms ──
    ["visualise", "visualize"],
    ["visualisation", "visualization"],
    ["dia gram", "diagram"],
    ["over view", "overview"],
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
const ZONE_RECENT_CHARS = 3000;
const ZONE_MIDDLE_CHARS = 7000;
const ZONE_RECENT_MULT = 2.5;
const ZONE_MIDDLE_MULT = 1.0;
const ZONE_DISTANT_MULT = 0.3;

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
  { pattern: "nu laver vi et interface", target: "hmi_interface" },
  { pattern: "lad os lave et interface", target: "hmi_interface" },
  { pattern: "nu skal vi lave et interface", target: "hmi_interface" },
  { pattern: "vis mig et interface", target: "hmi_interface" },
  { pattern: "vis et interface", target: "hmi_interface" },
  { pattern: "det skal være et interface", target: "hmi_interface" },
  { pattern: "det her skal være et interface", target: "hmi_interface" },
  { pattern: "lav et interface", target: "hmi_interface" },
  { pattern: "skal være interface", target: "hmi_interface" },
  { pattern: "det er et interface", target: "hmi_interface" },
  { pattern: "vi laver et hmi", target: "hmi_interface" },
  { pattern: "lad os lave et hmi", target: "hmi_interface" },
  { pattern: "vi bygger et interface", target: "hmi_interface" },
  { pattern: "vi designer et interface", target: "hmi_interface" },
  // English: interface / HMI
  { pattern: "show me an interface", target: "hmi_interface" },
  { pattern: "let's build an interface", target: "hmi_interface" },
  { pattern: "now let's make the interface", target: "hmi_interface" },
  { pattern: "we need an interface", target: "hmi_interface" },
  { pattern: "it should be an interface", target: "hmi_interface" },
  { pattern: "this should be an interface", target: "hmi_interface" },
  { pattern: "make it an interface", target: "hmi_interface" },
  { pattern: "build the interface", target: "hmi_interface" },
  // Danish: user journey
  { pattern: "det skal være en user journey", target: "user_journey" },
  { pattern: "vis mig en user journey", target: "user_journey" },
  { pattern: "lad os se en brugerrejse", target: "user_journey" },
  { pattern: "vis mig en brugerrejse", target: "user_journey" },
  { pattern: "lav en brugerrejse", target: "user_journey" },
  { pattern: "det skal være en brugerrejse", target: "user_journey" },
  { pattern: "vis en journey map", target: "user_journey" },
  // English: user journey
  { pattern: "show me a user journey", target: "user_journey" },
  { pattern: "make it a journey map", target: "user_journey" },
  { pattern: "it should be a user journey", target: "user_journey" },
  { pattern: "this should be a journey", target: "user_journey" },
  // Danish: workflow
  { pattern: "vis mig et workflow", target: "workflow_process" },
  { pattern: "vis mig et flowchart", target: "workflow_process" },
  { pattern: "det skal være et workflow", target: "workflow_process" },
  { pattern: "lav et flowchart", target: "workflow_process" },
  { pattern: "det skal være et flowdiagram", target: "workflow_process" },
  { pattern: "vis mig processen som et flowchart", target: "workflow_process" },
  // English: workflow
  { pattern: "show me a flowchart", target: "workflow_process" },
  { pattern: "make it a workflow", target: "workflow_process" },
  { pattern: "it should be a workflow", target: "workflow_process" },
  // Danish: pump / product
  { pattern: "vis mig pumpen", target: "physical_product" },
  { pattern: "vis mig produktet", target: "physical_product" },
  { pattern: "det skal være en pumpe", target: "physical_product" },
  { pattern: "vis pumpe hardware", target: "physical_product" },
  // English: pump / product
  { pattern: "show me the pump", target: "physical_product" },
  { pattern: "it should be a pump", target: "physical_product" },
  { pattern: "show the pump hardware", target: "physical_product" },
  // Danish: timeline / management
  { pattern: "vis mig en timeline", target: "management_summary" },
  { pattern: "vis mig en roadmap", target: "management_summary" },
  { pattern: "det skal være en timeline", target: "management_summary" },
  { pattern: "lav en gantt", target: "management_summary" },
  // English: timeline / management
  { pattern: "show me a timeline", target: "management_summary" },
  { pattern: "make it a roadmap", target: "management_summary" },
  // Danish: requirements
  { pattern: "det skal være en kravspec", target: "requirements_matrix" },
  { pattern: "vis mig kravene", target: "requirements_matrix" },
  { pattern: "lav en kravspecifikation", target: "requirements_matrix" },
  // English: requirements
  { pattern: "show me the requirements", target: "requirements_matrix" },
  { pattern: "make it a requirements matrix", target: "requirements_matrix" },
  // Additional Danish overrides — interface
  { pattern: "nu designer vi et interface", target: "hmi_interface" },
  { pattern: "lad os bygge et interface", target: "hmi_interface" },
  { pattern: "nu bygger vi et interface", target: "hmi_interface" },
  { pattern: "vi skal lave et interface", target: "hmi_interface" },
  { pattern: "vi vil gerne have et interface", target: "hmi_interface" },
  { pattern: "vis det som et interface", target: "hmi_interface" },
  { pattern: "generer et interface", target: "hmi_interface" },
  { pattern: "det skal visualiseres som interface", target: "hmi_interface" },
  // Additional Danish overrides — journey
  { pattern: "nu laver vi en brugerrejse", target: "user_journey" },
  { pattern: "det skal være en journey", target: "user_journey" },
  { pattern: "vis det som en brugerrejse", target: "user_journey" },
  { pattern: "lad os lave en journey map", target: "user_journey" },
  { pattern: "generer en brugerrejse", target: "user_journey" },
  // Additional Danish overrides — workflow
  { pattern: "nu laver vi et flowchart", target: "workflow_process" },
  { pattern: "vis det som et flowchart", target: "workflow_process" },
  { pattern: "generer et flowdiagram", target: "workflow_process" },
  { pattern: "lad os lave et flowdiagram", target: "workflow_process" },
  { pattern: "vis processen", target: "workflow_process" },
  // Additional Danish overrides — pump
  { pattern: "vis pumpen", target: "physical_product" },
  { pattern: "generer en pumpe", target: "physical_product" },
  { pattern: "vis produktet", target: "physical_product" },
  { pattern: "vis controlleren", target: "physical_product" },
  // Additional Danish overrides — timeline/management
  { pattern: "generer en timeline", target: "management_summary" },
  { pattern: "vis det som en roadmap", target: "management_summary" },
  { pattern: "lav en timeline", target: "management_summary" },
  { pattern: "generer en gantt", target: "management_summary" },
  // Additional Danish overrides — requirements
  { pattern: "generer en kravspecifikation", target: "requirements_matrix" },
  { pattern: "vis det som krav", target: "requirements_matrix" },
  { pattern: "lav en kravmatrix", target: "requirements_matrix" },
  // Additional English overrides — interface
  { pattern: "now let's design the interface", target: "hmi_interface" },
  { pattern: "let's design an interface", target: "hmi_interface" },
  { pattern: "now we're building an interface", target: "hmi_interface" },
  { pattern: "we want an interface", target: "hmi_interface" },
  { pattern: "we need to build an interface", target: "hmi_interface" },
  { pattern: "show it as an interface", target: "hmi_interface" },
  { pattern: "generate an interface", target: "hmi_interface" },
  { pattern: "visualize it as an interface", target: "hmi_interface" },
  { pattern: "display it as an interface", target: "hmi_interface" },
  { pattern: "create an interface", target: "hmi_interface" },
  { pattern: "make the interface", target: "hmi_interface" },
  { pattern: "design the interface", target: "hmi_interface" },
  { pattern: "show the interface", target: "hmi_interface" },
  { pattern: "it should be an hmi", target: "hmi_interface" },
  { pattern: "make it an hmi", target: "hmi_interface" },
  { pattern: "generate an hmi", target: "hmi_interface" },
  { pattern: "show an hmi dashboard", target: "hmi_interface" },
  { pattern: "create a dashboard", target: "hmi_interface" },
  { pattern: "build a dashboard", target: "hmi_interface" },
  // Additional English overrides — journey
  { pattern: "now let's make a user journey", target: "user_journey" },
  { pattern: "let's create a journey map", target: "user_journey" },
  { pattern: "generate a user journey", target: "user_journey" },
  { pattern: "show it as a journey map", target: "user_journey" },
  { pattern: "visualize it as a journey", target: "user_journey" },
  { pattern: "create a journey map", target: "user_journey" },
  { pattern: "display the user journey", target: "user_journey" },
  { pattern: "build a journey map", target: "user_journey" },
  { pattern: "we need a user journey", target: "user_journey" },
  { pattern: "show the journey", target: "user_journey" },
  { pattern: "it should be a journey map", target: "user_journey" },
  { pattern: "user journey mapping", target: "user_journey" },
  { pattern: "do user journey mapping", target: "user_journey" },
  { pattern: "do a user journey", target: "user_journey" },
  { pattern: "make a user journey", target: "user_journey" },
  { pattern: "i want a user journey", target: "user_journey" },
  { pattern: "i want a journey map", target: "user_journey" },
  { pattern: "i want user journey", target: "user_journey" },
  { pattern: "switch to user journey", target: "user_journey" },
  { pattern: "switch to journey", target: "user_journey" },
  { pattern: "change to user journey", target: "user_journey" },
  { pattern: "let's do user journey", target: "user_journey" },
  { pattern: "let's do a user journey", target: "user_journey" },
  { pattern: "let's do journey mapping", target: "user_journey" },
  { pattern: "now we do user journey", target: "user_journey" },
  { pattern: "now user journey", target: "user_journey" },
  { pattern: "a user journey map", target: "user_journey" },
  // Additional English overrides — workflow
  { pattern: "now let's make a flowchart", target: "workflow_process" },
  { pattern: "let's create a flowchart", target: "workflow_process" },
  { pattern: "generate a flowchart", target: "workflow_process" },
  { pattern: "generate a workflow", target: "workflow_process" },
  { pattern: "show it as a flowchart", target: "workflow_process" },
  { pattern: "show it as a workflow", target: "workflow_process" },
  { pattern: "visualize it as a workflow", target: "workflow_process" },
  { pattern: "create a workflow diagram", target: "workflow_process" },
  { pattern: "build a flowchart", target: "workflow_process" },
  { pattern: "show the process", target: "workflow_process" },
  { pattern: "display the workflow", target: "workflow_process" },
  { pattern: "we need a flowchart", target: "workflow_process" },
  { pattern: "it should be a flowchart", target: "workflow_process" },
  { pattern: "let's build a workflow", target: "workflow_process" },
  // Additional English overrides — pump
  { pattern: "show the pump", target: "physical_product" },
  { pattern: "generate a pump", target: "physical_product" },
  { pattern: "show the product", target: "physical_product" },
  { pattern: "show the controller", target: "physical_product" },
  { pattern: "display the pump", target: "physical_product" },
  { pattern: "visualize the pump", target: "physical_product" },
  { pattern: "it should be a pump illustration", target: "physical_product" },
  { pattern: "show me the hardware", target: "physical_product" },
  { pattern: "display the hardware", target: "physical_product" },
  { pattern: "generate pump hardware", target: "physical_product" },
  { pattern: "create a pump illustration", target: "physical_product" },
  { pattern: "looking at the hardware", target: "physical_product" },
  { pattern: "look at the hardware", target: "physical_product" },
  { pattern: "at the hardware", target: "physical_product" },
  { pattern: "have a look at the hardware", target: "physical_product" },
  { pattern: "to have a look at the hardware", target: "physical_product" },
  { pattern: "physical hardware", target: "physical_product" },
  { pattern: "leads us to look at the physical", target: "physical_product" },
  { pattern: "front panel design", target: "physical_product" },
  { pattern: "only the front panel", target: "physical_product" },
  {
    pattern: "only thing we're going to have is the front panel",
    target: "physical_product",
  },
  { pattern: "primarily on the the pin insert", target: "physical_product" },
  { pattern: "primarily on the pin insert", target: "physical_product" },
  { pattern: "looking at the front panel", target: "physical_product" },
  { pattern: "redesign the hardware", target: "physical_product" },
  { pattern: "redesign the appearance", target: "physical_product" },
  { pattern: "redesign of the front", target: "physical_product" },
  { pattern: "redesign the front panel", target: "physical_product" },
  { pattern: "the front panel for the pump", target: "physical_product" },
  { pattern: "the front face of the pump", target: "physical_product" },
  { pattern: "front panel of the pump", target: "physical_product" },
  { pattern: "front face of the pump", target: "physical_product" },
  { pattern: "appearance of the hardware", target: "physical_product" },
  { pattern: "redesign the appearance of the", target: "physical_product" },
  { pattern: "we need to redesign", target: "physical_product" },
  { pattern: "moving towards the physical pump", target: "physical_product" },
  { pattern: "looking at the physical pump", target: "physical_product" },
  { pattern: "the display is and underneath", target: "physical_product" },
  { pattern: "buttons for moving up", target: "physical_product" },
  { pattern: "we need an extra button", target: "physical_product" },
  { pattern: "need to see the buttons", target: "physical_product" },
  { pattern: "control panel", target: "physical_product" },
  { pattern: "control paddle", target: "physical_product" },
  // Additional Danish overrides — pump (natural speech patterns)
  { pattern: "vi kigger på hardwaren", target: "physical_product" },
  { pattern: "vi kigger på frontpanelet", target: "physical_product" },
  { pattern: "vi kigger på pumpen", target: "physical_product" },
  { pattern: "redesigne frontpanelet", target: "physical_product" },
  { pattern: "redesign af frontpanelet", target: "physical_product" },
  { pattern: "redesign af pumpen", target: "physical_product" },
  { pattern: "udseendet af pumpen", target: "physical_product" },
  { pattern: "udseendet af hardwaren", target: "physical_product" },
  { pattern: "knapperne på pumpen", target: "physical_product" },
  { pattern: "displayet på pumpen", target: "physical_product" },
  { pattern: "den fysiske pumpe", target: "physical_product" },
  // Kortere front panel udtryk — mere generiske men stadig stærke override-signaler
  { pattern: "the front panel", target: "physical_product" },
  { pattern: "front panel", target: "physical_product" },
  { pattern: "a separate display", target: "physical_product" },
  { pattern: "separate display for the pump", target: "physical_product" },
  { pattern: "sign of the pump", target: "physical_product" },
  { pattern: "only for pin code", target: "physical_product" },
  { pattern: "pin code entry", target: "physical_product" },
  { pattern: "the pin insert", target: "physical_product" },
  { pattern: "frontpanelet", target: "physical_product" },
  { pattern: "front panel of", target: "physical_product" },
  // Danish: mobile app / Grundfos GO
  { pattern: "vis mig appen", target: "mobile_app" },
  { pattern: "vis mig mobil appen", target: "mobile_app" },
  { pattern: "vis grundfos go", target: "mobile_app" },
  { pattern: "lad os lave en app", target: "mobile_app" },
  { pattern: "nu laver vi en app", target: "mobile_app" },
  { pattern: "det skal være en app", target: "mobile_app" },
  { pattern: "det skal være en mobil app", target: "mobile_app" },
  { pattern: "vi designer appen", target: "mobile_app" },
  { pattern: "vi bygger appen", target: "mobile_app" },
  { pattern: "lad os kigge på appen", target: "mobile_app" },
  { pattern: "nu kigger vi på appen", target: "mobile_app" },
  { pattern: "vis go appen", target: "mobile_app" },
  { pattern: "grundfos go appen", target: "mobile_app" },
  { pattern: "mobil applikationen", target: "mobile_app" },
  { pattern: "appen skal vise", target: "mobile_app" },
  { pattern: "i appen", target: "mobile_app" },
  { pattern: "via appen", target: "mobile_app" },
  { pattern: "på telefonen", target: "mobile_app" },
  // English: mobile app / Grundfos GO
  { pattern: "show me the app", target: "mobile_app" },
  { pattern: "show me the mobile app", target: "mobile_app" },
  { pattern: "show the grundfos go", target: "mobile_app" },
  { pattern: "let's build an app", target: "mobile_app" },
  { pattern: "let's design the app", target: "mobile_app" },
  { pattern: "now let's make the app", target: "mobile_app" },
  { pattern: "it should be an app", target: "mobile_app" },
  { pattern: "it should be a mobile app", target: "mobile_app" },
  { pattern: "make it an app", target: "mobile_app" },
  { pattern: "build the app", target: "mobile_app" },
  { pattern: "design the app", target: "mobile_app" },
  { pattern: "the app should show", target: "mobile_app" },
  { pattern: "in the app", target: "mobile_app" },
  { pattern: "via the app", target: "mobile_app" },
  { pattern: "on the phone", target: "mobile_app" },
  { pattern: "on the smartphone", target: "mobile_app" },
  { pattern: "the go app", target: "mobile_app" },
  { pattern: "grundfos go app", target: "mobile_app" },
  // Natural speech — hmi_interface
  { pattern: "the screen layout", target: "hmi_interface" },
  { pattern: "what the user sees on screen", target: "hmi_interface" },
  { pattern: "what the operator sees", target: "hmi_interface" },
  { pattern: "the display should show", target: "hmi_interface" },
  { pattern: "on the touch screen", target: "hmi_interface" },
  { pattern: "the operator needs to see", target: "hmi_interface" },
  { pattern: "navigating through the screens", target: "hmi_interface" },
  { pattern: "navigating through the menus", target: "hmi_interface" },
  { pattern: "the alarm screen", target: "hmi_interface" },
  { pattern: "how the operator interacts", target: "hmi_interface" },
  { pattern: "the screen with the values", target: "hmi_interface" },
  { pattern: "the monitoring view", target: "hmi_interface" },
  { pattern: "the menu structure", target: "hmi_interface" },
  { pattern: "what appears on the display", target: "hmi_interface" },
  { pattern: "the user interface for the", target: "hmi_interface" },
  { pattern: "layout of the screen", target: "hmi_interface" },
  { pattern: "tabs on the screen", target: "hmi_interface" },
  { pattern: "the settings screen", target: "hmi_interface" },
  { pattern: "the home screen of the", target: "hmi_interface" },
  { pattern: "how the screen looks", target: "hmi_interface" },
  { pattern: "designing the screen", target: "hmi_interface" },
  { pattern: "skærmen skal vise", target: "hmi_interface" },
  { pattern: "hvad operatøren ser", target: "hmi_interface" },
  { pattern: "hvad brugeren ser på skærmen", target: "hmi_interface" },
  { pattern: "skærmlayoutet", target: "hmi_interface" },
  { pattern: "layoutet af skærmen", target: "hmi_interface" },
  { pattern: "menustrukturen", target: "hmi_interface" },
  { pattern: "navigere igennem skærmene", target: "hmi_interface" },
  { pattern: "alarmbilledet", target: "hmi_interface" },
  { pattern: "overvågningsbilledet", target: "hmi_interface" },
  { pattern: "hvad der vises på displayet", target: "hmi_interface" },
  { pattern: "fanerne på skærmen", target: "hmi_interface" },
  { pattern: "indstillingsskærmen", target: "hmi_interface" },
  { pattern: "designer skærmen", target: "hmi_interface" },
  // Natural speech — user_journey
  { pattern: "from the user's perspective", target: "user_journey" },
  { pattern: "from the users perspective", target: "user_journey" },
  { pattern: "from the customer's perspective", target: "user_journey" },
  { pattern: "from the customers perspective", target: "user_journey" },
  { pattern: "when the user first arrives", target: "user_journey" },
  { pattern: "the user's experience", target: "user_journey" },
  { pattern: "the users experience", target: "user_journey" },
  { pattern: "what the user goes through", target: "user_journey" },
  { pattern: "the steps the user takes", target: "user_journey" },
  { pattern: "through the user's eyes", target: "user_journey" },
  { pattern: "through the users eyes", target: "user_journey" },
  { pattern: "the customer experience", target: "user_journey" },
  { pattern: "the touchpoints along the way", target: "user_journey" },
  { pattern: "how the customer feels", target: "user_journey" },
  { pattern: "the pain points in the journey", target: "user_journey" },
  { pattern: "mapping the experience", target: "user_journey" },
  { pattern: "mapping the journey", target: "user_journey" },
  { pattern: "map out the journey", target: "user_journey" },
  { pattern: "the stages of the journey", target: "user_journey" },
  { pattern: "what happens at each stage", target: "user_journey" },
  { pattern: "when the technician arrives", target: "user_journey" },
  { pattern: "when the user arrives", target: "user_journey" },
  { pattern: "the end to end experience", target: "user_journey" },
  { pattern: "end to end journey", target: "user_journey" },
  { pattern: "fra brugerens perspektiv", target: "user_journey" },
  { pattern: "fra kundens perspektiv", target: "user_journey" },
  { pattern: "brugerens oplevelse", target: "user_journey" },
  { pattern: "kundens oplevelse", target: "user_journey" },
  { pattern: "hvad brugeren oplever", target: "user_journey" },
  { pattern: "de trin brugeren tager", target: "user_journey" },
  { pattern: "igennem brugerens øjne", target: "user_journey" },
  { pattern: "kortlægge rejsen", target: "user_journey" },
  { pattern: "kortlæg oplevelsen", target: "user_journey" },
  { pattern: "touchpoints i rejsen", target: "user_journey" },
  { pattern: "smertepunkterne i rejsen", target: "user_journey" },
  { pattern: "hele oplevelsen fra start til slut", target: "user_journey" },
  { pattern: "når teknikeren ankommer", target: "user_journey" },
  { pattern: "når brugeren ankommer", target: "user_journey" },
  // Natural speech — workflow_process
  { pattern: "the sequence of steps", target: "workflow_process" },
  { pattern: "first they do this then", target: "workflow_process" },
  { pattern: "the process goes like this", target: "workflow_process" },
  { pattern: "how the process works", target: "workflow_process" },
  { pattern: "step by step how", target: "workflow_process" },
  { pattern: "the order of operations", target: "workflow_process" },
  { pattern: "the approval process", target: "workflow_process" },
  { pattern: "the maintenance procedure", target: "workflow_process" },
  { pattern: "the flow of the process", target: "workflow_process" },
  { pattern: "how the flow works", target: "workflow_process" },
  { pattern: "the decision points in the process", target: "workflow_process" },
  { pattern: "when they reach this step", target: "workflow_process" },
  { pattern: "the branching logic", target: "workflow_process" },
  { pattern: "what triggers the next step", target: "workflow_process" },
  { pattern: "the start of the process", target: "workflow_process" },
  { pattern: "map out the process", target: "workflow_process" },
  { pattern: "mapping the process", target: "workflow_process" },
  { pattern: "the installation procedure", target: "workflow_process" },
  { pattern: "the commissioning process", target: "workflow_process" },
  { pattern: "the service procedure", target: "workflow_process" },
  { pattern: "rækkefølgen af trin", target: "workflow_process" },
  { pattern: "processen fungerer sådan", target: "workflow_process" },
  { pattern: "trin for trin hvordan", target: "workflow_process" },
  { pattern: "godkendelsesprocessen", target: "workflow_process" },
  { pattern: "vedligeholdelsesproceduren", target: "workflow_process" },
  { pattern: "flowet i processen", target: "workflow_process" },
  { pattern: "beslutningspunkterne", target: "workflow_process" },
  { pattern: "hvad der trigger næste trin", target: "workflow_process" },
  { pattern: "kortlæg processen", target: "workflow_process" },
  { pattern: "installationsproceduren", target: "workflow_process" },
  { pattern: "idriftsættelsesprocessen", target: "workflow_process" },
  { pattern: "serviceproceduren", target: "workflow_process" },
  // Natural speech — management_summary
  { pattern: "the project timeline", target: "management_summary" },
  { pattern: "when do we deliver", target: "management_summary" },
  { pattern: "the milestones for", target: "management_summary" },
  { pattern: "the deadline is", target: "management_summary" },
  { pattern: "planning the phases", target: "management_summary" },
  { pattern: "the project plan", target: "management_summary" },
  { pattern: "the delivery schedule", target: "management_summary" },
  { pattern: "the sprint planning", target: "management_summary" },
  { pattern: "the release plan", target: "management_summary" },
  { pattern: "our development phases", target: "management_summary" },
  { pattern: "the quarterly plan", target: "management_summary" },
  { pattern: "how much time do we have", target: "management_summary" },
  { pattern: "when is the deadline", target: "management_summary" },
  { pattern: "resource allocation", target: "management_summary" },
  { pattern: "the rollout plan", target: "management_summary" },
  { pattern: "the implementation plan", target: "management_summary" },
  { pattern: "projekttidslinjen", target: "management_summary" },
  { pattern: "hvornår skal vi levere", target: "management_summary" },
  { pattern: "milepælene for", target: "management_summary" },
  { pattern: "deadlinen er", target: "management_summary" },
  { pattern: "planlægge faserne", target: "management_summary" },
  { pattern: "projektplanen", target: "management_summary" },
  { pattern: "leveringsplanen", target: "management_summary" },
  { pattern: "sprintplanlægningen", target: "management_summary" },
  { pattern: "releaseplanen", target: "management_summary" },
  { pattern: "vores udviklingsfaser", target: "management_summary" },
  { pattern: "kvartalsplanen", target: "management_summary" },
  { pattern: "hvor lang tid har vi", target: "management_summary" },
  { pattern: "hvornår er deadline", target: "management_summary" },
  { pattern: "ressourceallokering", target: "management_summary" },
  { pattern: "udrulningsplanen", target: "management_summary" },
  { pattern: "implementeringsplanen", target: "management_summary" },
  // Natural speech — requirements_matrix
  // NOTE: only very specific intent phrases; generic phrases like "the requirements for"
  // or "functional requirements" are intentionally excluded — they fire incorrectly in
  // workflow/UX/service-design discussions. Kept: MoSCoW-specific, CRA-specific, traceability.
  { pattern: "traceability of the requirements", target: "requirements_matrix" },
  { pattern: "the cra requires", target: "requirements_matrix" },
  { pattern: "the cyber resilience act requires", target: "requirements_matrix" },
  { pattern: "the acceptance criteria for the", target: "requirements_matrix" },
  { pattern: "moscow prioritization", target: "requirements_matrix" },
  { pattern: "must have should have could have", target: "requirements_matrix" },
  { pattern: "acceptkriterierne", target: "requirements_matrix" },
  { pattern: "sporbarhed af kravene", target: "requirements_matrix" },
  { pattern: "cra kræver at", target: "requirements_matrix" },
  { pattern: "cyber resilience act kræver", target: "requirements_matrix" },
  // Natural speech — persona_research
  { pattern: "who is the user", target: "persona_research" },
  { pattern: "the typical user is", target: "persona_research" },
  { pattern: "their pain points are", target: "persona_research" },
  { pattern: "what motivates the user", target: "persona_research" },
  { pattern: "what the user needs", target: "persona_research" },
  { pattern: "their frustrations include", target: "persona_research" },
  { pattern: "the user profile", target: "persona_research" },
  { pattern: "let's define who the user is", target: "persona_research" },
  { pattern: "the technician's background", target: "persona_research" },
  { pattern: "the technicians background", target: "persona_research" },
  { pattern: "their daily challenges", target: "persona_research" },
  { pattern: "what drives the user", target: "persona_research" },
  { pattern: "the user's goals and", target: "persona_research" },
  { pattern: "the users goals and", target: "persona_research" },
  { pattern: "empathy map for", target: "persona_research" },
  { pattern: "understanding the user", target: "persona_research" },
  { pattern: "the interview findings show", target: "persona_research" },
  { pattern: "the research shows that", target: "persona_research" },
  { pattern: "hvem er brugeren", target: "persona_research" },
  { pattern: "den typiske bruger er", target: "persona_research" },
  { pattern: "deres smertepunkter", target: "persona_research" },
  { pattern: "hvad der motiverer brugeren", target: "persona_research" },
  { pattern: "hvad brugeren har brug for", target: "persona_research" },
  { pattern: "brugerens frustrationer", target: "persona_research" },
  { pattern: "brugerprofilen", target: "persona_research" },
  { pattern: "lad os definere hvem brugeren er", target: "persona_research" },
  { pattern: "teknikerens baggrund", target: "persona_research" },
  { pattern: "deres daglige udfordringer", target: "persona_research" },
  { pattern: "hvad der driver brugeren", target: "persona_research" },
  { pattern: "brugerens mål og", target: "persona_research" },
  { pattern: "empatikort for", target: "persona_research" },
  { pattern: "forstå brugeren", target: "persona_research" },
  { pattern: "interviewresultaterne viser", target: "persona_research" },
  { pattern: "researchen viser at", target: "persona_research" },
  // Natural speech — service_blueprint
  { pattern: "the system architecture", target: "service_blueprint" },
  { pattern: "how the systems connect", target: "service_blueprint" },
  { pattern: "the backend services", target: "service_blueprint" },
  { pattern: "the different layers", target: "service_blueprint" },
  { pattern: "frontstage and backstage", target: "service_blueprint" },
  { pattern: "the touchpoints and channels", target: "service_blueprint" },
  { pattern: "what happens behind the scenes", target: "service_blueprint" },
  { pattern: "the support processes", target: "service_blueprint" },
  { pattern: "the service layers", target: "service_blueprint" },
  { pattern: "how the service is delivered", target: "service_blueprint" },
  { pattern: "the ecosystem around", target: "service_blueprint" },
  { pattern: "the stakeholders involved", target: "service_blueprint" },
  { pattern: "who is involved in the service", target: "service_blueprint" },
  { pattern: "the information flow between", target: "service_blueprint" },
  { pattern: "how the data flows", target: "service_blueprint" },
  { pattern: "the integration points", target: "service_blueprint" },
  { pattern: "systemarkitekturen", target: "service_blueprint" },
  { pattern: "hvordan systemerne forbindes", target: "service_blueprint" },
  { pattern: "de forskellige lag", target: "service_blueprint" },
  { pattern: "hvad der sker bag kulisserne", target: "service_blueprint" },
  { pattern: "supportprocesserne", target: "service_blueprint" },
  { pattern: "servicelagene", target: "service_blueprint" },
  { pattern: "hvordan servicen leveres", target: "service_blueprint" },
  { pattern: "økosystemet omkring", target: "service_blueprint" },
  { pattern: "interessenterne involveret", target: "service_blueprint" },
  { pattern: "hvem der er involveret i servicen", target: "service_blueprint" },
  { pattern: "informationsflowet mellem", target: "service_blueprint" },
  { pattern: "hvordan data flyder", target: "service_blueprint" },
  { pattern: "integrationspunkterne", target: "service_blueprint" },
  // Natural speech — comparison_evaluation
  { pattern: "which option is better", target: "comparison_evaluation" },
  { pattern: "comparing the alternatives", target: "comparison_evaluation" },
  { pattern: "the pros and cons", target: "comparison_evaluation" },
  { pattern: "evaluate the options", target: "comparison_evaluation" },
  { pattern: "which one should we choose", target: "comparison_evaluation" },
  { pattern: "weighing the options", target: "comparison_evaluation" },
  { pattern: "the trade offs between", target: "comparison_evaluation" },
  { pattern: "how do they compare", target: "comparison_evaluation" },
  { pattern: "the strengths and weaknesses", target: "comparison_evaluation" },
  { pattern: "scoring the alternatives", target: "comparison_evaluation" },
  { pattern: "rank the options", target: "comparison_evaluation" },
  { pattern: "the evaluation criteria", target: "comparison_evaluation" },
  { pattern: "rate the alternatives", target: "comparison_evaluation" },
  { pattern: "impact versus effort", target: "comparison_evaluation" },
  { pattern: "cost benefit analysis", target: "comparison_evaluation" },
  { pattern: "hvilken mulighed er bedst", target: "comparison_evaluation" },
  { pattern: "sammenligne alternativerne", target: "comparison_evaluation" },
  { pattern: "fordele og ulemper", target: "comparison_evaluation" },
  { pattern: "evaluer mulighederne", target: "comparison_evaluation" },
  { pattern: "hvilken skal vi vælge", target: "comparison_evaluation" },
  { pattern: "afvejning af mulighederne", target: "comparison_evaluation" },
  { pattern: "kompromiserne mellem", target: "comparison_evaluation" },
  { pattern: "hvordan sammenligner de", target: "comparison_evaluation" },
  { pattern: "styrker og svagheder", target: "comparison_evaluation" },
  { pattern: "rangere mulighederne", target: "comparison_evaluation" },
  { pattern: "evalueringskriterierne", target: "comparison_evaluation" },
  { pattern: "effekt versus indsats", target: "comparison_evaluation" },
  { pattern: "cost benefit analyse", target: "comparison_evaluation" },
  // Natural speech — design_system
  { pattern: "the color scheme", target: "design_system" },
  { pattern: "the typography for", target: "design_system" },
  { pattern: "the button styles", target: "design_system" },
  { pattern: "the visual language", target: "design_system" },
  { pattern: "consistent components", target: "design_system" },
  { pattern: "the spacing and layout rules", target: "design_system" },
  { pattern: "the icon set", target: "design_system" },
  { pattern: "the design tokens for", target: "design_system" },
  { pattern: "standardize the components", target: "design_system" },
  { pattern: "the component specifications", target: "design_system" },
  { pattern: "reusable components", target: "design_system" },
  { pattern: "the brand guidelines", target: "design_system" },
  { pattern: "the ui patterns we use", target: "design_system" },
  { pattern: "document our design", target: "design_system" },
  { pattern: "farverne vi bruger", target: "design_system" },
  { pattern: "typografien for", target: "design_system" },
  { pattern: "knapstilene", target: "design_system" },
  { pattern: "det visuelle sprog", target: "design_system" },
  { pattern: "konsistente komponenter", target: "design_system" },
  { pattern: "afstands og layoutregler", target: "design_system" },
  { pattern: "ikonsættet", target: "design_system" },
  { pattern: "design tokens for", target: "design_system" },
  { pattern: "standardiser komponenterne", target: "design_system" },
  { pattern: "komponentspecifikationerne", target: "design_system" },
  { pattern: "genbrugelige komponenter", target: "design_system" },
  { pattern: "brandretningslinjerne", target: "design_system" },
  { pattern: "ui mønstre vi bruger", target: "design_system" },
  { pattern: "dokumenter vores design", target: "design_system" },
  // Additional English overrides — timeline/management
  { pattern: "generate a timeline", target: "management_summary" },
  { pattern: "show it as a roadmap", target: "management_summary" },
  { pattern: "create a timeline", target: "management_summary" },
  { pattern: "generate a gantt", target: "management_summary" },
  { pattern: "build a timeline", target: "management_summary" },
  { pattern: "show the roadmap", target: "management_summary" },
  { pattern: "display a timeline", target: "management_summary" },
  { pattern: "visualize it as a timeline", target: "management_summary" },
  { pattern: "it should be a timeline", target: "management_summary" },
  { pattern: "let's make a roadmap", target: "management_summary" },
  { pattern: "we need a timeline", target: "management_summary" },
  { pattern: "create a gantt chart", target: "management_summary" },
  { pattern: "show a management summary", target: "management_summary" },
  // Additional English overrides — requirements
  { pattern: "generate a requirements matrix", target: "requirements_matrix" },
  { pattern: "show it as requirements", target: "requirements_matrix" },
  { pattern: "create a requirements matrix", target: "requirements_matrix" },
  { pattern: "build a requirements table", target: "requirements_matrix" },
  { pattern: "display the requirements", target: "requirements_matrix" },
  { pattern: "visualize it as requirements", target: "requirements_matrix" },
  {
    pattern: "it should be a requirements table",
    target: "requirements_matrix",
  },
  { pattern: "we need a requirements matrix", target: "requirements_matrix" },
  { pattern: "let's make a requirements spec", target: "requirements_matrix" },
  { pattern: "show a requirements spec", target: "requirements_matrix" },
  { pattern: "show me the cra requirements", target: "requirements_matrix" },
  { pattern: "vis mig cra kravene", target: "requirements_matrix" },
  { pattern: "vis cra kravene", target: "requirements_matrix" },
  { pattern: "show the cra compliance", target: "requirements_matrix" },
  {
    pattern: "show the cybersecurity requirements",
    target: "requirements_matrix",
  },
  { pattern: "vis cybersikkerhedskravene", target: "requirements_matrix" },
  { pattern: "generate a cra matrix", target: "requirements_matrix" },
  { pattern: "lav en cra oversigt", target: "requirements_matrix" },
  { pattern: "show me the 13 functions", target: "requirements_matrix" },
  { pattern: "vis mig de 13 funktioner", target: "requirements_matrix" },
  { pattern: "cra compliance status", target: "requirements_matrix" },
  { pattern: "conformity assessment", target: "requirements_matrix" },
  { pattern: "konformitetsvurdering", target: "requirements_matrix" },
  { pattern: "show the eu regulation", target: "requirements_matrix" },
  { pattern: "vis eu regulering", target: "requirements_matrix" },
  // Danish: persona / research
  { pattern: "vis mig en persona", target: "persona_research" },
  { pattern: "lav en persona", target: "persona_research" },
  { pattern: "generer en persona", target: "persona_research" },
  { pattern: "det skal være en persona", target: "persona_research" },
  { pattern: "vis mig brugerprofilen", target: "persona_research" },
  { pattern: "lav et empatikort", target: "persona_research" },
  { pattern: "vis mig et empathy map", target: "persona_research" },
  { pattern: "vis research resultaterne", target: "persona_research" },
  { pattern: "vis mig indsigterne", target: "persona_research" },
  { pattern: "vis mig brugerresearch", target: "persona_research" },
  { pattern: "hvem er vores bruger", target: "persona_research" },
  { pattern: "lad os lave en persona", target: "persona_research" },
  // English: persona / research
  { pattern: "show me a persona", target: "persona_research" },
  { pattern: "create a persona", target: "persona_research" },
  { pattern: "generate a persona", target: "persona_research" },
  { pattern: "make a persona", target: "persona_research" },
  { pattern: "show me an empathy map", target: "persona_research" },
  { pattern: "create an empathy map", target: "persona_research" },
  { pattern: "generate an empathy map", target: "persona_research" },
  { pattern: "show the research findings", target: "persona_research" },
  { pattern: "show the research results", target: "persona_research" },
  { pattern: "show the user research", target: "persona_research" },
  { pattern: "visualize the research", target: "persona_research" },
  { pattern: "display the insights", target: "persona_research" },
  { pattern: "show user insights", target: "persona_research" },
  { pattern: "who is our user", target: "persona_research" },
  { pattern: "let's define the persona", target: "persona_research" },
  { pattern: "we need a persona", target: "persona_research" },
  { pattern: "it should be a persona", target: "persona_research" },
  { pattern: "show the interview findings", target: "persona_research" },
  { pattern: "display the test results", target: "persona_research" },
  // Danish: service blueprint
  { pattern: "vis mig et service blueprint", target: "service_blueprint" },
  { pattern: "lav et service blueprint", target: "service_blueprint" },
  { pattern: "generer et service blueprint", target: "service_blueprint" },
  { pattern: "vis mig arkitekturen", target: "service_blueprint" },
  { pattern: "vis informationsarkitekturen", target: "service_blueprint" },
  { pattern: "lav et sitemap", target: "service_blueprint" },
  { pattern: "vis mig et sitemap", target: "service_blueprint" },
  { pattern: "vis mig et systemkort", target: "service_blueprint" },
  { pattern: "lav et økosystemkort", target: "service_blueprint" },
  { pattern: "vis mig et stakeholder map", target: "service_blueprint" },
  { pattern: "vis mig et interessentkort", target: "service_blueprint" },
  { pattern: "lad os lave et service blueprint", target: "service_blueprint" },
  // English: service blueprint
  { pattern: "show me a service blueprint", target: "service_blueprint" },
  { pattern: "create a service blueprint", target: "service_blueprint" },
  { pattern: "generate a service blueprint", target: "service_blueprint" },
  { pattern: "make a service blueprint", target: "service_blueprint" },
  { pattern: "show the information architecture", target: "service_blueprint" },
  { pattern: "show me the architecture", target: "service_blueprint" },
  { pattern: "create a sitemap", target: "service_blueprint" },
  { pattern: "show me a sitemap", target: "service_blueprint" },
  { pattern: "generate a sitemap", target: "service_blueprint" },
  { pattern: "show me the ecosystem", target: "service_blueprint" },
  { pattern: "create an ecosystem map", target: "service_blueprint" },
  { pattern: "show a stakeholder map", target: "service_blueprint" },
  { pattern: "create a stakeholder map", target: "service_blueprint" },
  { pattern: "show me a system map", target: "service_blueprint" },
  { pattern: "we need a service blueprint", target: "service_blueprint" },
  { pattern: "it should be a service blueprint", target: "service_blueprint" },
  { pattern: "let's make a service blueprint", target: "service_blueprint" },
  // Danish: comparison / evaluation
  { pattern: "vis mig en sammenligning", target: "comparison_evaluation" },
  { pattern: "lav en sammenligning", target: "comparison_evaluation" },
  { pattern: "generer en sammenligning", target: "comparison_evaluation" },
  { pattern: "lav en swot analyse", target: "comparison_evaluation" },
  { pattern: "vis mig en swot", target: "comparison_evaluation" },
  { pattern: "lav en konkurrentanalyse", target: "comparison_evaluation" },
  { pattern: "vis mig en konkurrentanalyse", target: "comparison_evaluation" },
  { pattern: "sammenlign disse", target: "comparison_evaluation" },
  { pattern: "lav en prioriteringsmatrix", target: "comparison_evaluation" },
  { pattern: "vis mig en beslutningsmatrix", target: "comparison_evaluation" },
  { pattern: "lav en evaluering", target: "comparison_evaluation" },
  { pattern: "vis mig en scorecard", target: "comparison_evaluation" },
  // English: comparison / evaluation
  { pattern: "show me a comparison", target: "comparison_evaluation" },
  { pattern: "create a comparison", target: "comparison_evaluation" },
  { pattern: "generate a comparison", target: "comparison_evaluation" },
  { pattern: "make a comparison matrix", target: "comparison_evaluation" },
  { pattern: "show me a swot", target: "comparison_evaluation" },
  { pattern: "create a swot analysis", target: "comparison_evaluation" },
  { pattern: "generate a swot", target: "comparison_evaluation" },
  {
    pattern: "show me a competitive analysis",
    target: "comparison_evaluation",
  },
  { pattern: "create a competitive analysis", target: "comparison_evaluation" },
  { pattern: "compare these options", target: "comparison_evaluation" },
  { pattern: "let's compare", target: "comparison_evaluation" },
  {
    pattern: "show me a prioritization matrix",
    target: "comparison_evaluation",
  },
  { pattern: "create a decision matrix", target: "comparison_evaluation" },
  { pattern: "show me a scorecard", target: "comparison_evaluation" },
  { pattern: "generate a scorecard", target: "comparison_evaluation" },
  { pattern: "it should be a comparison", target: "comparison_evaluation" },
  { pattern: "we need a comparison", target: "comparison_evaluation" },
  { pattern: "show an impact effort matrix", target: "comparison_evaluation" },
  { pattern: "create an impact effort", target: "comparison_evaluation" },
  { pattern: "show a heuristic evaluation", target: "comparison_evaluation" },
  { pattern: "update the comparison matrix", target: "comparison_evaluation" },
  { pattern: "update the comparison", target: "comparison_evaluation" },
  { pattern: "recalculate the scores", target: "comparison_evaluation" },
  {
    pattern: "add criteria to the comparison",
    target: "comparison_evaluation",
  },
  // Danish: design system
  { pattern: "vis mig design systemet", target: "design_system" },
  { pattern: "lav en komponentspec", target: "design_system" },
  { pattern: "generer en komponentspec", target: "design_system" },
  { pattern: "vis mig komponenterne", target: "design_system" },
  { pattern: "lav en style guide", target: "design_system" },
  { pattern: "vis mig en style guide", target: "design_system" },
  { pattern: "vis mig design tokens", target: "design_system" },
  { pattern: "lav en farvepalet", target: "design_system" },
  { pattern: "vis mig designprincipper", target: "design_system" },
  { pattern: "lad os dokumentere komponenterne", target: "design_system" },
  // English: design system
  { pattern: "show me the design system", target: "design_system" },
  { pattern: "show me a design system", target: "design_system" },
  { pattern: "create a component spec", target: "design_system" },
  { pattern: "generate a component spec", target: "design_system" },
  { pattern: "show me the design tokens", target: "design_system" },
  { pattern: "create a style guide", target: "design_system" },
  { pattern: "generate a style guide", target: "design_system" },
  { pattern: "show me the component library", target: "design_system" },
  { pattern: "show me the ui components", target: "design_system" },
  { pattern: "create a color palette", target: "design_system" },
  { pattern: "show the design principles", target: "design_system" },
  { pattern: "document the components", target: "design_system" },
  { pattern: "it should be a design system", target: "design_system" },
  { pattern: "we need a design system", target: "design_system" },
  { pattern: "show me a pattern library", target: "design_system" },
  { pattern: "create a ui kit", target: "design_system" },
  // Generic — eksplicit "ingen diagramtype" overrides (manglede hidtil)
  { pattern: "saml tankerne fra i dag", target: "generic" },
  { pattern: "bare en simpel oversigt", target: "generic" },
  { pattern: "ingen specifik diagramtype", target: "generic" },
  { pattern: "ingen fast diagramtype", target: "generic" },
  { pattern: "just a simple summary", target: "generic" },
  { pattern: "no specific diagram", target: "generic" },
  { pattern: "no specific type", target: "generic" },
  { pattern: "bare samle op", target: "generic" },
  { pattern: "just collect the thoughts", target: "generic" },
  // Workflow swimlane — eksplicit procesdiagram med swimlanes
  { pattern: "vis processen med swimlanes", target: "workflow_process" },
  { pattern: "show the process with swimlanes", target: "workflow_process" },
  { pattern: "swimlane diagram", target: "workflow_process" },
  { pattern: "swimlane procesdiagram", target: "workflow_process" },
];

function scoreZone(
  normText: string,
  signals: typeof VIZ_FAMILY_SIGNALS,
  multiplier: number,
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

/**
 * Zone 0: timestamp-baseret "latest chunk" — de seneste ~30 sekunder af tale.
 * Vægtes højere end zone 1 (RECENT) og tjekkes for hard overrides FØRST.
 * Giver tidspræcis kategori-skift-detektion uafhængigt af taletempo.
 */
const ZONE_LATEST_MULT = 4.0;

/** Seneste N ord fra fuld transskript — fanger "physical pump" før tail er HMI/PIN-tung. */
const PHYSICAL_LONG_RANGE_WORDS = 400;
const PHYSICAL_LONG_RANGE_PHRASES: string[] = [
  "physical pump",
  "the physical pump",
  "a physical pump",
  "fysisk pumpe",
  "den fysiske pumpe",
  "physical product",
  "the physical product",
  "hardware of the pump",
  "pump enclosure",
  "pump housing",
  "mechanical layout",
  "external ports",
  "front panel layout",
  "frontpanel layout",
  "RJ45 port",
  "cable gland",
  "kabelgennemføring",
];

/**
 * Løft physical_product hvis stærke hardware-fraser findes i et bredere ordvindue
 * end tail-inputtet (fx sidste 400 ord af fuld transskript).
 */
function boostPhysicalFromLongRangeWindow(
  mergedMap: Map<string, number>,
  rawText: string,
): void {
  const words = rawText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  const chunk =
    words.length > PHYSICAL_LONG_RANGE_WORDS
      ? words.slice(-PHYSICAL_LONG_RANGE_WORDS).join(" ")
      : rawText;
  const norm = normalizeForClassification(chunk);
  let add = 0;
  for (const p of PHYSICAL_LONG_RANGE_PHRASES) {
    if (norm.includes(p)) add += 18;
  }
  add = Math.min(add, 72);
  if (add > 0) {
    mergedMap.set(
      "physical_product",
      (mergedMap.get("physical_product") ?? 0) + add,
    );
  }
}

export function classifyVisualizationIntent(
  transcript: string,
  _workspaceDomain?: string | null,
  latestChunk?: string | null,
  /** Fuld (normaliseret) transskript til ekstra physical-window; typisk samme som route's `normalized`. */
  longRangeTranscript?: string | null,
): ClassificationResult {
  const topicShiftOverrides = TOPIC_SHIFT_OVERRIDES;

  const tail = transcript.slice(-VIZ_CLASSIFY_TAIL_CHARS);

  // Split tail into three recency zones
  const recentRaw = tail.slice(-ZONE_RECENT_CHARS);
  const middleRaw = tail.slice(-ZONE_MIDDLE_CHARS, -ZONE_RECENT_CHARS);
  const distantRaw = tail.slice(
    0,
    Math.max(0, tail.length - ZONE_MIDDLE_CHARS),
  );

  const recentNorm = normalizeForClassification(recentRaw);
  const middleNorm = normalizeForClassification(middleRaw);
  const distantNorm = normalizeForClassification(distantRaw);

  // Score each zone with its multiplier
  const recentScores = scoreZone(
    recentNorm,
    VIZ_FAMILY_SIGNALS,
    ZONE_RECENT_MULT,
  );
  const middleScores = scoreZone(
    middleNorm,
    VIZ_FAMILY_SIGNALS,
    ZONE_MIDDLE_MULT,
  );
  const distantScores = scoreZone(
    distantNorm,
    VIZ_FAMILY_SIGNALS,
    ZONE_DISTANT_MULT,
  );

  // Zone 0: timestamp-baseret latestChunk (de seneste ~30 sek af tale).
  // Mere præcis end tegn-baserede zoner ved varierende taletempo.
  const latestNorm = latestChunk
    ? normalizeForClassification(latestChunk)
    : null;
  const latestScores = latestNorm
    ? scoreZone(latestNorm, VIZ_FAMILY_SIGNALS, ZONE_LATEST_MULT)
    : null;

  // Merge all zone scores
  const mergedMap = new Map<string, number>();
  for (const fam of VIZ_FAMILY_SIGNALS) {
    mergedMap.set(
      fam.id,
      (latestScores?.get(fam.id) ?? 0) +
        (recentScores.get(fam.id) ?? 0) +
        (middleScores.get(fam.id) ?? 0) +
        (distantScores.get(fam.id) ?? 0),
    );
  }

  const longSource = longRangeTranscript?.trim()
    ? longRangeTranscript
    : transcript;
  boostPhysicalFromLongRangeWindow(mergedMap, longSource);

  // ─── HARD OVERRIDE: topic-shift phrases auto-win ────────────────────────────
  // Priority 0: latestChunk (timestamp-baseret, mest præcis)
  // Priority 1: last segment, 2) last 2 segments, 3) ultra-recent 1000 chars, 4) full recent zone.
  // We scan from end-to-start so the LAST override wins if multiple are present.

  const segmentMarkerRegex = /\n?\[[\w\s\-æøåÆØÅäöüÄÖÜ]+\]\s*:\s*/g;
  const segmentPositions: number[] = [];
  let segMatch: RegExpExecArray | null;
  while ((segMatch = segmentMarkerRegex.exec(tail)) !== null) {
    segmentPositions.push(segMatch.index + segMatch[0].length);
  }

  let hardOverrideFamily: VizFamily | null = null;
  let hardOverridePos = -1;

  // Priority 0: latestChunk — timestamp-baseret, de seneste ~30 sek (mest præcis)
  if (latestNorm) {
    for (const shift of topicShiftOverrides) {
      const pos = latestNorm.lastIndexOf(shift.pattern);
      if (pos !== -1 && pos > hardOverridePos) {
        hardOverridePos = pos;
        hardOverrideFamily = shift.target;
      }
    }
  }

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
    const lastTwoSegsText = normalizeForClassification(
      tail.slice(secondLastSegStart),
    );
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
      id: fam.id,
      label: fam.label,
      score:
        fam.id === hardOverrideFamily
          ? 999
          : Math.round((mergedMap.get(fam.id) ?? 0) * 10) / 10,
    }));
    if (hardOverrideFamily === "generic") {
      scored.push({
        id: "generic",
        label: VIZ_FAMILY_LABEL.generic,
        score: 999,
      });
    }
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    return {
      family: hardOverrideFamily,
      topic: topicLabel,
      scores: sorted,
      ambiguous: false,
      lead: 999,
      runnerUp: sorted[1]?.id ?? null,
      hardOverride: true,
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
    if (
      rawRecent >= RECENT_ZONE_OVERRIDE_THRESHOLD &&
      topRecentScore > secondRecentScore * 1.5
    ) {
      recentOverride = topRecentId as VizFamily;
    }
  }

  // Build scored array
  const scored = VIZ_FAMILY_SIGNALS.map((fam) => ({
    id: fam.id,
    label: fam.label,
    score: Math.round((mergedMap.get(fam.id) ?? 0) * 10) / 10,
  }));

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1] ?? { id: null, label: "", score: 0 };
  const lead = Math.round((top.score - second.score) * 10) / 10;

  // If recent zone has a clear override, use it
  if (recentOverride) {
    const overrideFam = VIZ_FAMILY_SIGNALS.find(
      (f) => f.id === recentOverride,
    )!;
    return {
      family: recentOverride,
      topic: overrideFam.label,
      scores: sorted,
      ambiguous: false,
      lead,
      runnerUp: top.id === recentOverride ? (second.id ?? null) : top.id,
      hardOverride: true,
    };
  }

  // ── EXPLICIT-MENTION GUARD for requirements_matrix ──────────────────────────
  // requirements_matrix may ONLY win if the transcript contains an unambiguous
  // explicit reference to a requirements / traceability artefact. Generic
  // compliance, firmware, CRA acronyms etc. must NOT trigger it.
  // This guard applies before ambiguity check so it can force a re-rank.
  const REQUIREMENTS_MATRIX_EXPLICIT_PHRASES = [
    "requirement matrix",
    "requirements matrix",
    "requirements traceability",
    "traceability matrix",
    "kravspecifikation",
    "kravspec",
    "krav matrix",
    "kravmatrix",
    "moscow priorit",
    "must have should have could have",
    "must should could won",
    "traceability id",
    "status per requirement",
    "status pr. krav",
    "srs document",
    "requirements baseline",
    "requirement id",
    "sporbarhed af krav",
    "conformity assessment",
    "konformitetsvurdering",
    "iec62443",
    "eu 2024/2847",
    "2024/2847",
  ];

  if (top.id === "requirements_matrix") {
    const normFull = normalizeForClassification(transcript);
    const hasExplicitMention = REQUIREMENTS_MATRIX_EXPLICIT_PHRASES.some((p) =>
      normFull.includes(p),
    );
    if (!hasExplicitMention) {
      console.warn(
        `[classifier] requirements_matrix SUPPRESSED — no explicit mention found (score=${top.score})`,
      );
      // Zero out requirements_matrix and re-sort to find real winner
      const rescored = sorted.map((s) =>
        s.id === "requirements_matrix" ? { ...s, score: 0 } : s,
      );
      rescored.sort((a, b) => b.score - a.score);
      const newTop = rescored[0];
      const newSecond = rescored[1] ?? { id: null, label: "", score: 0 };
      const newLead =
        Math.round((newTop.score - newSecond.score) * 10) / 10;
      const newAmbiguous =
        newTop.score < CLASSIFY_MIN_TOTAL || newLead < CLASSIFY_MIN_LEAD;
      if (newAmbiguous || newTop.score === 0) {
        return {
          family: "generic",
          topic: "General visualization",
          scores: rescored,
          ambiguous: true,
          lead: newLead,
          runnerUp: newTop.score > 0 ? newTop.id : (newSecond.id ?? null),
          hardOverride: false,
        };
      }
      const fam = VIZ_FAMILY_SIGNALS.find((f) => f.id === newTop.id)!;
      return {
        family: newTop.id as VizFamily,
        topic: fam?.label ?? newTop.id,
        scores: rescored,
        ambiguous: false,
        lead: newLead,
        runnerUp: newSecond.id ?? null,
        hardOverride: false,
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const ambiguous = top.score < CLASSIFY_MIN_TOTAL || lead < CLASSIFY_MIN_LEAD;

  if (ambiguous || top.score === 0) {
    return {
      family: "generic",
      topic: "General visualization",
      scores: sorted,
      ambiguous: true,
      lead,
      runnerUp: top.score > 0 ? top.id : (second.id ?? null),
      hardOverride: false,
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
      family: win.id as VizFamily,
      topic: win.label,
      scores: sorted,
      ambiguous: false,
      lead,
      runnerUp: second.id ?? null,
      hardOverride: false,
    };
  }

  return {
    family: top.id as VizFamily,
    topic: top.label,
    scores: sorted,
    ambiguous: false,
    lead,
    runnerUp: second.id ?? null,
    hardOverride: false,
  };
}
