import { useState, useEffect, useCallback, useRef } from "react";
import type { TranscriptSegment } from "@workspace/api-client-react";

export interface VisualizationState {
  html: string | null;
  meta: {
    family?: string;
    wordCount?: number;
  } | null;
}

export function useRoomSSE(roomId: string | null) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [visualization, setVisualization] = useState<VisualizationState>({ html: null, meta: null });
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  
  // Use a ref to deduplicate segments quickly
  const segmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!roomId) return;

    setConnectionStatus("connecting");
    const speakerName = localStorage.getItem("meetingVisualizer_speakerName")?.replace(/^"(.+)"$/, "$1") || "Anonymous";
    const es = new EventSource(`/api/sse?room=${roomId}&name=${encodeURIComponent(speakerName)}`);

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
          setSegments(prev => [...prev, segment]);
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
          meta: data.meta || null
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
        const data = JSON.parse(e.data);
        if (data.segments && Array.isArray(data.segments)) {
          data.segments.forEach((seg: TranscriptSegment) => {
            if (!segmentIdsRef.current.has(seg.id)) {
              segmentIdsRef.current.add(seg.id);
            }
          });
          setSegments(data.segments);
        }
      } catch (err) {
        console.error("Failed to parse history", err);
      }
    });

    es.addEventListener("connected", (e) => {
      setConnectionStatus("connected");
    });

    return () => {
      es.close();
      setConnectionStatus("disconnected");
    };
  }, [roomId]);

  const addLocalSegment = useCallback((segment: TranscriptSegment) => {
    if (!segmentIdsRef.current.has(segment.id)) {
      segmentIdsRef.current.add(segment.id);
      setSegments(prev => [...prev, segment]);
    }
  }, []);

  return {
    segments,
    participants,
    visualization,
    connectionStatus,
    addLocalSegment
  };
}
