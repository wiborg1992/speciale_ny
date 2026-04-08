import { useRef, useCallback, useEffect } from "react";

/** Samme mønster som specialev-rkt-j/public/index.html: værktøjslinje i parent window + injiceret script i iframen. */
const TOOLBAR_ID = "__speciale-viz-float-toolbar";

export type SpecialeVizEditBridge = {
  repositionToolbar: (el: Element) => void;
  showFloatToolbar: (iframe: HTMLIFrameElement, el: Element) => void;
  hideFloatToolbar: () => void;
  notifyChange: () => void;
  rgbToHex: (rgb: string) => string | null;
};

declare global {
  interface Window {
    __SpecialeVizEditBridge?: SpecialeVizEditBridge;
  }
}

function rgbToHex(rgb: string): string | null {
  if (!rgb || rgb === "transparent") return null;
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return (
    "#" +
    [m[1], m[2], m[3]].map((x) => parseInt(x, 10).toString(16).padStart(2, "0")).join("")
  );
}

function buildInjectedEditorScript(): string {
  return `(function(){
  if (window.__vizEditorActive) return;
  window.__vizEditorActive = true;

  var BR = window.parent.__SpecialeVizEditBridge;
  if (!BR) return;

  var SKIP = new Set(['HTML','HEAD','BODY','SCRIPT','STYLE','LINK','META','TITLE','NOSCRIPT','BR','HR']);
  function isChrome(el) {
    if (!el || !el.closest) return true;
    if (el.closest('[data-viz-filter]')) return true;
    if (el.closest('[role="tab"][data-viz-tab]')) return true;
    if (el.closest('[data-viz-toggle]')) return true;
    if (el.closest('#__viz-editor-badge')) return true;
    return false;
  }

  var sel = null;
  var dragEl = null, dragStartX = 0, dragStartY = 0, mouseDownX = 0, mouseDownY = 0, isDragging = false;

  var __origTransforms = new Map();
  document.querySelectorAll('*').forEach(function(el) {
    if (!SKIP.has(el.tagName)) {
      __origTransforms.set(el, {
        transform: el.style.transform || '',
        position: el.style.position || '',
        zIndex: el.style.zIndex || ''
      });
    }
  });

  window.__vizResetPositions = function() {
    __origTransforms.forEach(function(orig, el) {
      if (!document.contains(el)) return;
      el.style.transform = orig.transform;
      el.style.position = orig.position;
      el.style.zIndex = orig.zIndex;
      el.style.cursor = '';
    });
    if (sel) deselect();
  };

  var badge = document.createElement('div');
  badge.id = '__viz-editor-badge';
  badge.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);max-width:96vw;background:rgba(37,99,235,.92);color:#fff;font-size:.62rem;padding:6px 14px;border-radius:10px;z-index:2147483646;pointer-events:none;font-family:system-ui;text-align:center;line-height:1.35';
  badge.textContent = 'Redigering: klik = vælg · dobbeltklik = tekst · træk = flyt · Esc = afvælg · Del = slet — filtre/tabs virker stadig';
  document.body.appendChild(badge);

  function getTransform(el) {
    var m = (el.style.transform || '').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }

  function select(el) {
    if (sel && sel !== el) deselect();
    sel = el;
    el.setAttribute('data-orig-outline', el.style.outline || '');
    el.style.outline = '2px solid #3b82f6';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'grab';
    BR.showFloatToolbar(window.frameElement, el);
  }

  function deselect() {
    if (!sel) return;
    sel.style.outline = sel.getAttribute('data-orig-outline') || '';
    sel.style.outlineOffset = '';
    sel.style.cursor = '';
    if (sel.contentEditable === 'true') sel.contentEditable = 'false';
    sel.removeAttribute('contenteditable');
    sel = null;
    BR.hideFloatToolbar();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!e.target || isChrome(e.target)) return;
    var t = e.target;
    if (t.nodeType === 3) t = t.parentElement;
    if (!t || SKIP.has(t.tagName)) return;
    if (t.contentEditable === 'true') return;
    var existing = getTransform(t);
    dragEl = t;
    dragStartX = e.clientX - existing.x;
    dragStartY = e.clientY - existing.y;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    isDragging = false;
  }

  function onMouseMove(e) {
    if (!dragEl) return;
    if (!isDragging) {
      if (Math.abs(e.clientX - mouseDownX) + Math.abs(e.clientY - mouseDownY) < 5) return;
      isDragging = true;
      dragEl.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    dragEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    dragEl.style.position = 'relative';
    dragEl.style.zIndex = '1000';
    BR.repositionToolbar(dragEl);
  }

  function onMouseUp() {
    if (!dragEl) return;
    if (isDragging) {
      dragEl.style.cursor = dragEl === sel ? 'grab' : '';
      document.body.style.userSelect = '';
      BR.notifyChange();
    }
    dragEl = null;
  }

  function onClick(e) {
    if (e.button !== 0) return;
    if (isDragging) { isDragging = false; return; }
    if (!e.target || isChrome(e.target)) return;
    var t = e.target;
    if (t.nodeType === 3) t = t.parentElement;
    if (!t || SKIP.has(t.tagName)) return;
    e.stopPropagation();
    if (sel === t) { deselect(); return; }
    select(t);
  }

  function onDblClick(e) {
    if (!e.target || isChrome(e.target)) return;
    var t = e.target;
    if (t.nodeType === 3) t = t.parentElement;
    if (!t || SKIP.has(t.tagName)) return;
    e.preventDefault();
    e.stopPropagation();
    select(t);
    t.contentEditable = 'true';
    t.style.cursor = 'text';
    t.focus();
    t.addEventListener('blur', function() {
      t.contentEditable = 'false';
      t.style.cursor = 'grab';
      BR.notifyChange();
    }, { once: true });
  }

  function onKeyDown(e) {
    if (!sel) return;
    if (sel.contentEditable === 'true') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      sel.remove();
      sel = null;
      BR.hideFloatToolbar();
      BR.notifyChange();
    }
    if (e.key === 'Escape') deselect();
  }

  function onMouseOver(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1 || SKIP.has(t.tagName) || t === sel || dragEl || isChrome(t)) return;
    if (!t.__hoverSaved) t.__hoverSaved = t.style.outline || 'none';
    t.style.outline = '1px dashed rgba(59,130,246,.45)';
  }

  function onMouseOut(e) {
    var t = e.target;
    if (t && t !== sel && t.__hoverSaved !== undefined) {
      t.style.outline = t.__hoverSaved === 'none' ? '' : t.__hoverSaved;
    }
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('dblclick', onDblClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);

  window.__vizEditorCleanup = function() {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('dblclick', onDblClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    var b = document.getElementById('__viz-editor-badge');
    if (b) b.remove();
    document.querySelectorAll('[data-orig-outline]').forEach(function(el) {
      el.style.outline = el.getAttribute('data-orig-outline') || '';
      el.removeAttribute('data-orig-outline');
    });
    document.querySelectorAll('[contenteditable]').forEach(function(el) {
      el.contentEditable = 'false';
      el.removeAttribute('contenteditable');
    });
    window.__vizEditorActive = false;
    delete window.__vizEditorCleanup;
    delete window.__vizResetPositions;
  };
})();`;
}

function ensureFloatToolbar(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onMutated?: () => void
): HTMLElement {
  let t = document.getElementById(TOOLBAR_ID);
  if (t && window.__SpecialeVizEditBridge) return t;
  t?.remove();

  t = document.createElement("div");
  t.id = TOOLBAR_ID;
  t.style.cssText = [
    "position:fixed",
    "display:none",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:4px 8px",
    "z-index:2147483647",
    "padding:8px 10px",
    "background:#1a1f2e",
    "border:1px solid rgba(59,130,246,.45)",
    "border-radius:10px",
    "box-shadow:0 8px 32px rgba(0,0,0,.55)",
    "font-family:system-ui,sans-serif",
  ].join(";");
  const btnBase = "width:28px;height:28px;border:none;background:transparent;color:#94a3b8;border-radius:5px;cursor:pointer;font-size:14px";
  t.innerHTML = `
    <label style="font-size:9px;color:#64748b;font-weight:600">Txt</label>
    <input type="color" id="__fbt-color" title="Tekstfarve" style="width:28px;height:26px;padding:0;border:1px solid #334155;border-radius:4px;cursor:pointer"/>
    <label style="font-size:9px;color:#64748b;font-weight:600">Bg</label>
    <input type="color" id="__fbt-bg" title="Baggrund" style="width:28px;height:26px;padding:0;border:1px solid #334155;border-radius:4px;cursor:pointer"/>
    <div style="width:1px;height:20px;background:#334155;margin:0 2px"></div>
    <button type="button" id="__fbt-bold" title="Fed" style="${btnBase}"><b>B</b></button>
    <button type="button" id="__fbt-italic" title="Kursiv" style="${btnBase}"><i>I</i></button>
    <div style="width:1px;height:20px;background:#334155;margin:0 2px"></div>
    <button type="button" id="__fbt-layer-up" title="Lag fremad (z-index +1)" style="${btnBase}">▲</button>
    <button type="button" id="__fbt-layer-dn" title="Lag bagud (z-index −1)" style="${btnBase}">▼</button>
    <div style="width:1px;height:20px;background:#334155;margin:0 2px"></div>
    <button type="button" id="__fbt-del" title="Slet" style="${btnBase};color:#f87171;font-weight:700">✕</button>
  `;
  document.body.appendChild(t);

  type FloatTarget = { iframe: HTMLIFrameElement; el: HTMLElement };
  let floatTarget: FloatTarget | null = null;

  const syncFloatTargetStyles = () => {
    if (!floatTarget) return;
    const cs = floatTarget.iframe.contentWindow?.getComputedStyle(floatTarget.el);
    if (!cs) return;
    const c = rgbToHex(cs.color);
    const bg = rgbToHex(cs.backgroundColor);
    const inC = t.querySelector<HTMLInputElement>("#__fbt-color");
    const inB = t.querySelector<HTMLInputElement>("#__fbt-bg");
    if (c && inC) inC.value = c;
    if (bg && inB) inB.value = bg;
  };

  const repositionToolbar = (el: Element) => {
    const iframe = iframeRef.current;
    if (!iframe || !t) return;
    const iRect = iframe.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top = iRect.top + eRect.top - 52;
    const left = iRect.left + eRect.left;
    t.style.top = `${Math.max(8, top)}px`;
    t.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, left))}px`;
  };

  const hideFloatToolbar = () => {
    t!.style.display = "none";
    if (floatTarget?.el) {
      floatTarget.el.style.outline = floatTarget.el.getAttribute("data-orig-outline") || "";
      floatTarget.el.style.outlineOffset = "";
    }
    floatTarget = null;
  };

  const showFloatToolbar = (iframe: HTMLIFrameElement, el: Element) => {
    floatTarget = { iframe, el: el as HTMLElement };
    syncFloatTargetStyles();
    repositionToolbar(el);
    t!.style.display = "flex";
  };

  t.querySelector<HTMLInputElement>("#__fbt-color")!.oninput = (e) => {
    if (floatTarget) {
      floatTarget.el.style.color = (e.target as HTMLInputElement).value;
      onMutated?.();
    }
  };
  t.querySelector<HTMLInputElement>("#__fbt-bg")!.oninput = (e) => {
    if (floatTarget) {
      floatTarget.el.style.backgroundColor = (e.target as HTMLInputElement).value;
      onMutated?.();
    }
  };
  (t.querySelector("#__fbt-bold") as HTMLButtonElement).onclick = () => {
    if (!floatTarget?.iframe.contentWindow) return;
    const fw = floatTarget.iframe.contentWindow.getComputedStyle(floatTarget.el).fontWeight;
    floatTarget.el.style.fontWeight =
      parseInt(fw, 10) >= 700 || fw === "bold" ? "400" : "700";
    onMutated?.();
  };
  (t.querySelector("#__fbt-italic") as HTMLButtonElement).onclick = () => {
    if (!floatTarget?.iframe.contentWindow) return;
    const fs = floatTarget.iframe.contentWindow.getComputedStyle(floatTarget.el).fontStyle;
    floatTarget.el.style.fontStyle = fs === "italic" ? "normal" : "italic";
    onMutated?.();
  };

  const adjustLayer = (delta: number) => {
    if (!floatTarget?.iframe.contentWindow) return;
    const cs = floatTarget.iframe.contentWindow.getComputedStyle(floatTarget.el);
    const current = parseInt(cs.zIndex, 10);
    const next = (isNaN(current) ? 0 : current) + delta;
    floatTarget.el.style.zIndex = String(next);
    // z-index kræver at elementet er positioned
    const pos = floatTarget.el.style.position || cs.position;
    if (!pos || pos === "static") floatTarget.el.style.position = "relative";
    onMutated?.();
  };
  (t.querySelector("#__fbt-layer-up") as HTMLButtonElement).onclick = () => adjustLayer(1);
  (t.querySelector("#__fbt-layer-dn") as HTMLButtonElement).onclick = () => adjustLayer(-1);

  (t.querySelector("#__fbt-del") as HTMLButtonElement).onclick = () => {
    if (floatTarget) {
      floatTarget.el.remove();
      hideFloatToolbar();
      onMutated?.();
    }
  };

  docClickCleanup?.();
  const onDocClick = (e: MouseEvent) => {
    if (!t || t.style.display === "none") return;
    if (t.contains(e.target as Node)) return;
    const iframe = iframeRef.current;
    if (iframe?.contains(e.target as Node)) return;
    hideFloatToolbar();
  };
  document.addEventListener("click", onDocClick);
  docClickCleanup = () => document.removeEventListener("click", onDocClick);

  window.__SpecialeVizEditBridge = {
    repositionToolbar,
    showFloatToolbar,
    hideFloatToolbar,
    notifyChange: () => onMutated?.(),
    rgbToHex,
  };

  return t;
}

let docClickCleanup: (() => void) | null = null;

function removeFloatToolbar(): void {
  docClickCleanup?.();
  docClickCleanup = null;
  document.getElementById(TOOLBAR_ID)?.remove();
  delete window.__SpecialeVizEditBridge;
}

export function useIframeEdit(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  options?: { onDocumentMutated?: () => void }
) {
  const onMutated = options?.onDocumentMutated;
  const injectedRef = useRef(false);

  const runCleanupInFrame = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const win = doc?.defaultView as (Window & { __vizEditorCleanup?: () => void }) | undefined;
    win?.__vizEditorCleanup?.();
  }, [iframeRef]);

  const disable = useCallback(() => {
    runCleanupInFrame();
    window.__SpecialeVizEditBridge?.hideFloatToolbar();
    removeFloatToolbar();
    injectedRef.current = false;
  }, [runCleanupInFrame]);

  const enable = useCallback(() => {
    if (injectedRef.current) return;
    let attempts = 0;
    const tryInject = () => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc?.body) {
        if (attempts++ < 90) requestAnimationFrame(tryInject);
        return;
      }
      runCleanupInFrame();
      ensureFloatToolbar(iframeRef, onMutated);

      const old = doc.getElementById("__speciale-viz-editor-script");
      old?.remove();

      const script = doc.createElement("script");
      script.id = "__speciale-viz-editor-script";
      script.textContent = buildInjectedEditorScript();
      doc.body.appendChild(script);
      injectedRef.current = true;
    };
    tryInject();
  }, [iframeRef, onMutated, runCleanupInFrame]);

  useEffect(() => {
    return () => {
      disable();
    };
  }, [disable]);

  return { enable, disable, isActive: () => injectedRef.current };
}
