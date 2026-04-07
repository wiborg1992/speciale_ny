import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Play,
  PenLine,
  Clock,
  Users,
  MessageSquare,
  ExternalLink,
  Archive,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { generateRoomCode } from "@/lib/utils";
import { getLocalMeetingLog, removeMeetingFromLocalLog, clearMeetingLog } from "@/lib/recent-meetings-log";
import { exportSession } from "@/lib/export-session";

const BASE = import.meta.env.BASE_URL;

interface MeetingRow {
  id: number;
  roomId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  wordCount: number;
  speakerNames: string;
}

function parseSpeakers(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [speakerName, setSpeakerName] = useLocalStorage("meetingVisualizer_speakerName", "");
  const [localLogVersion, setLocalLogVersion] = useState(0);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [exportingRoomId, setExportingRoomId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const { data } = useQuery<{ meetings: MeetingRow[] }>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/meetings`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`${BASE}api/meetings/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) throw new Error("delete failed");
    },
    onSuccess: (_void, roomId) => {
      removeMeetingFromLocalLog(roomId);
      setLocalLogVersion((v) => v + 1);
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setDeletingRoomId(null);
    },
  });

  const recentMeetings = useMemo(() => {
    const api = data?.meetings ?? [];
    const apiIds = new Set(api.map((m) => m.roomId.toUpperCase()));
    const local = getLocalMeetingLog();
    const synthetic: MeetingRow[] = local
      .filter((e) => !apiIds.has(e.roomId.toUpperCase()))
      .map((e, i) => ({
        id: -1000 - i,
        roomId: e.roomId,
        title: e.title || `Session ${e.roomId}`,
        createdAt: e.visitedAt,
        updatedAt: e.visitedAt,
        segmentCount: 0,
        wordCount: 0,
        speakerNames: "[]",
      }));
    const merged = [...api, ...synthetic].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return merged.slice(0, 5);
  }, [data?.meetings, localLogVersion]);

  const handleClearAll = async () => {
    const apiIds = (data?.meetings ?? []).map((m) => m.roomId);
    await Promise.allSettled(
      apiIds.map((roomId) =>
        fetch(`${BASE}api/meetings/${encodeURIComponent(roomId)}`, { method: "DELETE" })
      )
    );
    clearMeetingLog();
    setLocalLogVersion((v) => v + 1);
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    setConfirmClearAll(false);
  };

  const handleExport = async (roomId: string, title: string) => {
    setExportingRoomId(roomId);
    try {
      await exportSession(roomId, title);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExportingRoomId(null);
    }
  };

  const handleNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakerName.trim()) return;
    const newRoom = generateRoomCode();
    setLocation(`/room/${newRoom}`);
  };

  const handleStartSketching = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakerName.trim()) return;
    const newRoom = generateRoomCode();
    setLocation(`/room/${newRoom}?sketch=new`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat mix-blend-luminosity"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/industrial-bg.png)` }}
      />

      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVsNDAtLjVNMzkuNSAwdi00MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')] opacity-50" />

      <div className="relative z-10 w-full max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="glass-panel p-8 rounded-2xl glow-border"
        >
          <div className="text-center mb-10">
            <h1 className="text-3xl font-display font-bold text-white mb-2">Meeting AI Visualizer</h1>
            <p className="text-muted-foreground">Real-time industrial systems modeling from speech.</p>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-sm font-display font-bold text-muted-foreground uppercase tracking-widest">Your Name</label>
              <Input
                placeholder="Enter your name..."
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                className="text-lg"
              />
            </div>

            <div className="flex gap-3">
              <form onSubmit={handleNewSession} className="flex-1">
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full h-14 text-base hover:bg-primary hover:text-primary-foreground"
                  disabled={!speakerName.trim()}
                >
                  <Play className="w-5 h-5 mr-2 text-orange-400" />
                  New Session
                </Button>
              </form>

              <form onSubmit={handleStartSketching} className="flex-1">
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full h-14 text-base hover:bg-primary hover:text-primary-foreground"
                  disabled={!speakerName.trim()}
                >
                  <PenLine className="w-5 h-5 mr-2 text-orange-400" />
                  Start Sketching
                </Button>
              </form>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 glass-panel rounded-xl p-4 border border-border/50"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-display font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Recent Sessions
            </h2>
            <div className="flex items-center gap-3">
              {recentMeetings.length > 0 && (
                confirmClearAll ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground font-mono">Clear all?</span>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[10px] font-mono text-destructive hover:text-destructive/80 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="text-[10px] font-mono text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setLocation("/history")}
                className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                <Archive className="w-3 h-3" />
                View All
              </button>
            </div>
          </div>

          {recentMeetings.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center leading-relaxed">
              Ingen sessioner endnu — opret en ny session eller tilslut med kode. Besøgte sessioner gemmes her (også uden database).
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentMeetings.map((m) => {
                const speakers = parseSpeakers(m.speakerNames);
                const isSynthetic = m.id < 0;
                const isConfirming = deletingRoomId === m.roomId;
                return (
                  <div
                    key={`${m.id}-${m.roomId}`}
                    className="flex items-stretch gap-1 rounded-lg border border-transparent hover:border-border/40 hover:bg-white/5 transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => setLocation(`/room/${m.roomId}`)}
                      className="flex-1 min-w-0 flex items-center justify-between p-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white font-medium truncate">
                            {m.title || `Session ${m.roomId}`}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 bg-accent/30 px-1 rounded">
                            {m.roomId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>{formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}</span>
                          <span className="flex items-center gap-1" title="Segments">
                            <MessageSquare className="w-2.5 h-2.5" />
                            {m.segmentCount}
                          </span>
                          <span className="flex items-center gap-1" title="Speakers">
                            <Users className="w-2.5 h-2.5" />
                            {speakers.length > 0 ? speakers.length : "—"}
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 ml-2" />
                    </button>
                    <div className="flex items-center justify-center gap-0.5 pr-1.5 shrink-0">
                      {isConfirming ? (
                        <div className="flex flex-col gap-1 py-1">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-[9px]"
                            disabled={!isSynthetic && deleteMeetingMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSynthetic) {
                                removeMeetingFromLocalLog(m.roomId);
                                setLocalLogVersion((v) => v + 1);
                                setDeletingRoomId(null);
                              } else {
                                deleteMeetingMutation.mutate(m.roomId);
                              }
                            }}
                          >
                            {isSynthetic ? "OK" : "Delete"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[9px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingRoomId(null);
                            }}
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-orange-400 opacity-60 group-hover:opacity-100"
                            title="Export session"
                            disabled={exportingRoomId === m.roomId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExport(m.roomId, m.title || `Session_${m.roomId}`);
                            }}
                          >
                            {exportingRoomId === m.roomId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-60 group-hover:opacity-100"
                            title="Remove from list"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingRoomId(m.roomId);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
