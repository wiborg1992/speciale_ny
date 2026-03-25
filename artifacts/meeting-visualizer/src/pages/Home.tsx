import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, ArrowRight, Play, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { generateRoomCode } from "@/lib/utils";

export default function Home() {
  const [, setLocation] = useLocation();
  const [speakerName, setSpeakerName] = useLocalStorage("meetingVisualizer_speakerName", "");
  const [roomCode, setRoomCode] = useState("");
  
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
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat mix-blend-luminosity"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/industrial-bg.png)` }}
      />
      
      {/* Grid Overlay */}
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVsNDAtLjVNMzkuNSAwdi00MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')] opacity-50" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md glass-panel p-8 rounded-2xl glow-border"
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
            <label className="text-sm font-display font-bold text-muted-foreground uppercase tracking-widest">Your Identity</label>
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
    </div>
  );
}
