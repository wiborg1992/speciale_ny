import { format } from "date-fns";
import { FileText, Sparkles, RefreshCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { IframeRenderer } from "@/components/IframeRenderer";
import type { TranscriptSegment } from "@workspace/api-client-react";

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
}

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
    </div>
  );
}
