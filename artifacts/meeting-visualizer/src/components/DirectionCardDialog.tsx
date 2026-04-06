/**
 * Retningskort — visual direction picker dialog.
 * Vises første gang brugeren trykker "Visualize" i en session (ingen tidligere viz, vizType=auto).
 * Kalder /api/classify, viser 3–4 wireframe-kort, og returnerer onPick(familyId) eller onSkip().
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VizWireframe, type VizFamilyId } from "@/lib/viz-wireframes";
import { BASE } from "@/pages/room/constants";

export interface DirectionFamily {
  id: VizFamilyId;
  labelDa: string;
  descriptionDa: string;
  score: number;
}

interface DirectionCardDialogProps {
  transcript: string;
  workspaceDomain?: string | null;
  context?: string | null;
  onPick: (familyId: VizFamilyId, shownFamilies: string[]) => void;
  onSkip: (shownFamilies: string[]) => void;
}

export function DirectionCardDialog({
  transcript,
  workspaceDomain,
  context,
  onPick,
  onSkip,
}: DirectionCardDialogProps) {
  const [families, setFamilies] = useState<DirectionFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VizFamilyId | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchClassification() {
      try {
        const res = await fetch(`${BASE}api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, workspaceDomain, context }),
        });

        if (!res.ok) {
          throw new Error(`classify failed: ${res.status}`);
        }

        const data = await res.json() as {
          families: Array<{
            id: string;
            labelDa: string;
            descriptionDa: string;
            score: number;
          }>;
        };

        if (!cancelled) {
          setFamilies(
            data.families.slice(0, 4).map((f) => ({
              id: f.id as VizFamilyId,
              labelDa: f.labelDa,
              descriptionDa: f.descriptionDa,
              score: f.score,
            })),
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Klassifikation fejlede");
          setLoading(false);
        }
      }
    }

    fetchClassification();
    return () => { cancelled = true; };
  }, [transcript, workspaceDomain, context]);

  function handleCardClick(familyId: VizFamilyId) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setSelected(familyId);
    const shownIds = families.map((f) => f.id);
    setTimeout(() => onPick(familyId, shownIds), 150);
  }

  const maxScore = families.length > 0 ? Math.max(...families.map((f) => f.score)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6"
      >
        <div className="mb-5">
          <h2 className="text-white font-semibold text-lg leading-tight mb-1">
            Hvilken retning skal visualiseringen tage?
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Klassifikatoren foreslår disse typer baseret på samtalen. Vælg en for at starte — eller lad AI'en bestemme.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Analyserer samtalen…</span>
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-zinc-500 text-sm">
            Kunne ikke hente forslag — fortsæt med AI-valg.
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {families.map((family) => (
              <DirectionCard
                key={family.id}
                family={family}
                maxScore={maxScore}
                isSelected={selected === family.id}
                onClick={() => handleCardClick(family.id)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <p className="text-zinc-600 text-xs">
            Kun første visualisering pr. session
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
            onClick={() => {
              if (resolvedRef.current) return;
              resolvedRef.current = true;
              onSkip(families.map((f) => f.id));
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Lad AI bestemme
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

interface DirectionCardProps {
  family: DirectionFamily;
  maxScore: number;
  isSelected: boolean;
  onClick: () => void;
}

function DirectionCard({ family, maxScore, isSelected, onClick }: DirectionCardProps) {
  const confidencePct = maxScore > 0 ? Math.round((family.score / maxScore) * 100) : 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative text-left rounded-lg border p-3 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
        isSelected
          ? "border-zinc-400 bg-zinc-800 ring-2 ring-zinc-400"
          : "border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 hover:bg-zinc-800",
      )}
    >
      <div className="rounded overflow-hidden mb-2.5 border border-zinc-700/60">
        <VizWireframe family={family.id} className="w-full h-auto" />
      </div>

      <p className="text-white text-sm font-medium leading-snug mb-0.5">
        {family.labelDa}
      </p>
      <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2 mb-2">
        {family.descriptionDa}
      </p>

      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-zinc-400 transition-all duration-500"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <span className="text-zinc-500 text-[10px] tabular-nums shrink-0">
          {confidencePct}%
        </span>
      </div>

      {isSelected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 rounded-lg border-2 border-zinc-300 pointer-events-none"
        />
      )}
    </motion.button>
  );
}
