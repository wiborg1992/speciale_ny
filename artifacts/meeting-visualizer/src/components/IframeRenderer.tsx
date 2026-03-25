import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "./ui/button";

interface IframeRendererProps {
  html: string | null;
  className?: string;
  isStreaming?: boolean;
}

export function IframeRenderer({ html, className, isStreaming = false }: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        
        // Wrap the HTML to ensure it looks good and fits the container if it doesn't supply its own base styling
        const wrappedHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                body { margin: 0; padding: 1rem; background: transparent; color: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
                ::-webkit-scrollbar { width: 8px; height: 8px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
              </style>
            </head>
            <body>
              ${html || '<div class="flex h-full items-center justify-center text-slate-500">Waiting for AI Visualization...</div>'}
            </body>
          </html>
        `;
        
        doc.write(wrappedHtml);
        doc.close();
      }
    }
  }, [html]);

  return (
    <div className={cn("relative group flex flex-col w-full h-full", 
      isFullscreen ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2" : className
    )}>
      {html && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      )}
      
      {isStreaming && (
        <div className="absolute top-4 right-14 z-10 flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md border border-primary/30 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary" />
          Rendering
        </div>
      )}

      <iframe
        ref={iframeRef}
        className="flex-1 w-full rounded-lg bg-black/20 border border-border"
        sandbox="allow-scripts allow-same-origin"
        title="AI Visualization"
      />
    </div>
  );
}
