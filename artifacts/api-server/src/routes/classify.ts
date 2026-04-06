import { Router, type IRouter } from "express";
import { z } from "zod";
import { classifyVisualizationIntent, type VizFamily } from "../lib/classifier.js";
import { normalizeTranscript } from "../lib/normalizer.js";

const router: IRouter = Router();

const ClassifyBodySchema = z.object({
  transcript: z.string(),
  workspaceDomain: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
});

const FAMILY_LABEL_DA: Record<VizFamily, string> = {
  hmi_interface: "HMI / SCADA",
  user_journey: "Brugerrejse",
  workflow_process: "Workflow / Proces",
  physical_product: "Produkt / Hardware",
  requirements_matrix: "Kravmatrix",
  management_summary: "Ledelsesoverblik",
  engagement_analytics: "Engagement Analytics",
  persona_research: "Persona / Research",
  service_blueprint: "Service Blueprint",
  comparison_evaluation: "Sammenligning",
  design_system: "Designsystem",
  ux_prototype: "UX Prototype",
  generic: "Generel visualisering",
};

const FAMILY_DESC_EN: Record<VizFamily, string> = {
  hmi_interface: "Dark-themed dashboard with widgets, controls, and status indicators — like an industrial control panel.",
  user_journey: "Swim-lane map with touchpoints, emotions, and phases across a user's experience.",
  workflow_process: "Flowchart with decision diamonds, arrows, and process steps from start to finish.",
  physical_product: "Product illustration with annotations, dimensions, and component breakdown.",
  requirements_matrix: "Structured table of requirements with priorities, owners, and status columns.",
  management_summary: "KPI cards, bar charts, and key metrics formatted for an executive briefing.",
  engagement_analytics: "Line/bar charts and usage trends visualised over time or by segment.",
  persona_research: "User profile card with avatar, goals, frustrations, and representative quotes.",
  service_blueprint: "Multi-lane diagram showing frontstage, backstage, and supporting processes.",
  comparison_evaluation: "Side-by-side table or scorecard with weighted evaluation criteria.",
  design_system: "Component library showing colour palette, typography, and reusable UI elements.",
  ux_prototype: "Clickable screen mockup illustrating navigation flow and screen transitions.",
  generic: "Flexible layout adapted to the content — no fixed visualization type.",
};

const FAMILY_DESC_DA: Record<VizFamily, string> = {
  hmi_interface: "Mørkt dashboard med widgets, knapper og statusvisning — som et kontrolpanel.",
  user_journey: "Svømmebaner med touchpoints, emotioner og faser gennem en brugers oplevelse.",
  workflow_process: "Flowchart med beslutningspunkter, pile og procestrin fra A til B.",
  physical_product: "Produktillustration med annotationer, dimensioner og komponentoversigt.",
  requirements_matrix: "Tabel med krav, prioriteter og status — struktureret oversigt.",
  management_summary: "KPI-kort, søjlediagrammer og nøgletal til ledelsesbriefing.",
  engagement_analytics: "Grafer, trends og brugsdata — visualiseret over tid eller segment.",
  persona_research: "Brugerprofil med foto, mål, frustrationer og citater.",
  service_blueprint: "Multi-lane diagram med frontstage, backstage og understøttende processer.",
  comparison_evaluation: "Side-om-side tabel eller scorecard med evalueringskriterier.",
  design_system: "Komponentbibliotek med farvepalet, typografi og UI-elementer.",
  ux_prototype: "Klikbar mockup med navigationsflow og skærmovergange.",
  generic: "Fleksibel visualisering tilpasset indholdet — ingen fast type.",
};

router.post("/classify", (req, res): void => {
  const parsed = ClassifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { transcript, workspaceDomain, context } = parsed.data;

  if (!transcript.trim()) {
    res.status(400).json({ error: "Transcript is empty." });
    return;
  }

  const combined = context
    ? `${transcript}\n\n${context}`
    : transcript;

  const normalized = normalizeTranscript(combined);

  const classification = classifyVisualizationIntent(
    normalized,
    workspaceDomain,
    null,
    normalized,
  );

  const topFamilies = classification.scores
    .slice(0, 4)
    .map((s) => ({
      id: s.id as VizFamily,
      label: s.label,
      labelDa: FAMILY_LABEL_DA[s.id as VizFamily] ?? s.label,
      score: s.score,
      descriptionEn: FAMILY_DESC_EN[s.id as VizFamily] ?? "",
      descriptionDa: FAMILY_DESC_DA[s.id as VizFamily] ?? "",
    }));

  res.json({
    topFamily: classification.family,
    families: topFamilies,
    ambiguous: classification.ambiguous,
  });
});

export default router;
