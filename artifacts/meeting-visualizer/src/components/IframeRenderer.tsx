import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Minimize2, Maximize2, Pencil, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";

const BASE = import.meta.env.BASE_URL;

const VIZ_INTERACT_SCRIPT = `
(function() {
  if (window.__vizInteractInit) return;
  window.__vizInteractInit = true;

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

const EDIT_MODE_SCRIPT = `
(function() {
  if (window.__vizEditInit) return;
  window.__vizEditInit = true;

  var editMode = false;
  var selectedEl = null;
  var toolbar = null;
  var dragState = null;
  var activeDragCleanup = null;
  var IGNORED_TAGS = {HTML:1, BODY:1, HEAD:1, SCRIPT:1, STYLE:1, LINK:1, META:1, TITLE:1, BR:1, HR:1};

  function injectEditStyles() {
    if (document.getElementById('__viz-edit-styles')) return;
    var s = document.createElement('style');
    s.id = '__viz-edit-styles';
    s.textContent =
      '.__viz-edit-hover { outline: 2px dashed rgba(0,200,255,0.35) !important; outline-offset: 2px; cursor: move !important; }' +
      '.__viz-edit-selected { outline: 2px solid #00c8ff !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(0,200,255,0.15) !important; }' +
      '.__viz-edit-dragging { opacity: 0.85; z-index: 99999 !important; }' +
      '.__viz-toolbar { position: fixed; display: flex; align-items: center; gap: 2px; padding: 3px 4px; background: #1a1f2e; border: 1px solid rgba(0,200,255,0.3); border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.6); z-index: 999999; font-family: system-ui, sans-serif; }' +
      '.__viz-toolbar button { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #a8b8cc; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }' +
      '.__viz-toolbar button:hover { background: rgba(0,200,255,0.15); color: #fff; }' +
      '.__viz-toolbar .sep { width: 1px; height: 20px; background: rgba(255,255,255,0.1); margin: 0 2px; }' +
      '.__viz-toolbar .clr { width: 16px; height: 16px; border-radius: 3px; border: 2px solid rgba(255,255,255,0.2); cursor: pointer; }' +
      '.__viz-toolbar .clr:hover { border-color: #fff; }' +
      '.__viz-edit-active * { user-select: none !important; -webkit-user-select: none !important; }';
    document.head.appendChild(s);
  }

  function removeEditStyles() {
    var s = document.getElementById('__viz-edit-styles');
    if (s) s.remove();
  }

  function createToolbar() {
    if (toolbar) toolbar.remove();
    var t = document.createElement('div');
    t.className = '__viz-toolbar';

    var colors = [
      ['#0d1421','Dark'],['#1e293b','Slate'],['#002A5C','Navy'],['#0077C8','Blue'],
      ['#00c8ff','Cyan'],['#00d084','Green'],['#ffb800','Amber'],['#ff4757','Red'],['#ffffff','White']
    ];
    colors.forEach(function(c) {
      var b = document.createElement('button');
      b.className = 'clr';
      b.style.background = c[0];
      b.title = c[1];
      b.onclick = function(e) {
        e.stopPropagation();
        if (selectedEl) selectedEl.style.backgroundColor = c[0];
      };
      t.appendChild(b);
    });

    var sep1 = document.createElement('div'); sep1.className = 'sep'; t.appendChild(sep1);

    var btnDouble = document.createElement('button');
    btnDouble.innerHTML = 'T';
    btnDouble.title = 'Double-click to edit text';
    btnDouble.style.fontSize = '11px';
    btnDouble.style.opacity = '0.5';
    t.appendChild(btnDouble);

    var btnBold = document.createElement('button');
    btnBold.innerHTML = '<b>B</b>';
    btnBold.title = 'Bold';
    btnBold.onclick = function(e) {
      e.stopPropagation();
      if (!selectedEl) return;
      var cur = window.getComputedStyle(selectedEl).fontWeight;
      selectedEl.style.fontWeight = (parseInt(cur) >= 700 || cur === 'bold') ? 'normal' : 'bold';
    };
    t.appendChild(btnBold);

    var btnItalic = document.createElement('button');
    btnItalic.innerHTML = '<i>I</i>';
    btnItalic.title = 'Italic';
    btnItalic.onclick = function(e) {
      e.stopPropagation();
      if (!selectedEl) return;
      var cur = window.getComputedStyle(selectedEl).fontStyle;
      selectedEl.style.fontStyle = cur === 'italic' ? 'normal' : 'italic';
    };
    t.appendChild(btnItalic);

    var sep2 = document.createElement('div'); sep2.className = 'sep'; t.appendChild(sep2);

    var btnDel = document.createElement('button');
    btnDel.innerHTML = '\\u2715';
    btnDel.title = 'Delete element';
    btnDel.style.color = '#ff4757';
    btnDel.onclick = function(e) {
      e.stopPropagation();
      if (selectedEl) {
        selectedEl.remove();
        deselect();
      }
    };
    t.appendChild(btnDel);

    document.body.appendChild(t);
    toolbar = t;
    return t;
  }

  function positionToolbar(el) {
    if (!toolbar) return;
    var r = el.getBoundingClientRect();
    var tw = toolbar.offsetWidth;
    var left = r.left + (r.width - tw) / 2;
    if (left < 4) left = 4;
    if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
    var top = r.top - 40;
    if (top < 4) top = r.bottom + 6;
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  function selectElement(el) {
    deselect();
    selectedEl = el;
    el.classList.add('__viz-edit-selected');
    if (!toolbar) createToolbar();
    toolbar.style.display = 'flex';
    positionToolbar(el);
  }

  function deselect() {
    if (selectedEl) {
      selectedEl.classList.remove('__viz-edit-selected');
      selectedEl = null;
    }
    if (toolbar) toolbar.style.display = 'none';
  }

  function isEditTarget(el) {
    if (!el || !el.tagName || IGNORED_TAGS[el.tagName]) return false;
    if (el.classList && (el.classList.contains('__viz-toolbar') || el.closest('.__viz-toolbar'))) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) return false;
    return true;
  }

  function findBestTarget(el) {
    while (el && el !== document.body) {
      if (isEditTarget(el)) {
        var r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 20) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  var hoverEl = null;

  function onMouseMove(e) {
    if (dragState) return;
    var target = findBestTarget(e.target);
    if (target === hoverEl) return;
    if (hoverEl) hoverEl.classList.remove('__viz-edit-hover');
    hoverEl = target;
    if (hoverEl && hoverEl !== selectedEl) hoverEl.classList.add('__viz-edit-hover');
  }

  function onMouseDown(e) {
    if (e.target && e.target.nodeType === 1 && e.target.closest && e.target.closest('.__viz-toolbar')) return;

    var target = findBestTarget(e.target);
    if (!target) {
      deselect();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    selectElement(target);

    if (!target.style.position || target.style.position === 'static') {
      target.style.position = 'relative';
    }

    var startX = e.clientX;
    var startY = e.clientY;
    var origLeft = parseInt(target.style.left) || 0;
    var origTop = parseInt(target.style.top) || 0;
    var moved = false;

    target.classList.add('__viz-edit-dragging');
    dragState = { el: target, startX: startX, startY: startY, origLeft: origLeft, origTop: origTop };

    function onDragMove(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      target.style.left = (origLeft + dx) + 'px';
      target.style.top = (origTop + dy) + 'px';
      positionToolbar(target);
    }

    function onDragEnd() {
      document.removeEventListener('mousemove', onDragMove, true);
      document.removeEventListener('mouseup', onDragEnd, true);
      target.classList.remove('__viz-edit-dragging');
      dragState = null;
      activeDragCleanup = null;
      if (moved) positionToolbar(target);
    }

    activeDragCleanup = function() {
      document.removeEventListener('mousemove', onDragMove, true);
      document.removeEventListener('mouseup', onDragEnd, true);
      target.classList.remove('__viz-edit-dragging');
      dragState = null;
      activeDragCleanup = null;
    };

    document.addEventListener('mousemove', onDragMove, true);
    document.addEventListener('mouseup', onDragEnd, true);
  }

  function onDblClick(e) {
    if (!editMode) return;
    var target = findBestTarget(e.target);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    target.contentEditable = 'true';
    target.focus();

    function onBlur() {
      target.contentEditable = 'false';
      target.removeEventListener('blur', onBlur);
    }
    target.addEventListener('blur', onBlur);
  }

  function onKeyDown(e) {
    if (!editMode || !selectedEl) return;
    if (selectedEl.isContentEditable) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      selectedEl.remove();
      deselect();
    }
  }

  function enableEdit() {
    if (editMode) return;
    editMode = true;
    injectEditStyles();
    document.body.classList.add('__viz-edit-active');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.parent.postMessage({ type: 'viz-edit-status', enabled: true }, '*');
  }

  function disableEdit() {
    if (!editMode) return;
    editMode = false;
    if (activeDragCleanup) activeDragCleanup();
    deselect();
    if (hoverEl) { hoverEl.classList.remove('__viz-edit-hover'); hoverEl = null; }
    if (toolbar) { toolbar.remove(); toolbar = null; }
    document.body.classList.remove('__viz-edit-active');
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('dblclick', onDblClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    removeEditStyles();
    window.parent.postMessage({ type: 'viz-edit-status', enabled: false }, '*');
  }

  window.addEventListener('message', function(e) {
    if (e.source !== window.parent) return;
    if (e.data && e.data.type === 'viz-edit-mode') {
      if (e.data.enabled) enableEdit();
      else disableEdit();
    }
  });
})();
`;

function isHtmlRenderable(html: string | null): boolean {
  if (!html || html.length < 300) return false;
  const has_div = html.includes("<div") || html.includes("<section") || html.includes("<table");
  return has_div;
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
  const [isEditMode, setIsEditMode] = useState(false);
  const fillPendingRef = useRef(false);
  const originalHtmlRef = useRef<string | null>(null);

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
    const editScript = `<script>${EDIT_MODE_SCRIPT}<\/script>`;
    if (t.startsWith("<!DOCTYPE") || t.toLowerCase().startsWith("<html")) {
      return t.replace(/<\/body>/i,
        `<script>${VIZ_INTERACT_SCRIPT}<\/script>${editScript}</body>`);
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
${editScript}
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
    if (!html || !renderable || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    originalHtmlRef.current = html;
    setIsEditMode(false);
    fillPendingRef.current = false;
    doc.open();
    doc.write(buildDocument(html));
    doc.close();

    if (!isStreaming) {
      setTimeout(() => {
        const d = iframeRef.current?.contentDocument;
        if (d) fillLazyTabs(d);
      }, 400);
    }
  }, [html, renderable, isStreaming, fillLazyTabs]);

  const toggleEditMode = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const newMode = !isEditMode;
    setIsEditMode(newMode);
    iframe.contentWindow.postMessage({ type: "viz-edit-mode", enabled: newMode }, "*");
  }, [isEditMode]);

  const handleReset = useCallback(() => {
    if (!originalHtmlRef.current || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
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
  }, [isStreaming, fillLazyTabs]);

  const isEmpty = !html || html.trim() === "";

  return (
    <div className={cn(
      "relative group flex flex-col w-full h-full",
      isFullscreen
        ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2"
        : className
    )}>
      {!isEmpty && !showSkeleton && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-7 h-7 backdrop-blur-sm",
              isEditMode
                ? "bg-primary/30 text-primary hover:bg-primary/40"
                : "bg-background/80 text-muted-foreground hover:text-foreground"
            )}
            onClick={toggleEditMode}
            title={isEditMode ? "Exit edit mode" : "Edit visualization"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {isEditMode && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
              onClick={handleReset}
              title="Reset to original"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
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
            ✎ Edit · click to select · double-click for text · drag to move · Del/Backspace to delete
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
        <iframe
          ref={iframeRef}
          className={cn(
            "w-full rounded-lg bg-card/20 border transition-opacity duration-300",
            showSkeleton ? "absolute opacity-0 pointer-events-none h-0" : "flex-1",
            isEditMode ? "border-primary/40" : "border-border"
          )}
          sandbox="allow-scripts allow-same-origin"
          title="AI Visualization"
        />
      )}
    </div>
  );
}
