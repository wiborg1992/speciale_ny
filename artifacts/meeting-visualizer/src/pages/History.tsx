import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { ArrowLeft, Clock, MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetHistory } from "@workspace/api-client-react";

export default function History() {
  const { data: historyData, isLoading, error } = useGetHistory();

  return (
    <div className="min-h-screen bg-background p-8 relative">
      <div className="max-w-4xl mx-auto relative z-10">
        <header className="flex items-center justify-between mb-12">
          <div>
            <Link href="/">
              <Button variant="ghost" className="mb-4 -ml-4 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Hub
              </Button>
            </Link>
            <h1 className="text-3xl font-display font-bold text-white uppercase tracking-widest">Archive Logs</h1>
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
            <p className="text-destructive font-mono">Failed to retrieve archive data.</p>
          </div>
        ) : !historyData?.meetings || historyData.meetings.length === 0 ? (
          <div className="text-center p-12 glass-panel rounded-xl">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-display text-white mb-2">No Archives Found</h3>
            <p className="text-muted-foreground text-sm">Previous meeting data will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {historyData.meetings.map(meeting => (
              <div key={meeting.id} className="glass-panel p-6 rounded-xl flex items-center justify-between group hover:border-primary/50 transition-colors">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-mono text-white font-bold">{meeting.roomId}</h3>
                    <Badge variant="outline">{format(new Date(meeting.createdAt), 'MMM d, yyyy HH:mm')}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4" />
                      {meeting.segments.length} Data Points
                    </span>
                    {meeting.lastVisualization && (
                      <span className="text-primary flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Visualized
                      </span>
                    )}
                  </div>
                </div>
                
                <Link href={`/room/${meeting.roomId}`}>
                  <Button variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    Access <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
