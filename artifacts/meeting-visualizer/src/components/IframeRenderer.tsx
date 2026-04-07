import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Minimize2, Maximize2, Pencil, RotateCcw, PenLine } from "lucide-react";
import { Button } from "./ui/button";
import { useIframeEdit } from "@/hooks/use-iframe-edit";

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

/** Under streaming: færre fulde doc.write() ⇒ mindre hvid blink mellem opdateringer */
const STREAMING_IFRAME_THROTTLE_MS = 1100;

function isHtmlRenderable(html: string | null): boolean {
  if (!html || html.length < 300) return false;
  return html.includes("<div") || html.includes("<section") || html.includes("<table");
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
  /** Kaldes med screenshot af visualiseringen når brugeren klikker "Tegn på" */
  onAnnotate?: (screenshotDataUrl: string) => void;
}

export function IframeRenderer({
  html,
  className,
  isStreaming = false,
  roomId,
  title,
  context,
  workspaceDomain,
  onAnnotate,
}: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const fillPendingRef = useRef(false);
  const originalHtmlRef = useRef<string | null>(null);
  const editHook = useIframeEdit(iframeRef);
  /** Stabil reference — editHook-objektet er nyt hver render og må ikke invalider writeHtmlToIframe. */
  const editHookRef = useRef(editHook);
  editHookRef.current = editHook;
  /** Seneste HTML fra props — læses i throttled interval under streaming */
  const pendingHtmlRef = useRef<string | null>(null);
  const streamFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStreamWrittenRef = useRef<string | null>(null);
  const lastCommittedHtmlRef = useRef<string | null>(null);

  pendingHtmlRef.current = html;

  const renderable = isHtmlRenderable(html);
  const isEmpty = !html || html.trim() === "";

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

  const writeHtmlToIframe = useCallback((rawHtml: string) => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    originalHtmlRef.current = rawHtml;
    editHookRef.current.disable();
    setIsEditMode(false);
    fillPendingRef.current = false;
    doc.open();
    doc.write(buildDocument(rawHtml));
    doc.close();
  }, []);

  useEffect(() => {
    if (isStreaming) {
      lastStreamWrittenRef.current = null;
    }
  }, [isStreaming]);

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
      if (!h || !isHtmlRenderable(h)) return;
      if (h === lastStreamWrittenRef.current) return;
      lastStreamWrittenRef.current = h;
      writeHtmlToIframe(h);
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
    if (!html || !renderable || !iframeRef.current) {
      if (!html) {
        lastCommittedHtmlRef.current = null;
      }
      return;
    }
    if (lastCommittedHtmlRef.current === html) {
      return;
    }
    lastCommittedHtmlRef.current = html;
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

  const handleAnnotate = useCallback(() => {
    if (!onAnnotate || !iframeRef.current) return;
    const iframeDoc = iframeRef.current.contentDocument;
    if (!iframeDoc) { onAnnotate(""); return; }
    // Send det fuldt renderede HTML-dokument direkte — ingen screenshot-capture
    // SketchModal renderer det i en baggrundsiframe i korrekt størrelse
    const html = iframeDoc.documentElement.outerHTML;
    onAnnotate(html || "");
  }, [onAnnotate]);

  return (
    <div className={cn(
      "relative group flex flex-col w-full h-full",
      isFullscreen
        ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2"
        : className
    )}>
      {!isEmpty && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          {onAnnotate && (
            <Button
              variant="outline"
              size="sm"
              disabled={isStreaming}
              className="h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider bg-background/90 border-primary/40 text-primary hover:text-primary-foreground hover:bg-primary backdrop-blur-sm"
              onClick={handleAnnotate}
              title="Åbn Excalidraw med visualiseringen som baggrund — tegn ændringer og annotationer"
            >
              <PenLine className="h-3 w-3" />
              Annotate
            </Button>
          )}

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

      {isEditMode && !isEmpty && (
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

      {!isEmpty && (
        <div className="relative min-h-0 w-full flex-1 flex flex-col">
          <iframe
            ref={iframeRef}
            className={cn(
              "w-full rounded-lg bg-card/20 border min-h-0 flex-1",
              isEditMode ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
            )}
            title="AI Visualization"
            style={{ pointerEvents: "auto" }}
          />
        </div>
      )}
    </div>
  );
}
