export type VizFamily =
  | "hmi"
  | "journey"
  | "workflow"
  | "product"
  | "requirements"
  | "management"
  | "general";

const FILLWORDS_DA = ["øh", "øhm", "eh", "ehm", "altså", "ligesom", "ikk", "ikke sandt", "jo", "nå", "hvad", "jamen", "jamens", "bare", "faktisk"];
const FILLWORDS_EN = ["um", "uh", "uhm", "hmm", "like", "sort of", "kind of", "basically", "actually", "right right", "okay okay", "yeah yeah", "you know", "i mean"];

const allFillwords = [...FILLWORDS_DA, ...FILLWORDS_EN];
const fillwordPattern = new RegExp(
  `\\b(${allFillwords.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
  "gi"
);

export function normalizeTranscript(text: string): string {
  let result = text
    .replace(fillwordPattern, "")
    // Repetitions: "det er det er" → "det er"
    .replace(/\b(\w{3,})\s+\1\b/gi, "$1")
    .replace(/\b(\w+ \w+)\s+\1\b/gi, "$1")
    // Standards written digit-by-digit by ASR
    .replace(/\bCER[\s-]?direktiv\w*/gi, "CER-direktivet")
    .replace(/\bNIS[\s-]?2\b/gi, "NIS2")
    .replace(/\bIEC[\s-]?6\s*2\s*4\s*4\s*3\b/gi, "IEC 62443")
    .replace(/\bISO[\s-]?2\s*7\s*0\s*0\s*1\b/gi, "ISO 27001")
    .replace(/\bISO[\s-]?9\s*0\s*0\s*1\b/gi, "ISO 9001")
    .replace(/\bGD\s+PR\b/gi, "GDPR")
    .replace(/\bcyber[\s-]?resilience[\s-]?act\b/gi, "Cyber Resilience Act")
    .replace(/\bcyber[\s-]?resiliens[\s-]?lov\w*/gi, "Cyber Resilience Act")
    .replace(/\b[Cc]\s*[Rr]\s*[Aa]\b(?!\w)/g, "CRA")
    .replace(/\bcy?ber[\s-]?sikkerhed\b/gi, "cybersikkerhed")
    .replace(/\bEU[\s-]?2024[\s-/]?2847\b/gi, "EU 2024/2847")
    .replace(/\b2024[\s-/]?2847\b/gi, "EU 2024/2847")
    .replace(/\bCE[\s-]?m[aæ]rk\w*/gi, "CE-mærkning")
    .replace(/\bkonformitets[\s-]?vurdering\b/gi, "konformitetsvurdering")
    .replace(/\bsårbarhed\w*[\s-]?h[aå]ndtering\b/gi, "sårbarhedshåndtering")
    // Technical abbreviations
    .replace(/\bscada\b/gi, "SCADA")
    .replace(/\bplc\b/gi, "PLC")
    .replace(/\bhmi\b/gi, "HMI")
    .replace(/\bbms\b/gi, "BMS")
    .replace(/\batex\b/gi, "ATEX")
    .replace(/\bnpsh\b/gi, "NPSH")
    .replace(/\bmge\b/gi, "MGE")
    .replace(/\bcim\b/gi, "CIM")
    .replace(/\bapi\b/gi, "API")
    .replace(/\biot\b/gi, "IoT")
    .replace(/\biiot\b/gi, "IIoT")
    .replace(/\bvfd\b/gi, "VFD")
    .replace(/\bpid\b/gi, "PID")
    .replace(/\bprofinet\b/gi, "PROFINET")
    .replace(/\bprofibus\b/gi, "PROFIBUS")
    .replace(/\bmodbus\b/gi, "Modbus")
    .replace(/\bbacnet\b/gi, "BACnet")
    .replace(/\bmqtt\b/gi, "MQTT")
    .replace(/\bopc[\s-]ua\b/gi, "OPC-UA")
    // IE efficiency classes — "IE 3", "I E 3", "IE class 3"
    .replace(/\bi[\s-]?e[\s-]?([1-5])\b/gi, (_, n) => "IE" + n)
    .replace(/\bi[\s-]?e[\s-]?class[\s-]?([1-5])\b/gi, (_, n) => "IE" + n)
    // Grundfos product names
    .replace(/\bi\s*solutions?\b/gi, "iSolutions")
    .replace(/\bi\s*cense\b/gi, "iSense")
    .replace(/\bground\s*foss?\b/gi, "Grundfos")
    .replace(/\bgrund\s*foss?\b/gi, "Grundfos")
    .replace(/\bgrundfos\b/gi, "Grundfos")
    // Refinement words ASR corrections
    .replace(/\bsoom\s+ind?\b/gi, "zoom ind")
    .replace(/\bsuming?\b/gi, "zoom ind")
    .replace(/\btil\s*føre?\b/gi, "tilføj")
    .replace(/\bfokus\s*er[ea]?\b/gi, "fokuser")
    .replace(/\bud\s*vid\b/gi, "udvid")
    .replace(/\bde\s*taljer?\b/gi, "detalje")
    .replace(/\bfremm?hæv\b/gi, "fremhæv")
    // Units split by ASR
    .replace(/\bm\s*3\s*\/?\s*h\b/gi, "m³/h")
    .replace(/\s{2,}/g, " ")
    .trim();

  return result;
}

export function classifyTranscript(text: string): VizFamily {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  const KEYWORDS: Record<VizFamily, string[]> = {
    hmi: ["hmi", "scada", "dashboard", "display", "screen", "panel", "alarm", "sensor", "gauge", "meter", "control", "setpoint", "monitoring", "overvågning", "styring", "skærm", "pumpe", "pump", "flow", "tryk", "pressure", "temperatur", "ventil", "valve", "isolutions"],
    journey: ["journey", "user", "bruger", "customer", "kunde", "step", "trin", "experience", "oplevelse", "onboarding", "path", "touch", "fase", "phase"],
    workflow: ["workflow", "process", "arbejdsgang", "task", "opgave", "approval", "godkendelse", "review", "sequence", "rækkefølge", "procedure", "integration", "automation"],
    product: ["product", "produkt", "hardware", "komponenter", "component", "installation", "montage", "dimension", "størrelse", "material", "spec", "motor", "impeller", "housing", "shaft", "aksel"],
    requirements: ["requirement", "krav", "feature", "funktion", "must", "skal", "should", "bør", "compliance", "standard", "norm", "regulation", "safety", "sikkerhed", "certification", "iso", "iec", "atex", "nis2", "cer", "gdpr"],
    management: ["management", "ledelse", "strategy", "strategi", "roadmap", "milestone", "milepæl", "budget", "cost", "resource", "ressource", "risk", "risiko", "timeline", "kpi", "metric", "måltal", "stakeholder"],
    general: [],
  };

  const scores: Partial<Record<VizFamily, number>> = {};

  for (const [family, keywords] of Object.entries(KEYWORDS) as [VizFamily, string[]][]) {
    if (family === "general") continue;
    scores[family] = 0;
    for (const keyword of keywords) {
      scores[family]! += words.filter((w) => w.includes(keyword)).length;
    }
  }

  const best = Object.entries(scores)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0];

  if (!best || (best[1] ?? 0) === 0) return "general";
  return best[0] as VizFamily;
}
