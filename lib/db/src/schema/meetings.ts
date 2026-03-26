import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  roomId: text("room_id").notNull().unique(),
  title: text("title").default(""),
  language: text("language").default("da-DK"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  segmentCount: integer("segment_count").default(0).notNull(),
  wordCount: integer("word_count").default(0).notNull(),
  speakerNames: text("speaker_names").default("[]").notNull(),
});

export const segmentsTable = pgTable("segments", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetingsTable.id, { onDelete: "cascade" }).notNull(),
  segmentId: text("segment_id").notNull(),
  speakerName: text("speaker_name").notNull(),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isFinal: boolean("is_final").default(true).notNull(),
});

export const visualizationsTable = pgTable("visualizations", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetingsTable.id, { onDelete: "cascade" }).notNull(),
  html: text("html").notNull(),
  family: text("family").default("generic"),
  version: integer("version").default(1).notNull(),
  wordCount: integer("word_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;

export const insertSegmentSchema = createInsertSchema(segmentsTable).omit({ id: true });
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Segment = typeof segmentsTable.$inferSelect;

export const insertVisualizationSchema = createInsertSchema(visualizationsTable).omit({ id: true });
export type InsertVisualization = z.infer<typeof insertVisualizationSchema>;
export type Visualization = typeof visualizationsTable.$inferSelect;
