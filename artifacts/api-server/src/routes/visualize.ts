import { Router, type IRouter } from "express";
import { VisualizeBody } from "@workspace/api-zod";
import { normalizeTranscript, classifyTranscript } from "../lib/normalizer.js";
import { streamVisualization, isHtmlQualityOk } from "../lib/visualizer.js";
import { getRoom, broadcastEvent } from "../lib/rooms.js";

const router: IRouter = Router();

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;
const MAX_BODY_CHARS = 50_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

router.post("/visualize", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait before generating again." });
    return;
  }

  const parsed = VisualizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { transcript, previousHtml, roomId, speakerName } = parsed.data;

  if (transcript.length > MAX_BODY_CHARS) {
    res.status(400).json({ error: "Transcript too long." });
    return;
  }

  if (!transcript.trim()) {
    res.status(400).json({ error: "Transcript is empty." });
    return;
  }

  const normalized = normalizeTranscript(transcript);
  const family = classifyTranscript(normalized);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullHtml = "";

  try {
    for await (const chunk of streamVisualization(
      normalized,
      family,
      previousHtml ?? null,
      (c) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: c })}\n\n`);
      }
    )) {
      fullHtml += chunk;
    }

    const meta = {
      family,
      wordCount: normalized.split(/\s+/).filter(Boolean).length,
      incremental: !!previousHtml,
    };

    if (isHtmlQualityOk(fullHtml)) {
      if (roomId) {
        const room = getRoom(roomId);
        if (room) {
          room.lastVisualization = fullHtml;
          room.lastVizWordCount = meta.wordCount;
          broadcastEvent(roomId, "visualization", { html: fullHtml, meta });
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done", html: fullHtml, meta })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Generated visualization was incomplete. Please try again." })}\n\n`);
    }
  } catch (err) {
    req.log.error({ err }, "Visualization generation failed");
    res.write(`data: ${JSON.stringify({ type: "error", error: "Visualization generation failed." })}\n\n`);
  }

  res.end();
});

export default router;
