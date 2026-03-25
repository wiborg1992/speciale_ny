import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Users, Code2, Play,
  RefreshCcw, AlertTriangle,
  ChevronDown, ChevronUp, ClipboardList, Wand2,
  Download, Maximize2, RotateCcw, History,
} from "lucide-react";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSpeech } from "@/hooks/use-speech";
import { useRoomSSE } from "@/hooks/use-room-sse";
import { useVisualizeStream } from "@/hooks/use-visualize-stream";
import { usePostSegment } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { IframeRenderer } from "@/components/IframeRenderer";

// ─── Types ───────────────────────────────────────────────────────────────────

type InputTab  = "mic" | "paste";
type OutputTab = "viz" | "actions";

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
  { value: "workflow",     label: "Workflow" },
  { value: "product",      label: "Product / Hardware" },
  { value: "requirements", label: "Requirements" },
  { value: "management",   label: "Management Overview" },
  { value: "kanban",       label: "Kanban / Tasks" },
  { value: "decisions",    label: "Decision Log" },
  { value: "timeline",     label: "Timeline / Roadmap" },
  { value: "comparison",   label: "Comparison Cards" },
  { value: "stakeholders", label: "Stakeholder Map" },
];

const VIZ_MODELS = [
  { value: "haiku",  label: "Haiku (fast)" },
  { value: "sonnet", label: "Sonnet (balanced)" },
  { value: "opus",   label: "Opus (best)" },
];

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
const BASE = import.meta.env.BASE_URL;

// ─── Component ───────────────────────────────────────────────────────────────

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const [speakerName] = useLocalStorage("meetingVisualizer_speakerName", "Anonymous");
  const [language, setLanguage] = useState("da-DK");
  const [autoVizEnabled, setAutoVizEnabled] = useState(false);
  const [autoVizCountdown, setAutoVizCountdown] = useState(45);

  // Input tabs
  const [inputTab, setInputTab] = useState<InputTab>("mic");
  const [pasteText, setPasteText] = useState("");

  // Output tabs
  const [outputTab, setOutputTab] = useState<OutputTab>("viz");

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
  const { generate, isGenerating, streamedHtml, meta: streamMeta } = useVisualizeStream();

  const activeHtml = isGenerating ? streamedHtml : (displayHtml || sseViz.html);

  // Compute full transcript text
  const fullText = useMemo(() => segments.map(s => s.text).join(" "), [segments]);
  const currentWordCount = useMemo(
    () => (fullText.trim() === "" ? 0 : fullText.split(/\s+/).length),
    [fullText]
  );

  // The transcript to use for visualization
  const getActiveTranscript = useCallback(() => {
    if (inputTab === "paste") return pasteText.trim();
    return fullText.trim();
  }, [inputTab, pasteText, fullText]);

  const getMeetingContext = useCallback(() => {
    const parts: string[] = [];
    if (ctxPurpose)  parts.push("Purpose: " + ctxPurpose);
    if (ctxProjects) parts.push("Projects/systems: " + ctxProjects);
    if (ctxAttend)   parts.push("Participants: " + ctxAttend);
    if (ctxExtra)    parts.push("Context: " + ctxExtra);
    return parts.join("\n") || null;
  }, [ctxPurpose, ctxProjects, ctxAttend, ctxExtra]);

  const hasContext = ctxPurpose || ctxProjects || ctxAttend || ctxExtra;

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
  useEffect(() => {
    if (!isGenerating && streamedHtml && streamedHtml.length > 50) {
      setDisplayHtml(streamedHtml);
      addVizVersion(streamedHtml);
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
  const handleFinalSegment = useCallback(async (text: string) => {
    if (!roomId) return;
    const newSegment = {
      id: uuidv4(),
      speakerName,
      text,
      timestamp: Date.now(),
      isFinal: true
    };
    addLocalSegment(newSegment);
    try {
      await postSegment({
        data: { roomId, speakerName, text, timestamp: newSegment.timestamp, isFinal: true }
      });
    } catch (err) {
      console.error("Failed to post segment", err);
    }
  }, [roomId, speakerName, addLocalSegment, postSegment]);

  const { isRecording, interimText, toggleRecording, error: speechError } = useSpeech({
    onSegmentFinalized: handleFinalSegment,
    language
  });

  // ── Visualization ────────────────────────────────────────────────────────────
  const prevHtmlRef = useRef<string>("");
  useEffect(() => { prevHtmlRef.current = displayHtml || sseViz.html || ""; }, [displayHtml, sseViz.html]);

  const handleGenerate = useCallback((auto = false) => {
    const transcript = getActiveTranscript();
    if (!transcript) return;

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
    });
  }, [getActiveTranscript, freshStart, roomId, speakerName, vizType, vizModel, meetingTitle, getMeetingContext, generate]);

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

  // Auto-viz: 45-second countdown
  useEffect(() => {
    setAutoVizCountdown(45);
    if (!autoVizEnabled) return;

    const tick = setInterval(() => {
      setAutoVizCountdown(prev => {
        if (prev <= 1) {
          if (currentWordCountRef.current > 0 && !isGeneratingRef.current) {
            handleGenerateRef.current(true);
          }
          return 45;
        }
        return prev - 1;
      });
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
  }, [getActiveTranscript, roomId, meetingTitle, getMeetingContext]);

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
          {/* Participants */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-mono">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{participants.length}</span>
            <div className="flex -space-x-1.5 ml-1">
              {participants.slice(0, 3).map((p, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-[9px] font-bold text-primary" title={p}>
                  {p.charAt(0).toUpperCase()}
                </div>
              ))}
              {participants.length > 3 && (
                <div className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-bold">
                  +{participants.length - 3}
                </div>
              )}
            </div>
          </div>

          {/* Language */}
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="bg-transparent text-xs font-mono text-muted-foreground border border-border rounded px-2 py-1 cursor-pointer hover:text-white transition-colors"
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

          {speechError && (
            <div className="p-2 mx-3 mt-2 bg-destructive/10 border border-destructive/50 rounded-lg flex items-start gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive-foreground">{speechError}</p>
            </div>
          )}

          {/* Mic Tab */}
          {inputTab === "mic" && (
            <div
              className="flex-1 overflow-y-auto p-3 space-y-3"
              ref={transcriptRef}
            >
              <AnimatePresence initial={false}>
                {segments.map((seg, i) => {
                  const isMe = seg.speakerName === speakerName;
                  const showSpeaker = i === 0 || segments[i - 1].speakerName !== seg.speakerName;
                  return (
                    <motion.div
                      key={seg.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                    >
                      {showSpeaker && (
                        <span className="text-[10px] font-mono text-muted-foreground mb-0.5 ml-1 tracking-wider uppercase">
                          {seg.speakerName} · {format(new Date(seg.timestamp), "HH:mm:ss")}
                        </span>
                      )}
                      <div className={cn(
                        "px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed",
                        isMe
                          ? "bg-primary/20 text-primary-foreground border border-primary/30 rounded-tr-sm"
                          : "bg-secondary text-secondary-foreground border border-border rounded-tl-sm"
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
          )}

          {/* Paste Tab */}
          {inputTab === "paste" && (
            <div className="flex-1 flex flex-col min-h-0 p-3">
              <p className="text-[11px] text-muted-foreground mb-2 shrink-0">
                Paste Teams, Zoom or other transcript text below
              </p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="[Speaker A]: Vi skal se på pumpe-effektiviteten..."
                className="flex-1 min-h-0 bg-secondary/30 border border-border rounded-lg p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <div className="flex items-center justify-between mt-2 shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {pasteText.trim() ? pasteText.trim().split(/\s+/).length + " words" : "0 words"}
                </span>
                <button
                  onClick={() => setPasteText("")}
                  className="text-[10px] font-mono text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
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
              className="flex-1 min-w-[160px] max-w-[280px] h-8 bg-secondary/50 border border-border rounded px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />

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

          {/* Meeting context fields (collapsible) */}
          <AnimatePresence>
            {showContext && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="shrink-0 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border bg-card/40 grid grid-cols-2 gap-2">
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* Output tab bar + actions */}
          <div className="shrink-0 flex items-center justify-between px-4 border-b border-border bg-card/30">
            {/* Tabs */}
            <div className="flex">
              {(["viz", "actions"] as OutputTab[]).map(tab => (
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
                  {tab === "viz" ? <><Code2 className="w-3.5 h-3.5" />Visualization</> : <><ClipboardList className="w-3.5 h-3.5" />Decisions</>}
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
                    onClick={() => handleGenerate(false)}
                    disabled={isGenerating || (getActiveTranscript().length === 0)}
                    className={cn("h-7 px-3 text-xs transition-all", isGenerating && "border-primary text-primary")}
                  >
                    {isGenerating ? (
                      <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating…</>
                    ) : (
                      <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Visualize</>
                    )}
                  </Button>
                </>
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
                />
              </div>
            )}

            {outputTab === "actions" && (
              <div className="h-full overflow-y-auto p-4">
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
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: actionsHtml }}
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
