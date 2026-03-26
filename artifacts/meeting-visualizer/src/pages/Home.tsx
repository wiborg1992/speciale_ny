import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Mic, ArrowRight, Play, Clock, Users, MessageSquare, ExternalLink, Archive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { generateRoomCode } from "@/lib/utils";

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

export default function Home() {
  const [, setLocation] = useLocation();
  const [speakerName, setSpeakerName] = useLocalStorage("meetingVisualizer_speakerName", "");
  const [roomCode, setRoomCode] = useState("");

  const { data } = useQuery<{ meetings: MeetingRow[] }>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/meetings`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const recentMeetings = (data?.meetings ?? []).slice(0, 5);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakerName.trim()) return;
    const newRoom = generateRoomCode();
    setLocation(`/room/${newRoom}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakerName.trim() || !roomCode.trim()) return;
    setLocation(`/room/${roomCode.toUpperCase()}`);
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
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary blur-xl opacity-30 rounded-full animate-pulse" />
              <img
                src={`${import.meta.env.BASE_URL}images/logo-mark.png`}
                alt="Logo"
                className="w-20 h-20 relative z-10 drop-shadow-2xl"
              />
            </div>
          </div>

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

            <div className="grid grid-cols-2 gap-4">
              <form onSubmit={handleCreate} className="space-y-4">
                <label className="text-sm font-display font-bold text-muted-foreground uppercase tracking-widest block opacity-0">Action</label>
                <Button
                  type="submit"
                  className="w-full h-14 text-base"
                  disabled={!speakerName.trim()}
                >
                  <Play className="w-5 h-5 mr-2" />
                  New Room
                </Button>
              </form>

              <form onSubmit={handleJoin} className="space-y-4">
                <label className="text-sm font-display font-bold text-muted-foreground uppercase tracking-widest block">Join Existing</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="CODE"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="h-14 text-center font-bold tracking-widest placeholder:tracking-normal"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="h-14 px-4"
                    disabled={!speakerName.trim() || roomCode.length < 3}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </motion.div>

        {recentMeetings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 glass-panel rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-display font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                Recent Meetings
              </h2>
              <button
                onClick={() => setLocation("/history")}
                className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                <Archive className="w-3 h-3" />
                View All
              </button>
            </div>
            <div className="space-y-1.5">
              {recentMeetings.map(m => {
                const speakers: string[] = (() => {
                  try { return JSON.parse(m.speakerNames); } catch { return []; }
                })();
                return (
                  <button
                    key={m.id}
                    onClick={() => setLocation(`/room/${m.roomId}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 transition-colors group text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-mono truncate">
                          {m.title || `Room ${m.roomId}`}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                          {m.roomId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}</span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5" />
                          {m.segmentCount}
                        </span>
                        {speakers.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            {speakers.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
