import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Minimize2, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";

const BASE = import.meta.env.BASE_URL;

// Script injected into every rendered visualization to power host-tab switching
// and other stateful interactions defined by data-viz-* attributes.
const VIZ_INTERACT_SCRIPT = `
(function() {
  if (window.__vizInteractInit) return;
  window.__vizInteractInit = true;

  // ── HOST TABS (data-viz-host-tabs) ─────────────────────────────────────────
  document.querySelectorAll('[data-viz-host-tabs]').forEach(function(host) {
    var tabs  = host.querySelectorAll('[role="tab"][data-viz-tab]');
    var panels = host.querySelectorAll('[data-viz-tab-panel]');

    function activate(idx) {
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

    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        activate(tab.getAttribute('data-viz-tab'));
      });
    });
  });

  // ── TOGGLE CONTROLS (data-viz-toggle) ─────────────────────────────────────
  document.querySelectorAll('[data-viz-toggle]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sel = btn.getAttribute('data-viz-toggle');
      document.querySelectorAll(sel).forEach(function(el) {
        el.classList.toggle('viz-open');
      });
    });
  });
})();
`;

interface IframeRendererProps {
  html: string | null;
  className?: string;
  isStreaming?: boolean;
  roomId?: string | null;
  title?: string | null;
  context?: string | null;
}

export function IframeRenderer({
  html,
  className,
  isStreaming = false,
  roomId,
  title,
  context,
}: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fillPendingRef = useRef(false);

  // Strip ```html...``` code fence wrappers the model sometimes emits
  function stripCodeFences(s: string): string {
    let t = s.trim();
    t = t.replace(/^```(?:html)?\s*\n?/, "");
    t = t.replace(/\n?```\s*$/, "");
    return t.trim();
  }

  // Detect whether the generated HTML is a full document or a snippet
  function buildDocument(rawHtml: string): string {
    const t = stripCodeFences(rawHtml).trimStart();
    if (t.startsWith("<!DOCTYPE") || t.toLowerCase().startsWith("<html")) {
      // Full document — inject interaction script before </body>
      return t.replace(/<\/body>/i,
        `<script>${VIZ_INTERACT_SCRIPT}<\/script></body>`);
    }
    // Snippet (style + div) — wrap in a minimal doc
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

  // Fill lazy tab panels via the API
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

    // Find the transcript from the parent page's iframe context is not possible,
    // but we can use the roomId to let the server pull it from the room.
    const transcript = ""; // server will use room segments if roomId given

    fillPendingRef.current = true;
    try {
      const res = await fetch(`${BASE}api/viz/fill-tab-panels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, roomId, title, context, tabs }),
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
  }, [roomId, title, context]);

  useEffect(() => {
    if (!html || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    fillPendingRef.current = false;
    doc.open();
    doc.write(buildDocument(html));
    doc.close();

    // If no longer streaming, try to fill lazy tab panels
    if (!isStreaming) {
      // Small delay so the browser has painted the iframe content
      setTimeout(() => {
        const d = iframeRef.current?.contentDocument;
        if (d) fillLazyTabs(d);
      }, 400);
    }
  }, [html, isStreaming, fillLazyTabs]);

  return (
    <div className={cn(
      "relative group flex flex-col w-full h-full",
      isFullscreen
        ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2"
        : className
    )}>
      {html && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm w-7 h-7"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      )}

      {isStreaming && (
        <div className="absolute top-3 right-12 z-10 flex items-center gap-1.5 bg-primary/20 text-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md border border-primary/30 animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          Rendering
        </div>
      )}

      {(!html || html.trim() === "") ? (
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
      ) : (
        <iframe
          ref={iframeRef}
          className="flex-1 w-full rounded-lg bg-card/20 border border-border"
          sandbox="allow-scripts allow-same-origin"
          title="AI Visualization"
        />
      )}
    </div>
  );
}
