import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Users, Code2, Play, Pencil, Check,
  RefreshCcw, AlertTriangle,
  ChevronDown, ChevronUp, ClipboardList, Wand2,
  Download, Maximize2, RotateCcw, History, FileText,
  Upload, X,
} from "lucide-react";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

import { cn } from "@/lib/utils";
import { passesVisualizationWordGate, MIN_WORDS_FOR_VISUALIZATION } from "@/lib/viz-gate";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSpeech } from "@/hooks/use-speech";
import { useDeepgramSpeech } from "@/hooks/use-deepgram-speech";
import { useRoomSSE } from "@/hooks/use-room-sse";
import { useVisualizeStream } from "@/hooks/use-visualize-stream";
import { usePostSegment } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { IframeRenderer } from "@/components/IframeRenderer";
import { toast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type InputTab  = "mic" | "paste";
type OutputTab = "viz" | "actions" | "transcript";

interface VizVersion {
  version: number;
  name: string;
  html: string;
  timestamp: number;
}

const VIZ_TYPES = [
  { value: "auto",         label: "Auto-detect" },
  { value: "hmi",          label: "HMI / SCADA" },
  { value: "journey",      label: "User Journey" },
  { value: "persona",      label: "Persona / Research" },
  { value: "blueprint",    label: "Service Blueprint" },
  { value: "comparison",   label: "Comparison / Evaluation" },
  { value: "designsystem", label: "Design System" },
  { value: "workflow",     label: "Workflow / Process" },
  { value: "product",      label: "Product / Hardware" },
  { value: "requirements", label: "Requirements" },
  { value: "management",   label: "Management Overview" },
  { value: "timeline",     label: "Timeline / Roadmap" },
  { value: "stakeholders", label: "Stakeholder Map" },
  { value: "kanban",       label: "Kanban / Tasks" },
  { value: "decisions",    label: "Decision Log" },
];

const VIZ_MODELS = [
  { value: "haiku",        label: "Haiku (fast)" },
  { value: "sonnet",       label: "Sonnet (balanced)" },
  { value: "opus",         label: "Opus (best)" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "gemini-pro",   label: "Gemini Pro" },
];

/** Styrer system-prompt og branding (Grundfos vs Gabriel vs neutral). */
const WORKSPACE_DOMAINS = [
  { value: "grundfos", label: "Grundfos" },
  { value: "gabriel",  label: "Gabriel (data)" },
  { value: "generic",  label: "Generic" },
] as const;

/** Kommasepareret — gemmes i localStorage; bruges som hurtigvalg for [Navn]: i transskriptet. */
const WORKSHOP_ROSTER_DEFAULT = "Jesper,Klaus,Maria,Anna,Facilitator";

function extractVizName(html: string): string | null {
  const div = document.createElement("div");
  div.innerHTML = html;
  const h1 = div.querySelector("h1");
  if (h1 && h1.textContent && h1.textContent.trim().length > 2)
    return h1.textContent.trim().slice(0, 42);
  const h2 = div.querySelector("h2");
  if (h2 && h2.textContent && h2.textContent.trim().length > 2)
    return h2.textContent.trim().slice(0, 42);
  return null;
}

const MAX_VIZ_HISTORY = 20;
const MAX_PASTE_HISTORY = 25;

interface PasteHistoryEntry {
  id: string;
  savedAt: number;
  text: string;
}
const BASE = import.meta.env.BASE_URL;

const SPEAKER_COLORS = [
  { bg: "bg-blue-500/15",    border: "border-blue-500/30",    text: "text-blue-300",    dot: "bg-blue-400" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-300",   dot: "bg-amber-400" },
  { bg: "bg-violet-500/15",  border: "border-violet-500/30",  text: "text-violet-300",  dot: "bg-violet-400" },
  { bg: "bg-rose-500/15",    border: "border-rose-500/30",    text: "text-rose-300",    dot: "bg-rose-400" },
  { bg: "bg-cyan-500/15",    border: "border-cyan-500/30",    text: "text-cyan-300",    dot: "bg-cyan-400" },
  { bg: "bg-orange-500/15",  border: "border-orange-500/30",  text: "text-orange-300",  dot: "bg-orange-400" },
  { bg: "bg-pink-500/15",    border: "border-pink-500/30",    text: "text-pink-300",    dot: "bg-pink-400" },
  { bg: "bg-lime-500/15",    border: "border-lime-500/30",    text: "text-lime-300",    dot: "bg-lime-400" },
  { bg: "bg-indigo-500/15",  border: "border-indigo-500/30",  text: "text-indigo-300",  dot: "bg-indigo-400" },
];

function getSpeakerColor(speakerName: string, speakerMap: Map<string, number>): typeof SPEAKER_COLORS[number] {
  if (!speakerMap.has(speakerName)) {
    speakerMap.set(speakerName, speakerMap.size);
  }
  const idx = speakerMap.get(speakerName)! % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[idx];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const [speakerName, setSpeakerName] = useLocalStorage("meetingVisualizer_speakerName", "Anonymous");
  const [workshopRosterCsv, setWorkshopRosterCsv] = useLocalStorage(
    "meetingVisualizer_workshopRoster",
    WORKSHOP_ROSTER_DEFAULT
  );
  const [workspaceDomain, setWorkspaceDomain] = useLocalStorage("meetingVisualizer_workspaceDomain", "grundfos");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [language, setLanguage] = useState("da-DK");
  const [autoVizEnabled, setAutoVizEnabled] = useState(false);
  const [autoVizCountdown, setAutoVizCountdown] = useState(45);

  // Input tabs
  const [inputTab, setInputTab] = useState<InputTab>("mic");
  const [pasteText, setPasteText] = useState("");
  const [pasteHistory, setPasteHistory] = useState<PasteHistoryEntry[]>([]);

  // Output tabs
  const [outputTab, setOutputTab] = useState<OutputTab>("viz");
  const [showDebug, setShowDebug] = useState(false);

  // Viz config
  const [vizType, setVizType] = useState("auto");
  const [vizModel, setVizModel] = useState("haiku");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [freshStart, setFreshStart] = useState(false);

  // Meeting context
  const [showContext, setShowContext] = useState(false);
  const [ctxPurpose, setCtxPurpose] = useState("");
  const [ctxProjects, setCtxProjects] = useState("");
  const [ctxAttend, setCtxAttend] = useState("");
  const [ctxExtra, setCtxExtra] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transcription mode: "browser" = Web Speech API, "deepgram" = Deepgram (diarization)
  const [transcriptionMode, setTranscriptionMode] = useLocalStorage<"browser" | "deepgram">(
    "meetingVisualizer_transcriptionMode",
    "browser"
  );
  // Maps Deepgram speaker ID (0,1,2…) → display name
  const [deepgramSpeakerNames, setDeepgramSpeakerNames] = useState<Record<number, string>>({});

  // Version history
  const [vizHistory, setVizHistory] = useState<VizVersion[]>([]);
  const vizVersionCounterRef = useRef(0);
  const [activeVersion, setActiveVersion] = useState(0);
  const [displayHtml, setDisplayHtml] = useState<string>("");

  // Actions/decisions
  const [actionsHtml, setActionsHtml] = useState("");
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const actionsHtmlRef = useRef("");

  const transcriptRef = useRef<HTMLDivElement>(null);

  // API & SSE hooks
  const { segments, participants, visualization: sseViz, connectionStatus, addLocalSegment } = useRoomSSE(roomId!);
  const { mutateAsync: postSegment } = usePostSegment();
  const { generate, isGenerating, streamedHtml, meta: streamMeta, error: vizStreamError, debugInfo } = useVisualizeStream();

  const activeHtml = isGenerating ? streamedHtml : (displayHtml || sseViz.html);

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
    () => segments.map(s => `[${s.speakerName}]: ${s.text}`).join("\n"),
    [segments]
  );
  const currentWordCount = useMemo(
    () => (fullText.trim() === "" ? 0 : fullText.split(/\s+/).length),
    [fullText]
  );

  const workshopQuickNames = useMemo(
    () =>
      workshopRosterCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 16),
    [workshopRosterCsv]
  );

  // The transcript to use for visualization
  const getActiveTranscript = useCallback(() => {
    if (inputTab === "paste") return pasteText.trim();
    return fullText.trim();
  }, [inputTab, pasteText, fullText]);

  const appendPasteHistoryIfNeeded = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setPasteHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].text === t) return prev;
      const entry: PasteHistoryEntry = { id: uuidv4(), savedAt: Date.now(), text: t };
      const next = [...prev, entry];
      return next.length > MAX_PASTE_HISTORY ? next.slice(-MAX_PASTE_HISTORY) : next;
    });
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setUploadedFiles(prev => {
          if (prev.some(f => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content }];
        });
      };
      reader.readAsText(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeUploadedFile = useCallback((name: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== name));
  }, []);

  const getMeetingContext = useCallback(() => {
    const parts: string[] = [];
    if (ctxPurpose)  parts.push("Purpose: " + ctxPurpose);
    if (ctxProjects) parts.push("Projects/systems: " + ctxProjects);
    if (ctxAttend)   parts.push("Participants: " + ctxAttend);
    if (ctxExtra)    parts.push("Context: " + ctxExtra);
    if (uploadedFiles.length > 0) {
      uploadedFiles.forEach(f => {
        parts.push(`\n--- FILE: ${f.name} ---\n${f.content}\n--- END FILE ---`);
      });
    }
    return parts.join("\n") || null;
  }, [ctxPurpose, ctxProjects, ctxAttend, ctxExtra, uploadedFiles]);

  const hasContext = ctxPurpose || ctxProjects || ctxAttend || ctxExtra || uploadedFiles.length > 0;

  // ── Version history ─────────────────────────────────────────────────────────
  const addVizVersion = useCallback((html: string) => {
    const trimmed = html.trim();
    if (trimmed.length < 50) return;
    setVizHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && last.html.trim() === trimmed) return prev;
      const capped = prev.length >= MAX_VIZ_HISTORY ? prev.slice(1) : prev;
      vizVersionCounterRef.current += 1;
      const version = vizVersionCounterRef.current;
      const name = extractVizName(html) || `Version ${version}`;
      setActiveVersion(version);
      return [...capped, { version, name, html: trimmed, timestamp: Date.now() }];
    });
  }, []);

  // When a new viz arrives from streaming, add it to history
  // After the first successful visualization, auto-upgrade to Opus for better quality
  useEffect(() => {
    if (!isGenerating && streamedHtml && streamedHtml.length > 50) {
      setDisplayHtml(streamedHtml);
      addVizVersion(streamedHtml);
      setVizModel(prev => prev === "haiku" ? "opus" : prev);
    }
  }, [isGenerating, streamedHtml, addVizVersion]);

  // When SSE viz arrives from another user
  useEffect(() => {
    if (sseViz.html && !isGenerating) {
      setDisplayHtml(sseViz.html);
      addVizVersion(sseViz.html);
    }
  }, [sseViz.html]);

  const loadVizVersion = useCallback((version: number) => {
    const entry = vizHistory.find(v => v.version === version);
    if (!entry) return;
    setActiveVersion(version);
    setDisplayHtml(entry.html);
  }, [vizHistory]);

  // ── Speech ───────────────────────────────────────────────────────────────────
  // detectedSpeaker is provided by Deepgram mode; falls back to the manual speakerName
  const handleFinalSegment = useCallback(async (text: string, detectedSpeaker?: string) => {
    if (!roomId) return;
    const effectiveSpeaker = detectedSpeaker ?? speakerName;
    const newSegment = {
      id: uuidv4(),
      speakerName: effectiveSpeaker,
      text,
      timestamp: Date.now(),
      isFinal: true
    };
    addLocalSegment(newSegment);
    try {
      await postSegment({
        data: { roomId, speakerName: effectiveSpeaker, text, timestamp: newSegment.timestamp, isFinal: true, id: newSegment.id } as any
      });
    } catch (err) {
      console.error("Failed to post segment", err);
    }
  }, [roomId, speakerName, addLocalSegment, postSegment]);

  const deepgramKeywords = useMemo(() => {
    const vizKeywords = [
      "user journey:5", "journey mapping:5", "journey map:5",
      "user journey mapping:5", "customer journey:5", "customer journey map:5",
      "experience map:4", "experience mapping:4",
      "touchpoint:4", "touchpoints:4", "touch point:4", "touch points:4",
      "pain point:4", "pain points:4", "painpoint:4",
      "moments of truth:4",
      "swimlane:4", "swim lane:4", "swim lanes:4",
      "onboarding:3", "onboarding flow:4",
      "emotion curve:4", "emotion:3",
      "storyboard:3", "user flow:4",

      "workflow:5", "flowchart:5", "flow chart:5",
      "process flow:4", "process diagram:4", "process map:4",
      "decision diamond:3", "decision tree:4",
      "BPMN:4", "value stream:4", "value stream mapping:5",
      "approval flow:3", "approval workflow:4",
      "handover:3", "RACI:4",

      "HMI:5", "SCADA:5", "dashboard:5",
      "interface:4", "user interface:4",
      "gauge:3", "gauges:3", "control panel:4",
      "operator screen:4", "navigation panel:4",
      "tab interface:4", "dark theme:3",
      "alarm:3", "setpoint:3", "set point:3",

      "persona:5", "personas:4", "empathy map:5",
      "empathy:3", "archetype:3",
      "research findings:4", "research insights:4",
      "user needs:4", "user research:4",
      "jobs to be done:4", "JTBD:4",

      "service blueprint:5", "blueprint:4",
      "information architecture:5", "sitemap:4", "site map:4",
      "ecosystem map:4", "ecosystem:3",
      "stakeholder map:4", "stakeholder:3",

      "requirements:4", "requirements matrix:5",
      "traceability:4", "traceability matrix:5",
      "specification:3", "MoSCoW:5",
      "must have:3", "should have:3", "could have:3",

      "roadmap:5", "timeline:5", "Gantt:5",
      "milestone:4", "milestones:4",
      "kanban:4", "decision log:4",
      "management summary:4",

      "comparison:4", "comparison matrix:5",
      "SWOT:5", "SWOT analysis:5",
      "evaluation:4", "evaluation matrix:5",
      "scorecard:4", "prioritization:4",
      "competitive analysis:4",

      "design system:5", "component spec:4",
      "style guide:4", "design tokens:4", "tokens:3",

      "visualization:4", "visualize:4", "visualise:4",
      "diagram:3", "chart:3", "matrix:3",
      "overview:3", "summary:3",

      "brugerrejse:5", "kunderejse:5",
      "berøringspunkt:4", "smertepunkt:4",
      "arbejdsgang:4", "flowdiagram:5",
      "procesdiagram:4", "kravspecifikation:5",
      "kravmatrix:5", "tidslinje:4",
      "sammenligning:4", "designsystem:4",
    ];
    const domainKeywords = workspaceDomain === "grundfos"
      ? [
          "pumpe:5", "pumper:5", "Grundfos:5", "iSolutions:5",
          "tryktab:3", "vandmåler:3", "CRA:5",
          "Cyber Resilience Act:5", "NIS2:4",
          "Alpha GO:5", "CU 200:5", "CU 352:4",
          "commissioning:4", "installer:4",
          "firmware:3", "access control:4",
          "compliance:4", "conformity:3",
          "IEC 62443:4", "ATEX:3",
          "motor:3", "impeller:3", "flange:3",
          "frequency converter:4",
        ]
      : workspaceDomain === "gabriel"
      ? [
          "Gabriel:5", "tekstil:5", "stoffer:4",
          "kollektion:4", "møbel:3", "polstring:3",
          "bæredygtighed:4", "certificering:3",
        ]
      : [];
    const ctxWords = [ctxPurpose, ctxProjects, ctxExtra]
      .join(" ")
      .match(/\b[A-ZÆØÅ][a-zæøå]{2,}\b/g) ?? [];
    const ctxKeywords = [...new Set(ctxWords)].slice(0, 10).map(w => `${w}:2`);
    return [...vizKeywords, ...domainKeywords, ...ctxKeywords];
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

  const { isRecording, interimText, toggleRecording, error: speechError } =
    transcriptionMode === "deepgram" ? deepgramSpeech : browserSpeech;

  const detectedSpeakers: number[] = transcriptionMode === "deepgram"
    ? deepgramSpeech.detectedSpeakers
    : [];

  // ── Visualization ────────────────────────────────────────────────────────────
  const prevHtmlRef = useRef<string>("");
  useEffect(() => { prevHtmlRef.current = displayHtml || sseViz.html || ""; }, [displayHtml, sseViz.html]);

  const handleGenerate = useCallback((auto = false) => {
    const transcript = getActiveTranscript();
    if (!transcript) return;

    const userPickedType = vizType !== "auto";
    if (!passesVisualizationWordGate(transcript, userPickedType)) {
      if (!auto) {
        toast({
          title: "Not enough text to visualize",
          description: `Ved Auto-detect bruges mindst ${MIN_WORDS_FOR_VISUALIZATION} ord — eller vælg en fast visualization-type.`,
        });
      }
      return;
    }

    if (inputTab === "paste") appendPasteHistoryIfNeeded(transcript);

    const previous = !freshStart ? (prevHtmlRef.current || null) : null;

    generate({
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
    });
  }, [
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
    appendPasteHistoryIfNeeded,
  ]);

  // Per-segment manual trigger: user picks a segment + mode (refine or fresh)
  const handleGenerateFromSegment = useCallback((seg: { speakerName: string; text: string }, isFresh: boolean) => {
    const transcript = getActiveTranscript();
    if (!transcript) return;
    const previous = !isFresh ? (prevHtmlRef.current || null) : null;
    generate({
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
    });
    setOutputTab("viz");
  }, [getActiveTranscript, roomId, vizType, vizModel, meetingTitle, getMeetingContext, generate, workspaceDomain]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [segments, interimText]);

  // Refs for auto-viz interval
  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => { handleGenerateRef.current = handleGenerate; }, [handleGenerate]);
  const currentWordCountRef = useRef(currentWordCount);
  useEffect(() => { currentWordCountRef.current = currentWordCount; }, [currentWordCount]);
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

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
      autoVizCountdownRef.current -= 1;
      const next = autoVizCountdownRef.current;
      setAutoVizCountdown(next);

      if (next <= 0) {
        const hasNewContent = currentWordCountRef.current > lastVizWordCountRef.current;
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

  // ── Actions / Decisions ──────────────────────────────────────────────────────
  const handleLoadActions = useCallback(async () => {
    const transcript = getActiveTranscript();
    if (!transcript) return;
    setIsLoadingActions(true);
    actionsHtmlRef.current = "";
    setActionsHtml("");

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
              actionsHtmlRef.current += d.text;
              setActionsHtml(actionsHtmlRef.current);
            }
          } catch { }
        }
      }
    } catch (err) {
      console.error(err);
      setActionsHtml("<p style='color:red'>Failed to extract actions. Please try again.</p>");
    } finally {
      setIsLoadingActions(false);
    }
  }, [getActiveTranscript, roomId, meetingTitle, getMeetingContext, workspaceDomain]);

  // Auto-load actions when tab switches
  const hasLoadedActionsRef = useRef(false);
  useEffect(() => {
    if (outputTab === "actions" && !hasLoadedActionsRef.current && getActiveTranscript()) {
      hasLoadedActionsRef.current = true;
      handleLoadActions();
    }
  }, [outputTab]);

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
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="h-14 glass-panel border-x-0 border-t-0 flex items-center justify-between px-4 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <img src={`${BASE}images/logo-mark.png`} className="w-7 h-7" alt="Logo" />
          <div className="flex items-center gap-2">
            <h1 className="text-base font-display leading-none text-white">AI Visualizer</h1>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"   ? "bg-green-500" :
              connectionStatus === "connecting"  ? "bg-yellow-500 animate-pulse" : "bg-red-500"
            }`} />
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
              return <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border", colors.bg, colors.border, colors.text)}>
                {speakerName.charAt(0).toUpperCase()}
              </div>;
            })()}
            {isEditingName ? (
              <form onSubmit={(e) => { e.preventDefault(); if (editNameValue.trim()) { setSpeakerName(editNameValue.trim()); } setIsEditingName(false); }} className="flex items-center gap-1">
                <input
                  autoFocus
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                  onBlur={() => { if (editNameValue.trim()) { setSpeakerName(editNameValue.trim()); } setIsEditingName(false); }}
                  className="w-20 bg-transparent border-b border-primary text-xs font-mono text-white outline-none"
                  maxLength={20}
                />
                <button type="submit" className="text-primary hover:text-white">
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => { setEditNameValue(speakerName); setIsEditingName(true); }}
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
                      colors.bg, colors.border, colors.text
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
            onChange={e => setLanguage(e.target.value)}
            className="bg-secondary text-xs font-mono text-foreground border border-border rounded px-2 py-1 cursor-pointer hover:text-white transition-colors [&>option]:bg-secondary [&>option]:text-foreground"
          >
            <option value="da-DK">DA-DK</option>
            <option value="en-US">EN-US</option>
          </select>

          {/* Record button */}
          <Button
            variant={isRecording ? "destructive" : "default"}
            className="h-8 px-4 text-xs transition-all relative overflow-hidden"
            onClick={toggleRecording}
          >
            {isRecording && <span className="absolute inset-0 bg-white/10 animate-pulse" />}
            {isRecording ? <MicOff className="w-3.5 h-3.5 mr-1.5" /> : <Mic className="w-3.5 h-3.5 mr-1.5" />}
            {isRecording ? "Stop" : "Record"}
          </Button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex overflow-hidden min-h-0">

        {/* ─── Left Panel: Input ─── */}
        <div className="w-[360px] shrink-0 border-r border-border flex flex-col bg-card/30 min-h-0">

          {/* Input tab switcher */}
          <div className="flex border-b border-border shrink-0">
            {(["mic", "paste"] as InputTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setInputTab(tab)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors",
                  inputTab === tab
                    ? "text-white border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {tab === "mic" ? "🎙 Mic" : "📋 Paste"}
              </button>
            ))}
          </div>

          {speechError && inputTab === "mic" && (
            <div className="p-2 mx-3 mt-2 bg-destructive/10 border border-destructive/50 rounded-lg flex items-start gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive-foreground">{speechError}</p>
            </div>
          )}

          {/* Mic Tab */}
          {inputTab === "mic" && (
            <div className="flex-1 flex flex-col min-h-0">

              {/* Transcription mode toggle */}
              <div className="shrink-0 px-3 py-2 border-b border-border bg-card/20 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Transcription</span>
                <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-mono">
                  {(["browser", "deepgram"] as const).map(mode => (
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
                        "disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <span className="text-[10px] font-mono text-primary w-16 shrink-0">Speaker {id + 1}</span>
                      <input
                        type="text"
                        value={deepgramSpeakerNames[id] ?? ""}
                        onChange={(e) =>
                          setDeepgramSpeakerNames((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                        placeholder={`Speaker ${id + 1}`}
                        className="flex-1 h-6 bg-secondary/40 border border-border rounded px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  ))}
                </div>
              )}

              {transcriptionMode === "browser" && (
              <div className="shrink-0 px-3 py-2 border-b border-border bg-card/40 space-y-2">
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mr-0.5">
                    Quick select
                  </span>
                  {workshopQuickNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSpeakerName(name)}
                      title={`Set active speaker to ${name}`}
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors",
                        speakerName === name
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-primary/40"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <details className="group text-[10px]">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                    <span className="opacity-60 group-open:rotate-90 transition-transform inline-block">▸</span>
                    Customise name list (comma-separated)
                  </summary>
                  <input
                    type="text"
                    value={workshopRosterCsv}
                    onChange={(e) => setWorkshopRosterCsv(e.target.value)}
                    className="mt-1.5 w-full h-7 bg-secondary/50 border border-border rounded px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Jesper, Klaus, Maria, …"
                    spellCheck={false}
                  />
                </details>
              </div>
              )}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" ref={transcriptRef}>
              <AnimatePresence initial={false}>
                {segments.map((seg, i) => {
                  const isMe = seg.speakerName === speakerName;
                  const showSpeaker = i === 0 || segments[i - 1].speakerName !== seg.speakerName;
                  const colors = getSpeakerColor(seg.speakerName, speakerColorMap);
                  return (
                    <motion.div
                      key={seg.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                    >
                      {showSpeaker && (
                        <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                          <span className={cn("w-2 h-2 rounded-full", colors.dot)} />
                          <span className={cn("text-[10px] font-mono tracking-wider uppercase", colors.text)}>
                            {seg.speakerName}
                          </span>
                          <span className="text-[9px] font-mono text-muted-foreground/50">
                            {format(new Date(seg.timestamp), "HH:mm:ss")}
                          </span>
                        </div>
                      )}
                      <div className={cn(
                        "px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed border",
                        isMe ? "rounded-tr-sm" : "rounded-tl-sm",
                        colors.bg,
                        colors.border,
                        "text-foreground"
                      )}>
                        {seg.text}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {interimText && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
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
                    <p className="text-xs font-mono opacity-60">Start recording to capture speech</p>
                  </div>
                </div>
              )}
              </div>

              {/* Visualize + Viz history — mirrors paste tab */}
              <div className="shrink-0 px-3 pt-2 pb-2 border-t border-border flex flex-col gap-2">
                {vizStreamError && (
                  <div className="p-2 rounded-md bg-destructive/10 border border-destructive/40 text-[11px] text-destructive-foreground flex gap-2 items-start">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{vizStreamError}</span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="default"
                  className="w-full h-9 text-xs font-mono"
                  onClick={() => { handleGenerate(false); setOutputTab("viz"); }}
                  disabled={isGenerating || currentWordCount === 0}
                >
                  {isGenerating ? (
                    <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating…</>
                  ) : (
                    <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Visualize from transcript</>
                  )}
                </Button>
                <details className="group rounded-md border border-border bg-card/40">
                  <summary className="cursor-pointer list-none px-2 py-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <FileText className="w-3.5 h-3.5 opacity-70" />
                    <span>Transcript log</span>
                    <span className="text-muted-foreground/60">({segments.length})</span>
                    <span className="opacity-50 group-open:rotate-90 transition-transform ml-auto">▸</span>
                  </summary>
                  <div className="border-t border-border">
                    <div className="max-h-48 overflow-y-auto px-2 py-1.5 space-y-0.5">
                      {segments.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground py-2">No segments yet. Start recording.</p>
                      ) : (
                        segments.map((seg) => (
                          <div key={seg.id} className="group flex gap-1.5 text-[10px] font-mono leading-relaxed rounded hover:bg-secondary/30 -mx-1 px-1 py-0.5">
                            <span className="text-muted-foreground/60 shrink-0 w-[52px] mt-px">
                              {format(new Date(seg.timestamp), "HH:mm:ss")}
                            </span>
                            <span className="text-primary/80 shrink-0 max-w-[60px] truncate">{seg.speakerName}:</span>
                            <span className="text-foreground/80 break-words min-w-0 flex-1">{seg.text}</span>
                            <span className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-px">
                              <button
                                type="button"
                                title="Refine existing visualization from this statement"
                                disabled={isGenerating}
                                onClick={() => handleGenerateFromSegment(seg, false)}
                                className="h-5 px-1.5 rounded text-[9px] font-mono bg-secondary/60 hover:bg-primary/20 hover:text-primary border border-border/60 hover:border-primary/40 disabled:opacity-40 transition-colors cursor-pointer"
                              >↻ refine</button>
                              <button
                                type="button"
                                title="Generate a fresh new visualization from this statement"
                                disabled={isGenerating}
                                onClick={() => handleGenerateFromSegment(seg, true)}
                                className="h-5 px-1.5 rounded text-[9px] font-mono bg-secondary/60 hover:bg-amber-500/20 hover:text-amber-500 border border-border/60 hover:border-amber-500/40 disabled:opacity-40 transition-colors cursor-pointer"
                              >✦ new</button>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {segments.length > 0 && (
                      <div className="border-t border-border px-2 py-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-[10px] font-mono gap-1.5"
                          onClick={() => {
                            const lines = segments.map(s =>
                              `[${format(new Date(s.timestamp), "HH:mm:ss")}] ${s.speakerName}: ${s.text}`
                            );
                            const header = `Meeting Transcript${meetingTitle ? ` — ${meetingTitle}` : ""}\n${format(new Date(), "yyyy-MM-dd HH:mm")}\n${"─".repeat(50)}\n\n`;
                            const blob = new Blob([header + lines.join("\n")], { type: "text/plain" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.txt`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          }}
                        >
                          <Download className="w-3 h-3" />Export TXT
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
                  <code className="text-[10px] bg-secondary/50 px-1 rounded">[Jesper]:</code> or{" "}
                  <code className="text-[10px] bg-secondary/50 px-1 rounded">Name: …</code> per speaker — matches mic format and AI pipeline.
                </p>
              </div>
              <div className="flex-1 min-h-0 px-3 flex flex-col gap-0">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
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
                  <Button
                    type="button"
                    variant="default"
                    className="w-full h-9 text-xs font-mono"
                    onClick={() => {
                      handleGenerate(false);
                      setOutputTab("viz");
                    }}
                    disabled={isGenerating || !pasteText.trim()}
                  >
                    {isGenerating ? (
                      <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating…</>
                    ) : (
                      <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Visualize from pasted text</>
                    )}
                  </Button>
                  <details className="group rounded-md border border-border bg-card/40">
                    <summary className="cursor-pointer list-none px-2 py-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <History className="w-3.5 h-3.5 opacity-70" />
                      <span>Transcript history</span>
                      <span className="text-muted-foreground/60">({pasteHistory.length})</span>
                      <span className="opacity-50 group-open:rotate-90 transition-transform ml-auto">▸</span>
                    </summary>
                    <div className="max-h-40 overflow-y-auto border-t border-border px-2 py-1.5 space-y-1">
                      {pasteHistory.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground py-2">No saved versions yet. Added when you Visualize.</p>
                      ) : (
                        [...pasteHistory].reverse().map((h) => {
                          const preview = h.text.replace(/\s+/g, " ").trim().slice(0, 72);
                          return (
                            <div
                              key={h.id}
                              className="flex items-start gap-2 rounded border border-border/60 bg-secondary/20 p-1.5"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[9px] font-mono text-muted-foreground">
                                  {format(new Date(h.savedAt), "dd. MMM HH:mm")}
                                </div>
                                <p className="text-[10px] text-foreground/90 line-clamp-2 break-words" title={h.text}>
                                  {preview}{h.text.length > preview.length ? "…" : ""}
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
                  </details>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {pasteText.trim() ? pasteText.trim().split(/\s+/).length + " words" : "0 words"}
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

          {/* Bottom: word count */}
          <div className="shrink-0 px-3 py-2 border-t border-border flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {inputTab === "mic" ? currentWordCount : (pasteText.trim().split(/\s+/).filter(Boolean).length)} words
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
              onChange={e => setMeetingTitle(e.target.value)}
              placeholder="Meeting title (optional)"
              className="flex-1 min-w-[160px] max-w-[240px] h-8 bg-secondary/50 border border-border rounded px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />

            <select
              value={workspaceDomain}
              onChange={e => setWorkspaceDomain(e.target.value)}
              title="Workspace — Gabriel: Excel/meeting data &amp; visualization (Gabriel-minded style)"
              className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer max-w-[140px]"
            >
              {WORKSPACE_DOMAINS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>

            {/* Viz type */}
            <select
              value={vizType}
              onChange={e => setVizType(e.target.value)}
              className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer"
            >
              {VIZ_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Model */}
            <select
              value={vizModel}
              onChange={e => setVizModel(e.target.value)}
              className="h-8 bg-secondary/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none cursor-pointer"
            >
              {VIZ_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {/* Context toggle */}
            <button
              onClick={() => setShowContext(s => !s)}
              className={cn(
                "h-8 px-2.5 flex items-center gap-1.5 rounded border text-xs font-mono transition-colors",
                showContext ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-white"
              )}
            >
              {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Context {hasContext && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
            </button>

            {/* Fresh start checkbox */}
            <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={freshStart}
                onChange={e => setFreshStart(e.target.checked)}
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
                      { label: "Purpose", val: ctxPurpose, set: setCtxPurpose, placeholder: "e.g. Design review for pump X" },
                      { label: "Projects / systems", val: ctxProjects, set: setCtxProjects, placeholder: "e.g. iSolutions, CR pump series" },
                      { label: "Participants", val: ctxAttend, set: setCtxAttend, placeholder: "e.g. Lars (PM), Mia (Eng)..." },
                      { label: "Extra context", val: ctxExtra, set: setCtxExtra, placeholder: "e.g. Q2 review, pilot project..." },
                    ].map(({ label, val, set, placeholder }) => (
                      <div key={label} className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</label>
                        <input
                          type="text"
                          value={val}
                          onChange={e => set(e.target.value)}
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
                    {uploadedFiles.map(f => (
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Output tab bar + actions */}
          <div className="shrink-0 flex items-center justify-between px-4 border-b border-border bg-card/30">
            {/* Tabs */}
            <div className="flex">
              {(["viz", "transcript", "actions"] as OutputTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setOutputTab(tab)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5",
                    outputTab === tab
                      ? "text-white border-b-2 border-primary"
                      : "text-muted-foreground hover:text-white"
                  )}
                >
                  {tab === "viz" && <><Code2 className="w-3.5 h-3.5" />Visualization</>}
                  {tab === "transcript" && <><FileText className="w-3.5 h-3.5" />Transcript</>}
                  {tab === "actions" && <><ClipboardList className="w-3.5 h-3.5" />Decisions</>}
                </button>
              ))}
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
                    <label htmlFor="auto-viz" className="text-xs font-mono text-muted-foreground cursor-pointer select-none">
                      Auto {autoVizEnabled && <span className="text-primary">[{autoVizCountdown}s]</span>}
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

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleGenerate(false);
                      setOutputTab("viz");
                    }}
                    disabled={isGenerating || (getActiveTranscript().length === 0)}
                    className={cn("h-7 px-3 text-xs transition-all", isGenerating && "border-primary text-primary")}
                  >
                    {isGenerating ? (
                      <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating…</>
                    ) : (
                      <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Visualize</>
                    )}
                  </Button>
                  {streamMeta?.refinement && !isGenerating && (
                    <Badge variant="outline" className="h-5 text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
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
                        : "text-muted-foreground/50 hover:text-muted-foreground"
                    )}
                  >
                    DBG
                  </button>
                </>
              )}

              {outputTab === "transcript" && segments.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const lines = segments.map(s =>
                        `[${format(new Date(s.timestamp), "HH:mm:ss")}] ${s.speakerName}: ${s.text}`
                      );
                      const header = `Meeting Transcript${meetingTitle ? ` — ${meetingTitle}` : ""}\n${format(new Date(), "yyyy-MM-dd HH:mm")}\n${"─".repeat(50)}\n\n`;
                      const blob = new Blob([header + lines.join("\n")], { type: "text/plain" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.txt`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                    className="h-7 px-3 text-xs gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />TXT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const data = {
                        title: meetingTitle || "Untitled Meeting",
                        date: format(new Date(), "yyyy-MM-dd HH:mm"),
                        participants: [...new Set(segments.map(s => s.speakerName))],
                        wordCount: currentWordCount,
                        segments: segments.map(s => ({
                          speaker: s.speakerName,
                          text: s.text,
                          timestamp: s.timestamp,
                          time: format(new Date(s.timestamp), "HH:mm:ss"),
                        })),
                      };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `transcript_${format(new Date(), "yyyy-MM-dd_HHmm")}.json`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                    className="h-7 px-3 text-xs gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />JSON
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
                    <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing…</>
                  ) : (
                    <><Play className="w-3.5 h-3.5 mr-1.5" />Extract</>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Version history strip (viz tab only) */}
          {outputTab === "viz" && vizHistory.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border overflow-x-auto bg-card/10 min-h-0">
              <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">Versions:</span>
              {vizHistory.map(v => (
                <button
                  key={v.version}
                  onClick={() => loadVizVersion(v.version)}
                  title={v.name + " · " + format(new Date(v.timestamp), "HH:mm")}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors",
                    activeVersion === v.version
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-white hover:border-white/40"
                  )}
                >
                  <span className="font-bold">v{v.version}</span>
                  <span className="max-w-[80px] truncate opacity-70">{v.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Debug panel */}
          {showDebug && outputTab === "viz" && (
            <div className="shrink-0 max-h-[40%] overflow-y-auto border-b border-amber-500/30 bg-amber-950/20 font-mono text-[10px] leading-relaxed">
              <div className="px-4 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-semibold uppercase tracking-wider text-[11px]">Debug Inspector</span>
                  {debugInfo?.performanceMs && (
                    <span className="text-muted-foreground">{(debugInfo.performanceMs / 1000).toFixed(1)}s total</span>
                  )}
                </div>

                {!debugInfo ? (
                  <p className="text-muted-foreground py-2">No debug data yet. Generate a visualization to see details.</p>
                ) : (
                  <>
                    {/* Classification section */}
                    <details open className="group">
                      <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                        <span className="opacity-50 group-open:rotate-90 transition-transform">▸</span>
                        Classification
                      </summary>
                      <div className="ml-3 mt-1 space-y-0.5 text-foreground/70">
                        {debugInfo.classification ? (
                          <>
                            <div><span className="text-muted-foreground">Result:</span> <span className="text-green-400 font-semibold">{debugInfo.classification.family}</span> ({debugInfo.classification.topic})</div>
                            <div><span className="text-muted-foreground">Lead:</span> {debugInfo.classification.lead} · <span className="text-muted-foreground">Ambiguous:</span> {debugInfo.classification.ambiguous ? "yes" : "no"}</div>
                            <div><span className="text-muted-foreground">Input mode:</span> {debugInfo.classification.inputMode} · <span className="text-muted-foreground">Words:</span> {debugInfo.classification.inputWords}/{debugInfo.classification.totalWords}</div>
                            <div className="text-muted-foreground">Scores: {debugInfo.classification.allScores?.map((s: any) => `${s.family}:${s.score}`).join(" · ")}</div>
                            <details className="mt-1">
                              <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                                <span className="opacity-50">▸</span> Classification input text
                              </summary>
                              <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-24 overflow-y-auto text-foreground/60">{debugInfo.classification.inputText}</pre>
                            </details>
                          </>
                        ) : (
                          <div><span className="text-muted-foreground">Skipped</span> (user picked type: {debugInfo.vizType})</div>
                        )}
                      </div>
                    </details>

                    {/* Generation config */}
                    <details open className="group">
                      <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                        <span className="opacity-50 group-open:rotate-90 transition-transform">▸</span>
                        Generation Config
                      </summary>
                      <div className="ml-3 mt-1 space-y-0.5 text-foreground/70">
                        <div><span className="text-muted-foreground">Family:</span> <span className="text-blue-400">{debugInfo.resolvedFamily ?? "none"}</span> · <span className="text-muted-foreground">Model:</span> {debugInfo.vizModel} · <span className="text-muted-foreground">Type:</span> {debugInfo.vizType}</div>
                        <div><span className="text-muted-foreground">Incremental:</span> {debugInfo.isIncremental ? "yes" : "no"} · <span className="text-muted-foreground">Refinement:</span> {debugInfo.isRefinement ? "yes" : "no"} · <span className="text-muted-foreground">Has prev HTML:</span> {debugInfo.hasPreviousHtml ? "yes" : "no"}</div>
                        <div><span className="text-muted-foreground">Domain:</span> {debugInfo.workspaceDomain ?? "none"} · <span className="text-muted-foreground">Words:</span> {debugInfo.transcriptTotalWords} · <span className="text-muted-foreground">Room:</span> {debugInfo.roomId}</div>
                        {debugInfo.focusSegment && <div><span className="text-muted-foreground">Focus:</span> {debugInfo.focusSegment}</div>}
                        {debugInfo.refinementDirective && <div><span className="text-muted-foreground">Directive:</span> {debugInfo.refinementDirective}</div>}
                      </div>
                    </details>

                    {/* Prompt */}
                    {debugInfo.prompt && (
                      <details className="group">
                        <summary className="cursor-pointer text-amber-400/80 hover:text-amber-400 [&::-webkit-details-marker]:hidden flex items-center gap-1">
                          <span className="opacity-50 group-open:rotate-90 transition-transform">▸</span>
                          Full Prompt ({debugInfo.prompt.model} · {debugInfo.prompt.maxTokens} max tokens)
                        </summary>
                        <div className="ml-3 mt-1 space-y-2">
                          <details>
                            <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                              <span className="opacity-50">▸</span> System prompt ({debugInfo.prompt.systemPrompt.length} chars)
                            </summary>
                            <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/60">{debugInfo.prompt.systemPrompt}</pre>
                          </details>
                          <details>
                            <summary className="cursor-pointer text-muted-foreground/60 hover:text-muted-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1">
                              <span className="opacity-50">▸</span> User message ({debugInfo.prompt.userMessage.length} chars)
                            </summary>
                            <pre className="mt-1 p-2 bg-black/30 rounded border border-border/30 whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/60">{debugInfo.prompt.userMessage}</pre>
                          </details>
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {outputTab === "viz" && (
              <div className="h-full p-4">
                <IframeRenderer
                  html={activeHtml}
                  isStreaming={isGenerating}
                  className="glow-border h-full"
                  roomId={roomId}
                  title={meetingTitle || null}
                  context={getMeetingContext()}
                  workspaceDomain={workspaceDomain}
                />
              </div>
            )}

            {outputTab === "transcript" && (
              <div className="h-full overflow-y-auto p-4">
                {segments.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-4 text-muted-foreground max-w-xs">
                      <FileText className="w-12 h-12 mx-auto opacity-20" />
                      <div className="space-y-1">
                        <p className="text-sm font-display">Transcript Log</p>
                        <p className="text-xs">Start recording to build the meeting transcript. All speech will be logged here with timestamps.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                      <div className="text-xs font-mono text-muted-foreground">
                        {segments.length} segment{segments.length !== 1 ? "s" : ""} · {currentWordCount} words · {[...new Set(segments.map(s => s.speakerName))].length} speaker{[...new Set(segments.map(s => s.speakerName))].length !== 1 ? "s" : ""}
                      </div>
                      {segments.length > 0 && (
                        <div className="text-[10px] font-mono text-muted-foreground/60">
                          {format(new Date(segments[0].timestamp), "HH:mm")} — {format(new Date(segments[segments.length - 1].timestamp), "HH:mm")}
                        </div>
                      )}
                    </div>
                    {segments.map((seg, i) => {
                      const showSpeaker = i === 0 || segments[i - 1].speakerName !== seg.speakerName;
                      const colors = getSpeakerColor(seg.speakerName, speakerColorMap);
                      return (
                        <div key={seg.id} className="group flex items-start gap-3 py-1.5 px-2 rounded hover:bg-card/40 transition-colors">
                          <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 pt-0.5 w-14 text-right">
                            {format(new Date(seg.timestamp), "HH:mm:ss")}
                          </span>
                          <span className={cn("shrink-0 w-2 h-2 rounded-full mt-1.5", colors.dot)} />
                          <div className="flex-1 min-w-0">
                            {showSpeaker && (
                              <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider mr-2", colors.text)}>
                                {seg.speakerName}
                              </span>
                            )}
                            <span className="text-sm text-foreground/90 leading-relaxed">{seg.text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {outputTab === "actions" && (
              <div className="h-full p-4">
                {isLoadingActions && !actionsHtml && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-3 text-muted-foreground">
                      <RefreshCcw className="w-8 h-8 mx-auto animate-spin opacity-50" />
                      <p className="text-xs font-mono">Claude is analyzing the meeting…</p>
                    </div>
                  </div>
                )}
                {!isLoadingActions && !actionsHtml && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-4 text-muted-foreground max-w-xs">
                      <ClipboardList className="w-12 h-12 mx-auto opacity-20" />
                      <div className="space-y-1">
                        <p className="text-sm font-display">Decisions & Actions</p>
                        <p className="text-xs">Click Extract to analyze the transcript for key decisions and action items.</p>
                      </div>
                    </div>
                  </div>
                )}
                {actionsHtml && (
                  <IframeRenderer
                    html={actionsHtml}
                    isStreaming={isLoadingActions}
                    className="h-full"
                    roomId={roomId}
                    title={meetingTitle || null}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
