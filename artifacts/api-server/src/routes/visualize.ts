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
import { getRoom, broadcastEvent } from "../lib/rooms.js";

const router: IRouter = Router();

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 8;
const MAX_BODY_CHARS = 100_000;

/** Strip ```html ... ``` wrappers that models sometimes emit despite instructions */
function stripCodeFences(text: string): string {
  let t = text.trim();
  // Remove leading ```html or ```
  t = t.replace(/^```(?:html)?\s*\n?/, "");
  // Remove trailing ```
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

const VizModelEnum = z.enum(["haiku", "sonnet", "opus"]).optional().nullable();

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
});

router.post("/visualize", async (req, res): Promise<void> => {
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

  const { transcript, previousHtml, roomId, vizType, vizModel, title, context, freshStart } = parsed.data;

  if (transcript.length > MAX_BODY_CHARS) {
    res.status(400).json({ error: "Transcript too long." });
    return;
  }

  if (!transcript.trim()) {
    res.status(400).json({ error: "Transcript is empty." });
    return;
  }

  // Use room transcript if roomId provided
  let effectiveTranscript = transcript;
  if (roomId) {
    const room = getRoom(roomId);
    if (room && room.segments.length > 0) {
      effectiveTranscript = room.segments.map((s) => `[${s.speakerName}]: ${s.text}`).join("\n");
    }
  }

  const normalized = normalizeTranscript(effectiveTranscript);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullHtml = "";

  try {
    for await (const chunk of streamVisualization(
      {
        transcript: normalized,
        vizType,
        vizModel: vizModel as VizModel | null | undefined,
        title,
        context,
        previousHtml,
        freshStart,
        roomId,
      },
      (c) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`);
      }
    )) {
      fullHtml += chunk;
    }

    const meta = {
      vizType: vizType ?? "auto",
      vizModel: vizModel ?? "haiku",
      wordCount: normalized.split(/\s+/).filter(Boolean).length,
      incremental: !freshStart && !!previousHtml,
    };

    const cleanHtml = stripCodeFences(fullHtml);

    if (isHtmlQualityOk(cleanHtml)) {
      if (roomId) {
        const room = getRoom(roomId);
        if (room) {
          room.lastVisualization = cleanHtml;
          broadcastEvent(roomId, "visualization", { html: cleanHtml, meta });
        }
      }
      res.write(`data: ${JSON.stringify({ type: "done", html: cleanHtml, meta })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Generated visualization was incomplete. Please try again." })}\n\n`);
    }
  } catch (err) {
    req.log.error({ err }, "Visualization generation failed");
    res.write(`data: ${JSON.stringify({ type: "error", error: "Visualization generation failed." })}\n\n`);
  }

  res.end();
});

// POST /api/viz/fill-tab-panels — fills lazy HMI tab panels after first paint
const FillTabsSchema = z.object({
  transcript: z.string(),
  roomId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  tabs: z.array(z.object({ id: z.string(), label: z.string() })),
});

router.post("/viz/fill-tab-panels", async (req, res): Promise<void> => {
  const parsed = FillTabsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context, tabs } = parsed.data;

  if (roomId) {
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
    const panels = await fillTabPanels(transcript, tabs, title, context);
    res.json({ panels });
  } catch (err) {
    req.log.error({ err }, "fill-tab-panels failed");
    res.status(500).json({ error: "Failed to fill panels" });
  }
});

// POST /api/actions — extract decisions and action items
const ActionsSchema = z.object({
  transcript: z.string(),
  roomId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
});

router.post("/actions", async (req, res): Promise<void> => {
  const parsed = ActionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { transcript, roomId, title, context } = parsed.data;

  if (roomId) {
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
      (c) => res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`)
    )) {
      // chunks already written above
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "actions extraction failed");
    res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to extract actions" })}\n\n`);
  }

  res.end();
});

export default router;
