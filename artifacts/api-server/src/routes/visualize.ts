import { Router, type IRouter } from "express";
import { z } from "zod";
import { normalizeTranscript } from "../lib/normalizer.js";
import {
  streamVisualization,
  fillTabPanels,
  streamActions,
  isHtmlQualityOk,
  type VizModel,
} from "../lib/visualizer.js";
import {
  classifyVisualizationIntent,
  VIZ_FAMILY_LABEL,
  type VizFamily,
} from "../lib/classifier.js";
import { getRoom, broadcastEvent } from "../lib/rooms.js";
import { saveVisualization, updateMeetingTitle } from "../lib/meeting-store.js";
import { detectRefinementIntent } from "../lib/refinement-detector.js";
import {
  evaluateVisualizationInput,
  MIN_WORDS_FOR_VISUALIZATION,
} from "../lib/transcript-quality.js";

const router: IRouter = Router();

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX    = 28;   // matches reference server
const MAX_BODY_CHARS    = 100_000;

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

const VizModelEnum = z.enum(["haiku", "sonnet", "opus", "gemini-flash", "gemini-pro"]).optional().nullable();

const VisualizeBodySchema = z.object({
  transcript:   z.string(),
  previousHtml: z.string().optional().nullable(),
  roomId:       z.string().optional().nullable(),
  speakerName:  z.string().optional().nullable(),
  vizType:      z.string().optional().nullable(),
  vizModel:     VizModelEnum,
  title:        z.string().optional().nullable(),
  context:      z.string().optional().nullable(),
  freshStart:   z.boolean().optional(),
  /** grundfos | gabriel | generic (aliases: neutral, other → generic) */
  workspaceDomain: z.string().optional().nullable(),
  /** "Speaker: text" of the specific segment the user clicked to trigger this generation */
  focusSegment: z.string().optional().nullable(),
});

router.post("/visualize", async (req, res, next): Promise<void> => {
  try {
  const ip = req.ip ?? "unknown";

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait before generating again." });
    return;
  }

  const parsed = VisualizeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { transcript, previousHtml, roomId, vizType, vizModel, title, context, freshStart, workspaceDomain, focusSegment } =
    parsed.data;

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
      effectiveTranscript = room.segments.map((s) => `[${s.speakerName}]: ${s.text}`).join("\n");
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
    const hasPreviousViz = !!(effectivePreviousHtml || room?.lastVisualization);
    const refinement = detectRefinementIntent(normalized, hasPreviousViz);

    if (refinement.detected && refinement.directive) {
      refinementDirective = refinement.directive;
      if (!effectivePreviousHtml && room?.lastVisualization) {
        effectivePreviousHtml = room.lastVisualization;
      }
      console.log(
        `[refinement] Detected in room ${roomId} (${refinement.confidence}):`,
        refinement.phrases.join(" | ")
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
  const CLASSIFY_TAIL_WORDS = 150;
  const userPickedType = vizType && vizType !== "auto";

  let classificationInput: string;
  if (focusSegment) {
    classificationInput = focusSegment;
  } else {
    const words = normalized.split(/\s+/);
    classificationInput = words.length > CLASSIFY_TAIL_WORDS
      ? words.slice(-CLASSIFY_TAIL_WORDS).join(" ")
      : normalized;
  }

  const classification = userPickedType
    ? null
    : classifyVisualizationIntent(classificationInput, workspaceDomain);

  if (classification) {
    const totalWords = normalized.split(/\s+/).filter(Boolean).length;
    const classifyWords = classificationInput.split(/\s+/).filter(Boolean).length;
    console.log(
      `[classify] Input: ${classifyWords}/${totalWords} words (${focusSegment ? "focusSegment" : "tail"}) → ${classification.family} (lead=${classification.lead}, ambiguous=${classification.ambiguous})`
    );
  }

  // Resolve the effective family to inject into the prompt
  let resolvedFamily: VizFamily | null = null;
  if (userPickedType) {
    // Map frontend vizType values → family ids
    const typeToFamily: Record<string, VizFamily> = {
      "hmi":          "hmi_interface",
      "journey":      "user_journey",
      "workflow":     "workflow_process",
      "product":      "physical_product",
      "requirements": "requirements_matrix",
      "management":   "management_summary",
      "kanban":       "management_summary",
      "decisions":    "management_summary",
      "timeline":     "management_summary",
      "persona":      "persona_research",
      "research":     "persona_research",
      "empathy":      "persona_research",
      "blueprint":    "service_blueprint",
      "architecture": "service_blueprint",
      "sitemap":      "service_blueprint",
      "stakeholders": "service_blueprint",
      "comparison":   "comparison_evaluation",
      "evaluation":   "comparison_evaluation",
      "swot":         "comparison_evaluation",
      "scorecard":    "comparison_evaluation",
      "designsystem": "design_system",
      "styleguide":   "design_system",
      "components":   "design_system",
    };
    resolvedFamily = typeToFamily[vizType!] ?? null;
  } else if (classification && !classification.ambiguous) {
    resolvedFamily = classification.family;
  }

  // ─── Topic-shift detection ─────────────────────────────────────────────────
  // When the classified family CHANGES from the previous visualization's family,
  // force a fresh start — don't try to incrementally update a user_journey into
  // a physical_product, etc. This prevents the most common topic-shift failure.
  if (resolvedFamily && roomId && !freshStart && !refinementDirective) {
    const room = getRoom(roomId);
    if (room?.lastFamily && room.lastFamily !== resolvedFamily) {
      console.log(
        `[topic-shift] Family changed: ${room.lastFamily} → ${resolvedFamily} in room ${roomId} — forcing fresh visualization`
      );
      effectivePreviousHtml = undefined;
    }
  }

  const vizPerfStart = performance.now();

  const vizQuality = evaluateVisualizationInput(normalized, {
    bypassForRefinement: !!refinementDirective,
    userPickedVisualizationType: !!userPickedType,
  });
  if (!vizQuality.ok) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        type: "skipped",
        reason: vizQuality.reason,
        wordCount: vizQuality.wordCount,
        minWords: MIN_WORDS_FOR_VISUALIZATION,
        hint:
          "For lidt indhold til visualisering. Fortsæt samtalen, eller vælg en fast visualization-type (ikke Auto).",
      })}\n\n`
    );
    res.end();
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

  const streamT0 = performance.now();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const ttHeadersMs = Math.round(performance.now() - streamT0);

  if (classification) {
    res.write(
      `data: ${JSON.stringify({
        type: "meta",
        classification: {
          family:   classification.family,
          topic:    classification.topic,
          ambiguous: classification.ambiguous,
          lead:     classification.lead,
          scores:   classification.scores.slice(0, 4),
        },
        refinement: refinementDirective ? { detected: true, directive: refinementDirective } : null,
      })}\n\n`
    );
  } else if (refinementDirective) {
    res.write(
      `data: ${JSON.stringify({
        type: "meta",
        refinement: { detected: true, directive: refinementDirective },
      })}\n\n`
    );
  }

  let fullHtml = "";
  let firstChunkMs: number | null = null;

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
      },
      (c) => {
        if (firstChunkMs == null) firstChunkMs = Math.round(performance.now() - streamT0);
        res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`);
      }
    )) {
      fullHtml += chunk;
    }

    const ttDoneMs = Math.round(performance.now() - streamT0);

    const meta = {
      vizType:         vizType ?? "auto",
      vizModel:        vizModel ?? "haiku",
      wordCount:       normalized.split(/\s+/).filter(Boolean).length,
      incremental:     !freshStart && !!effectivePreviousHtml,
      classifiedFamily: resolvedFamily ?? classification?.family ?? null,
      refinement:      refinementDirective ? true : false,
      workspaceDomain: workspaceDomain ?? null,
    };

    const cleanHtml = stripCodeFences(fullHtml);
    const qualityOk = isHtmlQualityOk(cleanHtml);

    if (qualityOk) {
      if (roomId) {
        const room = getRoom(roomId);
        if (room) {
          room.lastVisualization = cleanHtml;
          room.lastFamily = resolvedFamily ?? classification?.family ?? null;
          broadcastEvent(roomId, "visualization", { html: cleanHtml, meta });
        }
        saveVisualization(
          roomId,
          cleanHtml,
          resolvedFamily ?? classification?.family ?? "generic",
          meta.wordCount
        ).catch(() => {});
        if (title) {
          updateMeetingTitle(roomId, title).catch(() => {});
        }
      }
      res.write(`data: ${JSON.stringify({ type: "done", html: cleanHtml, meta })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Generated visualization was incomplete. Please try again." })}\n\n`);
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
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "Visualization generation failed");
    const status = err?.status ?? err?.statusCode;
    const isOverloaded = status === 529 || status === 503;
    const errorMsg = isOverloaded
      ? "AI-modellen er midlertidigt overbelastet. Prøv igen om et øjeblik."
      : "Visualization generation failed.";
    res.write(`data: ${JSON.stringify({ type: "error", error: errorMsg, retryable: isOverloaded })}\n\n`);

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
  roomId:     z.string().optional().nullable(),
  title:      z.string().optional().nullable(),
  context:    z.string().optional().nullable(),
  tabs:       z.array(z.object({ id: z.string(), label: z.string() })),
  workspaceDomain: z.string().optional().nullable(),
});

router.post("/viz/fill-tab-panels", async (req, res): Promise<void> => {
  const parsed = FillTabsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context, tabs, workspaceDomain } = parsed.data;

  if (!transcript.trim() && roomId) {
    const room = getRoom(roomId);
    if (room && room.segments.length > 0) {
      transcript = room.segments.map((s) => `[${s.speakerName}]: ${s.text}`).join("\n");
    }
  }

  if (!transcript.trim()) {
    res.status(400).json({ error: "No transcript" });
    return;
  }

  try {
    const panels = await fillTabPanels(transcript, tabs, title, context, workspaceDomain);
    res.json({ panels });
  } catch (err) {
    req.log.error({ err }, "fill-tab-panels failed");
    res.status(500).json({ error: "Failed to fill panels" });
  }
});

// POST /api/actions
const ActionsSchema = z.object({
  transcript: z.string(),
  roomId:     z.string().optional().nullable(),
  title:      z.string().optional().nullable(),
  context:    z.string().optional().nullable(),
  workspaceDomain: z.string().optional().nullable(),
});

router.post("/actions", async (req, res): Promise<void> => {
  const parsed = ActionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context, workspaceDomain } = parsed.data;

  if (!transcript.trim() && roomId) {
    const room = getRoom(roomId);
    if (room && room.segments.length > 0) {
      transcript = room.segments.map((s) => `[${s.speakerName}]: ${s.text}`).join("\n");
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
    for await (const chunk of streamActions(
      transcript,
      title,
      context,
      (c) => res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`),
      workspaceDomain
    )) {
      // chunks written in callback above
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "actions extraction failed");
    res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to extract actions" })}\n\n`);
  }

  res.end();
});

export default router;
