import type { VizDebugInfo } from "@/types/viz-debug";

export type InputTab = "mic" | "paste" | "sketch";
export type OutputTab = "viz" | "actions" | "technical" | "transcript";

export interface VizVersion {
  version: number;
  name: string;
  html: string;
  timestamp: number;
  debugSnapshot?: VizDebugInfo | null;
}

export interface PasteHistoryEntry {
  id: string;
  savedAt: number;
  text: string;
}

/** Svar fra GET /api/meetings/:roomId (Drizzle → JSON). */
export interface PersistedMeetingApiPayload {
  meeting: { roomId: string; title: string | null };
  segments: Array<{
    segmentId: string;
    speakerName: string;
    text: string;
    timestamp: string;
    isFinal: boolean;
  }>;
  visualizations: Array<{
    version: number;
    html: string;
    family: string | null;
    wordCount: number;
    createdAt: string;
  }>;
}
