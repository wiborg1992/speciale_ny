import type { Response } from "express";

export interface TranscriptSegment {
  id: string;
  speakerName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface RoomState {
  roomId: string;
  createdAt: number;
  segments: TranscriptSegment[];
  clients: Set<Response>;
  participants: Map<string, number>;
  lastVisualization: string | null;
  lastVizWordCount: number;
  lastFamily: string | null;
}

const rooms = new Map<string, RoomState>();

export function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      createdAt: Date.now(),
      segments: [],
      clients: new Set(),
      participants: new Map(),
      lastVisualization: null,
      lastVizWordCount: 0,
      lastFamily: null,
    });
  }
  return rooms.get(roomId)!;
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function addClient(roomId: string, res: Response): void {
  const room = getOrCreateRoom(roomId);
  room.clients.add(res);
}

export function removeClient(roomId: string, res: Response): void {
  const room = rooms.get(roomId);
  if (room) {
    room.clients.delete(res);
  }
}

export function addParticipant(roomId: string, name: string): void {
  const room = getOrCreateRoom(roomId);
  room.participants.set(name, Date.now());
}

export function removeParticipant(roomId: string, name: string): void {
  const room = rooms.get(roomId);
  if (room) {
    room.participants.delete(name);
  }
}

export function broadcastEvent(
  roomId: string,
  eventType: string,
  data: unknown,
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of room.clients) {
    try {
      client.write(payload);
    } catch {}
  }
}

export function addSegment(roomId: string, segment: TranscriptSegment): void {
  const room = getOrCreateRoom(roomId);
  room.segments.push(segment);

  if (room.segments.length > 1000) {
    room.segments.splice(0, room.segments.length - 1000);
  }
}

export function getAllRooms(): RoomState[] {
  return Array.from(rooms.values());
}

export function getMergedTranscript(roomId: string): string {
  const room = rooms.get(roomId);
  if (!room) return "";
  return room.segments
    .filter((s) => s.isFinal)
    .map((s) => `[${s.speakerName}]: ${s.text}`)
    .join("\n");
}

/**
 * Returnerer de seneste segmenter inden for et tidsvindue (ms fra nu).
 * Bruges til timestamp-baseret "latestChunk" til klassifikatoren —
 * mere præcis end tegn-baserede zoner ved varierende taletempo.
 */
export function getRecentSegments(
  roomId: string,
  windowMs: number,
): TranscriptSegment[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const cutoff = Date.now() - windowMs;
  return room.segments.filter((s) => s.isFinal && s.timestamp >= cutoff);
}
