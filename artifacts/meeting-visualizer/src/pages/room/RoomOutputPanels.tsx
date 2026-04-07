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
  /** Resolved viz family from the stream hook — drives the loading skeleton variant. Null when not generating. */
  streamFamily?: string | null;
  onAnnotate?: (screenshotDataUrl: string) => void;
}

// ── Technical Reasoning: one step in the thinking timeline ──────────────────

interface ThinkingStep {
  label: string;
  detail: string | null;
  sub?: string[];
  done: boolean;
  warning?: boolean;
}

function buildThinkingSteps(info: VizDebugInfo): ThinkingStep[] {
  const steps: ThinkingStep[] = [];
  const c = info.classification;

  // ── Step 1: Input received ────────────────────────────────────────────────
  if (c) {
    const raw = c.inputText?.trim() ?? "";
    const preview = raw.length > 0
      ? `"${raw.slice(0, 150)}${raw.length > 150 ? "…" : ""}"`
      : null;
    steps.push({
      label: "Input received",
      detail: `Mode: ${c.inputMode} · ${c.inputWords} new word${c.inputWords !== 1 ? "s" : ""} analyzed · ${c.totalWords} total in transcript`,
      sub: preview ? [preview] : undefined,
      done: true,
    });
  }

  // ── Step 2: Content classification ───────────────────────────────────────
  if (c) {
    const allSorted = [...(c.allScores ?? [])].sort((a, b) => b.score - a.score);
    const runnerUp = allSorted[1];
    const leadPct = ((c.lead ?? 0) * 100).toFixed(1);

    const maxScore = allSorted[0]?.score ?? 1;
    const norm = maxScore > 0 ? maxScore : 1;
    const scoreBars = allSorted.map((s) => {
      const ratio = s.score / norm;
      const pct = (ratio * 100).toFixed(1);
      const filled = Math.max(0, Math.min(16, Math.round(ratio * 16)));
      const bar = "█".repeat(filled) + "░".repeat(16 - filled);
      const winner = s.family === c.family ? " ◀" : "";
      return `${s.family.padEnd(22)} ${bar} ${pct}%${winner}`;
    });

    steps.push({
      label: "Content classification",
      detail: `Winner: ${c.family} · lead margin: ${leadPct}%${c.ambiguous ? " · ⚠ AMBIGUOUS — confidence gap too small" : ""}`,
      sub: [
        `Topic identified: "${c.topic}"`,
        runnerUp
          ? `Runner-up: ${runnerUp.family} (${(runnerUp.score * 100).toFixed(1)}%)`
          : null,
        "── All family scores ────────────────────",
        ...scoreBars,
      ].filter((x): x is string => x !== null),
      done: true,
      warning: c.ambiguous,
    });
  }

  // ── Step 3: Viz type resolution ───────────────────────────────────────────
  {
    const userPicked = info.userPickedType;
    const resolved = info.resolvedFamily ?? info.vizType ?? "unknown";
    const classifierFamily = c?.family;
    const overridden = classifierFamily && resolved !== classifierFamily && !userPicked;

    steps.push({
      label: userPicked ? "Viz type — user override" : "Viz type — auto-resolved",
      detail: resolved,
      sub: [
        userPicked
          ? "User explicitly selected this type; classifier result ignored"
          : overridden
            ? `Classifier said: ${classifierFamily} → overridden to: ${resolved}`
            : "Classifier family accepted as-is",
      ],
      done: true,
    });
  }

  // ── Step 4: Context & strategy ────────────────────────────────────────────
  {
    const approach: string[] = [];
    const reasoning: string[] = [];

    if (info.isIncremental && info.hasPreviousHtml) {
      approach.push("Incremental update");
      reasoning.push("hasPreviousHtml=true → building on top of existing visualization");
    } else if (!info.isIncremental) {
      approach.push("Fresh generation");
      reasoning.push("isIncremental=false → generating from scratch, no previous baseline");
    } else {
      approach.push("Standard generation");
    }

    if (info.isRefinement) {
      approach.push("Refinement");
      reasoning.push("isRefinement=true — transcript signals same topic continuation");
    }

    if (!info.hasPreviousHtml) {
      reasoning.push("hasPreviousHtml=false — no existing HTML available to build from");
    }

    if (info.refinementDirective) {
      approach.push(`Directive: "${info.refinementDirective}"`);
      reasoning.push(`Explicit refinement instruction: "${info.refinementDirective}"`);
    }

    if (info.focusSegment) {
      approach.push(`Focus segment active`);
      reasoning.push(`User clicked transcript segment: "${info.focusSegment}" — prompt focuses on that excerpt`);
    }

    if (info.workspaceDomain) {
      reasoning.push(`Workspace domain: ${info.workspaceDomain} — domain-specific prompt rules applied`);
    }

    steps.push({
      label: "Context strategy",
      detail: approach.join(" · ") || "Standard",
      sub: reasoning.length > 0 ? reasoning : undefined,
      done: true,
    });
  }

  // ── Step 5: Model & prompt ────────────────────────────────────────────────
  if (info.vizModel) {
    const p = info.prompt;
    const sysKb = p ? (p.systemPrompt.length / 1024).toFixed(1) : null;
    const userKb = p ? (p.userMessage.length / 1024).toFixed(1) : null;
    const hasImage = p?.userMessage.includes("base64") || p?.userMessage.includes('"type":"image"');

    const modelNote: Record<string, string> = {
      haiku: "Haiku — fast initial generation, lightweight vision",
      sonnet: "Sonnet — balanced quality and speed",
      opus: "Opus — highest quality, full vision capability for annotations",
    };

    steps.push({
      label: "Model & prompt construction",
      detail: `${info.vizModel} · ${p ? `max ${p.maxTokens.toLocaleString()} output tokens` : ""}`,
      sub: [
        modelNote[info.vizModel] ?? null,
        sysKb ? `System prompt: ${sysKb} KB` : null,
        userKb ? `User message: ${userKb} KB` : null,
        hasImage ? "Sketch/annotation image embedded in user message (vision)" : null,
        p ? `Total prompt context: ${((p.systemPrompt.length + p.userMessage.length) / 1024).toFixed(1)} KB` : null,
      ].filter((x): x is string => x !== null),
      done: true,
    });
  }

  // ── Step 6: Generation complete ───────────────────────────────────────────
  if (info.performanceMs != null && info.performanceMs > 0) {
    const sec = (info.performanceMs / 1000).toFixed(2);
    steps.push({
      label: "Generation complete",
      detail: `${sec}s total wall time`,
      sub: [
        info.performanceMs < 8000
          ? "Fast response — small model or short output"
          : info.performanceMs > 35000
            ? "Extended generation — large model or highly detailed output"
            : "Normal generation time",
      ],
      done: true,
    });
  }

  return steps;
}

// ── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: ThinkingStep }) {
  return (
    <li className="flex gap-3 group">
      {/* Timeline column */}
      <div className="flex flex-col items-center gap-0">
        <div
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
            step.done
              ? step.warning ? "text-yellow-400" : "text-primary"
              : "text-muted-foreground/40",
          )}
        >
          {step.done ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <p
          className={cn(
            "text-xs font-medium leading-tight",
            step.done
              ? step.warning ? "text-yellow-300/90" : "text-foreground/90"
              : "text-muted-foreground/60",
          )}
        >
          {step.label}
        </p>
        {step.detail && (
          <p className={cn(
            "text-[11px] leading-relaxed mt-0.5 font-mono",
            step.warning ? "text-yellow-400/70" : "text-muted-foreground",
          )}>
            {step.detail}
          </p>
        )}
        {step.sub && step.sub.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {step.sub.map((s, i) => (
              <li key={i} className={cn(
                "text-[10px] font-mono leading-snug pl-2",
                s.startsWith("──") || s.startsWith('"')
                  ? "text-muted-foreground/50 mt-1"
                  : "text-muted-foreground/70 before:content-['·'] before:mr-1.5 before:text-muted-foreground/40",
              )}>
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
  streamFamily,
  onAnnotate,
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
            pendingFamily={streamFamily ?? null}
            onAnnotate={onAnnotate}
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
                  Generating explanation…
                </p>
              </div>
            </div>
          )}
          {!isLoadingActions && !reasoningText && (
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center space-y-4 text-muted-foreground max-w-sm">
                <Sparkles className="w-12 h-12 mx-auto opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-display">Explanation</p>
                  <p className="text-xs leading-relaxed">
                    A plain-language explanation of how the AI read the meeting
                    and which choices shaped the current visualization. Click{" "}
                    <span className="text-foreground/80">Refresh explanation</span>{" "}
                    above, or open this tab again after generating a new version.
                  </p>
                </div>
              </div>
            </div>
          )}
          {reasoningText ? (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/60 bg-card/30 px-4 py-4">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
                How the model reasoned (simplified)
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
                    Generate a visualization to see the model&apos;s step-by-step
                    decision process here.
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
                  Model decision trace
                </span>
                {debugInfo.performanceMs != null && debugInfo.performanceMs > 0 && (
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
                    {(debugInfo.performanceMs / 1000).toFixed(1)}s total
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
                          step.done
                            ? step.warning ? "text-yellow-400" : "text-primary"
                            : "text-muted-foreground/30",
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
                      <p className={cn(
                        "text-xs font-medium leading-tight mt-0.5",
                        step.warning ? "text-yellow-300/90" : "text-foreground/90",
                      )}>
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className={cn(
                          "text-[11px] leading-relaxed mt-0.5 font-mono break-words",
                          step.warning ? "text-yellow-400/70" : "text-muted-foreground",
                        )}>
                          {step.detail}
                        </p>
                      )}
                      {step.sub && step.sub.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {step.sub.map((s, si) => (
                            <li
                              key={si}
                              className={cn(
                                "text-[10px] font-mono leading-snug pl-2",
                                s.startsWith("──") || s.startsWith('"')
                                  ? "text-muted-foreground/50 mt-1"
                                  : "text-muted-foreground/60 flex items-baseline gap-1.5",
                              )}
                            >
                              {!s.startsWith("──") && !s.startsWith('"') && (
                                <span className="text-muted-foreground/30 shrink-0">·</span>
                              )}
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
