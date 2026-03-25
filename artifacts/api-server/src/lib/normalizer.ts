export type VizFamily =
  | "hmi"
  | "journey"
  | "workflow"
  | "product"
  | "requirements"
  | "management"
  | "general";

const FILLWORDS_DA = ["øh", "øhm", "eh", "ehm", "altså", "ligesom", "ikk", "ikke", "jo", "nå", "hvad", "jamen", "jamens", "men", "og", "så", "bare", "faktisk"];
const FILLWORDS_EN = ["um", "uh", "like", "sort of", "kind of", "basically", "actually", "right", "okay", "so", "well"];

const LEXICON: Record<string, string> = {
  grundfos: "Grundfos",
  scada: "SCADA",
  hmi: "HMI",
  plc: "PLC",
  api: "API",
  iot: "IoT",
  modbus: "Modbus",
  profibus: "PROFIBUS",
  profinet: "PROFINET",
  bacnet: "BACnet",
  mqtt: "MQTT",
  "opc-ua": "OPC-UA",
  iiot: "IIoT",
  vfd: "VFD",
  pid: "PID",
  ui: "UI",
  ux: "UX",
};

const CLASSIFICATION_KEYWORDS: Record<string, string[]> = {
  hmi: ["hmi", "scada", "dashboard", "display", "screen", "panel", "alarm", "sensor", "gauge", "meter", "control", "setpoint", "status", "monitoring", "overvågning", "styring", "skærm", "pumpe", "pump", "flow", "tryk", "pressure", "temperatur", "temperature", "ventil", "valve"],
  journey: ["journey", "user", "bruger", "customer", "kunde", "step", "trin", "experience", "oplevelse", "onboarding", "path", "touch", "fase", "phase"],
  workflow: ["workflow", "process", "arbejdsgang", "task", "opgave", "approval", "godkendelse", "review", "sequence", "rækkefølge", "procedure", "handoff", "integration", "automation", "automatisering"],
  product: ["product", "produkt", "hardware", "komponenter", "component", "installation", "montage", "mounting", "dimension", "størrelse", "material", "materiale", "specification", "spec", "motor", "impeller", "housing", "shaft", "aksel"],
  requirements: ["requirement", "krav", "feature", "funktion", "function", "must", "skal", "should", "bør", "compliance", "standard", "norm", "regulation", "safety", "sikkerhed", "certification", "certificering", "iso", "iec", "atex"],
  management: ["management", "ledelse", "strategy", "strategi", "roadmap", "milestone", "milepæl", "budget", "cost", "omkostning", "resource", "ressource", "risk", "risiko", "timeline", "kpi", "metric", "måltal", "stakeholder"],
};

const allFillwords = [...FILLWORDS_DA, ...FILLWORDS_EN];

const fillwordPattern = new RegExp(
  `\\b(${allFillwords.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
  "gi"
);

export function normalizeTranscript(text: string): string {
  let result = text.replace(fillwordPattern, "").replace(/\s{2,}/g, " ").trim();

  for (const [wrong, correct] of Object.entries(LEXICON)) {
    const pattern = new RegExp(`\\b${wrong}\\b`, "gi");
    result = result.replace(pattern, correct);
  }

  return result;
}

export function classifyTranscript(text: string): VizFamily {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  const scores: Record<string, number> = {
    hmi: 0,
    journey: 0,
    workflow: 0,
    product: 0,
    requirements: 0,
    management: 0,
  };

  for (const [family, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
    for (const keyword of keywords) {
      const count = words.filter((w) => w.includes(keyword)).length;
      scores[family] += count;
    }
  }

  const best = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

  if (best[1] === 0) return "general";
  return best[0] as VizFamily;
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
