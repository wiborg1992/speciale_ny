import { pgTable, text, serial, integer, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  provider: text("provider"),
  latencyMs: integer("latency_ms"),
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

export const sketchScenesTable = pgTable("sketch_scenes", {
  sketchId: varchar("sketch_id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetingsTable.roomId, { onDelete: "cascade" }),
  sceneJson: text("scene_json").notNull(),
  previewPngBase64: text("preview_png_base64").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sketchVizLinksTable = pgTable("sketch_viz_links", {
  id: serial("id").primaryKey(),
  sketchId: varchar("sketch_id")
    .notNull()
    .references(() => sketchScenesTable.sketchId, { onDelete: "cascade" }),
  vizVersion: integer("viz_version").notNull(),
  meetingId: text("meeting_id").notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
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

export type SketchScene = typeof sketchScenesTable.$inferSelect;
export type SketchVizLink = typeof sketchVizLinksTable.$inferSelect;
