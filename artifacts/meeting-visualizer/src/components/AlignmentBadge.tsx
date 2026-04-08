import { AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

export type AlignmentSeverity = "ok" | "warn" | "fail";

export interface AlignmentState {
  severity: AlignmentSeverity;
  rubricHits: string[];
  llmVerdict: "ok" | "warn" | "fail" | null;
  llmTriggered: boolean;
  llmCompleted: boolean;
}

interface AlignmentBadgeProps {
  alignment: AlignmentState | null;
  onRegenerate?: () => void;
}

export function AlignmentBadge({ alignment, onRegenerate }: AlignmentBadgeProps) {
  if (!alignment || alignment.severity === "ok") return null;

  const isWarn = alignment.severity === "warn";
  const isFail = alignment.severity === "fail";

  const topHit = alignment.rubricHits[0] ?? null;

  if (isWarn) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(251, 191, 36, 0.12)",
          border: "1px solid rgba(251, 191, 36, 0.35)",
          fontSize: 11,
          color: "#D97706",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          maxWidth: 340,
          lineHeight: 1.4,
        }}
        title={topHit ?? "Mulig semantisk uoverensstemmelse"}
      >
        <AlertTriangle size={12} style={{ flexShrink: 0 }} />
        <span>Mulig uoverensstemmelse</span>
      </div>
    );
  }

  if (isFail) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          borderRadius: 6,
          background: "rgba(239, 68, 68, 0.10)",
          border: "1px solid rgba(239, 68, 68, 0.40)",
          fontSize: 11,
          color: "#DC2626",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          maxWidth: 380,
          lineHeight: 1.4,
        }}
        title={topHit ?? "Visualiseringen matcher ikke indholdet"}
      >
        <XCircle size={12} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Visualisering matcher ikke indholdet</span>
        {onRegenerate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            style={{
              height: 22,
              padding: "0 8px",
              fontSize: 10,
              color: "#DC2626",
              border: "1px solid rgba(239, 68, 68, 0.40)",
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <RefreshCw size={9} />
            Regenerer
          </Button>
        )}
      </div>
    );
  }

  return null;
}
