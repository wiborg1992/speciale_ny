import { db } from "@workspace/db";
import {
  meetingsTable,
  segmentsTable,
  visualizationsTable,
  sketchScenesTable,
  sketchVizLinksTable,
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
    provider?: string;
    latencyMs?: number;
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
      provider: segment.provider ?? null,
      latencyMs: segment.latencyMs ?? null,
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
): Promise<number | null> {
  try {
    const meeting = await getOrCreateMeeting(roomId);
    if (!meeting || !db) return null;

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

    return nextVersion;
  } catch (err) {
    console.error("Failed to persist visualization:", err);
    return null;
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

export type SessionContextData = {
  purpose: string;
  projects: string;
  attendees: string;
  extra: string;
  files: { name: string; content: string }[];
};

export async function getMeetingContextData(roomId: string): Promise<SessionContextData | null> {
  if (!db) return null;
  const rows = await db
    .select({ contextData: meetingsTable.contextData })
    .from(meetingsTable)
    .where(eq(meetingsTable.roomId, roomId))
    .limit(1);
  if (!rows.length || !rows[0].contextData) return null;
  try {
    return JSON.parse(rows[0].contextData) as SessionContextData;
  } catch {
    return null;
  }
}

export async function updateMeetingContextData(roomId: string, data: SessionContextData) {
  if (!db) return;
  try {
    await db
      .update(meetingsTable)
      .set({ contextData: JSON.stringify(data), updatedAt: new Date() })
      .where(eq(meetingsTable.roomId, roomId));
  } catch (err) {
    console.error("Failed to update meeting context data:", err);
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

  const sketches = await db
    .select()
    .from(sketchScenesTable)
    .where(eq(sketchScenesTable.meetingId, roomId))
    .orderBy(sketchScenesTable.createdAt);

  return { meeting, segments, visualizations, sketches };
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

/** Gem en ny skitse-scene og returnér det autogenererede sketchId. */
export async function saveSketch(
  roomId: string,
  sceneJson: string,
  previewPngBase64: string,
): Promise<string | null> {
  if (!db) return null;
  try {
    const [row] = await db
      .insert(sketchScenesTable)
      .values({ meetingId: roomId, sceneJson, previewPngBase64 })
      .returning({ sketchId: sketchScenesTable.sketchId });
    return row?.sketchId ?? null;
  } catch (err) {
    console.error("Failed to save sketch:", err);
    return null;
  }
}

/** Hent en skitse-scene fra DB. */
export async function getSketchById(
  sketchId: string,
): Promise<{ sceneJson: string; previewPngBase64: string; meetingId: string } | null> {
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(sketchScenesTable)
      .where(eq(sketchScenesTable.sketchId, sketchId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { sceneJson: r.sceneJson, previewPngBase64: r.previewPngBase64, meetingId: r.meetingId };
  } catch (err) {
    console.error("Failed to get sketch:", err);
    return null;
  }
}

/** Link et sketchId til en viz-version (indsættes kun efter vellydende persist). */
export async function linkSketchToViz(
  sketchId: string,
  vizVersion: number,
  meetingId: string,
): Promise<void> {
  if (!db) return;
  try {
    await db
      .insert(sketchVizLinksTable)
      .values({ sketchId, vizVersion, meetingId });
  } catch (err) {
    console.error("Failed to link sketch to viz:", err);
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

/** Return a room's transcript as formatted text, truncated to 3000 words. */
export async function getMeetingTranscript(roomId: string): Promise<{
  title: string;
  roomId: string;
  createdAt: Date;
  wordCount: number;
  transcript: string;
  lastVisualization: string | null;
} | null> {
  if (!db) return null;

  const meetings = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.roomId, roomId))
    .limit(1);

  if (meetings.length === 0) return null;
  const meeting = meetings[0];

  const [segments, latestViz] = await Promise.all([
    db
      .select()
      .from(segmentsTable)
      .where(eq(segmentsTable.meetingId, meeting.id))
      .orderBy(segmentsTable.timestamp),
    db
      .select({ html: visualizationsTable.html })
      .from(visualizationsTable)
      .where(eq(visualizationsTable.meetingId, meeting.id))
      .orderBy(desc(visualizationsTable.version))
      .limit(1),
  ]);

  const MAX_WORDS = 3000;
  const formattedLines = segments.map((s) => `[${s.speakerName}]: ${s.text}`);

  let wordsSeen = 0;
  const keptLines: string[] = [];
  let wasTruncated = false;

  for (const line of formattedLines) {
    const lineWords = line.split(/\s+/).filter(Boolean);
    if (wordsSeen + lineWords.length > MAX_WORDS) {
      const remaining = MAX_WORDS - wordsSeen;
      if (remaining > 0) {
        keptLines.push(lineWords.slice(0, remaining).join(" ") + "…");
      }
      wasTruncated = true;
      break;
    }
    keptLines.push(line);
    wordsSeen += lineWords.length;
  }

  const transcript =
    keptLines.join("\n") + (wasTruncated ? "\n[...transskript afkortet]" : "");

  return {
    title: meeting.title || roomId,
    roomId: meeting.roomId,
    createdAt: meeting.createdAt,
    wordCount: meeting.wordCount,
    transcript,
    lastVisualization: latestViz[0]?.html ?? null,
  };
}
