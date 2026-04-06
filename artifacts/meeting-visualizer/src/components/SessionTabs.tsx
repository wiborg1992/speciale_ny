import { useLocation } from "wouter";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenSession } from "@/hooks/use-open-sessions";

interface Props {
  currentRoomId: string;
  sessions: OpenSession[];
  onRemove: (roomId: string) => void;
}

export function SessionTabs({ currentRoomId, sessions = [], onRemove }: Props) {
  const [, setLocation] = useLocation();

  if (!sessions.length) return null;

  const handleClose = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    onRemove(roomId);
    if (roomId === currentRoomId) {
      const remaining = sessions.filter((s) => s.roomId !== roomId);
      if (remaining.length > 0) {
        setLocation(`/room/${remaining[remaining.length - 1].roomId}`);
      } else {
        setLocation("/");
      }
    }
  };

  return (
    <div className="shrink-0 flex items-end h-9 px-3 gap-0.5 border-b border-border bg-background/60 overflow-x-auto">
      {sessions.map((session) => {
        const isActive = session.roomId === currentRoomId;
        const label = session.title || session.roomId;
        return (
          <div
            key={session.roomId}
            onClick={() => setLocation(`/room/${session.roomId}`)}
            className={cn(
              "group flex items-center gap-1.5 h-7 px-3 rounded-t border border-b-0 cursor-pointer select-none text-xs font-mono shrink-0 max-w-[180px] transition-colors",
              isActive
                ? "bg-card border-border text-white"
                : "bg-transparent border-transparent text-muted-foreground hover:text-white hover:bg-card/50 hover:border-border/50",
            )}
          >
            <span className="truncate flex-1 min-w-0" title={label}>
              {label}
            </span>
            <button
              type="button"
              onClick={(e) => handleClose(e, session.roomId)}
              className={cn(
                "shrink-0 transition-all hover:text-red-400",
                isActive
                  ? "opacity-40 hover:opacity-100"
                  : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
              )}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* New session button */}
      <button
        type="button"
        onClick={() => setLocation("/")}
        title="Ny session"
        className="flex items-center justify-center h-7 w-7 shrink-0 rounded-t text-muted-foreground hover:text-white transition-colors ml-1"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
