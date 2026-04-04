import { db } from "@workspace/db";
import {
  meetingsTable,
  segmentsTable,
  visualizationsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/** Max antal gemte visualiseringer der returneres pr. møde (API + SSE-hydrering). */
export const MAX_VISUALIZATIONS_PER_MEETING = 100;

export async function getOrCreateMeeting(roomId: string, title?: string) {
  if (!db) return undefined;

  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      roomId,
      title: title || "",
      speakerNames: "[]",
    })
    .onConflictDoNothing({ target: meetingsTable.roomId })
    .returning();

  if (meeting) return meeting;

  const existing = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.roomId, roomId))
    .limit(1);

  return existing[0];
}

export async function saveSegment(
  roomId: string,
  segment: {
    id: string;
    speakerName: string;
    text: string;
    timestamp: number;
    isFinal: boolean;
  }
) {
  try {
    const meeting = await getOrCreateMeeting(roomId);
    if (!meeting || !db) return;

    await db.insert(segmentsTable).values({
      meetingId: meeting.id,
      segmentId: segment.id,
      speakerName: segment.speakerName,
      text: segment.text,
      timestamp: new Date(segment.timestamp),
      isFinal: segment.isFinal,
    });

    const segmentWords = segment.text.split(/\s+/).filter(Boolean).length;

    await db
      .update(meetingsTable)
      .set({
        segmentCount: sql`${meetingsTable.segmentCount} + 1`,
        wordCount: sql`${meetingsTable.wordCount} + ${segmentWords}`,
        speakerNames: sql`
          CASE
            WHEN ${meetingsTable.speakerNames}::jsonb ? ${segment.speakerName}
            THEN ${meetingsTable.speakerNames}
            ELSE (${meetingsTable.speakerNames}::jsonb || ${JSON.stringify([segment.speakerName])}::jsonb)::text
          END
        `,
        updatedAt: new Date(),
      })
      .where(eq(meetingsTable.id, meeting.id));
  } catch (err) {
    console.error("Failed to persist segment:", err);
  }
}

export async function saveVisualization(
  roomId: string,
  html: string,
  family: string,
  wordCount: number
) {
  try {
    const meeting = await getOrCreateMeeting(roomId);
    if (!meeting || !db) return;

    const existingViz = await db
      .select()
      .from(visualizationsTable)
      .where(eq(visualizationsTable.meetingId, meeting.id))
      .orderBy(desc(visualizationsTable.version))
      .limit(1);

    const nextVersion = existingViz.length > 0 ? existingViz[0].version + 1 : 1;

    await db.insert(visualizationsTable).values({
      meetingId: meeting.id,
      html,
      family: family || "generic",
      version: nextVersion,
      wordCount,
    });

    await db
      .update(meetingsTable)
      .set({ updatedAt: new Date() })
      .where(eq(meetingsTable.id, meeting.id));
  } catch (err) {
    console.error("Failed to persist visualization:", err);
  }
}

export async function updateMeetingTitle(roomId: string, title: string) {
  if (!db) return;
  try {
    await db
      .update(meetingsTable)
      .set({ title, updatedAt: new Date() })
      .where(eq(meetingsTable.roomId, roomId));
  } catch (err) {
    console.error("Failed to update meeting title:", err);
  }
}

export async function listMeetings(limit = 50) {
  if (!db) return [];
  return db
    .select()
    .from(meetingsTable)
    .orderBy(desc(meetingsTable.updatedAt))
    .limit(limit);
}

export async function getMeetingByRoom(roomId: string) {
  if (!db) return null;

  const meetings = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.roomId, roomId))
    .limit(1);

  if (meetings.length === 0) return null;

  const meeting = meetings[0];

  const segments = await db
    .select()
    .from(segmentsTable)
    .where(eq(segmentsTable.meetingId, meeting.id))
    .orderBy(segmentsTable.timestamp);

  const visualizationsDesc = await db
    .select()
    .from(visualizationsTable)
    .where(eq(visualizationsTable.meetingId, meeting.id))
    .orderBy(desc(visualizationsTable.version))
    .limit(MAX_VISUALIZATIONS_PER_MEETING);

  /** Kronologisk (ældst → nyest) til UI og så `at(-1)` er seneste. */
  const visualizations = [...visualizationsDesc].reverse();

  return { meeting, segments, visualizations };
}

/** Slet alle segmenter for mødet og nulstil tællere (visualiseringer bevares). */
export async function clearMeetingTranscript(roomId: string): Promise<void> {
  if (!db) return;
  try {
    const meetings = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.roomId, roomId))
      .limit(1);
    if (meetings.length === 0) return;
    const meeting = meetings[0];
    await db
      .delete(segmentsTable)
      .where(eq(segmentsTable.meetingId, meeting.id));
    await db
      .update(meetingsTable)
      .set({
        segmentCount: 0,
        wordCount: 0,
        speakerNames: "[]",
        updatedAt: new Date(),
      })
      .where(eq(meetingsTable.id, meeting.id));
  } catch (err) {
    console.error("Failed to clear meeting transcript:", err);
  }
}

export async function deleteMeeting(roomId: string) {
  if (!db) return false;
  const result = await db
    .delete(meetingsTable)
    .where(eq(meetingsTable.roomId, roomId))
    .returning({ id: meetingsTable.id });

  return result.length > 0;
}
