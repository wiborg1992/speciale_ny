import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { Download, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import {
  buildSessionEvalReport,
  downloadSessionEvalJson,
  mergeFacitIntoEvents,
  type SessionEvalEvent,
  type SessionEvalReport,
  type SessionEvalVizFacit,
} from "@/lib/session-eval-report";
import {
  sessionEvalWebhookConfigured,
  tryPostSessionEvalWebhook,
} from "@/lib/session-eval-webhook";

const intentOptions: Array<{
  value: "" | "incremental" | "new_viz" | "unsure";
  label: string;
}> = [
  { value: "", label: "— vælg —" },
  { value: "incremental", label: "Inkrementel forbedring (samme figur)" },
  { value: "new_viz", label: "Ny visualisering / ny type" },
  { value: "unsure", label: "Usikker" },
];

const severityOptions: Array<{ value: "" | "p0" | "p1" | "p2" | "p3"; label: string }> = [
  { value: "", label: "—" },
  { value: "p0", label: "P0 (kritisk)" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
];

const legacyOptions: Array<{
  value: "" | "previous_html" | "transcript_window" | "room_reload" | "other";
  label: string;
}> = [
  { value: "", label: "—" },
  { value: "previous_html", label: "Previous HTML / inkrementel rest" },
  { value: "transcript_window", label: "Forkert transskript-vindue" },
  { value: "room_reload", label: "Rum / reload / state" },
  { value: "other", label: "Andet" },
];

function selectClassName(): string {
  return "w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground";
}

function fieldLabel(text: string): ReactNode {
  return (
    <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
      {text}
    </span>
  );
}

export interface SessionEvalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: SessionEvalEvent[];
  roomId: string | undefined;
  meetingTitle: string;
  sessionStartedAtRef: MutableRefObject<number>;
  getTranscriptWordCount: () => number;
  getSegmentCount: () => number;
  getParticipantNames: () => string[];
  onClearLog: () => void;
}

export function SessionEvalSheet({
  open,
  onOpenChange,
  events,
  roomId,
  meetingTitle,
  sessionStartedAtRef,
  getTranscriptWordCount,
  getSegmentCount,
  getParticipantNames,
  onClearLog,
}: SessionEvalSheetProps) {
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [facitByVersion, setFacitByVersion] = useState<
    Record<number, SessionEvalVizFacit>
  >({});

  const vizEvents = useMemo(
    () => events.filter((e) => e.kind === "visualization"),
    [events],
  );

  useEffect(() => {
    if (events.length === 0) {
      setReviewerNotes("");
      setFacitByVersion({});
    }
  }, [events.length]);

  const patchFacit = useCallback((version: number, patch: Partial<SessionEvalVizFacit>) => {
    setFacitByVersion((prev) => ({
      ...prev,
      [version]: { ...prev[version], ...patch },
    }));
  }, []);

  const buildMergedReport = useCallback((): SessionEvalReport => {
    const merged = mergeFacitIntoEvents(events, facitByVersion);
    return buildSessionEvalReport({
      roomId: roomId ?? "unknown",
      meetingTitle,
      sessionStartedAt: sessionStartedAtRef.current,
      reviewerNotes,
      events: merged,
      transcriptWordCountApprox: getTranscriptWordCount(),
      segmentCount: getSegmentCount(),
      participantNames: getParticipantNames(),
    });
  }, [
    events,
    facitByVersion,
    roomId,
    meetingTitle,
    sessionStartedAtRef,
    reviewerNotes,
    getTranscriptWordCount,
    getSegmentCount,
    getParticipantNames,
  ]);

  const handleExport = useCallback(async () => {
    const report = buildMergedReport();
    const hook = await tryPostSessionEvalWebhook(report);
    if (hook.attempted && !hook.ok) {
      toast({
        title: "Webhook fejlede",
        description: hook.message ?? "Ukendt fejl",
        variant: "destructive",
      });
    } else if (hook.attempted && hook.ok) {
      toast({
        title: "Rapport sendt til webhook",
        description: "JSON downloades også lokalt.",
      });
    }
    downloadSessionEvalJson(report);
  }, [buildMergedReport]);

  const handleCopyFullReport = useCallback(async () => {
    try {
      const report = buildMergedReport();
      const hook = await tryPostSessionEvalWebhook(report);
      if (hook.attempted && !hook.ok) {
        toast({
          title: "Webhook fejlede",
          description: hook.message ?? "Ukendt fejl",
          variant: "destructive",
        });
      }
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast({
        title: "Kopieret",
        description: hook.attempted
          ? "Rapport i udklipsholder; webhook forsøgt."
          : "Hele rapporten (med facit) er i udklipsholderen.",
      });
    } catch {
      toast({
        title: "Kunne ikke kopiere",
        description: "Brug Download JSON.",
        variant: "destructive",
      });
    }
  }, [buildMergedReport]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto flex flex-col"
      >
        <SheetHeader>
          <SheetTitle className="font-display">Session-evaluering</SheetTitle>
          <SheetDescription>
            Hændelser (viz, skipped, fejl, intent) logges automatisk.{" "}
            <strong>P1–P3-facit</strong> er felter du selv udfylder pr. figur (de
            forudfyldes ikke). Under hver visualisering vises også{" "}
            <strong>auto-debug</strong> fra serveren (klassifikation m.m.) — samme
            data ligger i JSON som <code className="text-[10px]">debug</code>. Fuld
            prompt er ikke med i eksporten. State lever kun i dette panel.
            {sessionEvalWebhookConfigured() ? (
              <span className="block mt-2 text-[11px] text-muted-foreground">
                <strong>Webhook aktiv:</strong> Ved «Download JSON» sendes rapporten
                også til din{" "}
                <code className="text-[10px]">VITE_SESSION_EVAL_WEBHOOK_URL</code>{" "}
                (fx n8n/Slack/e-mail-pipeline). Cursor modtager ikke noget automatisk —
                du styrer hvad webhook’en gør bagefter.
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-4 text-sm overflow-y-auto pr-1">
          <p className="text-xs font-mono text-muted-foreground">
            <span className="text-foreground/90">{events.length}</span> hændelse(r) ·{" "}
            <span className="text-foreground/90">{vizEvents.length}</span> viz · rum
            start{" "}
            {format(new Date(sessionStartedAtRef.current), "yyyy-MM-dd HH:mm")}
          </p>

          <div className="space-y-1.5">
            {fieldLabel("Samlet kommentar / facit (valgfri)")}
            <textarea
              className="w-full min-h-[100px] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder="Overordnet note til hele sessionen efter gennemgang…"
            />
          </div>

          {vizEvents.length === 0 && (
            <p className="text-xs text-amber-600/90 dark:text-amber-400/90 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <span className="font-medium text-foreground/90">Ingen viz i loggen.</span>{" "}
              Sektionen med P1–P3-facit og auto-debug pr. figur vises først, når mindst
              én visualisering er færdiggenereret i denne session (tælleren «viz» over
              0). Skips og fejl tæller som hændelser men giver ikke facit-rækker.
            </p>
          )}

          {vizEvents.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              {fieldLabel("Facit pr. visualisering")}
              <p className="text-[11px] text-muted-foreground">
                P1 = inkrementel vs. ny · P2 = tale vs. figur · P3 = legacy /
                transskriptkilde. Auto-debug under hver figur kommer fra serveren og
                følger med i eksport.
              </p>
              <div className="space-y-3">
                {vizEvents.map((ev) => {
                  const f = facitByVersion[ev.version] ?? {};
                  return (
                    <details
                      key={`${ev.version}-${ev.at}`}
                      className="rounded-lg border border-border/80 bg-card/40 px-3 py-2"
                    >
                      <summary className="cursor-pointer text-xs font-medium text-foreground list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                        <span className="opacity-50">▸</span>
                        <span className="truncate">
                          v{ev.version} · {ev.vizName}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] font-mono text-muted-foreground">
                          {ev.htmlChars} tegn
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3 pb-1">
                        <div className="space-y-1">
                          {fieldLabel("Auto-debug (server / klassifikation)")}
                          {ev.debug != null &&
                          typeof ev.debug === "object" &&
                          Object.keys(ev.debug).length > 0 ? (
                            <details className="rounded-md border border-border/70 bg-black/25">
                              <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground/80">
                                Vis JSON (samme som feltet{" "}
                                <code className="text-[9px]">debug</code> i eksport)
                              </summary>
                              <pre className="max-h-48 overflow-auto border-t border-border/40 p-2 text-[10px] leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
                                {(() => {
                                  try {
                                    return JSON.stringify(ev.debug, null, 2);
                                  } catch {
                                    return String(ev.debug);
                                  }
                                })()}
                              </pre>
                            </details>
                          ) : (
                            <p className="text-[10px] text-muted-foreground italic px-0.5">
                              Ingen debug gemt (fx viz modtaget via SSE fra anden
                              klient, eller ældre session).
                            </p>
                          )}
                        </div>
                        <div className="grid gap-2">
                          {fieldLabel("P1 — forventet")}
                          <select
                            className={selectClassName()}
                            value={f.expectedIntent ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                expectedIntent:
                                  e.target.value === ""
                                    ? undefined
                                    : (e.target.value as SessionEvalVizFacit["expectedIntent"]),
                              })
                            }
                          >
                            {intentOptions.map((o) => (
                              <option key={o.value || "empty"} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P1 — observation")}
                          <textarea
                            className="w-full min-h-[56px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.actualIntentNotes ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                actualIntentNotes: e.target.value || undefined,
                              })
                            }
                            placeholder="Hvad skete der ift. forventning?"
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            {fieldLabel("Disambiguation vist?")}
                            <select
                              className={selectClassName()}
                              value={
                                f.disambiguationShown === undefined
                                  ? ""
                                  : f.disambiguationShown
                                    ? "yes"
                                    : "no"
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                patchFacit(ev.version, {
                                  disambiguationShown:
                                    v === "" ? undefined : v === "yes",
                                });
                              }}
                            >
                              <option value="">—</option>
                              <option value="yes">Ja</option>
                              <option value="no">Nej</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            {fieldLabel("Alvor")}
                            <select
                              className={selectClassName()}
                              value={f.severity ?? ""}
                              onChange={(e) =>
                                patchFacit(ev.version, {
                                  severity:
                                    e.target.value === ""
                                      ? undefined
                                      : (e.target.value as SessionEvalVizFacit["severity"]),
                                })
                              }
                            >
                              {severityOptions.map((o) => (
                                <option key={o.value || "s"} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("Disambiguation-note")}
                          <input
                            type="text"
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.disambiguationNotes ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                disambiguationNotes: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P2 — hvad transskriptet kræver")}
                          <textarea
                            className="w-full min-h-[56px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.transcriptClaims ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                transcriptClaims: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P2 — hvad figuren viser")}
                          <textarea
                            className="w-full min-h-[56px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.figureObserved ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                figureObserved: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P3 — mistanke om legacy")}
                          <textarea
                            className="w-full min-h-[48px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.legacySuspicion ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                legacySuspicion: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P3 — hypotese")}
                          <select
                            className={selectClassName()}
                            value={f.legacyHypothesis ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                legacyHypothesis:
                                  e.target.value === ""
                                    ? undefined
                                    : (e.target.value as SessionEvalVizFacit["legacyHypothesis"]),
                              })
                            }
                          >
                            {legacyOptions.map((o) => (
                              <option key={o.value || "l"} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          {fieldLabel("P3 — transskriptuddrag (sandhed)")}
                          <textarea
                            className="w-full min-h-[48px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            value={f.transcriptSnippetUser ?? ""}
                            onChange={(e) =>
                              patchFacit(ev.version, {
                                transcriptSnippetUser: e.target.value || undefined,
                              })
                            }
                            placeholder="Kort uddrag du mener skulle styre denne viz"
                          />
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border sticky bottom-0 bg-card pb-1">
            <Button type="button" size="sm" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleCopyFullReport()}
            >
              <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
              Kopiér rapport
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(
                    JSON.stringify(events, null, 2),
                  );
                  toast({
                    title: "Kopieret",
                    description: "Rå events (uden facit) — brug Download for facit.",
                  });
                } catch {
                  toast({
                    title: "Kunne ikke kopiere",
                    variant: "destructive",
                  });
                }
              }}
            >
              Kopiér events
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                if (events.length === 0) return;
                if (
                  window.confirm(
                    "Ryd alle hændelser i denne session fra loggen? (Facit i dette panel nulstilles også ved næste tom log.)",
                  )
                )
                  onClearLog();
              }}
            >
              Ryd log
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
