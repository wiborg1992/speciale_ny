import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { ArrowLeft, Clock, MessageSquare, ExternalLink, Users, Trash2, FileText } from "lucide-react";
import { removeMeetingFromLocalLog } from "@/lib/recent-meetings-log";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL;

interface MeetingRow {
  id: number;
  roomId: string;
  title: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  wordCount: number;
  speakerNames: string;
}

export default function History() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ meetings: MeetingRow[] }>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/meetings`);
      if (!res.ok) throw new Error("Failed to load meetings");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`${BASE}api/meetings/${roomId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_void, roomId) => {
      removeMeetingFromLocalLog(roomId);
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setDeletingId(null);
    },
  });

  const meetings = data?.meetings ?? [];

  return (
    <div className="min-h-screen bg-background p-8 relative">
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVsNDAtLjVNMzkuNSAwdi00MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')] opacity-50" />

      <div className="max-w-4xl mx-auto relative z-10">
        <header className="flex items-center justify-between mb-8">
          <div>
            <Link href="/">
              <Button variant="ghost" className="mb-4 -ml-4 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-3xl font-display font-bold text-white uppercase tracking-widest">Meeting Archive</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {meetings.length} meeting{meetings.length !== 1 ? "s" : ""} saved
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 glass-panel rounded-xl text-center border-destructive/50">
            <p className="text-destructive font-mono">Failed to load meeting history.</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center p-12 glass-panel rounded-xl">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-display text-white mb-2">No Meetings Yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Start a meeting and it will be saved here automatically.</p>
            <Link href="/">
              <Button>Create Meeting</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map(meeting => {
              const speakers: string[] = (() => {
                try { return JSON.parse(meeting.speakerNames); } catch { return []; }
              })();
              const isConfirmingDelete = deletingId === meeting.roomId;

              return (
                <div key={meeting.id} className="glass-panel p-5 rounded-xl group hover:border-primary/30 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-display text-white font-bold truncate">
                          {meeting.title || `Room ${meeting.roomId}`}
                        </h3>
                        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                          {meeting.roomId}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDistanceToNow(new Date(meeting.updatedAt), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {meeting.segmentCount} segments
                        </span>
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          {meeting.wordCount} words
                        </span>
                        {speakers.length > 0 && (
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {speakers.join(", ")}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] font-mono text-muted-foreground/60 mt-1.5">
                        Created {format(new Date(meeting.createdAt), "MMM d, yyyy HH:mm")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-destructive mr-1">Delete?</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => deleteMutation.mutate(meeting.roomId)}
                            disabled={deleteMutation.isPending}
                          >
                            Yes
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDeletingId(null)}
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeletingId(meeting.roomId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Link href={`/room/${meeting.roomId}`}>
                            <Button variant="secondary" size="sm" className="h-8 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              Resume <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
