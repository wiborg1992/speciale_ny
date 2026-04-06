import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Users,
  Code2,
  Play,
  Pencil,
  Check,
  RefreshCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wand2,
  Download,
  Maximize2,
  RotateCcw,
  History,
  FileText,
  Upload,
  X,
  NotebookText,
  Square,
  BrainCircuit,
  PenLine,
} from "lucide-react";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

import { cn } from "@/lib/utils";
import {
  passesVisualizationWordGate,
  MIN_WORDS_FOR_VISUALIZATION,
} from "@/lib/viz-gate";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSpeech } from "@/hooks/use-speech";
import { useDeepgramSpeech } from "@/hooks/use-deepgram-speech";
import { useRoomSSE } from "@/hooks/use-room-sse";
import {
  useVisualizeStream,
  type VisualizeRequestWithIntent,
} from "@/hooks/use-visualize-stream";
import type { VizDebugInfo } from "@/types/viz-debug";
import type { NeedIntentPayload } from "@/types/need-intent";
import { useSessionEvalLog } from "@/hooks/use-session-eval-log";
import { recordMeetingVisit } from "@/lib/recent-meetings-log";
import type { SessionEvalVizSource } from "@/lib/session-eval-report";
import { useOpenSessions } from "@/hooks/use-open-sessions";
import { SessionTabs } from "@/components/SessionTabs";
import {
  usePostSegment,
  type TranscriptSegment,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SessionEvalSheet } from "@/components/SessionEvalSheet";
import { toast } from "@/hooks/use-toast";
import { DirectionCardDialog } from "@/components/DirectionCardDialog";
import { SketchTab } from "@/components/SketchTab";
import { SketchModal } from "@/components/SketchModal";

import type {
  InputTab,
  OutputTab,
  VizVersion,
  PasteHistoryEntry,
  PersistedMeetingApiPayload,
} from "./room/types";
import {
  VIZ_TYPES,
  VIZ_MODELS,
  WORKSPACE_DOMAINS,
  WORKSHOP_ROSTER_DEFAULT,
  MAX_VIZ_HISTORY,
  MAX_PASTE_HISTORY,
  BASE,
} from "./room/constants";
import { getSpeakerColor } from "./room/speaker-colors";
import {
  extractVizName,
  cloneVizDebug,
  slimVizTraceForReasoning,
} from "./room/viz-helpers";
import { RoomOutputPanels } from "./room/RoomOutputPanels";

// ─── Component ───────────────────────────────────────────────────────────────

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const {
    sessions: openSessions,
    addSession,
    removeSession: removeOpenSession,
    updateTitle: updateSessionTitle,
  } = useOpenSessions();
  const [speakerName, setSpeakerName] = useLocalStorage(
    "meetingVisualizer_speakerName",
    "Anonymous",
  );
  const [workshopRosterCsv, setWorkshopRosterCsv] = useLocalStorage(
    "meetingVisualizer_workshopRoster",
    WORKSHOP_ROSTER_DEFAULT,
  );
  const [workspaceDomain, setWorkspaceDomain] = useLocalStorage(
    "meetingVisualizer_workspaceDomain",
    "grundfos",
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [language, setLanguage] = useState("da-DK");
  const [autoVizEnabled, setAutoVizEnabled] = useState(false);
  const [autoVizCountdown, setAutoVizCountdown] = useState(45);

  // Input tabs
  const [inputTab, setInputTab] = useState<InputTab>("mic");
  const [pasteText, setPasteText] = useState("");
  const [pasteHistory, setPasteHistory] = useState<PasteHistoryEntry[]>([]);

  // Sketch modal + sketch state
  const [sketchModalOpen, setSketchModalOpen] = useState(false);
  const [sketchId, setSketchId] = useState<string | null>(() =>
    roomId ? sessionStorage.getItem(`sketch_id_${roomId}`) : null,
  );
  const [sketchPreviewDataUrl, setSketchPreviewDataUrl] = useState<string | null>(() =>
    roomId ? sessionStorage.getItem(`sketch_preview_${roomId}`) : null,
  );
  const [sketchElementCount, setSketchElementCount] = useState(() => {
    const v = roomId ? sessionStorage.getItem(`sketch_count_${roomId}`) : null;
    return v ? parseInt(v, 10) : 0;
  });
  const [sketchSceneJson, setSketchSceneJson] = useState<string | null>(() =>
    roomId ? sessionStorage.getItem(`sketch_scene_${roomId}`) : null,
  );
  // Annotation-mode: brugeren tegner oven på en eksisterende visualisering
  const [annotateImageDataUrl, setAnnotateImageDataUrl] = useState<string | null>(null);
  const [isAnnotationSketch, setIsAnnotationSketch] = useState(false);

  // Fixation-breaker: antal inkrementelle forbedringer i træk
  const [consecutiveRefinements, setConsecutiveRefinements] = useState(0);
  const FIXATION_THRESHOLD = 3;

  // Output tabs
  const [outputTab, setOutputTab] = useState<OutputTab>("viz");
  const [showDebug, setShowDebug] = useState(false);
  const [showSessionEval, setShowSessionEval] = useState(false);

  // Viz config
  const [vizType, setVizType] = useState("auto");
  const [vizModel, setVizModel] = useState("haiku");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [freshStart, setFreshStart] = useState(false);

  // Disambiguation dialog
  const [pendingIntent, setPendingIntent] = useState<{
    payload: NeedIntentPayload;
    request: VisualizeRequestWithIntent;
  } | null>(null);

  // Fixation-breaker retningskort — vises ved 3+ inkrementelle forbedringer i træk
  const [pendingDirectionPick, setPendingDirectionPick] = useState<{
    transcript: string;
  } | null>(null);
  const fixationBreakerShownRef = useRef(false);

  // Meeting context
  const [showContext, setShowContext] = useState(false);
  const [ctxPurpose, setCtxPurpose] = useState("");
  const [ctxProjects, setCtxProjects] = useState("");
  const [ctxAttend, setCtxAttend] = useState("");
  const [ctxExtra, setCtxExtra] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; content: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Previous sessions (imported as context)
  type PreviousSessionMeta = {
    roomId: string;
    title: string;
    createdAt: string;
    wordCount: number;
    transcript: string;
  };
  const [previousSessions, setPreviousSessions] = useState<PreviousSessionMeta[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [sessionPickerSearch, setSessionPickerSearch] = useState("");
  const [availableSessions, setAvailableSessions] = useState<
    { roomId: string; title: string; createdAt: string; wordCount: number }[]
  >([]);
  const [loadingSessionTranscript, setLoadingSessionTranscript] = useState<string | null>(null);
  const previousSessionsSectionRef = useRef<HTMLDivElement>(null);

  // Transcription mode: "browser" = Web Speech API, "deepgram" = Deepgram (diarization)
  const [transcriptionMode, setTranscriptionMode] = useLocalStorage<
    "browser" | "deepgram"
  >("meetingVisualizer_transcriptionMode", "browser");
  // Maps Deepgram speaker ID (0,1,2…) → display name
  const [deepgramSpeakerNames, setDeepgramSpeakerNames] = useState<
    Record<number, string>
  >({});

  // Version history
  const [vizHistory, setVizHistory] = useState<VizVersion[]>([]);
  const vizVersionCounterRef = useRef(0);
  const [activeVersion, setActiveVersion] = useState(0);
  const [displayHtml, setDisplayHtml] = useState<string>("");

  // Forklaring-fanen (AI reasoning som almen tekst)
  const [reasoningText, setReasoningText] = useState("");
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const reasoningTextRef = useRef("");

  const transcriptRef = useRef<HTMLDivElement>(null);

  // API & SSE hooks
  const {
    segments,
    participants,
    visualization: sseViz,
    connectionStatus,
    addLocalSegment,
    applyPersistedSegments,
    clearSegmentsLocally,
  } = useRoomSSE(roomId ?? null);
  const { mutateAsync: postSegment } = usePostSegment();
  const {
    generate,
    cancelGeneration,
    isGenerating,
    streamedHtml,
    meta: streamMeta,
    error: vizStreamError,
    debugInfo,
  } = useVisualizeStream();

  const activeHtml = isGenerating ? streamedHtml : displayHtml || sseViz.html;

  const [clearingTranscript, setClearingTranscript] = useState(false);

  const handleClearTranscript = useCallback(async () => {
    if (!roomId) return;
    if (
      !window.confirm(
        "Slette hele transskriptet i denne session? Segmenter fjernes fra server/databasen for alle i sessionen.",
      )
    )
      return;
    setClearingTranscript(true);
    try {
      const res = await fetch(
        `${BASE}api/meetings/${encodeURIComponent(roomId)}/clear-transcript`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("clear failed");
      clearSegmentsLocally();
      toast({ title: "Transskript ryddet" });
    } catch {
      toast({
        title: "Kunne ikke rydde transskript",
        description: "Tjek netværk eller api-server.",
        variant: "destructive",
      });
    } finally {
      setClearingTranscript(false);
    }
  }, [roomId, clearSegmentsLocally]);

  useEffect(() => {
    if (!roomId) return;

    setMeetingTitle("");
    setVizHistory([]);
    setDisplayHtml("");
    setActiveVersion(0);
    vizVersionCounterRef.current = 0;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${BASE}api/meetings/${encodeURIComponent(roomId)}`,
        );
        if (cancelled) return;
        if (res.status === 404) return;
        if (!res.ok) {
          console.warn("Kunne ikke hente gemt møde:", res.status);
          return;
        }
        const data = (await res.json()) as PersistedMeetingApiPayload;
        if (cancelled) return;

        const mapped: TranscriptSegment[] = data.segments.map((s) => ({
          id: s.segmentId,
          speakerName: s.speakerName,
          text: s.text,
          timestamp: new Date(s.timestamp).getTime(),
          isFinal: s.isFinal,
        }));
        applyPersistedSegments(mapped);

        if (data.visualizations?.length) {
          const versions: VizVersion[] = data.visualizations.map((row) => ({
            version: row.version,
            name: extractVizName(row.html) || `Version ${row.version}`,
            html: row.html.trim(),
            timestamp: new Date(row.createdAt).getTime(),
            debugSnapshot: null,
          }));
          vizVersionCounterRef.current = Math.max(
            ...versions.map((v) => v.version),
            0,
          );
          setVizHistory(versions);
          const latest = versions[versions.length - 1]!;
          setActiveVersion(latest.version);
          setDisplayHtml(latest.html);
        }

        const t = (data.meeting?.title ?? "").trim();
        if (t) setMeetingTitle(t);
      } catch (e) {
        if (!cancelled) console.warn("Møde-hydrering fejlede", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, applyPersistedSegments]);

  useEffect(() => {
    if (!roomId || !meetingTitle.trim()) return;
    const timer = setTimeout(() => {
      fetch(`${BASE}api/meetings/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitle }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [meetingTitle, roomId]);

  useEffect(() => {
    if (!roomId) return;
    recordMeetingVisit(roomId, meetingTitle || "");
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const timer = setTimeout(() => {
      recordMeetingVisit(roomId, meetingTitle || "");
    }, 2000);
    return () => clearTimeout(timer);
  }, [meetingTitle, roomId]);

  // Build stable speaker color map from segment order
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const seg of segments) {
      if (!map.has(seg.speakerName)) map.set(seg.speakerName, map.size);
    }
    return map;
  }, [segments]);

  // Compute full transcript text WITH speaker attribution (so the AI sees who said what)
  const fullText = useMemo(
    () => segments.map((s) => `[${s.speakerName}]: ${s.text}`).join("\n"),
    [segments],
  );
  const currentWordCount = useMemo(
    () => (fullText.trim() === "" ? 0 : fullText.split(/\s+/).length),
    [fullText],
  );

  const workshopQuickNames = useMemo(
    () =>
      workshopRosterCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 16),
    [workshopRosterCsv],
  );

  // The transcript to use for visualization
  const getActiveTranscript = useCallback(() => {
    if (inputTab === "paste") return pasteText.trim();
    return fullText.trim();
  }, [inputTab, pasteText, fullText]);

  const getEvalWordCount = useCallback(() => {
    const t = getActiveTranscript();
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
  }, [getActiveTranscript]);

  const appendPasteHistoryIfNeeded = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setPasteHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].text === t) return prev;
      const entry: PasteHistoryEntry = {
        id: uuidv4(),
        savedAt: Date.now(),
        text: t,
      };
      const next = [...prev, entry];
      return next.length > MAX_PASTE_HISTORY
        ? next.slice(-MAX_PASTE_HISTORY)
        : next;
    });
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          setUploadedFiles((prev) => {
            if (prev.some((f) => f.name === file.name)) return prev;
            return [...prev, { name: file.name, content }];
          });
        };
        reader.readAsText(file);
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  const removeUploadedFile = useCallback((name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const getMeetingContext = useCallback(() => {
    const parts: string[] = [];
    if (ctxPurpose) parts.push("Purpose: " + ctxPurpose);
    if (ctxProjects) parts.push("Projects/systems: " + ctxProjects);
    if (ctxAttend) parts.push("Participants: " + ctxAttend);
    if (ctxExtra) parts.push("Context: " + ctxExtra);
    if (uploadedFiles.length > 0) {
      uploadedFiles.forEach((f) => {
        parts.push(`\n--- FILE: ${f.name} ---\n${f.content}\n--- END FILE ---`);
      });
    }
    if (previousSessions.length > 0) {
      previousSessions.forEach((s) => {
        const date = format(new Date(s.createdAt), "yyyy-MM-dd");
        parts.push(
          `\n--- PREVIOUS SESSION: "${s.title || s.roomId}" (${date}, ${s.wordCount} ord) ---\n${s.transcript}\n--- END PREVIOUS SESSION ---`,
        );
      });
    }
    return parts.join("\n") || null;
  }, [ctxPurpose, ctxProjects, ctxAttend, ctxExtra, uploadedFiles, previousSessions]);

  const hasContext =
    ctxPurpose ||
    ctxProjects ||
    ctxAttend ||
    ctxExtra ||
    uploadedFiles.length > 0 ||
    previousSessions.length > 0;

  // Previous sessions: filtered list for picker
  const filteredAvailableSessions = useMemo(() => {
    const search = sessionPickerSearch.trim().toLowerCase();
    if (!search) return availableSessions;
    return availableSessions.filter(
      (s) =>
        (s.title || s.roomId).toLowerCase().includes(search) ||
        s.roomId.toLowerCase().includes(search),
    );
  }, [availableSessions, sessionPickerSearch]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showSessionPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        previousSessionsSectionRef.current &&
        !previousSessionsSectionRef.current.contains(e.target as Node)
      ) {
        setShowSessionPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSessionPicker]);

  const handleOpenSessionPicker = useCallback(async () => {
    setShowSessionPicker(true);
    setSessionPickerSearch("");
    try {
      const res = await fetch(`${BASE}api/meetings`);
      if (res.ok) {
        const data = await res.json();
        const selectedIds = new Set(previousSessions.map((s) => s.roomId));
        const filtered = ((data.meetings as Array<Record<string, unknown>>) || [])
          .filter((m) => m.roomId !== roomId && !selectedIds.has(m.roomId as string))
          .map((m) => ({
            roomId: m.roomId as string,
            title: (m.title as string) || "",
            createdAt: m.createdAt as string,
            wordCount: (m.wordCount as number) || 0,
          }));
        setAvailableSessions(filtered);
      }
    } catch (err) {
      console.error("Failed to load sessions list:", err);
    }
  }, [roomId, previousSessions]);

  const handleSelectSession = useCallback(
    async (selectedRoomId: string) => {
      if (previousSessions.length >= 4) return;
      setLoadingSessionTranscript(selectedRoomId);
      try {
        const res = await fetch(
          `${BASE}api/meetings/${encodeURIComponent(selectedRoomId)}/transcript`,
        );
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setPreviousSessions((prev) => {
          if (prev.some((s) => s.roomId === selectedRoomId)) return prev;
          return [
            ...prev,
            {
              roomId: selectedRoomId,
              title: data.title,
              createdAt: data.createdAt,
              wordCount: data.wordCount,
              transcript: data.transcript,
            },
          ];
        });
        setShowSessionPicker(false);
      } catch (err) {
        console.error("Failed to load session transcript:", err);
        toast({
          title: "Fejl",
          description: "Kunne ikke hente transskript fra det valgte rum.",
          variant: "destructive",
        });
      } finally {
        setLoadingSessionTranscript(null);
      }
    },
    [previousSessions.length],
  );

  const removePreviousSession = useCallback((sessionRoomId: string) => {
    setPreviousSessions((prev) => prev.filter((s) => s.roomId !== sessionRoomId));
  }, []);

  const sessionStartedAtRef = useRef<number>(Date.now());

  /** Stabil kontekst-streng til iframe (undgår unødige fillLazyTabs-identitetsskift). */
  const meetingContextForIframe = useMemo(
    () => getMeetingContext(),
    [getMeetingContext],
  );

  const sessionEval = useSessionEvalLog();

  useEffect(() => {
    sessionStartedAtRef.current = Date.now();
    sessionEval.clearLog();
  }, [roomId, sessionEval.clearLog]);

  // Track open sessions for the tab bar
  useEffect(() => {
    if (roomId) addSession(roomId, meetingTitle || "");
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (roomId && meetingTitle) updateSessionTitle(roomId, meetingTitle);
  }, [roomId, meetingTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Version history ─────────────────────────────────────────────────────────
  const addVizVersion = useCallback(
    (
      html: string,
      debugSnapshot: VizDebugInfo | null = null,
      sessionSource: SessionEvalVizSource = "local_stream",
    ) => {
      const trimmed = html.trim();
      if (trimmed.length < 50) return;
      const snap = cloneVizDebug(debugSnapshot);
      setVizHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.html.trim() === trimmed) {
          if (snap && !(last.debugSnapshot && last.debugSnapshot.prompt)) {
            return [...prev.slice(0, -1), { ...last, debugSnapshot: snap }];
          }
          return prev;
        }
        const capped = prev.length >= MAX_VIZ_HISTORY ? prev.slice(1) : prev;
        vizVersionCounterRef.current += 1;
        const version = vizVersionCounterRef.current;
        const name = extractVizName(html) || `Version ${version}`;
        setActiveVersion(version);
        const entry = {
          version,
          name,
          html: trimmed,
          timestamp: Date.now(),
          debugSnapshot: snap,
        };
        queueMicrotask(() => {
          sessionEval.recordVisualization({
            version,
            vizName: name,
            html: trimmed,
            debugSnapshot: snap,
            source: sessionSource,
          });
        });
        return [...capped, entry];
      });
    },
    [sessionEval.recordVisualization],
  );

  // When a new viz arrives from streaming, add it to history
  // After the first successful visualization, auto-upgrade to Opus for better quality
  useEffect(() => {
    if (!isGenerating && streamedHtml && streamedHtml.length > 50) {
      setDisplayHtml(streamedHtml);
      addVizVersion(streamedHtml, debugInfo ?? null);
      setVizModel((prev) => (prev === "haiku" ? "opus" : prev));
      // Retningskort-match: registrér hvilken familie der faktisk blev genereret
      if (directionPickPendingResolutionRef.current) {
        directionPickPendingResolutionRef.current = false;
        sessionEval.updateDirectionPickResolution(
          debugInfo?.resolvedFamily ?? null,
        );
      }
    }
  }, [isGenerating, streamedHtml, addVizVersion, debugInfo, sessionEval.updateDirectionPickResolution]);

  // When SSE viz arrives from another user
  useEffect(() => {
    if (sseViz.html && !isGenerating) {
      setDisplayHtml(sseViz.html);
      addVizVersion(sseViz.html, null, "sse_peer");
    }
  }, [sseViz.html, isGenerating, addVizVersion]);

  // Auto-åbn sketch modal hvis URL indeholder ?sketch=new (sendt fra New Session)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sketch") === "new") {
      setSketchModalOpen(true);
      setInputTab("sketch");
      // Fjern query param fra URL uden page reload
      const url = new URL(window.location.href);
      url.searchParams.delete("sketch");
      window.history.replaceState({}, "", url.toString());
    }
  }, []); // kun ved mount

  // Bruges til at sende annotation-sketchId direkte til generate() efter upload (undgår stale closure i handleGenerate)
  const pendingAnnotationSketchIdRef = useRef<string | null>(null);

  // Gem sketch: PUTs til backend, gemmer preview og sketchId i state
  const handleSaveSketch = useCallback(
    async (result: { pngBase64: string; sceneJson: string; previewDataUrl: string; elementCount: number }) => {
      const wasAnnotation = isAnnotationSketch;
      setSketchPreviewDataUrl(result.previewDataUrl);
      setSketchElementCount(result.elementCount);
      setSketchSceneJson(result.sceneJson);
      setSketchModalOpen(false);

      // Gem i sessionStorage så "Rediger canvas" gendanner skitsen ved reload
      if (roomId) {
        sessionStorage.setItem(`sketch_preview_${roomId}`, result.previewDataUrl);
        sessionStorage.setItem(`sketch_count_${roomId}`, String(result.elementCount));
        sessionStorage.setItem(`sketch_scene_${roomId}`, result.sceneJson);
      }

      if (roomId) {
        try {
          const BASE = import.meta.env.BASE_URL;
          // Opret room i DB hvis den ikke eksisterer endnu
          await fetch(`${BASE}api/meetings/${roomId}/ensure`, { method: "POST" });
          // Upload sketch med korrekte feltnavne
          const res = await fetch(`${BASE}api/meetings/${roomId}/sketch`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previewPngBase64: result.pngBase64,
              sceneJson: result.sceneJson,
            }),
          });
          if (res.ok) {
            const json = (await res.json()) as { sketchId: string };
            setSketchId(json.sketchId);
            sessionStorage.setItem(`sketch_id_${roomId}`, json.sketchId);
            sessionEval.recordSketchUsed({
              sketchId: json.sketchId,
              elementCount: result.elementCount,
              bytes: Math.round(result.pngBase64.length * 0.75),
            });
            // Annotation-mode: gem sketchId i ref så useEffect kan auto-generere
            if (wasAnnotation) {
              pendingAnnotationSketchIdRef.current = json.sketchId;
            }
          } else {
            console.error("Sketch upload failed:", res.status, await res.text());
          }
        } catch (err) {
          console.error("Failed to upload sketch", err);
        }
      }
    },
    [roomId, sessionEval.recordSketchUsed, isAnnotationSketch],
  );

  // Annotation-mode: brugeren klikker "Tegn på" på en visualisering → åbn sketch-modal med screenshot som baggrund
  const handleVizAnnotate = useCallback((screenshotDataUrl: string) => {
    setAnnotateImageDataUrl(screenshotDataUrl || null);
    setIsAnnotationSketch(true);
    setSketchModalOpen(true);
  }, []);

  // Nulstil annotation-mode når sketch-modal lukkes uden at gemme
  const handleSketchModalClose = useCallback(() => {
    setSketchModalOpen(false);
    setAnnotateImageDataUrl(null);
    setIsAnnotationSketch(false);
  }, []);

  // Track consecutive inkrementelle forbedringer til fixation-breaker
  useEffect(() => {
    if (vizHistory.length === 0) {
      setConsecutiveRefinements(0);
      fixationBreakerShownRef.current = false;
      return;
    }
    let count = 0;
    for (let i = vizHistory.length - 1; i >= 0; i--) {
      if (vizHistory[i].debugSnapshot?.isRefinement === true) {
        count++;
      } else {
        break;
      }
    }
    setConsecutiveRefinements(count);
    // Nulstil "vist" flag når stregen brydes
    if (count === 0) fixationBreakerShownRef.current = false;
  }, [vizHistory]);

  // Vis fixation-breaker popup efter FIXATION_THRESHOLD inkrementelle forbedringer i træk
  useEffect(() => {
    if (
      consecutiveRefinements >= FIXATION_THRESHOLD &&
      !fixationBreakerShownRef.current &&
      !pendingDirectionPick &&
      !isGenerating
    ) {
      const transcript = getActiveTranscript();
      if (transcript) {
        fixationBreakerShownRef.current = true;
        setPendingDirectionPick({ transcript });
      }
    }
  }, [consecutiveRefinements, FIXATION_THRESHOLD, pendingDirectionPick, isGenerating, getActiveTranscript]);

  const displayDebug = useMemo(() => {
    if (isGenerating) return debugInfo;
    const entry = vizHistory.find((v) => v.version === activeVersion);
    return entry?.debugSnapshot ?? null;
  }, [isGenerating, debugInfo, vizHistory, activeVersion]);

  const loadVizVersion = useCallback(
    (version: number) => {
      const entry = vizHistory.find((v) => v.version === version);
      if (!entry) return;
      setActiveVersion(version);
      setDisplayHtml(entry.html);
    },
    [vizHistory],
  );

  // ── Speech ───────────────────────────────────────────────────────────────────
  // detectedSpeaker is provided by Deepgram mode; falls back to the manual speakerName
  const handleFinalSegment = useCallback(
    async (text: string, detectedSpeaker?: string) => {
      if (!roomId) return;
      const effectiveSpeaker = detectedSpeaker ?? speakerName;
      const newSegment = {
        id: uuidv4(),
        speakerName: effectiveSpeaker,
        text,
        timestamp: Date.now(),
        isFinal: true,
      };
      addLocalSegment(newSegment);
      try {
        await postSegment({
          data: {
            roomId,
            speakerName: effectiveSpeaker,
            text,
            timestamp: newSegment.timestamp,
            isFinal: true,
            id: newSegment.id,
          } as any,
        });
      } catch (err) {
        console.error("Failed to post segment", err);
      }
    },
    [roomId, speakerName, addLocalSegment, postSegment],
  );

  const deepgramKeywords = useMemo(() => {
    const vizKeywords = [
      "user journey:5",
      "journey mapping:5",
      "journey map:5",
      "user journey mapping:5",
      "customer journey:5",
      "customer journey map:5",
      "experience map:4",
      "experience mapping:4",
      "touchpoint:4",
      "touchpoints:4",
      "touch point:4",
      "touch points:4",
      "pain point:4",
      "pain points:4",
      "painpoint:4",
      "moments of truth:4",
      "swimlane:4",
      "swim lane:4",
      "swim lanes:4",
      "onboarding:3",
      "onboarding flow:4",
      "emotion curve:4",
      "emotion:3",
      "storyboard:3",
      "user flow:4",

      "workflow:5",
      "flowchart:5",
      "flow chart:5",
      "process flow:4",
      "process diagram:4",
      "process map:4",
      "decision diamond:3",
      "decision tree:4",
      "BPMN:4",
      "value stream:4",
      "value stream mapping:5",
      "approval flow:3",
      "approval workflow:4",
      "handover:3",
      "RACI:4",

      "HMI:5",
      "SCADA:5",
      "dashboard:5",
      "interface:4",
      "user interface:4",
      "gauge:3",
      "gauges:3",
      "control panel:4",
      "operator screen:4",
      "navigation panel:4",
      "tab interface:4",
      "dark theme:3",
      "alarm:3",
      "setpoint:3",
      "set point:3",

      "persona:5",
      "personas:4",
      "empathy map:5",
      "empathy:3",
      "archetype:3",
      "research findings:4",
      "research insights:4",
      "user needs:4",
      "user research:4",
      "jobs to be done:4",
      "JTBD:4",

      "service blueprint:5",
      "blueprint:4",
      "information architecture:5",
      "sitemap:4",
      "site map:4",
      "ecosystem map:4",
      "ecosystem:3",
      "stakeholder map:4",
      "stakeholder:3",

      "requirements:4",
      "requirements matrix:5",
      "traceability:4",
      "traceability matrix:5",
      "specification:3",
      "MoSCoW:5",
      "must have:3",
      "should have:3",
      "could have:3",

      "roadmap:5",
      "timeline:5",
      "Gantt:5",
      "milestone:4",
      "milestones:4",
      "kanban:4",
      "decision log:4",
      "management summary:4",

      "comparison:4",
      "comparison matrix:5",
      "SWOT:5",
      "SWOT analysis:5",
      "evaluation:4",
      "evaluation matrix:5",
      "scorecard:4",
      "prioritization:4",
      "competitive analysis:4",

      "design system:5",
      "component spec:4",
      "style guide:4",
      "design tokens:4",
      "tokens:3",

      "visualization:4",
      "visualize:4",
      "visualise:4",
      "diagram:3",
      "chart:3",
      "matrix:3",
      "overview:3",
      "summary:3",

      "brugerrejse:5",
      "kunderejse:5",
      "berøringspunkt:4",
      "smertepunkt:4",
      "arbejdsgang:4",
      "flowdiagram:5",
      "procesdiagram:4",
      "kravspecifikation:5",
      "kravmatrix:5",
      "tidslinje:4",
      "sammenligning:4",
      "designsystem:4",
    ];
    const domainKeywords =
      workspaceDomain === "grundfos"
        ? [
            "pumpe:5",
            "pumper:5",
            "Grundfos:5",
            "iSolutions:5",
            "tryktab:3",
            "vandmåler:3",
            "CRA:5",
            "Cyber Resilience Act:5",
            "NIS2:4",
            "Alpha GO:5",
            "CU 200:5",
            "CU 352:4",
            "commissioning:4",
            "installer:4",
            "firmware:3",
            "access control:4",
            "compliance:4",
            "conformity:3",
            "IEC 62443:4",
            "ATEX:3",
            "motor:3",
            "impeller:3",
            "flange:3",
            "frequency converter:4",
          ]
        : workspaceDomain === "gabriel"
          ? [
              "Gabriel:5",
              "tekstil:5",
              "stoffer:4",
              "kollektion:4",
              "møbel:3",
              "polstring:3",
              "bæredygtighed:4",
              "certificering:3",
            ]
          : [];
    const ctxWords =
      [ctxPurpose, ctxProjects, ctxExtra]
        .join(" ")
        .match(/\b[A-ZÆØÅ][a-zæøå]{2,}\b/g) ?? [];
    const ctxKeywords = [...new Set(ctxWords)]
      .slice(0, 10)
      .map((w) => `${w}:2`);

    // Deepgram keyword boosting virker bedst med enkelt-ord og moderate intensifiers.
    // Vi normaliserer derfor især "journey"-fraser og reducerer aggressiv boost-styrke,
    // samt capper til max 100 keywords/request.
    const parseEntry = (entry: string): { kw: string; boost: number } => {
      const idx = entry.lastIndexOf(":");
      if (idx <= 0) return { kw: entry.trim(), boost: 2 };
      const kw = entry.slice(0, idx).trim();
      const boost = Number(entry.slice(idx + 1));
      return { kw, boost: Number.isFinite(boost) ? boost : 2 };
    };

    const adjustBoost = (boost: number): number => {
      // Moderat boost for at undgå falske positiver pga. overboost.
      if (boost >= 5) return 2.25;
      if (boost >= 4) return 1.8;
      if (boost === 3) return 1.5;
      return Math.max(1.1, boost);
    };

    const normalizeJourneyPhrase = (
      kw: string,
      boost: number,
    ): Array<{ kw: string; boost: number }> => {
      const lower = kw.toLowerCase();

      // "user journey" / "customer journey"
      if (lower.includes("journey mapping"))
        return [
          { kw: "journey", boost },
          { kw: "mapping", boost: 1.5 },
        ];
      if (lower.includes("journey map"))
        return [
          { kw: "journey", boost },
          { kw: "mapping", boost: 1.3 },
        ];
      if (lower.includes("user journey") || lower.includes("customer journey"))
        return [{ kw: "journey", boost }];

      // "experience map" / "experience mapping"
      if (lower.includes("experience map"))
        return [{ kw: "experience", boost }];
      if (lower.includes("experience mapping"))
        return [
          { kw: "experience", boost },
          { kw: "mapping", boost: 1.3 },
        ];

      // "touch point(s)" -> touchpoint (single token)
      if (
        lower === "touch point" ||
        lower === "touch points" ||
        lower.includes("touch point")
      ) {
        return [{ kw: "touchpoint", boost }];
      }

      // "pain point(s)" -> painpoint (single token)
      if (
        lower === "pain point" ||
        lower === "pain points" ||
        lower.includes("pain point")
      ) {
        return [{ kw: "painpoint", boost }];
      }

      return [{ kw, boost }];
    };

    const raw = [...vizKeywords, ...domainKeywords, ...ctxKeywords];
    const bestByKw = new Map<string, number>();

    for (const entry of raw) {
      const { kw, boost } = parseEntry(entry);
      const normalized = normalizeJourneyPhrase(kw, boost);
      for (const item of normalized) {
        const finalKw = item.kw.trim();
        if (!finalKw) continue;

        // Basic sanity filters: skip overly short generic tokens.
        const looksLikeAbbrev = /^[A-Z0-9]{2,}$/.test(finalKw);
        if (!looksLikeAbbrev && finalKw.length < 4) continue;

        const finalBoost = adjustBoost(item.boost);
        const prev = bestByKw.get(finalKw);
        if (prev === undefined || finalBoost > prev)
          bestByKw.set(finalKw, finalBoost);
      }
    }

    const capped = [...bestByKw.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    return capped.map(([kw, boost]) => `${kw}:${boost}`);
  }, [workspaceDomain, ctxPurpose, ctxProjects, ctxExtra]);

  const browserSpeech = useSpeech({
    onSegmentFinalized: handleFinalSegment,
    language,
  });

  const deepgramSpeech = useDeepgramSpeech({
    onSegmentFinalized: handleFinalSegment,
    language,
    keywords: deepgramKeywords,
    speakerNames: deepgramSpeakerNames,
  });

  const {
    isRecording,
    interimText,
    toggleRecording,
    stopRecording,
    error: speechError,
  } = transcriptionMode === "deepgram" ? deepgramSpeech : browserSpeech;

  const detectedSpeakers: number[] =
    transcriptionMode === "deepgram" ? deepgramSpeech.detectedSpeakers : [];

  // ── Visualization ────────────────────────────────────────────────────────────
  const prevHtmlRef = useRef<string>("");
  useEffect(() => {
    prevHtmlRef.current = displayHtml || sseViz.html || "";
  }, [displayHtml, sseViz.html]);

  // Tracker til retningskort-match: sættes til true når bruger vælger et kort,
  // nulstilles efter første viz er registreret (så kun ét match-event afsendes).
  const directionPickPendingResolutionRef = useRef(false);

  const handleGenerate = useCallback(
    (auto = false) => {
      const rawTranscript = getActiveTranscript();
      // Annotation-mode: brugerens tegning viser ønskede ændringer til visualiseringen
      // Normal sketch-mode: ingen transskript → brug placeholder
      const transcript = !rawTranscript && sketchId
        ? (isAnnotationSketch
            ? "Anvend annotationerne på den eksisterende visualisering og opdater den tilsvarende."
            : "Visualiser skitsen.")
        : rawTranscript;
      if (!transcript) return;

      const userPickedType = vizType !== "auto";
      // Bypass word-gate når en skitse er vedhæftet — skitsen er indholdet
      if (!sketchId && !passesVisualizationWordGate(transcript, userPickedType)) {
        if (!auto) {
          toast({
            title: "Not enough text to visualize",
            description: `Ved Auto-detect bruges mindst ${MIN_WORDS_FOR_VISUALIZATION} ord — eller vælg en fast visualization-type.`,
          });
        }
        return;
      }

      if (!auto) stopRecording();

      if (inputTab === "paste") appendPasteHistoryIfNeeded(transcript);

      const previous = !freshStart ? prevHtmlRef.current || null : null;

      generate(
        {
          transcript,
          previousHtml: previous,
          roomId,
          speakerName,
          vizType: vizType !== "auto" ? vizType : null,
          vizModel,
          title: meetingTitle || null,
          context: getMeetingContext(),
          freshStart,
          workspaceDomain,
          ...(sketchId ? { sketchId } : {}),
        },
        {
          onSessionDiagnostic: sessionEval.onStreamDiagnostic,
          onStreamComplete: (html) => setDisplayHtml(html),
          onNeedIntent: (payload, originalRequest) => {
            setPendingIntent({ payload, request: originalRequest });
          },
        },
      );
    },
    [
      getActiveTranscript,
      freshStart,
      roomId,
      speakerName,
      vizType,
      vizModel,
      meetingTitle,
      getMeetingContext,
      generate,
      workspaceDomain,
      inputTab,
      sketchId,
      isAnnotationSketch,
      appendPasteHistoryIfNeeded,
      sessionEval.onStreamDiagnostic,
      stopRecording,
    ],
  );

  // Per-segment manual trigger: user picks a segment + mode (refine or fresh)
  const handleGenerateFromSegment = useCallback(
    (seg: { speakerName: string; text: string }, isFresh: boolean) => {
      const transcript = getActiveTranscript();
      if (!transcript) return;
      stopRecording();
      const previous = !isFresh ? prevHtmlRef.current || null : null;
      generate(
        {
          transcript,
          previousHtml: previous,
          roomId,
          speakerName: seg.speakerName,
          vizType: vizType !== "auto" ? vizType : null,
          vizModel,
          title: meetingTitle || null,
          context: getMeetingContext(),
          freshStart: isFresh,
          workspaceDomain,
          focusSegment: `${seg.speakerName}: ${seg.text}`,
        },
        {
          onSessionDiagnostic: sessionEval.onStreamDiagnostic,
          onStreamComplete: (html) => setDisplayHtml(html),
        },
      );
      setOutputTab("viz");
    },
    [
      getActiveTranscript,
      roomId,
      vizType,
      vizModel,
      meetingTitle,
      getMeetingContext,
      generate,
      workspaceDomain,
      sessionEval.onStreamDiagnostic,
      stopRecording,
    ],
  );

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [segments, interimText]);

  // Refs for auto-viz interval
  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  // Auto-generer visualisering efter annotation-sketch er uploadet
  useEffect(() => {
    const pendingId = pendingAnnotationSketchIdRef.current;
    if (pendingId && sketchId === pendingId) {
      pendingAnnotationSketchIdRef.current = null;
      setOutputTab("viz");
      const t = setTimeout(() => {
        handleGenerateRef.current(false);
        // Nulstil annotation-mode så næste manuelle Visualisér ikke bruger annotation-transcriptet
        setIsAnnotationSketch(false);
        setAnnotateImageDataUrl(null);
      }, 100);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchId]);

  // Spejler pendingIntent-state så interval-callback kan læse den uden stale closure
  const pendingIntentRef = useRef<typeof pendingIntent>(null);
  useEffect(() => {
    pendingIntentRef.current = pendingIntent;
  }, [pendingIntent]);
  // Spejler pendingDirectionPick-state til interval-callback
  const pendingDirectionPickRef = useRef<typeof pendingDirectionPick>(null);
  useEffect(() => {
    pendingDirectionPickRef.current = pendingDirectionPick;
  }, [pendingDirectionPick]);
  const currentWordCountRef = useRef(currentWordCount);
  useEffect(() => {
    currentWordCountRef.current = currentWordCount;
  }, [currentWordCount]);
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Track word count at last generation to avoid redundant auto-viz triggers
  const lastVizWordCountRef = useRef(0);
  const autoVizCountdownRef = useRef(45);

  // Reset countdown whenever a generation completes (manual or auto)
  useEffect(() => {
    if (!isGenerating) {
      lastVizWordCountRef.current = currentWordCount;
      autoVizCountdownRef.current = 45;
      setAutoVizCountdown(45);
    }
  }, [isGenerating, currentWordCount]);

  // Auto-viz: 45-second countdown
  useEffect(() => {
    setAutoVizCountdown(45);
    autoVizCountdownRef.current = 45;
    if (!autoVizEnabled) return;

    const tick = setInterval(() => {
      // Frys nedtælling mens disambiguation-dialog eller retningskort afventer brugerens valg
      if (pendingIntentRef.current || pendingDirectionPickRef.current) return;

      autoVizCountdownRef.current -= 1;
      const next = autoVizCountdownRef.current;
      setAutoVizCountdown(next);

      if (next <= 0) {
        const hasNewContent =
          currentWordCountRef.current > lastVizWordCountRef.current;
        if (
          hasNewContent &&
          currentWordCountRef.current >= MIN_WORDS_FOR_VISUALIZATION &&
          !isGeneratingRef.current
        ) {
          handleGenerateRef.current(true);
        }
        autoVizCountdownRef.current = 45;
        setAutoVizCountdown(45);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [autoVizEnabled]);

  // ── Forklaring (AI-reasoning i almen tekst) ─────────────────────────────────
  const handleLoadActions = useCallback(async () => {
    const transcript = getActiveTranscript();
    if (!transcript) return;
    setIsLoadingActions(true);
    reasoningTextRef.current = "";
    setReasoningText("");

    const vizTrace = slimVizTraceForReasoning(displayDebug);

    try {
      const res = await fetch(`${BASE}api/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          roomId,
          title: meetingTitle || null,
          context: getMeetingContext(),
          workspaceDomain,
          vizTrace,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Server error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "chunk" && d.text) {
              reasoningTextRef.current += d.text;
              setReasoningText(reasoningTextRef.current);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
      setReasoningText(
        "Kunne ikke hente forklaringen. Prøv igen om lidt.",
      );
    } finally {
      setIsLoadingActions(false);
    }
  }, [
    getActiveTranscript,
    roomId,
    meetingTitle,
    getMeetingContext,
    workspaceDomain,
    displayDebug,
  ]);

  const hasLoadedActionsRef = useRef(false);
  useEffect(() => {
    hasLoadedActionsRef.current = false;
  }, [activeVersion]);

  useEffect(() => {
    if (
      outputTab === "actions" &&
      !hasLoadedActionsRef.current &&
      getActiveTranscript()
    ) {
      hasLoadedActionsRef.current = true;
      handleLoadActions();
    }
  }, [outputTab, handleLoadActions, getActiveTranscript]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const html = activeHtml;
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-viz-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeHtml]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Fullscreen sketch canvas modal ──────────────────────────────────── */}
      <SketchModal
        open={sketchModalOpen}
        onClose={handleSketchModalClose}
        onSave={handleSaveSketch}
        initialSceneJson={isAnnotationSketch ? null : sketchSceneJson}
        backgroundImageDataUrl={annotateImageDataUrl}
        isAnnotationMode={isAnnotationSketch}
      />

      {/* ── Fixation-breaker inspiration popup (3+ inkrementelle forbedringer) ── */}
      {pendingDirectionPick && (
        <DirectionCardDialog
          transcript={pendingDirectionPick.transcript}
          workspaceDomain={workspaceDomain}
          context={getMeetingContext()}
          mode="fixation_breaker"
          onPick={(familyId, shownFamilies) => {
            sessionEval.recordDirectionPick({
              shownFamilies,
              pickedFamily: familyId,
              skipped: false,
            });
            setPendingDirectionPick(null);
            // Nulstil consecutive count (ny retning bryder fikseringen)
            setConsecutiveRefinements(0);
            fixationBreakerShownRef.current = false;
            const transcript = pendingDirectionPick.transcript;
            const previous = !freshStart ? prevHtmlRef.current || null : null;
            generate(
              {
                transcript,
                previousHtml: previous,
                roomId,
                speakerName,
                vizType: familyId,
                vizModel,
                title: meetingTitle || null,
                context: getMeetingContext(),
                freshStart,
                workspaceDomain,
              },
              {
                onSessionDiagnostic: sessionEval.onStreamDiagnostic,
                onStreamComplete: (html) => setDisplayHtml(html),
                onNeedIntent: (payload, originalRequest) => {
                  setPendingIntent({ payload, request: originalRequest });
                },
              },
            );
          }}
          onSkip={(shownFamilies) => {
            sessionEval.recordDirectionPick({
              shownFamilies,
              pickedFamily: null,
              skipped: true,
            });
            setPendingDirectionPick(null);
          }}
        />
      )}

      {/* ── Disambiguation dialog ──────────────────────────────────────────── */}
      {pendingIntent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="mt-0.5 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-base mb-1">
                  Hvad skal der ske?
                </h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {pendingIntent.payload.explanation}
                </p>
                {pendingIntent.payload.detectedFamily && (
                  <p className="text-zinc-500 text-xs mt-2">
                    Nyt emne:{" "}
                    <span className="text-zinc-300">
                      {pendingIntent.payload.detectedFamily}
                    </span>
                    {pendingIntent.payload.currentFamily && (
                      <>
                        {" "}
                        · Nuværende:{" "}
                        <span className="text-zinc-300">
                          {pendingIntent.payload.currentFamily}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600"
                onClick={() => {
                  const req = pendingIntent.request;
                  const choice = "fresh" as const;
                  sessionEval.recordIntentDecision({
                    disambiguationReason:
                      pendingIntent.payload.disambiguationReason,
                    defaultChoice: pendingIntent.payload.defaultChoice,
                    actualChoice: choice,
                    detectedFamily: pendingIntent.payload.detectedFamily,
                    currentFamily: pendingIntent.payload.currentFamily,
                    scores: pendingIntent.payload.scores,
                  });
                  setPendingIntent(null);
                  generate(
                    { ...req, userVizIntent: choice },
                    {
                      onSessionDiagnostic: sessionEval.onStreamDiagnostic,
                      onStreamComplete: (html) => setDisplayHtml(html),
                      onNeedIntent: (p, r) =>
                        setPendingIntent({ payload: p, request: r }),
                    },
                  );
                }}
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                Ny visualisering
              </Button>
              <Button
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600"
                onClick={() => {
                  const req = pendingIntent.request;
                  const choice = "refine" as const;
                  sessionEval.recordIntentDecision({
                    disambiguationReason:
                      pendingIntent.payload.disambiguationReason,
                    defaultChoice: pendingIntent.payload.defaultChoice,
                    actualChoice: choice,
                    detectedFamily: pendingIntent.payload.detectedFamily,
                    currentFamily: pendingIntent.payload.currentFamily,
                    scores: pendingIntent.payload.scores,
                  });
                  setPendingIntent(null);
                  generate(
                    { ...req, userVizIntent: choice },
                    {
                      onSessionDiagnostic: sessionEval.onStreamDiagnostic,
                      onStreamComplete: (html) => setDisplayHtml(html),
                      onNeedIntent: (p, r) =>
                        setPendingIntent({ payload: p, request: r }),
                    },
                  );
                }}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Byg videre
              </Button>
            </div>
            <p className="text-zinc-600 text-xs text-center mt-3">
              Standard:{" "}
              <span className="text-zinc-400">
                {pendingIntent.payload.defaultChoice === "fresh"
                  ? "Ny visualisering"
                  : "Byg videre"}
              </span>
            </p>
          </div>
        </div>
      )}

      <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
        {/* ── Header ── */}
        <header className="h-14 glass-panel border-x-0 border-t-0 flex items-center justify-between px-4 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              title="Til forsiden"
            >
              <h1 className="text-base font-display leading-none text-white">
                AI Visualizer
              </h1>
            </button>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-green-500"
                    : connectionStatus === "connecting"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-red-500"
                }`}
              />
              <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                {roomId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Speaker identity */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-mono">
              {(() => {
                const colors = getSpeakerColor(speakerName, speakerColorMap);
                return (
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border",
                      colors.bg,
                      colors.border,
                      colors.text,
                    )}
                  >
                    {speakerName.charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              {isEditingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editNameValue.trim()) {
                      setSpeakerName(editNameValue.trim());
                    }
                    setIsEditingName(false);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={() => {
                      if (editNameValue.trim()) {
                        setSpeakerName(editNameValue.trim());
                      }
                      setIsEditingName(false);
                    }}
                    className="w-20 bg-transparent border-b border-primary text-xs font-mono text-white outline-none"
                    maxLength={20}
                  />
                  <button
                    type="submit"
                    className="text-primary hover:text-white"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setEditNameValue(speakerName);
                    setIsEditingName(true);
                  }}
                  className="flex items-center gap-1 text-muted-foreground hover:text-white transition-colors"
                  title="Active speaker — this user is labelled [Name]: in the transcript"
                >
                  <span className="text-white">{speakerName}</span>
                  <Pencil className="w-2.5 h-2.5 opacity-50" />
                </button>
              )}
            </div>

            {/* Participants — up to 10 colored avatars */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-mono">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{participants.length}</span>
              <div className="flex -space-x-1.5 ml-1">
                {participants.slice(0, 10).map((p, i) => {
                  const colors = getSpeakerColor(p, speakerColorMap);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border",
                        colors.bg,
                        colors.border,
                        colors.text,
                      )}
                      title={p}
                    >
                      {p.charAt(0).toUpperCase()}
                    </div>
                  );
                })}
                {participants.length > 10 && (
                  <div className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-bold">
                    +{participants.length - 10}
                  </div>
                )}
              </div>
            </div>

            {/* Language */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-secondary text-xs font-mono text-foreground border border-border rounded px-2 py-1 cursor-pointer hover:text-white transition-colors [&>option]:bg-secondary [&>option]:text-foreground"
            >
              <option value="da-DK">DA-DK</option>
              <option value="en-US">EN-US</option>
            </select>
          </div>
        </header>

        {/* ── Session Tabs ── */}
        <SessionTabs
          currentRoomId={roomId ?? ""}
          sessions={openSessions}
          onRemove={removeOpenSession}
        />

        {/* ── Main ── */}
        <main className="flex-1 flex overflow-hidden min-h-0">
          {/* ─── Left Panel: Input ─── */}
          <div className="w-[360px] shrink-0 border-r border-border flex flex-col bg-card/30 min-h-0">
            {/* Input tab switcher */}
            <div className="flex border-b border-border shrink-0">
              {(["mic", "paste", "sketch"] as InputTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInputTab(tab)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors",
                    inputTab === tab
                      ? "text-white border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  {tab === "mic" ? "🎙 Mic" : tab === "paste" ? "📋 Paste" : "✏️ Sketch"}
                </button>
              ))}
            </div>

            {speechError && inputTab === "mic" && (
              <div className="p-2 mx-3 mt-2 bg-destructive/10 border border-destructive/50 rounded-lg flex items-start gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive-foreground">
                  {speechError}
                </p>
              </div>
            )}

            {/* Mic Tab */}
            {inputTab === "mic" && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Transcription mode toggle */}
                <div className="shrink-0 px-3 py-2 border-b border-border bg-card/20 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Transcription
                  </span>
                  <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-mono">
                    {(["browser", "deepgram"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTranscriptionMode(mode)}
                        disabled={isRecording}
                        className={cn(
                          "px-2.5 py-1 transition-colors",
                          transcriptionMode === mode
                            ? "bg-primary text-white"
                            : "text-muted-foreground hover:text-white hover:bg-secondary/60",
                          "disabled:opacity-40 disabled:cursor-not-allowed",
                        )}
                      >
                        {mode === "browser" ? "Browser" : "Deepgram ✦"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Deepgram speaker name mapping */}
                {transcriptionMode === "deepgram" && (
                  <div className="shrink-0 px-3 py-2 border-b border-border bg-card/30 space-y-1.5">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                      {detectedSpeakers.length === 0
                        ? "Start recording — speakers detected automatically"
                        : "Assign names to detected speakers"}
                    </p>
                    {detectedSpeakers.map((id) => (
                      <div key={id} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-primary w-16 shrink-0">
                          Speaker {id + 1}
                        </span>
                        <input
                          type="text"
                          value={deepgramSpeakerNames[id] ?? ""}
                          onChange={(e) =>
                            setDeepgramSpeakerNames((prev) => ({
                              ...prev,
                              [id]: e.target.value,
                            }))
                          }
                          placeholder={`Speaker ${id + 1}`}
                          className="flex-1 h-6 bg-secondary/40 border border-border rounded px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
                  ref={transcriptRef}
                >
                  <AnimatePresence initial={false}>
                    {segments.map((seg, i) => {
                      const isMe = seg.speakerName === speakerName;
                      const showSpeaker =
                        i === 0 ||
                        segments[i - 1].speakerName !== seg.speakerName;
                      const colors = getSpeakerColor(
                        seg.speakerName,
                        speakerColorMap,
                      );
                      return (
                        <motion.div
                          key={seg.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex flex-col",
                            isMe ? "items-end" : "items-start",
                          )}
                        >
                          {showSpeaker && (
                            <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  colors.dot,
                                )}
                              />
                              <span
                                className={cn(
                                  "text-[10px] font-mono tracking-wider uppercase",
                                  colors.text,
                                )}
                              >
                                {seg.speakerName}
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground/50">
                                {format(new Date(seg.timestamp), "HH:mm:ss")}
                              </span>
                            </div>
                          )}
                          <div
                            className={cn(
                              "px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed border",
                              isMe ? "rounded-tr-sm" : "rounded-tl-sm",
                              colors.bg,
                              colors.border,
                              "text-foreground",
                            )}
                          >
                            {seg.text}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {interimText && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-end"
                    >
                      <div className="px-3 py-2 rounded-2xl max-w-[90%] text-sm bg-primary/10 text-primary-foreground/70 border border-primary/10 italic rounded-tr-sm">
                        {interimText}
                        <span className="inline-block w-1 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
                      </div>
                    </motion.div>
                  )}

                  {segments.length === 0 && !interimText && (
                    <div className="h-full flex items-center justify-center py-20 text-center">
                      <div className="text-muted-foreground space-y-3">
                        <Mic className="w-10 h-10 mx-auto opacity-20" />
                        <p className="text-xs font-mono opacity-60">
                          Start recording to capture speech
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Record + Visualize — same row */}
                <div className="shrink-0 px-3 pt-2 pb-2 border-t border-border flex flex-col gap-2">
                  {vizStreamError && (
                    <div className="p-2 rounded-md bg-destructive/10 border border-destructive/40 text-[11px] text-destructive-foreground flex gap-2 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{vizStreamError}</span>
                    </div>
                  )}
                  <div className="flex gap-2 w-full">
                    <Button
                      type="button"
                      variant={isRecording ? "destructive" : "default"}
                      className="h-9 px-4 text-xs transition-all relative overflow-hidden shrink-0"
                      onClick={() => toggleRecording()}
                    >
                      {isRecording && (
                        <span className="absolute inset-0 bg-white/10 animate-pulse" />
                      )}
                      {isRecording ? (
                        <MicOff className="w-3.5 h-3.5 mr-1.5" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {isRecording ? "Stop" : "Record"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 min-w-0 h-9 text-xs font-mono"
                      onClick={() => {
                        handleGenerate(false);
                        setOutputTab("viz");
                      }}
                      disabled={isGenerating || currentWordCount === 0}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                          Visualize
                        </>
                      )}
                    </Button>
                    {isGenerating && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-9 shrink-0 px-3 text-xs font-mono"
                        title="Stop generering"
                        onClick={() => cancelGeneration()}
                      >
                        <Square className="w-3 h-3 mr-1 fill-current" />
                        Stop
                      </Button>
                    )}
                  </div>
                  <details className="group rounded-md border border-border bg-card/40">
                    <summary className="cursor-pointer list-none px-2 py-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <FileText className="w-3.5 h-3.5 opacity-70" />
                      <span>Transcript log</span>
                      <span className="text-muted-foreground/60">
                        ({segments.length})
                      </span>
                      <span className="opacity-50 group-open:rotate-90 transition-transform ml-auto">
                        ▸
                      </span>
                    </summary>
                    <div className="border-t border-border">
                      <div className="max-h-48 overflow-y-auto px-2 py-1.5 space-y-0.5">
                        {segments.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground py-2">
                            No segments yet. Start recording.
                          </p>
                        ) : (
                          segments.map((seg) => (
                            <div
                              key={seg.id}
                              className="group flex gap-1.5 text-[10px] font-mono leading-relaxed rounded hover:bg-secondary/30 -mx-1 px-1 py-0.5"
                            >
                              <span className="text-muted-foreground/60 shrink-0 w-[52px] mt-px">
                                {format(new Date(seg.timestamp), "HH:mm:ss")}
                              </span>
                              <span className="text-primary/80 shrink-0 max-w-[60px] truncate">
                                {seg.speakerName}:
                              </span>
                              <span className="text-foreground/80 break-words min-w-0 flex-1">
                                {seg.text}
                              </span>
                              <span className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-px">
                                <button
                                  type="button"
                                  title="Refine existing visualization from this statement"
                                  disabled={isGenerating}
                                  onClick={() =>
                                    handleGenerateFromSegment(seg, false)
                                  }
                                  className="h-5 px-1.5 rounded text-[9px] font-mono bg-secondary/60 hover:bg-primary/20 hover:text-primary border border-border/60 hover:border-primary/40 disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                  ↻ refine
                                </button>
                                <button
                                  type="button"
                                  title="Generate a fresh new visualization from this statement"
                                  disabled={isGenerating}
                                  onClick={() =>
                                    handleGenerateFromSegment(seg, true)
                                  }
                                  className="h-5 px-1.5 rounded text-[9px] font-mono bg-secondary/60 hover:bg-amber-500/20 hover:text-amber-500 border border-border/60 hover:border-amber-500/40 disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                  ✦ new
                                </button>
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      {segments.length > 0 && (
                        <div className="border-t border-border px-2 py-1.5 flex flex-col gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[10px] font-mono gap-1.5"
                            onClick={() => {
                              const lines = segments.map(
                                (s) =>
                                  `[${format(new Date(s.timestamp), "HH:mm:ss")}] ${s.speakerName}: ${s.text}`,
                              );
                              const header = `Meeting Transcript${meetingTitle ? ` — ${meetingTitle}` : ""}\n${format(new Date(), "yyyy-MM-dd HH:mm")}\n${"─".repeat(50)}\n\n`;
                              const blob = new Blob(
                                [header + lines.join("\n")],
                                { type: "text/plain" },
                              );
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(blob);
                              a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.txt`;
                              a.click();
                              URL.revokeObjectURL(a.href);
                            }}
                          >
                            <Download className="w-3 h-3" />
                            Export TXT
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[10px] font-mono gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                            disabled={clearingTranscript || isGenerating}
                            onClick={() => void handleClearTranscript()}
                          >
                            <RotateCcw className="w-3 h-3" />
                            Clear transskript
                          </Button>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/* Paste Tab */}
            {inputTab === "paste" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="shrink-0 p-3 pb-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Paste export from Teams, Zoom etc. Use lines like{" "}
                    <code className="text-[10px] bg-secondary/50 px-1 rounded">
                      [Jesper]:
                    </code>{" "}
                    or{" "}
                    <code className="text-[10px] bg-secondary/50 px-1 rounded">
                      Name: …
                    </code>{" "}
                    per speaker — matches mic format and AI pipeline.
                  </p>
                </div>
                <div className="flex-1 min-h-0 px-3 flex flex-col gap-0">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="[Jesper]: Let's look at the Excel sheet...&#10;[Klaus]: KPIs for last quarter..."
                    className="flex-1 min-h-[140px] bg-secondary/30 border border-border rounded-lg p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {vizStreamError && (
                    <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/40 text-[11px] text-destructive-foreground flex gap-2 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{vizStreamError}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-2 shrink-0 border-t border-border pt-2 pb-2">
                    <div className="flex gap-2 w-full">
                      <Button
                        type="button"
                        variant="default"
                        className="flex-1 min-w-0 h-9 text-xs font-mono"
                        onClick={() => {
                          handleGenerate(false);
                          setOutputTab("viz");
                        }}
                        disabled={isGenerating || !pasteText.trim()}
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                            Visualize
                          </>
                        )}
                      </Button>
                      {isGenerating && (
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-9 shrink-0 px-3 text-xs font-mono"
                          title="Stop generering"
                          onClick={() => cancelGeneration()}
                        >
                          <Square className="w-3 h-3 mr-1 fill-current" />
                          Stop
                        </Button>
                      )}
                    </div>
                    <details className="group rounded-md border border-border bg-card/40">
                      <summary className="cursor-pointer list-none px-2 py-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <History className="w-3.5 h-3.5 opacity-70" />
                        <span>Transcript history</span>
                        <span className="text-muted-foreground/60">
                          ({pasteHistory.length})
                        </span>
                        <span className="opacity-50 group-open:rotate-90 transition-transform ml-auto">
                          ▸
                        </span>
                      </summary>
                      <div className="max-h-40 overflow-y-auto border-t border-border px-2 py-1.5 space-y-1">
                        {pasteHistory.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground py-2">
                            No saved versions yet. Added when you Visualize.
                          </p>
                        ) : (
                          [...pasteHistory].reverse().map((h) => {
                            const preview = h.text
                              .replace(/\s+/g, " ")
                              .trim()
                              .slice(0, 72);
                            return (
                              <div
                                key={h.id}
                                className="flex items-start gap-2 rounded border border-border/60 bg-secondary/20 p-1.5"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[9px] font-mono text-muted-foreground">
                                    {format(
                                      new Date(h.savedAt),
                                      "dd. MMM HH:mm",
                                    )}
                                  </div>
                                  <p
                                    className="text-[10px] text-foreground/90 line-clamp-2 break-words"
                                    title={h.text}
                                  >
                                    {preview}
                                    {h.text.length > preview.length ? "…" : ""}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 shrink-0 text-[10px] px-2"
                                  onClick={() => setPasteText(h.text)}
                                >
                                  Restore
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                      {pasteHistory.length > 0 && (
                        <div className="border-t border-border px-2 py-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[10px] font-mono text-destructive border-destructive/40 hover:bg-destructive/10"
                            onClick={() => setPasteHistory([])}
                          >
                            Clear historik
                          </Button>
                        </div>
                      )}
                    </details>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {pasteText.trim()
                          ? pasteText.trim().split(/\s+/).length + " words"
                          : "0 words"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPasteText("")}
                        className="text-[10px] font-mono text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sketch Tab */}
            {inputTab === "sketch" && (
              <SketchTab
                previewDataUrl={sketchPreviewDataUrl}
                elementCount={sketchElementCount}
                onOpenCanvas={() => { setIsAnnotationSketch(false); setAnnotateImageDataUrl(null); setSketchModalOpen(true); }}
                isGenerating={isGenerating}
                onVisualize={() => {
                  handleGenerate(false);
                  setOutputTab("viz");
                }}
                onClear={() => {
                  setSketchId(null);
                  setSketchPreviewDataUrl(null);
                  setSketchElementCount(0);
                  setSketchSceneJson(null);
                  if (roomId) {
                    sessionStorage.removeItem(`sketch_id_${roomId}`);
                    sessionStorage.removeItem(`sketch_preview_${roomId}`);
                    sessionStorage.removeItem(`sketch_count_${roomId}`);
                    sessionStorage.removeItem(`sketch_scene_${roomId}`);
                  }
                }}
              />
            )}

            {/* Bottom: word count */}
            <div className="shrink-0 px-3 py-2 border-t border-border flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {inputTab === "mic"
                  ? currentWordCount
                  : inputTab === "paste"
                    ? pasteText.trim().split(/\s+/).filter(Boolean).length
                    : currentWordCount}{" "}
                words
              </span>
              {isRecording && (
                <span className="text-[10px] font-mono text-destructive animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                  REC
                </span>
              )}
            </div>
          </div>

          {/* ─── Right Panel: Config + Viz ─── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Config row */}
            <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card/20 flex flex-wrap items-center gap-3">
              {/* Meeting title */}
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Session title (optional)"
                className="flex-1 min-w-[160px] max-w-[240px] h-8 bg-secondary/50 border border-border rounded px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />

              <select
                value={workspaceDomain}
                onChange={(e) => setWorkspaceDomain(e.target.value)}
                title="Workspace — Gabriel: Excel/meeting data &amp; visualization (Gabriel-minded style)"
                className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer max-w-[140px]"
              >
                {WORKSPACE_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>

              {/* Viz type */}
              <select
                value={vizType}
                onChange={(e) => setVizType(e.target.value)}
                className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer"
              >
                {VIZ_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              {/* Model */}
              <select
                value={vizModel}
                onChange={(e) => setVizModel(e.target.value)}
                className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer"
              >
                {VIZ_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Context toggle */}
              <button
                onClick={() => setShowContext((s) => !s)}
                className={cn(
                  "h-8 px-2.5 flex items-center gap-1.5 rounded border text-xs font-mono transition-colors",
                  showContext
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-white",
                )}
              >
                {showContext ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                Context{" "}
                {hasContext && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                )}
              </button>

              {/* Fresh start checkbox */}
              <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={freshStart}
                  onChange={(e) => setFreshStart(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                Start over
              </label>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt,.yaml,.yml,.json,.csv,.ts,.js,.py,.xml,.toml,.ini,.conf,.log"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Meeting context fields (collapsible) */}
            <AnimatePresence>
              {showContext && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="px-4 pt-3 pb-2 border-b border-border bg-card/40">
                    {/* Text context fields */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[
                        {
                          label: "Purpose",
                          val: ctxPurpose,
                          set: setCtxPurpose,
                          placeholder: "e.g. Design review for pump X",
                        },
                        {
                          label: "Projects / systems",
                          val: ctxProjects,
                          set: setCtxProjects,
                          placeholder: "e.g. iSolutions, CR pump series",
                        },
                        {
                          label: "Participants",
                          val: ctxAttend,
                          set: setCtxAttend,
                          placeholder: "e.g. Lars (PM), Mia (Eng)...",
                        },
                        {
                          label: "Extra context",
                          val: ctxExtra,
                          set: setCtxExtra,
                          placeholder: "e.g. Q2 review, pilot project...",
                        },
                      ].map(({ label, val, set, placeholder }) => (
                        <div key={label} className="flex flex-col gap-1">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                            {label}
                          </label>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            placeholder={placeholder}
                            className="h-7 bg-secondary/40 border border-border rounded px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                      ))}
                    </div>

                    {/* File upload area */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-dashed border-border text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/50 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Upload context file
                      </button>
                      {uploadedFiles.map((f) => (
                        <span
                          key={f.name}
                          className="flex items-center gap-1 h-7 px-2 rounded bg-primary/10 border border-primary/30 text-xs font-mono text-primary"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          {f.name}
                          <button
                            type="button"
                            onClick={() => removeUploadedFile(f.name)}
                            className="ml-0.5 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Previous sessions section */}
                    <div
                      ref={previousSessionsSectionRef}
                      className="mt-2 pt-2 border-t border-border/50 relative"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenSessionPicker}
                          disabled={previousSessions.length >= 4}
                          className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-dashed border-border text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <History className="w-3 h-3" />
                          Tilføj tidligere session
                        </button>
                        {previousSessions.map((s) => (
                          <span
                            key={s.roomId}
                            title={s.title || s.roomId}
                            className="flex items-center gap-1 h-7 px-2 rounded bg-primary/10 border border-primary/30 text-xs font-mono text-primary max-w-[200px]"
                          >
                            <History className="w-3 h-3 shrink-0" />
                            <span className="truncate">{s.title || s.roomId}</span>
                            <button
                              type="button"
                              onClick={() => removePreviousSession(s.roomId)}
                              className="ml-0.5 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Session picker dropdown */}
                      {showSessionPicker && (
                        <div className="mt-2 bg-card border border-border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
                          <div className="p-2 border-b border-border shrink-0">
                            <input
                              type="text"
                              value={sessionPickerSearch}
                              onChange={(e) => setSessionPickerSearch(e.target.value)}
                              placeholder="Søg session..."
                              autoFocus
                              className="w-full h-7 bg-secondary/40 border border-border rounded px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1">
                            {filteredAvailableSessions.length === 0 ? (
                              <div className="px-3 py-3 text-xs font-mono text-muted-foreground text-center">
                                {availableSessions.length === 0
                                  ? "Ingen sessioner fundet"
                                  : "Ingen resultater"}
                              </div>
                            ) : (
                              filteredAvailableSessions.map((s) => (
                                <button
                                  key={s.roomId}
                                  type="button"
                                  onClick={() => handleSelectSession(s.roomId)}
                                  disabled={loadingSessionTranscript === s.roomId}
                                  className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-secondary/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-60"
                                >
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-foreground truncate">
                                      {s.title || s.roomId}
                                    </span>
                                    <span className="text-muted-foreground text-[10px]">
                                      {format(new Date(s.createdAt), "d. MMM yyyy")}
                                      {" · "}
                                      {s.wordCount.toLocaleString()} ord
                                    </span>
                                  </div>
                                  {loadingSessionTranscript === s.roomId && (
                                    <span className="text-muted-foreground text-[10px] shrink-0">
                                      Henter…
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Output tab bar + actions */}
            <div className="shrink-0 flex items-center justify-between px-4 border-b border-border bg-card/30">
              {/* Tabs */}
              <div className="flex">
                {(["viz", "transcript", "actions", "technical"] as OutputTab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setOutputTab(tab)}
                      className={cn(
                        "px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5",
                        outputTab === tab
                          ? "text-white border-b-2 border-primary"
                          : "text-muted-foreground hover:text-white",
                      )}
                    >
                      {tab === "viz" && (
                        <>
                          <Code2 className="w-3.5 h-3.5" />
                          Visualization
                        </>
                      )}
                      {tab === "transcript" && (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          Transcript
                        </>
                      )}
                      {tab === "actions" && (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Forklaring
                        </>
                      )}
                      {tab === "technical" && (
                        <>
                          <BrainCircuit className="w-3.5 h-3.5" />
                          Technical Reasoning
                        </>
                      )}
                    </button>
                  ),
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 py-1.5">
                {outputTab === "viz" && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={autoVizEnabled}
                        onCheckedChange={setAutoVizEnabled}
                        id="auto-viz"
                      />
                      <label
                        htmlFor="auto-viz"
                        className="text-xs font-mono text-muted-foreground cursor-pointer select-none"
                      >
                        Auto{" "}
                        {autoVizEnabled && (
                          <span className="text-primary">
                            [{autoVizCountdown}s]
                          </span>
                        )}
                      </label>
                    </div>

                    <div className="w-px h-5 bg-border" />

                    {activeHtml && (
                      <button
                        onClick={handleExport}
                        title="Download HTML"
                        className="text-muted-foreground hover:text-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handleGenerate(false);
                          setOutputTab("viz");
                        }}
                        disabled={
                          isGenerating || getActiveTranscript().length === 0
                        }
                        className={cn(
                          "h-7 px-3 text-xs transition-all",
                          isGenerating && "border-primary text-primary",
                        )}
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                            Visualize
                          </>
                        )}
                      </Button>
                      {isGenerating && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs font-mono"
                          title="Stop generering"
                          onClick={() => cancelGeneration()}
                        >
                          <Square className="w-3 h-3 mr-1 fill-current" />
                          Stop
                        </Button>
                      )}
                    </div>
                    {streamMeta?.refinement && !isGenerating && (
                      <Badge
                        variant="outline"
                        className="h-5 text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10"
                      >
                        Refined
                      </Badge>
                    )}

                    <div className="w-px h-5 bg-border" />

                    <button
                      onClick={() => setShowDebug((v) => !v)}
                      title="Toggle debug panel"
                      className={cn(
                        "text-xs font-mono px-1.5 py-0.5 rounded transition-colors",
                        showDebug
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "text-muted-foreground/50 hover:text-muted-foreground",
                      )}
                    >
                      DBG
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSessionEval(true)}
                      title="Session-evaluering: download struktureret JSON til forbedringer"
                      className={cn(
                        "text-xs font-mono px-1.5 py-0.5 rounded transition-colors flex items-center gap-1",
                        showSessionEval
                          ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                          : "text-muted-foreground/50 hover:text-muted-foreground",
                      )}
                    >
                      <NotebookText className="w-3 h-3" />
                      EVAL
                      {sessionEval.eventCount > 0 && (
                        <span className="text-[9px] opacity-80">
                          ({sessionEval.eventCount})
                        </span>
                      )}
                    </button>
                  </>
                )}

                {outputTab === "transcript" && segments.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const lines = segments.map(
                          (s) =>
                            `[${format(new Date(s.timestamp), "HH:mm:ss")}] ${s.speakerName}: ${s.text}`,
                        );
                        const header = `Meeting Transcript${meetingTitle ? ` — ${meetingTitle}` : ""}\n${format(new Date(), "yyyy-MM-dd HH:mm")}\n${"─".repeat(50)}\n\n`;
                        const blob = new Blob([header + lines.join("\n")], {
                          type: "text/plain",
                        });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.txt`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="h-7 px-3 text-xs gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      TXT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = {
                          title: meetingTitle || "Untitled Meeting",
                          date: format(new Date(), "yyyy-MM-dd HH:mm"),
                          participants: [
                            ...new Set(segments.map((s) => s.speakerName)),
                          ],
                          wordCount: currentWordCount,
                          segments: segments.map((s) => ({
                            speaker: s.speakerName,
                            text: s.text,
                            timestamp: s.timestamp,
                            time: format(new Date(s.timestamp), "HH:mm:ss"),
                          })),
                        };
                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                          type: "application/json",
                        });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.json`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="h-7 px-3 text-xs gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={clearingTranscript || isGenerating}
                      onClick={() => void handleClearTranscript()}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Clear
                    </Button>
                  </div>
                )}

                {outputTab === "actions" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadActions}
                    disabled={isLoadingActions}
                    className="h-7 px-3 text-xs"
                  >
                    {isLoadingActions ? (
                      <>
                        <RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Henter forklaring…
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        Opdatér forklaring
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Version history strip (viz tab only) */}
            {outputTab === "viz" && vizHistory.length > 0 && (
              <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border overflow-x-auto bg-card/10 min-h-0">
                <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  Versions:
                </span>
                {vizHistory.map((v) => (
                  <button
                    key={v.version}
                    onClick={() => loadVizVersion(v.version)}
                    title={
                      (v.debugSnapshot ? "DBG · " : "") +
                      v.name +
                      " · " +
                      format(new Date(v.timestamp), "HH:mm")
                    }
                    className={cn(
                      "shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors",
                      activeVersion === v.version
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground hover:text-white hover:border-white/40",
                    )}
                  >
                    <span className="font-bold">v{v.version}</span>
                    <span className="max-w-[80px] truncate opacity-70">
                      {v.name}
                    </span>
                    {v.debugSnapshot && (
                      <span className="text-[8px] text-amber-500/90 font-bold">
                        DBG
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Debug panel */}
            {showDebug && outputTab === "viz" && (
              <div className="shrink-0 max-h-[40%] overflow-y-auto border-b border-amber-500/30 bg-amber-950/20 font-mono text-[10px] leading-relaxed">
                <div className="px-4 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400 font-semibold uppercase tracking-wider text-[11px]">
                      Debug Inspector
                      <span className="text-muted-foreground font-mono normal-case ml-2">
                        · v{activeVersion}
                      </span>
                    </span>
                    {displayDebug?.performanceMs != null &&
                      displayDebug.performanceMs > 0 && (
                        <span className="text-muted-foreground">
                          {(displayDebug.performanceMs / 1000).toFixed(1)}s
                          total
                        </span>
                      )}
                  </div>

                  {!displayDebug ? (
                    <p className="text-muted-foreground py-2">
                      {isGenerating
                        ? "Henter debug…"
                        : "Ingen debug gemt for denne version — vælg en version med DBG-badge, eller generér på ny."}
                    </p>
                  ) : (
                    <>
                      {/* Classification section */}
                      <details open className="group">
                        <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                          <span className="opacity-50 group-open:rotate-90 transition-transform">
                            ▸
                          </span>
                          Classification
                        </summary>
                        <div className="ml-3 mt-1 space-y-0.5 text-foreground/70">
                          {displayDebug.classification ? (
                            <>
                              <div>
                                <span className="text-muted-foreground">
                                  Result:
                                </span>{" "}
                                <span className="text-green-400 font-semibold">
                                  {displayDebug.classification.family}
                                </span>{" "}
                                ({displayDebug.classification.topic})
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Lead:
                                </span>{" "}
                                {displayDebug.classification.lead} ·{" "}
                                <span className="text-muted-foreground">
                                  Ambiguous:
                                </span>{" "}
                                {displayDebug.classification.ambiguous
                                  ? "yes"
                                  : "no"}
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Input mode:
                                </span>{" "}
                                {displayDebug.classification.inputMode} ·{" "}
                                <span className="text-muted-foreground">
                                  Words:
                                </span>{" "}
                                {displayDebug.classification.inputWords}/
                                {displayDebug.classification.totalWords}
                              </div>
                              <div className="text-muted-foreground">
                                Scores:{" "}
                                {displayDebug.classification.allScores
                                  ?.map((s: any) => `${s.family}:${s.score}`)
                                  .join(" · ")}
                              </div>
                              <details className="mt-1">
                                <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                                  <span className="opacity-50">▸</span>{" "}
                                  Classification input text
                                </summary>
                                <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-24 overflow-y-auto text-foreground/60">
                                  {displayDebug.classification.inputText}
                                </pre>
                              </details>
                            </>
                          ) : (
                            <div>
                              <span className="text-muted-foreground">
                                Skipped
                              </span>{" "}
                              (user picked type: {displayDebug.vizType})
                            </div>
                          )}
                        </div>
                      </details>

                      {/* Generation config */}
                      <details open className="group">
                        <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                          <span className="opacity-50 group-open:rotate-90 transition-transform">
                            ▸
                          </span>
                          Generation Config
                        </summary>
                        <div className="ml-3 mt-1 space-y-0.5 text-foreground/70">
                          <div>
                            <span className="text-muted-foreground">
                              Family:
                            </span>{" "}
                            <span className="text-blue-400">
                              {displayDebug.resolvedFamily ?? "none"}
                            </span>{" "}
                            ·{" "}
                            <span className="text-muted-foreground">
                              Model:
                            </span>{" "}
                            {displayDebug.vizModel} ·{" "}
                            <span className="text-muted-foreground">Type:</span>{" "}
                            {displayDebug.vizType}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Incremental:
                            </span>{" "}
                            {displayDebug.isIncremental ? "yes" : "no"} ·{" "}
                            <span className="text-muted-foreground">
                              Refinement:
                            </span>{" "}
                            {displayDebug.isRefinement ? "yes" : "no"} ·{" "}
                            <span className="text-muted-foreground">
                              Has prev HTML:
                            </span>{" "}
                            {displayDebug.hasPreviousHtml ? "yes" : "no"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Domain:
                            </span>{" "}
                            {displayDebug.workspaceDomain ?? "none"} ·{" "}
                            <span className="text-muted-foreground">
                              Words:
                            </span>{" "}
                            {displayDebug.transcriptTotalWords} ·{" "}
                            <span className="text-muted-foreground">Room:</span>{" "}
                            {displayDebug.roomId}
                          </div>
                          {displayDebug.focusSegment && (
                            <div>
                              <span className="text-muted-foreground">
                                Focus:
                              </span>{" "}
                              {displayDebug.focusSegment}
                            </div>
                          )}
                          {displayDebug.refinementDirective && (
                            <div>
                              <span className="text-muted-foreground">
                                Directive:
                              </span>{" "}
                              {displayDebug.refinementDirective}
                            </div>
                          )}
                        </div>
                      </details>

                      {/* Prompt */}
                      {displayDebug.prompt && (
                        <details className="group">
                          <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                            <span className="opacity-50 group-open:rotate-90 transition-transform">
                              ▸
                            </span>
                            Full Prompt ({displayDebug.prompt.model} ·{" "}
                            {displayDebug.prompt.maxTokens} max tokens)
                          </summary>
                          <div className="ml-3 mt-1 space-y-2">
                            <details>
                              <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                                <span className="opacity-50">▸</span> System
                                prompt (
                                {displayDebug.prompt.systemPrompt.length} chars)
                              </summary>
                              <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/60">
                                {displayDebug.prompt.systemPrompt}
                              </pre>
                            </details>
                            <details>
                              <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                                <span className="opacity-50">▸</span> User
                                message (
                                {displayDebug.prompt.userMessage.length} chars)
                              </summary>
                              <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/60">
                                {displayDebug.prompt.userMessage}
                              </pre>
                            </details>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <RoomOutputPanels
              outputTab={outputTab}
              activeHtml={activeHtml}
              isGenerating={isGenerating}
              roomId={roomId}
              meetingTitle={meetingTitle}
              meetingContextForIframe={meetingContextForIframe}
              workspaceDomain={workspaceDomain}
              segments={segments}
              interimText={interimText}
              currentWordCount={currentWordCount}
              speakerColorMap={speakerColorMap}
              reasoningText={reasoningText}
              isLoadingActions={isLoadingActions}
              debugInfo={displayDebug}
              onAnnotate={handleVizAnnotate}
            />
          </div>
        </main>
      </div>

      <SessionEvalSheet
        open={showSessionEval}
        onOpenChange={setShowSessionEval}
        events={sessionEval.events}
        roomId={roomId}
        meetingTitle={meetingTitle}
        workspaceDomain={workspaceDomain}
        sessionStartedAtRef={sessionStartedAtRef}
        getTranscriptWordCount={getEvalWordCount}
        getSegmentCount={() => segments.length}
        getParticipantNames={() => [
          ...new Set(segments.map((s) => s.speakerName)),
        ]}
        onClearLog={sessionEval.clearLog}
      />
    </>
  );
}
