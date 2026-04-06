import { PenLine, ImageOff, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SketchTabProps {
  previewDataUrl: string | null;
  elementCount: number;
  onOpenCanvas: () => void;
  isGenerating?: boolean;
  onVisualize?: () => void;
  onClear?: () => void;
}

export function SketchTab({
  previewDataUrl,
  elementCount,
  onOpenCanvas,
  isGenerating,
  onVisualize,
  onClear,
}: SketchTabProps) {
  const hasSketch = elementCount > 0 && previewDataUrl;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Instruction */}
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card/20 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        Tegn layoutstruktur → AI bruger skitsen som guide
      </div>

      {/* Preview or empty state */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-4 gap-3">
        {hasSketch ? (
          <>
            {/* Thumbnail */}
            <div className="w-full rounded-lg overflow-hidden border border-border/60 bg-zinc-900 shadow-inner">
              <img
                src={previewDataUrl}
                alt="Sketch preview"
                className="w-full h-auto object-contain max-h-[180px]"
              />
            </div>
            <p className="text-[10px] font-mono text-emerald-400 text-center">
              ✓ {elementCount} element{elementCount !== 1 ? "er" : ""} gemt — sendes med ved visualisering
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-border flex items-center justify-center">
              <PenLine className="w-5 h-5 text-zinc-500" />
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-[200px]">
              Ingen skitse endnu. Åbn canvas for at tegne din ønskede layoutstruktur.
            </p>
          </div>
        )}

        {/* Open canvas button */}
        <Button
          type="button"
          variant={hasSketch ? "outline" : "default"}
          className={cn(
            "w-full font-mono text-xs gap-2",
            !hasSketch && "bg-primary hover:bg-primary/90",
          )}
          onClick={onOpenCanvas}
        >
          <PenLine className="w-3.5 h-3.5" />
          {hasSketch ? "Rediger canvas" : "Åbn canvas"}
        </Button>

        {/* Visualize button (if sketch present) */}
        {hasSketch && onVisualize && (
          <Button
            type="button"
            variant="default"
            className="w-full font-mono text-xs gap-2 bg-primary hover:bg-primary/90"
            onClick={onVisualize}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <ImageOff className="w-3.5 h-3.5" />
                Visualize with Sketch
              </>
            )}
          </Button>
        )}

        {/* Clear sketch */}
        {hasSketch && onClear && (
          <button
            type="button"
            className="text-[10px] font-mono text-muted-foreground hover:text-destructive transition-colors"
            onClick={onClear}
          >
            Fjern skitse
          </button>
        )}
      </div>
    </div>
  );
}
