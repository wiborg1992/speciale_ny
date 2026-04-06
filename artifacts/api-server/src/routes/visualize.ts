import { Router, type IRouter } from "express";
import { z } from "zod";
import { normalizeTranscript } from "../lib/normalizer.js";
import {
  streamVisualization,
  fillTabPanels,
  streamReasoningNarrative,
  isHtmlQualityOk,
  type VizModel,
} from "../lib/visualizer.js";
import {
  classifyVisualizationIntent,
  CLASSIFY_SWITCH_LEAD,
  type VizFamily,
  type ClassificationResult,
} from "../lib/classifier.js";
import { getRoom, broadcastEvent, getRecentSegments } from "../lib/rooms.js";
import {
  computeEssenceBullets,
  extractVizTitleFromHtml,
  roomToMeetingEssencePayload,
} from "../lib/meeting-essence.js";
import { saveVisualization, updateMeetingTitle, getSketchById, linkSketchToViz } from "../lib/meeting-store.js";
import { detectRefinementIntent } from "../lib/refinement-detector.js";
import {
  evaluateVisualizationInput,
  MIN_WORDS_FOR_VISUALIZATION,
} from "../lib/transcript-quality.js";

const router: IRouter = Router();

/** Mindste lead før vi spørger brugeren ved “blødt” emneskift (undgå støj ved lead 0–2). */
const UNCERTAIN_TOPIC_SHIFT_MIN_LEAD = 4;

// ─── resolveFamily — P1–P8 decision order ────────────────────────────────────
// P0 (userPickedType) løses i route-handleren før dette kald.
// Ren funktion: ingen side-effects, ingen adgang til room-state.
//
// Decision order (højest prioritet øverst):
//   P1  focusSegment      → brug classifier.family direkte, bypass alt
//   P2  hardOverride=true → brug classifier.family, bypass inertia og refinement-lås
//   P3  ambiguous + lastFamily  → arv lastFamily  [log: ambiguous_inherit]
//   P4  ambiguous + !lastFamily → null (route skipper)
//   P5  refinement + lastFamily → lås til lastFamily  [Strategi A: refinement blokerer ordinær klassifikation]
//   P6  !ambiguous + lead >= CLASSIFY_SWITCH_LEAD + lastFamily → skift familie
//   P7  !ambiguous + !lastFamily → brug classifier.family (første viz)
//   P8  !ambiguous + lead < CLASSIFY_SWITCH_LEAD + lastFamily → inertia, behold lastFamily
export function resolveFamily(params: {
  classification: ClassificationResult | null;
  lastFamily: VizFamily | null;
  hasFocusSegment: boolean;
  refinementDetected: boolean;
}): VizFamily | null {
  const { classification, lastFamily, hasFocusSegment, refinementDetected } =
    params;

  // P1: focusSegment — bypass alt, brug klassifikatorens direkte resultat
  if (hasFocusSegment && classification) {
    return classification.family;
  }

  if (!classification) return null;

  // P2: hardOverride — TOPIC_SHIFT_OVERRIDE eller RECENT_ZONE_OVERRIDE slog til
  // Bypasser inertia og refinement-lås. Eneste ikke-bruger vej der kan trumfe P5.
  if (classification.hardOverride) {
    return classification.family;
  }

  // P3: ambiguous + etableret familie → arv
  if (classification.ambiguous && lastFamily) {
    console.log(`[ambiguous-inherit] holder ${lastFamily}`);
    return lastFamily;
  }

  // P4: ambiguous + ingen etableret familie → null (route skipper visualisering)
  if (classification.ambiguous) {
    return null;
  }

  // P5: refinement detekteret + etableret familie → lås
  // Strategi A: kun P0/P1/P2 kan bryde ud. Høj lead fra ordinær klassifikation
  // bryder IKKE refinement-lås — det er bivirkningssignal, ikke brugerinstruktion.
  if (refinementDetected && lastFamily) {
    return lastFamily;
  }

  // P6: klar ny familie med tilstrækkelig sikkerhed + etableret familie → skift
  if (lastFamily && classification.lead >= CLASSIFY_SWITCH_LEAD) {
    console.log(
      `[family-switch] ${lastFamily} → ${classification.family} (lead=${classification.lead})`,
    );
    return classification.family;
  }

  // P7: første viz (ingen etableret familie) → brug klassifikatorens resultat
  if (!lastFamily) {
    return classification.family;
  }

  // P8: lead for lav til at skifte etableret familie → inertia
  console.log(
    `[inertia] lead=${classification.lead} < ${CLASSIFY_SWITCH_LEAD}, holder ${lastFamily}`,
  );
  return lastFamily;
}

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 28; // matches reference server
const MAX_BODY_CHARS = 100_000;

function stripCodeFences(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:html)?\s*\n?/, "");
  t = t.replace(/\n?```\s*$/, "");
  return t.trim();
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

const VizModelEnum = z
  .enum(["haiku", "sonnet", "opus", "gemini-flash", "gemini-pro"])
  .optional()
  .nullable();

const VisualizeBodySchema = z.object({
  transcript: z.string(),
  previousHtml: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  speakerName: z.string().optional().nullable(),
  vizType: z.string().optional().nullable(),
  vizModel: VizModelEnum,
  title: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  freshStart: z.boolean().optional(),
  /** grundfos | gabriel | generic (aliases: neutral, other → generic) */
  workspaceDomain: z.string().optional().nullable(),
  /** "Speaker: text" of the specific segment the user clicked to trigger this generation */
  focusSegment: z.string().optional().nullable(),
  /** Eksplicit brugervalg efter disambiguation-dialog: "fresh" = ny viz, "refine" = byg videre */
  userVizIntent: z.enum(["fresh", "refine"]).optional().nullable(),
  /** Skitse-ID fra PUT /meetings/:roomId/sketch — billede loades fra DB */
  sketchId: z.string().optional().nullable(),
  /** Bypass ord-tærskel-check — bruges når annotation-sketch trigger viz (ingen nye ord kræves) */
  forceVisualize: z.boolean().optional(),
});

export type DisambiguationReason =
  | "refinement_vs_topic_shift"
  | "ambiguous_with_previous_viz"
  | "uncertain_topic_shift";

/**
 * Ren funktion — ingen side-effects. Returnerer gate-resultat.
 * Eksporteret så den kan testes uden HTTP.
 *
 * Gate 1: refinement_vs_topic_shift — refinement + stærkt topic-skift (som før).
 * Gate 2: ambiguous_with_previous_viz — klassifikation tvetydig, men der findes allerede en viz.
 * Gate 3: uncertain_topic_shift — klassifikatoren peger på anden familie, men lead er under auto-skift (P8-inertia) — typisk “workflow under pump”-situationer.
 */
export function checkDisambiguationGate(params: {
  refinementDirective: string | null;
  classification: ClassificationResult | null;
  lastFamily: VizFamily | null;
  effectivePreviousHtml: string | null | undefined;
  userPickedType: boolean;
  focusSegment: string | null | undefined;
  userVizIntent: string | null | undefined;
}): {
  needsIntent: boolean;
  reason: DisambiguationReason | null;
  defaultChoice: "fresh" | "refine" | null;
  detectedFamily: VizFamily | null;
} {
  const {
    refinementDirective,
    classification,
    lastFamily,
    effectivePreviousHtml,
    userPickedType,
    focusSegment,
    userVizIntent,
  } = params;

  // Bypass: bruger har allerede svaret, valgt type eksplicit, eller klikket segment
  if (userVizIntent || userPickedType || focusSegment) {
    return {
      needsIntent: false,
      reason: null,
      defaultChoice: null,
      detectedFamily: null,
    };
  }

  // Gate: refinement-signal + stærkt topic-skift i modsat retning
  const hasConflict =
    refinementDirective != null &&
    classification != null &&
    !classification.ambiguous &&
    classification.lead >= CLASSIFY_SWITCH_LEAD &&
    lastFamily != null &&
    classification.family !== lastFamily &&
    !!effectivePreviousHtml;

  if (hasConflict) {
    return {
      needsIntent: true,
      reason: "refinement_vs_topic_shift",
      // Default: ny viz, fordi topic-skiftet er stærkt (høj lead)
      defaultChoice: "fresh",
      detectedFamily: classification!.family,
    };
  }

  // Tvetydig klassifikation + eksisterende viz: ikke bare arv stiltiende (P3).
  if (
    classification?.ambiguous &&
    lastFamily &&
    !!effectivePreviousHtml &&
    !refinementDirective
  ) {
    return {
      needsIntent: true,
      reason: "ambiguous_with_previous_viz",
      defaultChoice: "refine",
      detectedFamily: classification.family,
    };
  }

  // “Blødt” emneskift: anden top-familie, men ikke nok lead til P6 — spørg før inertia tvinger forkert incremental.
  if (
    classification &&
    !classification.ambiguous &&
    lastFamily &&
    classification.family !== lastFamily &&
    !!effectivePreviousHtml &&
    !refinementDirective &&
    classification.lead >= UNCERTAIN_TOPIC_SHIFT_MIN_LEAD &&
    classification.lead < CLASSIFY_SWITCH_LEAD
  ) {
    return {
      needsIntent: true,
      reason: "uncertain_topic_shift",
      defaultChoice: "fresh",
      detectedFamily: classification.family,
    };
  }

  return {
    needsIntent: false,
    reason: null,
    defaultChoice: null,
    detectedFamily: null,
  };
}

function sendNeedIntent(
  res: import("express").Response,
  reason: DisambiguationReason,
  defaultChoice: "fresh" | "refine",
  detectedFamily: string | null,
  currentFamily: string | null,
  scores: Array<{ family: string; score: number }>,
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const EXPLANATIONS: Record<DisambiguationReason, string> = {
    refinement_vs_topic_shift:
      "Samtalen bevæger sig i en ny retning, men du talte om at justere den nuværende visualisering. Hvad skal der ske?",
    ambiguous_with_previous_viz:
      "Det er uklart hvilken type figur der passer bedst til det seneste indhold. Vil du bygge videre på den nuværende visualisering, eller starte en ny type?",
    uncertain_topic_shift:
      "Det lyder som et nyt emne (fx anden figur-type end den du har), men signalet er ikke helt entydigt. Vil du have en ny visualisering til det nye emne, eller fortsætte på den nuværende?",
  };

  res.write(
    `data: ${JSON.stringify({
      type: "need_intent",
      disambiguationReason: reason,
      defaultChoice,
      explanation: EXPLANATIONS[reason],
      detectedFamily,
      currentFamily,
      scores: scores.slice(0, 4),
    })}\n\n`,
  );
  res.end();
}

router.post("/visualize", async (req, res, next): Promise<void> => {
  try {
    const ip = req.ip ?? "unknown";

    if (!checkRateLimit(ip)) {
      res.status(429).json({
        error: "Rate limit exceeded. Please wait before generating again.",
      });
      return;
    }

    const parsed = VisualizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const {
      transcript,
      previousHtml,
      roomId,
      vizType,
      vizModel,
      title,
      context,
      freshStart,
      workspaceDomain,
      focusSegment,
      userVizIntent,
      sketchId,
      forceVisualize,
    } = parsed.data;

    if (transcript.length > MAX_BODY_CHARS) {
      res.status(400).json({ error: "Transcript too long." });
      return;
    }

    if (!transcript.trim()) {
      res.status(400).json({ error: "Transcript is empty." });
      return;
    }

    // Brug klients transskript når det er udfyldt (fx Paste). Traf kun room-segmenter ind når body er tom,
    // så indsat tekst ikke overskrives af gamle/mic-segmenter i samme rum.
    let effectiveTranscript = transcript;
    if (!transcript.trim() && roomId) {
      const room = getRoom(roomId);
      if (room && room.segments.length > 0) {
        effectiveTranscript = room.segments
          .map((s) => `[${s.speakerName}]: ${s.text}`)
          .join("\n");
      }
    }

    const normalized = normalizeTranscript(effectiveTranscript);

    // ─── Refinement detection ─────────────────────────────────────────────────
    // Check if recent speech contains modification directives like "zoom ind på",
    // "tilføj en kolonne", "behold formatet men..." — if so, force incremental mode
    // with the previous visualization even if the frontend didn't explicitly send it.
    let effectivePreviousHtml = previousHtml;
    let refinementDirective: string | null = null;

    if (roomId && !freshStart) {
      const room = getRoom(roomId);
      const hasPreviousViz = !!(
        effectivePreviousHtml || room?.lastVisualization
      );
      const refinement = detectRefinementIntent(normalized, hasPreviousViz);

      if (refinement.detected && refinement.directive) {
        refinementDirective = refinement.directive;
        if (!effectivePreviousHtml && room?.lastVisualization) {
          effectivePreviousHtml = room.lastVisualization;
        }
        console.log(
          `[refinement] Detected in room ${roomId} (${refinement.confidence}):`,
          refinement.phrases.join(" | "),
        );
      }
    }

    // ─── Server-side classification ───────────────────────────────────────────
    // Runs BEFORE calling Claude so we can pass an explicit type hint.
    // If the user explicitly chose a type, skip auto-classification.
    //
    // CRITICAL: Classify on the RECENT tail of the transcript, NOT the full history.
    // In a 700-word conversation about pumps/requirements, a recent command like
    // "let's do a user journey mapping" gets drowned out by older keywords.
    // The classifier must reflect the user's LATEST intent, not accumulated topics.
    /** Ord sendes til klassifikator (tail). Øget så "physical pump" mv. ikke falder ud af vinduet før PIN/HMI-dominans. */
    const CLASSIFY_TAIL_WORDS = 280;
    const userPickedType = vizType && vizType !== "auto";

    let classificationInput: string;
    if (focusSegment) {
      classificationInput = focusSegment;
    } else {
      const words = normalized.split(/\s+/);
      classificationInput =
        words.length > CLASSIFY_TAIL_WORDS
          ? words.slice(-CLASSIFY_TAIL_WORDS).join(" ")
          : normalized;
    }

    // Timestamp-baseret "latest chunk": de seneste 30 sek af tale fra roomet.
    // Mere præcis end tegn-baserede zoner ved varierende taletempo.
    const LATEST_CHUNK_WINDOW_MS = 30_000;
    let latestChunk: string | null = null;
    if (roomId && !focusSegment) {
      const recentSegs = getRecentSegments(roomId, LATEST_CHUNK_WINDOW_MS);
      if (recentSegs.length > 0) {
        latestChunk = recentSegs
          .map((s) => `[${s.speakerName}]: ${s.text}`)
          .join("\n");
      }
    }

    const classification = userPickedType
      ? null
      : classifyVisualizationIntent(
          classificationInput,
          workspaceDomain,
          latestChunk,
          normalized,
        );

    if (classification) {
      const totalWords = normalized.split(/\s+/).filter(Boolean).length;
      const classifyWords = classificationInput
        .split(/\s+/)
        .filter(Boolean).length;
      console.log(
        `[classify] Input: ${classifyWords}/${totalWords} words (${focusSegment ? "focusSegment" : "tail"}) latestChunk: ${latestChunk ? latestChunk.split(/\s+/).filter(Boolean).length + "w" : "none"} → ${classification.family} (lead=${classification.lead}, ambiguous=${classification.ambiguous})`,
      );
    }

    // ─── Resolve viz-familie (P0–P8 decision order) ─────────────────────────────
    //
    // P0: userPickedType — løses her (typeToFamily-mapping), IKKE i resolveFamily
    // P1–P8: resolveFamily() — ren funktion, testbar uden HTTP
    //
    // Spec: https://github.com/... (se plan v3 i commit-historik)
    const TYPE_TO_FAMILY: Record<string, VizFamily> = {
      hmi: "hmi_interface",
      journey: "user_journey",
      workflow: "workflow_process",
      product: "physical_product",
      requirements: "requirements_matrix",
      engagement: "engagement_analytics",
      analytics: "engagement_analytics",
      management: "management_summary",
      kanban: "management_summary",
      decisions: "management_summary",
      timeline: "management_summary",
      persona: "persona_research",
      research: "persona_research",
      empathy: "persona_research",
      blueprint: "service_blueprint",
      architecture: "service_blueprint",
      sitemap: "service_blueprint",
      stakeholders: "service_blueprint",
      comparison: "comparison_evaluation",
      evaluation: "comparison_evaluation",
      swot: "comparison_evaluation",
      scorecard: "comparison_evaluation",
      designsystem: "design_system",
      styleguide: "design_system",
      components: "design_system",
      uxprototype: "ux_prototype",
      prototype: "ux_prototype",
      clickable: "ux_prototype",
      mockup: "ux_prototype",
      // VizFamily IDs passeret direkte fra retningskort-picker
      hmi_interface: "hmi_interface",
      user_journey: "user_journey",
      workflow_process: "workflow_process",
      physical_product: "physical_product",
      requirements_matrix: "requirements_matrix",
      management_summary: "management_summary",
      engagement_analytics: "engagement_analytics",
      persona_research: "persona_research",
      service_blueprint: "service_blueprint",
      comparison_evaluation: "comparison_evaluation",
      design_system: "design_system",
      ux_prototype: "ux_prototype",
      generic: "generic",
    };

    const lastFamily = (
      roomId ? (getRoom(roomId)?.lastFamily ?? null) : null
    ) as VizFamily | null;

    let resolvedFamily: VizFamily | null;
    if (userPickedType) {
      // P0: brugeren har valgt eksplicit — bypass alt
      resolvedFamily = TYPE_TO_FAMILY[vizType!] ?? null;
    } else {
      resolvedFamily = resolveFamily({
        classification,
        lastFamily,
        hasFocusSegment: !!focusSegment,
        refinementDetected: !!refinementDirective,
      });
    }

    // ─── userVizIntent override ───────────────────────────────────────────────
    // Brugeren har svaret på disambiguation-dialogen — respektér det over P5/P8.
    if (userVizIntent === "fresh") {
      effectivePreviousHtml = undefined;
      refinementDirective = null;
      // Bypass inertia/refinement-lås: brug klassifikatorens direkte familie
      if (classification) resolvedFamily = classification.family;
    } else if (userVizIntent === "refine") {
      // Sørg for at vi har previousHtml fra rummet hvis klienten ikke sendte det
      if (!effectivePreviousHtml && roomId) {
        const room = getRoom(roomId);
        if (room?.lastVisualization)
          effectivePreviousHtml = room.lastVisualization;
      }
    }

    // ─── Topic-shift clear ────────────────────────────────────────────────────
    // Ryd previousHtml når resolved familie ikke matcher serverens lastFamily — ELLER
    // når lastFamily mangler (ny instans, restart, state ikke delt): ellers sender
    // klienten stadig previousHtml → isIncremental=true og gammelt layout bløder ind.
    // Refinement: ikke ryd (Strategi A / bruger retter bevidst samme viz).
    if (resolvedFamily && roomId && !freshStart && !refinementDirective) {
      const noServerFamily = lastFamily == null;
      const familyMismatch =
        lastFamily != null && lastFamily !== resolvedFamily;
      if (noServerFamily || familyMismatch) {
        const reason = noServerFamily
          ? `no server lastFamily (clear previousHtml if any) → ${resolvedFamily}`
          : `family changed: ${lastFamily} → ${resolvedFamily}`;
        console.log(
          `[topic-shift] ${reason} in room ${roomId} — forcing fresh visualization`,
        );
        effectivePreviousHtml = undefined;
        refinementDirective = null;
      }
    }

    const vizPerfStart = performance.now();

    const vizQuality = evaluateVisualizationInput(normalized, {
      bypassForRefinement: !!refinementDirective,
      userPickedVisualizationType: !!userPickedType,
    });
    function sendSkipped(
      reason: string,
      extra?: Record<string, unknown>,
    ): void {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(
        `data: ${JSON.stringify({ type: "skipped", reason, ...extra })}\n\n`,
      );
      res.end();
    }

    // Bypass word-gate når en sketch er vedhæftet — skitsen er indholdet
    if (!vizQuality.ok && !sketchId) {
      sendSkipped(vizQuality.reason, {
        wordCount: vizQuality.wordCount,
        minWords: MIN_WORDS_FOR_VISUALIZATION,
        hint: "For lidt indhold til visualisering. Fortsæt samtalen, eller vælg en fast visualization-type (ikke Auto).",
      });
      req.log?.info({
        msg: "viz_perf",
        vizPerf: {
          skipped: true,
          reason: vizQuality.reason,
          wordCount: vizQuality.wordCount,
          ttMs: Math.round(performance.now() - vizPerfStart),
          roomId: roomId ?? null,
        },
      });
      return;
    }

    // ─── Ambiguity guard ──────────────────────────────────────────────────────
    // Klassifikatoren er ikke sikker på typen OG der er ingen tidligere
    // visualisering at opdatere — generér ikke generisk HTML, vent på mere indhold.
    // Bypasses hvis: bruger har valgt type, refinement er detekteret, focusSegment.
    if (
      !sketchId &&
      !userPickedType &&
      !refinementDirective &&
      !focusSegment &&
      !effectivePreviousHtml &&
      classification?.ambiguous
    ) {
      sendSkipped("ambiguous_no_context", {
        wordCount: vizQuality.wordCount,
        hint: "Emnet er endnu ikke klart nok. Fortsæt samtalen — systemet genererer når det ved hvilken type der passer.",
      });
      req.log?.info({
        msg: "viz_perf",
        vizPerf: {
          skipped: true,
          reason: "ambiguous_no_context",
          wordCount: vizQuality.wordCount,
          ttMs: Math.round(performance.now() - vizPerfStart),
          roomId: roomId ?? null,
        },
      });
      return;
    }

    // ─── Word-count delta guard ───────────────────────────────────────────────
    // Undgår at regenerere når samtalen ikke har vokset nok siden sidst.
    // Fx: stille perioder, small-talk, pauser — ingen Claude-kald.
    // Bypasses hvis: freshStart, refinement, focusSegment, forceVisualize, topic-skift, ingen forrige viz.
    const MIN_NEW_WORDS_FOR_REGEN = 10;
    if (!freshStart && !refinementDirective && !focusSegment && !forceVisualize && roomId) {
      const room = getRoom(roomId);
      if (
        room?.lastVizWordCount &&
        room.lastVizWordCount > 0 &&
        effectivePreviousHtml
      ) {
        const wordGrowth = vizQuality.wordCount - room.lastVizWordCount;
        const familyChanged =
          resolvedFamily &&
          room.lastFamily &&
          room.lastFamily !== resolvedFamily;
        if (wordGrowth < MIN_NEW_WORDS_FOR_REGEN && !familyChanged) {
          sendSkipped("insufficient_new_content", {
            wordCount: vizQuality.wordCount,
            lastVizWordCount: room.lastVizWordCount,
            wordGrowth,
            hint: `Kun ${wordGrowth} nye ord siden sidst. Systemet venter på mere indhold.`,
          });
          req.log?.info({
            msg: "viz_perf",
            vizPerf: {
              skipped: true,
              reason: "insufficient_new_content",
              wordGrowth,
              wordCount: vizQuality.wordCount,
              ttMs: Math.round(performance.now() - vizPerfStart),
              roomId: roomId ?? null,
            },
          });
          return;
        }
      }
    }

    // ─── Disambiguation gate ──────────────────────────────────────────────────
    // Spørg brugeren når refinement-signal og stærkt topic-skift konflikterer.
    // Kun når brugeren IKKE allerede har svaret (userVizIntent) og ikke har valgt
    // type eksplicit eller klikket et segment.
    {
      const gate = checkDisambiguationGate({
        refinementDirective,
        classification,
        lastFamily,
        effectivePreviousHtml,
        userPickedType: !!userPickedType,
        focusSegment,
        userVizIntent,
      });
      if (gate.needsIntent && gate.reason && gate.defaultChoice) {
        console.log(
          `[disambiguation] ${gate.reason} in room ${roomId} — detectedFamily=${gate.detectedFamily}, currentFamily=${lastFamily}`,
        );
        sendNeedIntent(
          res,
          gate.reason,
          gate.defaultChoice,
          gate.detectedFamily,
          lastFamily,
          (classification?.scores ?? []).map((s) => ({
            family: s.id,
            score: s.score,
          })),
        );
        return;
      }
    }

    // ─── Sketch image loading ─────────────────────────────────────────────────
    // Load PNG from DB if sketchId is provided. Én sandhed — billede hentes fra sketch_scenes.
    let sketchPngBase64: string | null = null;
    if (sketchId && roomId) {
      const sketch = await getSketchById(sketchId);
      if (sketch && sketch.meetingId === roomId) {
        sketchPngBase64 = sketch.previewPngBase64;
        console.log(`[sketch] Loaded sketchId=${sketchId} for room=${roomId} (${sketchPngBase64.length} base64 chars)`);
      } else {
        console.warn(`[sketch] sketchId=${sketchId} not found or roomId mismatch (room=${roomId})`);
      }
    }

    const streamT0 = performance.now();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const ttHeadersMs = Math.round(performance.now() - streamT0);

    // Track client disconnect so we skip broadcast for orphaned requests
    let clientDisconnected = false;
    req.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });
    const vizStartedAt = Date.now();

    if (classification) {
      res.write(
        `data: ${JSON.stringify({
          type: "meta",
          classification: {
            family: classification.family,
            topic: classification.topic,
            ambiguous: classification.ambiguous,
            lead: classification.lead,
            scores: classification.scores.slice(0, 4),
          },
          refinement: refinementDirective
            ? { detected: true, directive: refinementDirective }
            : null,
        })}\n\n`,
      );
    } else if (refinementDirective) {
      res.write(
        `data: ${JSON.stringify({
          type: "meta",
          refinement: { detected: true, directive: refinementDirective },
        })}\n\n`,
      );
    }

    // ─── Debug payload: send full prompt construction details ───────────────
    {
      const totalWords = normalized.split(/\s+/).filter(Boolean).length;
      const classifyWords = classificationInput
        .split(/\s+/)
        .filter(Boolean).length;
      res.write(
        `data: ${JSON.stringify({
          type: "debug",
          timestamp: new Date().toISOString(),
          classification: classification
            ? {
                inputMode: focusSegment ? "focusSegment" : "tail",
                inputWords: classifyWords,
                totalWords,
                inputText: classificationInput.slice(0, 500),
                family: classification.family,
                topic: classification.topic,
                lead: classification.lead,
                ambiguous: classification.ambiguous,
                allScores: classification.scores.slice(0, 8),
              }
            : null,
          userPickedType: !!userPickedType,
          vizType: vizType ?? "auto",
          resolvedFamily: resolvedFamily ?? null,
          vizModel: vizModel ?? "haiku",
          isIncremental: !freshStart && !!effectivePreviousHtml,
          isRefinement: !!refinementDirective,
          refinementDirective: refinementDirective ?? null,
          hasPreviousHtml: !!effectivePreviousHtml,
          focusSegment: focusSegment ?? null,
          workspaceDomain: workspaceDomain ?? null,
          transcriptTotalWords: totalWords,
          roomId: roomId ?? null,
        })}\n\n`,
      );
    }

    let fullHtml = "";
    let firstChunkMs: number | null = null;

    const roomBeforeViz = roomId ? getRoom(roomId) : undefined;
    const meetingEssenceForPrompt = roomBeforeViz
      ? roomToMeetingEssencePayload(roomBeforeViz)
      : null;

    try {
      for await (const chunk of streamVisualization(
        {
          transcript: normalized,
          vizType,
          vizModel: vizModel as VizModel | null | undefined,
          title,
          context,
          previousHtml: effectivePreviousHtml,
          freshStart,
          roomId,
          resolvedFamily,
          refinementDirective,
          workspaceDomain,
          focusSegment,
          meetingEssence: meetingEssenceForPrompt,
          sketchPngBase64,
        },
        (c) => {
          if (firstChunkMs == null)
            firstChunkMs = Math.round(performance.now() - streamT0);
          res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`);
        },
        (promptInfo) => {
          res.write(
            `data: ${JSON.stringify({
              type: "debug_prompt",
              systemPrompt: promptInfo.systemPrompt,
              userMessage: promptInfo.userMessage,
              model: promptInfo.model,
              maxTokens: promptInfo.maxTokens,
            })}\n\n`,
          );
        },
      )) {
        fullHtml += chunk;
      }

      const ttDoneMs = Math.round(performance.now() - streamT0);

      const meta = {
        vizType: vizType ?? "auto",
        vizModel: vizModel ?? "haiku",
        wordCount: normalized.split(/\s+/).filter(Boolean).length,
        incremental: !freshStart && !!effectivePreviousHtml,
        classifiedFamily: resolvedFamily ?? classification?.family ?? null,
        refinement: refinementDirective ? true : false,
        workspaceDomain: workspaceDomain ?? null,
      };

      const cleanHtml = stripCodeFences(fullHtml);
      const qualityOk = isHtmlQualityOk(cleanHtml);

      if (qualityOk) {
        if (roomId) {
          // Always persist to DB — even if the client navigated away while the
          // AI was still streaming. The HTML is complete at this point because
          // the server-side loop runs to completion regardless of disconnect.
          saveVisualization(
            roomId,
            cleanHtml,
            resolvedFamily ?? classification?.family ?? "generic",
            meta.wordCount,
          ).then((savedVersion) => {
            if (sketchId && savedVersion) {
              linkSketchToViz(sketchId, savedVersion, roomId).catch(() => {});
            }
          }).catch((err) => console.error("[viz-save] Failed to persist visualization:", err));
          if (title) {
            updateMeetingTitle(roomId, title).catch(() => {});
          }

          if (!clientDisconnected) {
            const room = getRoom(roomId);
            if (room) {
              room.lastVisualization = cleanHtml;
              room.lastFamily = resolvedFamily ?? classification?.family ?? null;
              const fromHtml = extractVizTitleFromHtml(cleanHtml);
              room.lastVizTitle =
                fromHtml ??
                (title?.trim() ? title.trim().slice(0, 84) : room.lastVizTitle);
              room.meetingEssenceBullets = computeEssenceBullets(
                classification,
                (resolvedFamily ??
                  classification?.family ??
                  null) as VizFamily | null,
              );
              broadcastEvent(roomId, "visualization", { html: cleanHtml, meta });
            }
          } else {
            console.log(
              `[viz-orphan] Client disconnected during generation — saved to DB but skipping live broadcast (room=${roomId}, family=${resolvedFamily ?? classification?.family}, took=${Math.round(performance.now() - streamT0)}ms)`,
            );
          }
        }
        if (!clientDisconnected) {
          res.write(
            `data: ${JSON.stringify({ type: "done", html: cleanHtml, meta })}\n\n`,
          );
        }
      } else {
        if (!clientDisconnected) {
          res.write(
            `data: ${JSON.stringify({ type: "error", error: "Generated visualization was incomplete. Please try again." })}\n\n`,
          );
        }
      }

      req.log?.info({
        msg: "viz_perf",
        vizPerf: {
          ttHeadersMs,
          ttfcMs: firstChunkMs,
          ttDoneMs,
          ttTotalPrepPlusStreamMs: Math.round(performance.now() - vizPerfStart),
          qualityOk,
          vizModel: vizModel ?? "haiku",
          resolvedFamily: resolvedFamily ?? classification?.family ?? null,
          classifiedAmbiguous: classification?.ambiguous ?? null,
          userPickedType: !!userPickedType,
          incremental: !freshStart && !!effectivePreviousHtml,
          refinement: !!refinementDirective,
          roomId: roomId ?? null,
          workspaceDomain: workspaceDomain ?? null,
          transcriptWords: normalized.split(/\s+/).filter(Boolean).length,
          orphaned: clientDisconnected,
        },
      });
    } catch (err: any) {
      req.log.error({ err }, "Visualization generation failed");
      const status = err?.status ?? err?.statusCode;
      const isOverloaded = status === 529 || status === 503;
      const errorMsg = isOverloaded
        ? "AI-modellen er midlertidigt overbelastet. Prøv igen om et øjeblik."
        : "Visualization generation failed.";
      res.write(
        `data: ${JSON.stringify({ type: "error", error: errorMsg, retryable: isOverloaded })}\n\n`,
      );

      req.log?.info({
        msg: "viz_perf",
        vizPerf: {
          error: true,
          ttHeadersMs,
          ttfcMs: firstChunkMs,
          ttDoneMs: Math.round(performance.now() - streamT0),
          vizModel: vizModel ?? "haiku",
          roomId: roomId ?? null,
          retryable: isOverloaded,
        },
      });
    }

    res.end();
  } catch (err) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
      return;
    }
    next(err);
  }
});

// POST /api/viz/fill-tab-panels
const FillTabsSchema = z.object({
  transcript: z.string(),
  roomId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  tabs: z.array(z.object({ id: z.string(), label: z.string() })),
  workspaceDomain: z.string().optional().nullable(),
});

router.post("/viz/fill-tab-panels", async (req, res): Promise<void> => {
  const parsed = FillTabsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context, tabs, workspaceDomain } =
    parsed.data;

  if (!transcript.trim() && roomId) {
    const room = getRoom(roomId);
    if (room && room.segments.length > 0) {
      transcript = room.segments
        .map((s) => `[${s.speakerName}]: ${s.text}`)
        .join("\n");
    }
  }

  if (!transcript.trim()) {
    res.status(400).json({ error: "No transcript" });
    return;
  }

  try {
    const panels = await fillTabPanels(
      transcript,
      tabs,
      title,
      context,
      workspaceDomain,
    );
    res.json({ panels });
  } catch (err) {
    req.log.error({ err }, "fill-tab-panels failed");
    res.status(500).json({ error: "Failed to fill panels" });
  }
});

// POST /api/actions
const ActionsSchema = z.object({
  transcript: z.string(),
  roomId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  workspaceDomain: z.string().optional().nullable(),
  /** Slank debug/metadata fra seneste visualisering — til almen reasoning-forklaring */
  vizTrace: z.record(z.string(), z.unknown()).nullable().optional(),
});

router.post("/actions", async (req, res): Promise<void> => {
  const parsed = ActionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context, workspaceDomain, vizTrace } =
    parsed.data;

  if (!transcript.trim() && roomId) {
    const room = getRoom(roomId);
    if (room && room.segments.length > 0) {
      transcript = room.segments
        .map((s) => `[${s.speakerName}]: ${s.text}`)
        .join("\n");
    }
  }

  if (!transcript.trim()) {
    res.status(400).json({ error: "No transcript" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    for await (const chunk of streamReasoningNarrative(
      transcript,
      title,
      context,
      (c) =>
        res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`),
      workspaceDomain,
      vizTrace ?? null,
    )) {
      // chunks written in callback above
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "reasoning narrative failed");
    res.write(
      `data: ${JSON.stringify({ type: "error", error: "Failed to generate explanation" })}\n\n`,
    );
  }

  res.end();
});

export default router;
