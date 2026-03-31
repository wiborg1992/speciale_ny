import { Router, type IRouter } from "express";
import {
  getOrCreateRoom,
  addClient,
  removeClient,
  addParticipant,
  removeParticipant,
  broadcastEvent,
  getMergedTranscript,
  addSegment,
} from "../lib/rooms.js";
import { getMeetingByRoom } from "../lib/meeting-store.js";

const router: IRouter = Router();

const hydrating = new Set<string>();

router.get("/sse", async (req, res): Promise<void> => {
  const roomId = (req.query.room as string) || "default";
  const participantName = (req.query.name as string) || "Anonymous";

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    addClient(roomId, res);
    addParticipant(roomId, participantName);

    const room = getOrCreateRoom(roomId);

    if (room.segments.length === 0 && !hydrating.has(roomId)) {
      hydrating.add(roomId);
      try {
        const dbData = await getMeetingByRoom(roomId);
        if (dbData && dbData.segments.length > 0) {
          for (const seg of dbData.segments) {
            addSegment(roomId, {
              id: seg.segmentId,
              speakerName: seg.speakerName,
              text: seg.text,
              timestamp: new Date(seg.timestamp).getTime(),
              isFinal: seg.isFinal,
            });
          }
          if (dbData.visualizations.length > 0) {
            room.lastVisualization = dbData.visualizations[0].html;
            room.lastVizWordCount = dbData.visualizations[0].wordCount;
            room.lastFamily = (dbData.visualizations[0] as any).family ?? null;
          }
        }
      } catch (err) {
        console.error("Failed to load meeting from DB:", err);
      } finally {
        hydrating.delete(roomId);
      }
    }

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
  } catch (err) {
    console.error("SSE handler failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Kunne ikke starte live-forbindelsen.",
        hint: "Tjek api-server logs; ofte PostgreSQL/DATABASE_URL ved første DB-kald.",
      });
    }
  }
});

export default router;
