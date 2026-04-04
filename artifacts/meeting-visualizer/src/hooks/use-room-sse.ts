import { useState, useEffect, useCallback, useRef } from "react";
import type { TranscriptSegment } from "@workspace/api-client-react";

export interface VisualizationState {
  html: string | null;
  meta: {
    family?: string;
    wordCount?: number;
  } | null;
}

function mergeSegmentsById(
  prev: TranscriptSegment[],
  incoming: TranscriptSegment[],
): TranscriptSegment[] {
  const map = new Map<string, TranscriptSegment>();
  for (const s of prev) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function rebuildSegmentIdSet(segments: TranscriptSegment[]) {
  const set = new Set<string>();
  for (const s of segments) set.add(s.id);
  return set;
}

export function useRoomSSE(roomId: string | null) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [visualization, setVisualization] = useState<VisualizationState>({
    html: null,
    meta: null,
  });
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const segmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!roomId) return;

    segmentIdsRef.current.clear();
    setSegments([]);
    setVisualization({ html: null, meta: null });
    setParticipants([]);

    setConnectionStatus("connecting");
    const speakerName =
      localStorage.getItem("meetingVisualizer_speakerName")?.replace(
        /^"(.+)"$/,
        "$1",
      ) || "Anonymous";
    const es = new EventSource(
      `/api/sse?room=${roomId}&name=${encodeURIComponent(speakerName)}`,
    );

    es.onopen = () => {
      setConnectionStatus("connected");
    };

    es.onerror = () => {
      setConnectionStatus("disconnected");
    };

    es.addEventListener("transcript_segment", (e) => {
      try {
        const segment = JSON.parse(e.data) as TranscriptSegment;
        if (!segmentIdsRef.current.has(segment.id)) {
          segmentIdsRef.current.add(segment.id);
          setSegments((prev) => mergeSegmentsById(prev, [segment]));
        }
      } catch (err) {
        console.error("Failed to parse transcript_segment", err);
      }
    });

    es.addEventListener("visualization", (e) => {
      try {
        const data = JSON.parse(e.data);
        setVisualization({
          html: data.html,
          meta: data.meta || null,
        });
      } catch (err) {
        console.error("Failed to parse visualization", err);
      }
    });

    es.addEventListener("participants", (e) => {
      try {
        const data = JSON.parse(e.data);
        setParticipants(data.participants || []);
      } catch (err) {
        console.error("Failed to parse participants", err);
      }
    });

    es.addEventListener("history", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          segments?: TranscriptSegment[];
          truncated?: number;
        };
        if (data.segments && Array.isArray(data.segments)) {
          setSegments((prev) => {
            const merged = mergeSegmentsById(prev, data.segments!);
            segmentIdsRef.current = rebuildSegmentIdSet(merged);
            return merged;
          });
        }
      } catch (err) {
        console.error("Failed to parse history", err);
      }
    });

    es.addEventListener("connected", () => {
      setConnectionStatus("connected");
    });

    es.addEventListener("transcript_cleared", () => {
      segmentIdsRef.current.clear();
      setSegments([]);
    });

    return () => {
      es.close();
      setConnectionStatus("disconnected");
    };
  }, [roomId]);

  const clearSegmentsLocally = useCallback(() => {
    segmentIdsRef.current.clear();
    setSegments([]);
  }, []);

  const addLocalSegment = useCallback((segment: TranscriptSegment) => {
    if (!segmentIdsRef.current.has(segment.id)) {
      segmentIdsRef.current.add(segment.id);
      setSegments((prev) => mergeSegmentsById(prev, [segment]));
    }
  }, []);

  /** Merge DB-/API-segmenter ind (fx GET /api/meetings/:roomId). */
  const applyPersistedSegments = useCallback((incoming: TranscriptSegment[]) => {
    setSegments((prev) => {
      const merged = mergeSegmentsById(prev, incoming);
      segmentIdsRef.current = rebuildSegmentIdSet(merged);
      return merged;
    });
  }, []);

  return {
    segments,
    participants,
    visualization,
    connectionStatus,
    addLocalSegment,
    applyPersistedSegments,
    clearSegmentsLocally,
  };
}
