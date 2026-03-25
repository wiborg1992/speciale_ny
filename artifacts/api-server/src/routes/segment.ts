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

  const segmentId = randomUUID();

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
