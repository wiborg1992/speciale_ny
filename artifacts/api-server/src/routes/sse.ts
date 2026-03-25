import { Router, type IRouter } from "express";
import {
  getOrCreateRoom,
  addClient,
  removeClient,
  addParticipant,
  removeParticipant,
  broadcastEvent,
  getMergedTranscript,
} from "../lib/rooms.js";

const router: IRouter = Router();

router.get("/sse", (req, res): void => {
  const roomId = (req.query.room as string) || "default";
  const participantName = (req.query.name as string) || "Anonymous";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addClient(roomId, res);
  addParticipant(roomId, participantName);

  const room = getOrCreateRoom(roomId);

  if (room.segments.length > 0) {
    const recentSegments = room.segments.slice(-20);
    res.write(
      `event: history\ndata: ${JSON.stringify({ segments: recentSegments })}\n\n`
    );
  }

  if (room.lastVisualization) {
    res.write(
      `event: visualization\ndata: ${JSON.stringify({
        html: room.lastVisualization,
        meta: { family: "general", wordCount: room.lastVizWordCount, incremental: false },
      })}\n\n`
    );
  }

  broadcastEvent(roomId, "participants", {
    participants: Array.from(room.participants.keys()),
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ roomId, participantName })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 15_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeClient(roomId, res);
    removeParticipant(roomId, participantName);
    broadcastEvent(roomId, "participants", {
      participants: Array.from((getOrCreateRoom(roomId)).participants.keys()),
    });
  });
});

export default router;
