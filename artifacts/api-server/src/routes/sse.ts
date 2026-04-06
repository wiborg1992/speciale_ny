import { Router, type IRouter } from "express";
import {
  getOrCreateRoom,
  addClient,
  removeClient,
  addParticipant,
  removeParticipant,
  broadcastEvent,
  addSegment,
} from "../lib/rooms.js";
import { getMeetingByRoom } from "../lib/meeting-store.js";

const router: IRouter = Router();

/** Én delt DB-hydrering pr. room — undgår at faner der forbinder samtidig springer load over. */
const roomHydrationInflight = new Map<string, Promise<void>>();

/** Undgå gigantiske SSE-payloads; fuld historik kan stadig hentes via GET /api/meetings/:roomId. */
const MAX_SSE_HISTORY_SEGMENTS = 10_000;

function getRoomDbHydrationPromise(roomId: string): Promise<void> {
  const existing = roomHydrationInflight.get(roomId);
  if (existing) return existing;

  // Skip if the room is already fully hydrated (has both segments and a visualization)
  const room = getOrCreateRoom(roomId);
  if (room.segments.length > 0 && room.lastVisualization) {
    return Promise.resolve();
  }

  const p = (async () => {
    try {
      const dbData = await getMeetingByRoom(roomId);
      if (!dbData) return;

      const r = getOrCreateRoom(roomId);

      // Load segments if not already in memory
      if (dbData.segments.length > 0 && r.segments.length === 0) {
        for (const seg of dbData.segments) {
          addSegment(roomId, {
            id: seg.segmentId,
            speakerName: seg.speakerName,
            text: seg.text,
            timestamp: new Date(seg.timestamp).getTime(),
            isFinal: seg.isFinal,
          });
        }
      }

      // Always load the latest visualization into memory so new SSE clients
      // get it immediately — even for paste-only sessions with no segments.
      if (dbData.visualizations.length > 0 && !r.lastVisualization) {
        const latest = dbData.visualizations[dbData.visualizations.length - 1];
        r.lastVisualization = latest.html;
        r.lastVizWordCount = latest.wordCount;
        r.lastFamily = (latest as { family?: string | null }).family ?? null;
      }
    } catch (err) {
      console.error("Failed to load meeting from DB:", err);
    } finally {
      roomHydrationInflight.delete(roomId);
    }
  })();

  roomHydrationInflight.set(roomId, p);
  return p;
}

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

    await getRoomDbHydrationPromise(roomId);
    const room = getOrCreateRoom(roomId);

    if (room.segments.length > 0) {
      const segmentsForWire =
        room.segments.length > MAX_SSE_HISTORY_SEGMENTS
          ? room.segments.slice(-MAX_SSE_HISTORY_SEGMENTS)
          : room.segments;
      res.write(
        `event: history\ndata: ${JSON.stringify({
          segments: segmentsForWire,
          truncated:
            room.segments.length > MAX_SSE_HISTORY_SEGMENTS
              ? room.segments.length - MAX_SSE_HISTORY_SEGMENTS
              : 0,
        })}\n\n`,
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
