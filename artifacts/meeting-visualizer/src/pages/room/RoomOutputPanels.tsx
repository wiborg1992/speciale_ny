import { format } from "date-fns";
import { FileText, Sparkles, RefreshCcw, BrainCircuit, CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";
import { IframeRenderer } from "@/components/IframeRenderer";
import type { TranscriptSegment } from "@workspace/api-client-react";
import type { VizDebugInfo } from "@/types/viz-debug";

import { getSpeakerColor } from "./speaker-colors";
import type { OutputTab } from "./types";

interface RoomOutputPanelsProps {
  outputTab: OutputTab;
  activeHtml: string | null;
  isGenerating: boolean;
  roomId: string | undefined;
  meetingTitle: string;
  meetingContextForIframe: string | null;
  workspaceDomain: string;
  segments: TranscriptSegment[];
  interimText: string;
  currentWordCount: number;
  speakerColorMap: Map<string, number>;
  reasoningText: string;
  isLoadingActions: boolean;
  debugInfo: VizDebugInfo | null | undefined;
}

// ── Technical Reasoning: one step in the thinking timeline ──────────────────

interface ThinkingStep {
  label: string;
  detail: string | null;
  sub?: string[];
  done: boolean;
}

function buildThinkingSteps(info: VizDebugInfo): ThinkingStep[] {
  const steps: ThinkingStep[] = [];

  const c = info.classification;

  // 1. Input
  if (c) {
    steps.push({
      label: "Analyserede transkript",
      detail: `${c.inputWords} nye ord · ${c.totalWords} ord i alt · tilstand: ${c.inputMode}`,
      done: true,
    });
  }

  // 2. Classification
  if (c) {
    const topScores = [...(c.allScores ?? [])]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    steps.push({
      label: "Klassificerede mødeindhold",
      detail: `Familie: ${c.family} · Emne: ${c.topic} · Score: ${c.lead}${c.ambiguous ? " · ⚠ Tvetydigt" : ""}`,
      sub: topScores.map(
        (s) => `${s.family}: ${(s.score * 100).toFixed(0)}%`,
      ),
      done: true,
    });
  }

  // 3. Resolved family / user override
  if (info.resolvedFamily) {
    const userPicked = info.userPickedType;
    steps.push({
      label: userPicked
        ? "Bruger valgte visualiseringstype"
        : "Valgte visualiseringstype",
      detail: info.resolvedFamily,
      done: true,
    });
  }

  // 4. Approach: incremental / refinement / fresh
  {
    const parts: string[] = [];
    if (info.isIncremental) parts.push("Inkrementel opdatering");
    else parts.push("Generering fra bunden");
    if (info.isRefinement) parts.push("Finjustering aktiv");
    if (info.hasPreviousHtml) parts.push("Tidligere visualisering tilgængelig");
    if (info.refinementDirective)
      parts.push(`Direktiv: "${info.refinementDirective}"`);
    if (info.focusSegment)
      parts.push(`Fokus: "${info.focusSegment}"`);
    steps.push({
      label: "Valgte fremgangsmåde",
      detail: parts.join(" · "),
      done: true,
    });
  }

  // 5. Model
  if (info.vizModel) {
    steps.push({
      label: "Valgte AI-model",
      detail: info.vizModel + (info.prompt ? ` · ${info.prompt.maxTokens.toLocaleString()} max tokens` : ""),
      done: true,
    });
  }

  // 6. Done / performance
  if (info.performanceMs != null && info.performanceMs > 0) {
    steps.push({
      label: "Generering færdig",
      detail: `${(info.performanceMs / 1000).toFixed(1)}s`,
      done: true,
    });
  }

  return steps;
}

// ── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step, index }: { step: ThinkingStep; index: number }) {
  return (
    <li className="flex gap-3 group">
      {/* Timeline column */}
      <div className="flex flex-col items-center gap-0">
        <div
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
            step.done
              ? "text-primary"
              : "text-muted-foreground/40",
          )}
        >
          {step.done ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </div>
        {/* connector line — rendered by parent between items */}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <p
          className={cn(
            "text-xs font-medium leading-tight",
            step.done ? "text-foreground/90" : "text-muted-foreground/60",
          )}
        >
          {step.label}
        </p>
        {step.detail && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 font-mono">
            {step.detail}
          </p>
        )}
        {step.sub && step.sub.length > 0 && (
          <ul className="mt-1 space-y-px">
            {step.sub.map((s, i) => (
              <li key={i} className="text-[10px] text-muted-foreground/70 font-mono pl-2 before:content-['·'] before:mr-1.5 before:text-muted-foreground/40">
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RoomOutputPanels({
  outputTab,
  activeHtml,
  isGenerating,
  roomId,
  meetingTitle,
  meetingContextForIframe,
  workspaceDomain,
  segments,
  interimText,
  currentWordCount,
  speakerColorMap,
  reasoningText,
  isLoadingActions,
  debugInfo,
}: RoomOutputPanelsProps) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {outputTab === "viz" && (
        <div className="h-full p-4">
          <IframeRenderer
            html={activeHtml}
            isStreaming={isGenerating}
            className="glow-border h-full"
            roomId={roomId}
            title={meetingTitle || null}
            context={meetingContextForIframe}
            workspaceDomain={workspaceDomain}
          />
        </div>
      )}

      {outputTab === "transcript" && (
        <div className="h-full overflow-y-auto p-4">
          {segments.length === 0 && !interimText ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 text-muted-foreground max-w-xs">
                <FileText className="w-12 h-12 mx-auto opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-display">Transcript Log</p>
                  <p className="text-xs">
                    Start recording to build the meeting transcript. All speech
                    will be logged here with timestamps.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <div className="text-xs font-mono text-muted-foreground">
                  {segments.length} segment
                  {segments.length !== 1 ? "s" : ""} · {currentWordCount} words ·{" "}
                  {[...new Set(segments.map((s) => s.speakerName))].length} speaker
                  {[...new Set(segments.map((s) => s.speakerName))].length !== 1
                    ? "s"
                    : ""}
                </div>
                {segments.length > 0 && (
                  <div className="text-[10px] font-mono text-muted-foreground/60">
                    {format(new Date(segments[0].timestamp), "HH:mm")} —{" "}
                    {format(
                      new Date(segments[segments.length - 1].timestamp),
                      "HH:mm",
                    )}
                  </div>
                )}
              </div>
              {segments.map((seg, i) => {
                const showSpeaker =
                  i === 0 || segments[i - 1].speakerName !== seg.speakerName;
                const colors = getSpeakerColor(seg.speakerName, speakerColorMap);
                return (
                  <div
                    key={seg.id}
                    className="group flex items-start gap-3 py-1.5 px-2 rounded hover:bg-card/40 transition-colors"
                  >
                    <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 pt-0.5 w-14 text-right">
                      {format(new Date(seg.timestamp), "HH:mm:ss")}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 w-2 h-2 rounded-full mt-1.5",
                        colors.dot,
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      {showSpeaker && (
                        <span
                          className={cn(
                            "text-[10px] font-mono font-bold uppercase tracking-wider mr-2",
                            colors.text,
                          )}
                        >
                          {seg.speakerName}
                        </span>
                      )}
                      <span className="text-sm text-foreground/90 leading-relaxed">
                        {seg.text}
                      </span>
                    </div>
                  </div>
                );
              })}
              {interimText && (
                <div className="group flex items-start gap-3 py-1.5 px-2 rounded bg-primary/5 border border-primary/15">
                  <span className="shrink-0 text-[10px] font-mono text-primary/70 pt-0.5 w-14 text-right">
                    live
                  </span>
                  <span className="shrink-0 w-2 h-2 rounded-full mt-1.5 bg-primary/60 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider mr-2 text-primary/90">
                      IN PROGRESS
                    </span>
                    <span className="text-sm text-foreground/90 leading-relaxed italic">
                      {interimText}
                    </span>
                    <span className="inline-block w-1 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {outputTab === "actions" && (
        <div className="h-full p-4 min-h-0 flex flex-col">
          {isLoadingActions && !reasoningText && (
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center space-y-3 text-muted-foreground">
                <RefreshCcw className="w-8 h-8 mx-auto animate-spin opacity-50" />
                <p className="text-xs font-mono">
                  Skriver forklaring på dansk…
                </p>
              </div>
            </div>
          )}
          {!isLoadingActions && !reasoningText && (
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center space-y-4 text-muted-foreground max-w-sm">
                <Sparkles className="w-12 h-12 mx-auto opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-display">Forklaring</p>
                  <p className="text-xs leading-relaxed">
                    Her får du en almen forklaring på, hvordan AI&apos;en har
                    læst mødet og hvilke valg der typisk ligger bag den viste
                    visualisering. Tryk{" "}
                    <span className="text-foreground/80">Opdatér forklaring</span>{" "}
                    ovenfor, eller åbn fanen igen efter du har genereret en ny
                    version.
                  </p>
                </div>
              </div>
            </div>
          )}
          {reasoningText ? (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/60 bg-card/30 px-4 py-4">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Sådan tænkte modellen (forenklet)
              </p>
              <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans max-w-3xl">
                {reasoningText}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {outputTab === "technical" && (
        <div className="h-full p-4 min-h-0 flex flex-col">
          {!debugInfo ? (
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center space-y-4 text-muted-foreground max-w-sm">
                <BrainCircuit className="w-12 h-12 mx-auto opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-display">Technical Reasoning</p>
                  <p className="text-xs leading-relaxed">
                    Generer en visualisering for at se modellens tekniske
                    beslutningsproces trin for trin her.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-2 mb-5">
                <BrainCircuit className="w-4 h-4 text-primary/70 shrink-0" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Modellens beslutningsproces
                </span>
                {debugInfo.performanceMs != null && debugInfo.performanceMs > 0 && (
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
                    Tænkte i {(debugInfo.performanceMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Steps timeline */}
              <ul className="relative pl-0 space-y-0">
                {buildThinkingSteps(debugInfo).map((step, i, arr) => (
                  <li key={i} className="flex gap-3 group">
                    {/* Timeline column */}
                    <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10",
                          step.done ? "text-primary" : "text-muted-foreground/30",
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-px flex-1 bg-border/50 my-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground/90 leading-tight mt-0.5">
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 font-mono break-words">
                          {step.detail}
                        </p>
                      )}
                      {step.sub && step.sub.length > 0 && (
                        <ul className="mt-1.5 space-y-px">
                          {step.sub.map((s, si) => (
                            <li
                              key={si}
                              className="text-[10px] text-muted-foreground/60 font-mono flex items-baseline gap-1.5"
                            >
                              <span className="text-muted-foreground/30">·</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Model + workspace footer */}
              {(debugInfo.vizModel || debugInfo.workspaceDomain) && (
                <div className="mt-2 pt-3 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1">
                  {debugInfo.vizModel && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      model: {debugInfo.vizModel}
                    </span>
                  )}
                  {debugInfo.workspaceDomain && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      workspace: {debugInfo.workspaceDomain}
                    </span>
                  )}
                  {debugInfo.transcriptTotalWords != null && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      ord i transkript: {debugInfo.transcriptTotalWords}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
