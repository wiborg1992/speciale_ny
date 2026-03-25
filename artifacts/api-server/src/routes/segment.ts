import { Router, type IRouter } from "express";
import { PostSegmentBody, PostSegmentResponse } from "@workspace/api-zod";
import { addSegment, broadcastEvent } from "../lib/rooms.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/segment", async (req, res): Promise<void> => {
  const parsed = PostSegmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { roomId, speakerName, text, timestamp, isFinal } = parsed.data;

  // Use client-provided id if present (prevents SSE dedup failure when the
  // segment is broadcast back to the sender who already added it locally).
  const clientId = typeof req.body.id === "string" && req.body.id.length > 8
    ? req.body.id
    : null;
  const segmentId = clientId || randomUUID();

  const segment = {
    id: segmentId,
    speakerName,
    text,
    timestamp,
    isFinal,
  };

  addSegment(roomId, segment);

  if (isFinal) {
    broadcastEvent(roomId, "transcript_segment", segment);
  }

  res.json(PostSegmentResponse.parse({ ok: true, segmentId }));
});

export default router;
