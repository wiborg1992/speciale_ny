import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, MicOff, Settings, Users, Code2, Play, 
  RefreshCcw, AlertTriangle, CheckCircle2,
  Workflow, Map, LayoutTemplate, Box, FileText, BarChart
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { IframeRenderer } from "@/components/IframeRenderer";

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  hmi: <LayoutTemplate className="w-5 h-5" />,
  user_journey: <Map className="w-5 h-5" />,
  workflow: <Workflow className="w-5 h-5" />,
  product: <Box className="w-5 h-5" />,
  requirements: <FileText className="w-5 h-5" />,
  management: <BarChart className="w-5 h-5" />,
};

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const [speakerName] = useLocalStorage("meetingVisualizer_speakerName", "Anonymous");
  const [language, setLanguage] = useState("en-US");
  const [autoVizEnabled, setAutoVizEnabled] = useState(false);
  
  // API & State Hooks
  const { segments, participants, visualization: sseViz, connectionStatus, addLocalSegment } = useRoomSSE(roomId!);
  const { mutateAsync: postSegment } = usePostSegment();
  const { generate, isGenerating, streamedHtml, meta: streamMeta } = useVisualizeStream();
  
  // Combine SSE visualization with active stream
  const activeHtml = isGenerating ? streamedHtml : sseViz.html;
  const activeMeta = isGenerating ? streamMeta : sseViz.meta;

  // Auto-viz tracking
  const [lastVizWordCount, setLastVizWordCount] = useState(0);
  const [autoVizCountdown, setAutoVizCountdown] = useState(45);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const fullText = useMemo(() => {
    return segments.map(s => s.text).join(" ");
  }, [segments]);

  const currentWordCount = useMemo(() => {
    return fullText.trim() === "" ? 0 : fullText.split(/\s+/).length;
  }, [fullText]);

  // Speech Handler — memoized so useSpeech hook is not recreated on every render
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

  // Manual & auto visualization
  const handleManualGenerate = useCallback(() => {
    if (!roomId || currentWordCount === 0) return;
    setLastVizWordCount(currentWordCount);
    generate({
      transcript: fullText,
      previousHtml: sseViz.html,
      roomId,
      speakerName
    });
  }, [roomId, currentWordCount, fullText, sseViz.html, speakerName, generate]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [segments, interimText]);

  // Refs so the interval always reads latest values without restating
  const handleManualGenerateRef = useRef(handleManualGenerate);
  useEffect(() => { handleManualGenerateRef.current = handleManualGenerate; }, [handleManualGenerate]);
  const currentWordCountRef = useRef(currentWordCount);
  useEffect(() => { currentWordCountRef.current = currentWordCount; }, [currentWordCount]);
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

  // Auto-viz: 45-second countdown — restarts only when the toggle changes
  useEffect(() => {
    setAutoVizCountdown(45);
    if (!autoVizEnabled) return;

    const tick = setInterval(() => {
      setAutoVizCountdown(prev => {
        if (prev <= 1) {
          if (currentWordCountRef.current > 0 && !isGeneratingRef.current) {
            handleManualGenerateRef.current();
          }
          return 45;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [autoVizEnabled]);

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-16 glass-panel border-x-0 border-t-0 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.png`} className="w-8 h-8" alt="Logo" />
            <div>
              <h1 className="text-lg font-display leading-none text-white">AI Visualizer</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' : 
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                }`} />
                <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-widest">
                  Room: {roomId}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-mono">{participants.length} Online</span>
            <div className="flex -space-x-2 ml-2">
              {participants.slice(0, 3).map((p, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-[10px] font-bold text-primary" title={p}>
                  {p.charAt(0).toUpperCase()}
                </div>
              ))}
              {participants.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold">
                  +{participants.length - 3}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent text-sm font-mono text-muted-foreground border-none outline-none cursor-pointer hover:text-white transition-colors"
            >
              <option value="en-US">EN-US</option>
              <option value="da-DK">DA-DK</option>
            </select>
            
            <Button 
              variant={isRecording ? "destructive" : "default"}
              className="w-40 transition-all duration-300 relative overflow-hidden"
              onClick={toggleRecording}
            >
              {isRecording && (
                <span className="absolute inset-0 bg-white/20 animate-pulse" />
              )}
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isRecording ? "Stop Engine" : "Start Engine"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Transcript */}
        <div className="w-[400px] border-r border-border flex flex-col bg-card/30 relative">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
            <h2 className="text-sm font-display text-muted-foreground">Telemetry Stream</h2>
            <Badge variant="outline" className="font-mono text-[10px]">{currentWordCount} W</Badge>
          </div>

          {speechError && (
            <div className="p-3 m-4 bg-destructive/10 border border-destructive/50 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive-foreground">{speechError}</p>
            </div>
          )}

          <div 
            className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
            ref={transcriptRef}
          >
            <AnimatePresence initial={false}>
              {segments.map((seg, i) => {
                const isMe = seg.speakerName === speakerName;
                const showSpeaker = i === 0 || segments[i-1].speakerName !== seg.speakerName;
                
                return (
                  <motion.div 
                    key={seg.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                  >
                    {showSpeaker && (
                      <span className="text-[10px] font-mono text-muted-foreground mb-1 ml-1 tracking-wider uppercase">
                        {seg.speakerName} • {format(new Date(seg.timestamp), 'HH:mm:ss')}
                      </span>
                    )}
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                      isMe ? "bg-primary/20 text-primary-foreground border border-primary/30 rounded-tr-sm" : "bg-secondary text-secondary-foreground border border-border rounded-tl-sm"
                    )}>
                      {seg.text}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Interim Text */}
            {interimText && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-end"
              >
                <div className="px-4 py-2.5 rounded-2xl max-w-[85%] text-sm leading-relaxed bg-primary/10 text-primary-foreground/70 border border-primary/10 rounded-tr-sm italic">
                  {interimText}
                  <span className="inline-block w-1 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
                </div>
              </motion.div>
            )}
            
            {segments.length === 0 && !interimText && (
              <div className="h-full flex items-center justify-center text-center p-6">
                <div className="text-muted-foreground space-y-4">
                  <Mic className="w-12 h-12 mx-auto opacity-20" />
                  <p className="text-sm font-mono">Stream inactive.<br/>Start engine to commence telemetry capture.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Visualization */}
        <div className="flex-1 flex flex-col relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGgyMHYyMEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDE5LjVsMjAtLjVNMTkuNSAwdi0yMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')]">
          
          <div className="p-4 border-b border-border flex items-center justify-between glass-panel z-10">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-display text-muted-foreground flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                Synthesized Output
              </h2>
              {activeMeta?.family && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1.5 px-3">
                  {FAMILY_ICONS[activeMeta.family] || <Settings className="w-3 h-3" />}
                  {activeMeta.family.replace('_', ' ')}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={autoVizEnabled} 
                  onCheckedChange={setAutoVizEnabled}
                  id="auto-viz"
                />
                <label htmlFor="auto-viz" className="text-xs font-mono text-muted-foreground uppercase cursor-pointer select-none">
                  Auto-Sync {autoVizEnabled && <span className="text-primary ml-1">[{autoVizCountdown}s]</span>}
                </label>
              </div>

              <div className="w-px h-6 bg-border" />

              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManualGenerate}
                disabled={isGenerating || currentWordCount === 0}
                className={cn("transition-all", isGenerating && "border-primary text-primary")}
              >
                {isGenerating ? (
                  <>
                    <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Force Sync
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 p-6 relative">
            <IframeRenderer 
              html={activeHtml} 
              isStreaming={isGenerating}
              className="glow-border"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
