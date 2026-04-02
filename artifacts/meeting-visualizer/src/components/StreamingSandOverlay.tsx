import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";

type Grain = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  size: number;
  phase: number;
  hue: number;
};

interface StreamingSandOverlayProps {
  /** Synlig under aktiv streaming efter skeleton */
  active: boolean;
  /** 0–100 fra skeletonProgress — styrer samle-hastighed / opløsning */
  assemblyProgress: number;
  className?: string;
}

/**
 * Æstetisk overlay: små “sandkorn” flyver ind mod et gitter og toner ud,
 * så det føles som om visualiseringen materialiseres. Påvirker ikke selve HTML-streamingen.
 */
export function StreamingSandOverlay({
  active,
  assemblyProgress,
  className,
}: StreamingSandOverlayProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainsRef = useRef<Grain[] | null>(null);
  const rafRef = useRef<number>(0);
  const wRef = useRef(0);
  const hRef = useRef(0);
  const progressRef = useRef(assemblyProgress);
  useLayoutEffect(() => {
    progressRef.current = assemblyProgress;
  }, [assemblyProgress]);

  const buildGrains = useCallback((w: number, h: number): Grain[] => {
    const area = w * h;
    const count = Math.min(1400, Math.max(380, Math.floor(area / 900)));
    const cols = Math.ceil(Math.sqrt(count * (w / h)));
    const rows = Math.ceil(count / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const list: Grain[] = [];
    let i = 0;
    for (let row = 0; row < rows && i < count; row++) {
      for (let col = 0; col < cols && i < count; col++) {
        const tx = col * cellW + cellW * 0.5 + (Math.random() - 0.5) * cellW * 0.35;
        const ty = row * cellH + cellH * 0.5 + (Math.random() - 0.5) * cellH * 0.35;
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * Math.max(w, h) * 0.65;
        list.push({
          x: tx + Math.cos(angle) * dist,
          y: ty + Math.sin(angle) * dist,
          tx,
          ty,
          size: 1.1 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random(),
        });
        i++;
      }
    }
    return list;
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      wRef.current = w;
      hRef.current = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (active) grainsRef.current = buildGrains(w, h);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => ro.disconnect();
  }, [active, buildGrains]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      grainsRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frame = () => {
      const w = wRef.current;
      const h = hRef.current;
      if (w < 2 || h < 2) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (!grainsRef.current || grainsRef.current.length === 0) {
        grainsRef.current = buildGrains(w, h);
      }
      const grains = grainsRef.current;

      ctx.clearRect(0, 0, w, h);

      const p = progressRef.current;
      const progressBoost = 0.35 + (p / 100) * 0.9;
      const ease = 0.045 + progressBoost * 0.052;
      const jitter = Math.max(0, 1.1 - p / 88) * 0.45;

      for (const g of grains) {
        g.x += (g.tx - g.x) * ease;
        g.y += (g.ty - g.y) * ease;
        if (jitter > 0.02) {
          g.x += Math.sin(performance.now() * 0.0018 + g.phase) * jitter;
          g.y += Math.cos(performance.now() * 0.0016 + g.phase * 1.3) * jitter;
        }

        const dx = g.tx - g.x;
        const dy = g.ty - g.y;
        const dist = Math.hypot(dx, dy);
        const settled = dist < 1.8;
        const alpha = settled
          ? Math.max(0, 0.42 - (p / 100) * 0.38 - (1 - dist / 1.8) * 0.15)
          : 0.18 + Math.min(0.52, dist * 0.012);

        const s = settled ? g.size * (0.55 + (dist / 1.8) * 0.45) : g.size;
        const b = 220 + g.hue * 35;
        ctx.fillStyle = settled
          ? `rgba(186, 230, 253, ${alpha * (0.75 + g.hue * 0.2)})`
          : `rgba(0, ${Math.floor(b * 0.45)}, 255, ${alpha})`;
        ctx.fillRect(g.x - s * 0.5, g.y - s * 0.5, s, s);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, buildGrains]);

  if (!active) return null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "pointer-events-none absolute inset-0 z-[14] overflow-hidden rounded-lg",
        "bg-[#0d1421]/[0.04]",
        className
      )}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full opacity-95"
      />
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-mono uppercase tracking-[0.2em] text-primary/40"
        style={{ textShadow: "0 0 12px rgba(0,199,255,0.35)" }}
      >
        Samler visualisering…
      </div>
    </div>
  );
}
