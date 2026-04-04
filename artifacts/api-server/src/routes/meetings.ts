import { Router, type IRouter } from "express";
import {
  listMeetings,
  getMeetingByRoom,
  deleteMeeting,
  updateMeetingTitle,
  clearMeetingTranscript,
} from "../lib/meeting-store.js";
import { clearRoomSegments, broadcastEvent } from "../lib/rooms.js";

const router: IRouter = Router();

router.get("/meetings", async (_req, res): Promise<void> => {
  try {
    const meetings = await listMeetings(50);
    res.json({ meetings });
  } catch (err) {
    console.error("Failed to list meetings:", err);
    const msg = err instanceof Error ? err.message : String(err);
    // 200 så forsidens React Query ikke bryder sammen; klient kan vise tom liste + advarsel.
    res.status(200).json({
      meetings: [],
      dbUnavailable: true,
      dbMessage: msg,
      dbHint:
        "Tjek at PostgreSQL kører, DATABASE_URL i .env er korrekt, og kør: pnpm --filter @workspace/db push",
    });
  }
});

router.get("/meetings/:roomId", async (req, res): Promise<void> => {
  try {
    const { roomId } = req.params;
    const data = await getMeetingByRoom(roomId);
    if (!data) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error("Failed to load meeting:", err);
    res.status(500).json({ error: "Failed to load meeting" });
  }
});

router.patch("/meetings/:roomId", async (req, res): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { title } = req.body;
    if (typeof title === "string") {
      await updateMeetingTitle(roomId, title);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to update meeting:", err);
    res.status(500).json({ error: "Failed to update meeting" });
  }
});

router.post("/meetings/:roomId/clear-transcript", async (req, res): Promise<void> => {
  try {
    const { roomId } = req.params;
    await clearMeetingTranscript(roomId);
    clearRoomSegments(roomId);
    broadcastEvent(roomId, "transcript_cleared", { ok: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to clear transcript:", err);
    res.status(500).json({ error: "Failed to clear transcript" });
  }
});

router.delete("/meetings/:roomId", async (req, res): Promise<void> => {
  try {
    const { roomId } = req.params;
    const deleted = await deleteMeeting(roomId);
    if (!deleted) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete meeting:", err);
    res.status(500).json({ error: "Failed to delete meeting" });
  }
});

export default router;
