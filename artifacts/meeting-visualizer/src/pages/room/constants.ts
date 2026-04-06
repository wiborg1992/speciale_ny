export const VIZ_TYPES = [
  { value: "auto", label: "Auto-detect" },
  { value: "hmi", label: "HMI / SCADA" },
  { value: "journey", label: "User Journey" },
  { value: "persona", label: "Persona / Research" },
  { value: "blueprint", label: "Service Blueprint" },
  { value: "comparison", label: "Comparison / Evaluation" },
  { value: "designsystem", label: "Design System" },
  { value: "uxprototype", label: "UX Prototype" },
  { value: "workflow", label: "Workflow / Process" },
  { value: "product", label: "Product / Hardware" },
  { value: "requirements", label: "Requirements" },
  { value: "engagement", label: "Engagement Analytics" },
  { value: "management", label: "Management Overview" },
  { value: "timeline", label: "Timeline / Roadmap" },
  { value: "stakeholders", label: "Stakeholder Map" },
  { value: "kanban", label: "Kanban / Tasks" },
  { value: "decisions", label: "Decision Log" },
] as const;

export const VIZ_MODELS = [
  { value: "haiku", label: "Haiku (fast)" },
  { value: "sonnet", label: "Sonnet (balanced)" },
  { value: "opus", label: "Opus (best)" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "gemini-pro", label: "Gemini Pro" },
] as const;

export const WORKSPACE_DOMAINS = [
  { value: "grundfos", label: "Grundfos" },
  { value: "gabriel", label: "Gabriel (data)" },
  { value: "generic", label: "Generic" },
] as const;

export const WORKSHOP_ROSTER_DEFAULT = "Jesper,Klaus,Maria,Anna,Facilitator";

export const MAX_VIZ_HISTORY = 100;
export const MAX_PASTE_HISTORY = 25;

export const BASE = import.meta.env.BASE_URL;
