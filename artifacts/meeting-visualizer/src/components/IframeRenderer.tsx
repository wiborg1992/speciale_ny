import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Minimize2, Maximize2, Pencil, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { useIframeEdit } from "@/hooks/use-iframe-edit";
import { StreamingSandOverlay } from "./StreamingSandOverlay";

const BASE = import.meta.env.BASE_URL;

/** Delegation på document.body + markør på documentElement (ikke window) — så scriptet virker igen efter doc.write() og på lazy-indhold. */
const VIZ_INTERACT_SCRIPT = `
(function() {
  var root = document.documentElement;
  if (root && root.getAttribute('data-viz-interact-bound') === '1') return;
  if (root) root.setAttribute('data-viz-interact-bound', '1');

  function activateTab(host, idx) {
    var tabs = host.querySelectorAll('[role="tab"][data-viz-tab]');
    var panels = host.querySelectorAll('[data-viz-tab-panel]');
    tabs.forEach(function(t) {
      var active = String(t.getAttribute('data-viz-tab')) === String(idx);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.classList.toggle('viz-tab-active', active);
    });
    panels.forEach(function(p) {
      var show = String(p.getAttribute('data-viz-tab-panel')) === String(idx);
      p.style.display = show ? '' : 'none';
      if (show) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
  }

  document.body.addEventListener('click', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var filterBtn = t.closest('[data-viz-filter]');
    if (filterBtn) {
      var host = filterBtn.closest('[data-viz-filter-host]');
      if (!host) return;
      e.preventDefault();
      var val = filterBtn.getAttribute('data-viz-filter') || 'all';
      host.querySelectorAll('[data-viz-filter]').forEach(function(b) {
        b.setAttribute('aria-pressed', b === filterBtn ? 'true' : 'false');
      });
      host.querySelectorAll('[data-viz-row-cat]').forEach(function(row) {
        var c = row.getAttribute('data-viz-row-cat') || '';
        row.style.display = (val === 'all' || c === val) ? '' : 'none';
      });
      return;
    }

    var tab = t.closest('[role="tab"][data-viz-tab]');
    if (tab) {
      var tabHost = tab.closest('[data-viz-host-tabs]');
      if (!tabHost) return;
      e.preventDefault();
      activateTab(tabHost, tab.getAttribute('data-viz-tab'));
      return;
    }

    var toggleBtn = t.closest('[data-viz-toggle]');
    if (toggleBtn) {
      var sel = toggleBtn.getAttribute('data-viz-toggle');
      if (sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.classList.toggle('viz-open');
        });
      }
    }
  }, true);
})();
`;

/** Under streaming: opdater iframe max. så ofte for at undgå blink ved hver SSE-chunk */
const STREAMING_IFRAME_THROTTLE_MS = 340;

function isHtmlRenderable(html: string | null): boolean {
  if (!html || html.length < 300) return false;
  return html.includes("<div") || html.includes("<section") || html.includes("<table");
}

function VizSkeleton({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0d1421",
        borderRadius: "inherit",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
      }}
    >
      <div style={{ height: "2px", background: "rgba(0,200,255,0.12)", position: "relative", flexShrink: 0 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #0077C8, #00c8ff)",
            borderRadius: "0 2px 2px 0",
            transition: "width 0.6s ease",
            boxShadow: "0 0 8px rgba(0,200,255,0.6)",
          }}
        />
      </div>

      <style>{`
        @keyframes __sk_shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes __sk_pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .__sk_block {
          position: relative;
          overflow: hidden;
          background: #111827;
          border-radius: 6px;
        }
        .__sk_block::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.07) 50%, transparent 100%);
          animation: __sk_shimmer 1.6s ease-in-out infinite;
        }
      `}</style>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{
          width: "56px",
          background: "#080e1a",
          borderRight: "1px solid rgba(0,200,255,0.08)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 0",
          gap: "10px",
        }}>
          <div className="__sk_block" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <div style={{ width: "80%", height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="__sk_block" style={{ width: 36, height: 36, borderRadius: 8, opacity: i === 0 ? 1 : 0.45 }} />
          ))}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            height: "48px",
            background: "#080e1a",
            borderBottom: "1px solid rgba(0,200,255,0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 14,
            flexShrink: 0,
          }}>
            <div className="__sk_block" style={{ width: 120, height: 14, borderRadius: 4 }} />
            <div className="__sk_block" style={{ width: 200, height: 10, borderRadius: 4, opacity: 0.6 }} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
              <div className="__sk_block" style={{ width: 22, height: 22, borderRadius: "50%" }} />
              <div className="__sk_block" style={{ width: 80, height: 22, borderRadius: 4 }} />
            </div>
          </div>

          <div style={{
            height: "38px",
            background: "#0d1421",
            borderBottom: "1px solid rgba(0,200,255,0.06)",
            display: "flex",
            alignItems: "flex-end",
            padding: "0 20px",
            gap: 0,
            flexShrink: 0,
          }}>
            {["OVERVIEW", "TRENDS", "EVENTS", "SMART"].map((t, i) => (
              <div key={t} style={{
                padding: "0 20px",
                height: "38px",
                display: "flex",
                alignItems: "center",
                borderBottom: i === 0 ? "2px solid rgba(0,200,255,0.5)" : "none",
                marginBottom: i === 0 ? -1 : 0,
              }}>
                <div className="__sk_block" style={{
                  width: i === 0 ? 68 : 48,
                  height: 9,
                  borderRadius: 3,
                  opacity: i === 0 ? 0.9 : 0.35,
                }} />
              </div>
            ))}
          </div>

          <div style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: "12px",
            padding: "14px",
            overflow: "hidden",
          }}>
            <div className="__sk_block" style={{
              display: "flex", flexDirection: "column", padding: "14px",
              border: "1px solid rgba(0,200,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div className="__sk_block" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                <div className="__sk_block" style={{ width: 140, height: 9, borderRadius: 3 }} />
                <div style={{ marginLeft: "auto" }}>
                  <div className="__sk_block" style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d08460" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, flex: 1 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="__sk_block" style={{
                    display: "flex", flexDirection: "column", padding: "10px 8px", gap: 6,
                    border: "1px solid rgba(0,200,255,0.06)", borderRadius: 6,
                  }}>
                    <div className="__sk_block" style={{ width: "70%", height: 7, borderRadius: 3, opacity: 0.5 }} />
                    <div className="__sk_block" style={{ width: "90%", height: 22, borderRadius: 4 }} />
                    <div className="__sk_block" style={{ width: "60%", height: 6, borderRadius: 3, opacity: 0.4 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="__sk_block" style={{
              display: "flex", flexDirection: "column", padding: "14px",
              border: "1px solid rgba(0,200,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div className="__sk_block" style={{ width: 120, height: 9, borderRadius: 3 }} />
                <div className="__sk_block" style={{ width: 50, height: 18, borderRadius: 4, marginLeft: 8 }} />
              </div>
              <div style={{ flex: 1, position: "relative", padding: "4px 0" }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{
                    position: "absolute", left: 0, right: 0,
                    top: `${20 + i * 30}%`, height: 1,
                    background: "rgba(0,200,255,0.05)",
                  }} />
                ))}
                <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none" style={{ opacity: 0.25 }}>
                  <polyline points="0,70 50,55 100,62 150,35 200,44 250,28 300,32"
                    fill="none" stroke="#00c8ff" strokeWidth="2" />
                  <polyline points="0,70 50,55 100,62 150,35 200,44 250,28 300,32 300,100 0,100"
                    fill="rgba(0,200,255,0.06)" stroke="none" />
                </svg>
              </div>
            </div>

            <div className="__sk_block" style={{
              display: "flex", flexDirection: "column", padding: "14px",
              border: "1px solid rgba(0,200,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div className="__sk_block" style={{ width: 100, height: 9, borderRadius: 3 }} />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div className="__sk_block" style={{ width: 56, height: 36, borderRadius: 5, border: "1px solid rgba(0,200,255,0.1)" }} />
                    <div className="__sk_block" style={{ width: 44, height: 7, borderRadius: 3, opacity: 0.5 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="__sk_block" style={{
              display: "flex", flexDirection: "column", padding: "14px",
              border: "1px solid rgba(0,200,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div className="__sk_block" style={{ width: 130, height: 9, borderRadius: 3 }} />
              </div>
              {[...Array(2)].map((_, i) => (
                <div key={i} className="__sk_block" style={{
                  padding: 10, borderRadius: 6, marginBottom: 8,
                  border: "1px solid rgba(0,200,255,0.06)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div className="__sk_block" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div className="__sk_block" style={{ width: "80%", height: 7, borderRadius: 3, opacity: 0.5 }} />
                    <div className="__sk_block" style={{ width: "60%", height: 9, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: "0.67rem",
        color: "rgba(0,200,255,0.5)",
        letterSpacing: "0.12em",
        fontFamily: "monospace",
        textTransform: "uppercase",
        animation: "__sk_pulse 1.8s ease-in-out infinite",
        whiteSpace: "nowrap",
      }}>
        ◈ Generating visualization…
      </div>
    </div>
  );
}

interface IframeRendererProps {
  html: string | null;
  className?: string;
  isStreaming?: boolean;
  roomId?: string | null;
  title?: string | null;
  context?: string | null;
  /** grundfos | gabriel | generic — passed to lazy tab fill API */
  workspaceDomain?: string | null;
}

export function IframeRenderer({
  html,
  className,
  isStreaming = false,
  roomId,
  title,
  context,
  workspaceDomain,
}: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const fillPendingRef = useRef(false);
  const originalHtmlRef = useRef<string | null>(null);
  const editHook = useIframeEdit(iframeRef);
  /** Seneste HTML fra props — læses i throttled interval under streaming */
  const pendingHtmlRef = useRef<string | null>(null);
  const streamFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [skeletonProgress, setSkeletonProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      setSkeletonProgress(5);
      let current = 5;
      progressTimerRef.current = setInterval(() => {
        const delta = (92 - current) * 0.045;
        current = Math.min(92, current + delta + 0.3);
        setSkeletonProgress(current);
      }, 400);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setSkeletonProgress(100);
      const t = setTimeout(() => setSkeletonProgress(0), 600);
      return () => clearTimeout(t);
    }
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isStreaming]);

  pendingHtmlRef.current = html;

  const renderable = isHtmlRenderable(html);
  const showSkeleton = isStreaming && !renderable;

  function stripCodeFences(s: string): string {
    let t = s.trim();
    t = t.replace(/^```(?:html)?\s*\n?/, "");
    t = t.replace(/\n?```\s*$/, "");
    return t.trim();
  }

  function buildDocument(rawHtml: string): string {
    const t = stripCodeFences(rawHtml).trimStart();
    if (t.startsWith("<!DOCTYPE") || t.toLowerCase().startsWith("<html")) {
      return t.replace(/<\/body>/i,
        `<script>${VIZ_INTERACT_SCRIPT}<\/script></body>`);
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0d1421; color: #f8fafc; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  </style>
</head>
<body>
${t}
<script>${VIZ_INTERACT_SCRIPT}<\/script>
</body>
</html>`;
  }

  const fillLazyTabs = useCallback(async (doc: Document) => {
    if (fillPendingRef.current) return;
    const host = doc.querySelector<HTMLElement>('[data-viz-host-tabs][data-viz-lazy-tabs="1"]');
    if (!host) return;
    const pending = Array.from(doc.querySelectorAll<HTMLElement>('[data-viz-tab-panel][data-viz-pending="1"]'));
    if (!pending.length) return;
    const tabs = pending
      .map(p => ({
        id:    p.getAttribute("data-viz-tab-panel")!,
        label: (p.getAttribute("data-viz-tab-label") || "").trim(),
      }))
      .filter(t => t.id != null);
    if (!tabs.length) return;

    const transcript = "";
    fillPendingRef.current = true;
    try {
      const res = await fetch(`${BASE}api/viz/fill-tab-panels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, roomId, title, context, tabs, workspaceDomain }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.panels || typeof data.panels !== "object") return;
      for (const [id, innerHtml] of Object.entries(data.panels)) {
        const safeId = String(id).replace(/["\\]/g, "");
        const panel = doc.querySelector<HTMLElement>(`[data-viz-tab-panel="${safeId}"]`);
        if (panel && innerHtml != null && String(innerHtml).trim() !== "") {
          panel.innerHTML = String(innerHtml);
          panel.removeAttribute("data-viz-pending");
        }
      }
    } catch {
      // silently fail
    } finally {
      fillPendingRef.current = false;
    }
  }, [roomId, title, context, workspaceDomain]);

  const writeHtmlToIframe = useCallback(
    (rawHtml: string) => {
      if (!iframeRef.current) return;
      const doc = iframeRef.current.contentDocument;
      if (!doc) return;
      originalHtmlRef.current = rawHtml;
      editHook.disable();
      setIsEditMode(false);
      fillPendingRef.current = false;
      doc.open();
      doc.write(buildDocument(rawHtml));
      doc.close();
    },
    [editHook],
  );

  // Under streaming: throttled iframe-opdateringer (undgår blink ved hver chunk)
  useEffect(() => {
    if (!isStreaming || !renderable) {
      if (streamFlushIntervalRef.current) {
        clearInterval(streamFlushIntervalRef.current);
        streamFlushIntervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      const h = pendingHtmlRef.current;
      if (h && isHtmlRenderable(h)) writeHtmlToIframe(h);
    };

    tick();
    streamFlushIntervalRef.current = setInterval(tick, STREAMING_IFRAME_THROTTLE_MS);

    return () => {
      if (streamFlushIntervalRef.current) {
        clearInterval(streamFlushIntervalRef.current);
        streamFlushIntervalRef.current = null;
      }
    };
  }, [isStreaming, renderable, writeHtmlToIframe]);

  // Når ikke streaming: ét fuldt skriv pr. færdig HTML (inkl. lazy tabs)
  useEffect(() => {
    if (isStreaming) return;
    if (!html || !renderable || !iframeRef.current) return;
    writeHtmlToIframe(html);

    setTimeout(() => {
      const d = iframeRef.current?.contentDocument;
      if (d) fillLazyTabs(d);
    }, 400);
  }, [html, renderable, isStreaming, fillLazyTabs, writeHtmlToIframe]);

  const toggleEditMode = useCallback(() => {
    const newMode = !isEditMode;
    setIsEditMode(newMode);
    if (newMode) {
      editHook.enable();
    } else {
      editHook.disable();
    }
  }, [isEditMode, editHook]);

  const handleReset = useCallback(() => {
    if (!originalHtmlRef.current || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    editHook.disable();
    setIsEditMode(false);
    doc.open();
    doc.write(buildDocument(originalHtmlRef.current));
    doc.close();

    if (!isStreaming) {
      setTimeout(() => {
        const d = iframeRef.current?.contentDocument;
        if (d) fillLazyTabs(d);
      }, 400);
    }
  }, [isStreaming, fillLazyTabs, editHook]);

  const isEmpty = !html || html.trim() === "";

  return (
    <div className={cn(
      "relative group flex flex-col w-full h-full",
      isFullscreen
        ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2"
        : className
    )}>
      {!isEmpty && !showSkeleton && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider backdrop-blur-sm",
              isEditMode
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-background/90 border-border text-muted-foreground hover:text-foreground hover:bg-background"
            )}
            onClick={toggleEditMode}
          >
            <Pencil className="h-3 w-3" />
            {isEditMode ? "Editing" : "Edit"}
          </Button>

          {isEditMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider bg-background/90 border-border text-muted-foreground hover:text-foreground hover:bg-background backdrop-blur-sm"
              onClick={handleReset}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            className="w-7 h-7 bg-background/90 border-border backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      {isEditMode && !isEmpty && !showSkeleton && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-primary tracking-wider uppercase">
            ✎ Edit · klik = præcis det element du rammer · dobbeltklik = tekst · træk = flyt · vælg farve i værktøjslinjen · Del = slet
          </span>
        </div>
      )}

      {isEmpty && !isStreaming && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-border bg-card/30">
          <div className="text-center space-y-4 text-muted-foreground p-8">
            <div className="w-16 h-16 mx-auto opacity-10 border-2 border-current rounded-xl flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-display">No Visualization Yet</p>
              <p className="text-xs mt-1 opacity-60">Start recording and click Visualize to generate</p>
            </div>
          </div>
        </div>
      )}

      {showSkeleton && (
        <div className="flex-1 relative rounded-lg border border-border overflow-hidden">
          <VizSkeleton progress={skeletonProgress} />
        </div>
      )}

      {!isEmpty && (
        <div
          className={cn(
            "relative min-h-0 w-full",
            showSkeleton ? "absolute h-0 overflow-hidden opacity-0" : "flex-1 flex flex-col"
          )}
        >
          <iframe
            ref={iframeRef}
            className={cn(
              "w-full rounded-lg bg-card/20 border transition-opacity duration-200",
              showSkeleton ? "pointer-events-none h-0 min-h-0 shrink-0 opacity-0" : "min-h-0 flex-1",
              isEditMode ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
              isStreaming && renderable && !showSkeleton && "opacity-[0.98]"
            )}
            title="AI Visualization"
            style={{ pointerEvents: "auto" }}
          />
          {isStreaming && renderable && !showSkeleton && (
            <StreamingSandOverlay active assemblyProgress={skeletonProgress} />
          )}
        </div>
      )}
    </div>
  );
}
