import { Router, type IRouter } from "express";
import { getAllRooms } from "../lib/rooms.js";

const router: IRouter = Router();

router.get("/history", (_req, res): void => {
  const rooms = getAllRooms();

  const meetings = rooms.map((room) => ({
    id: room.roomId,
    roomId: room.roomId,
    createdAt: room.createdAt,
    segments: room.segments,
    lastVisualization: room.lastVisualization,
  }));

  res.json({ meetings });
});

export default router;
