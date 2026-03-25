import { useRef, useCallback, useEffect } from "react";

const EDIT_STYLES = `
.__viz-edit-hover {
  outline: 2px dashed rgba(0,200,255,0.4) !important;
  outline-offset: 2px;
  cursor: move !important;
}
.__viz-edit-selected {
  outline: 2px solid #00c8ff !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(0,200,255,0.18) !important;
}
.__viz-edit-dragging {
  opacity: 0.85;
  z-index: 99999 !important;
}
.__viz-toolbar {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #1a1f2e;
  border: 1px solid rgba(0,200,255,0.35);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.7);
  z-index: 999999;
  font-family: system-ui, -apple-system, sans-serif;
}
.__viz-toolbar button {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}
.__viz-toolbar button:hover {
  background: rgba(0,200,255,0.18);
  color: #fff;
}
.__viz-toolbar .sep {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.1);
  margin: 0 3px;
}
.__viz-toolbar .clr-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid rgba(255,255,255,0.15);
  cursor: pointer;
  padding: 0;
  min-width: 18px;
}
.__viz-toolbar .clr-btn:hover {
  border-color: #fff;
}
.__viz-edit-active,
.__viz-edit-active * {
  user-select: none !important;
  -webkit-user-select: none !important;
}
`;

const IGNORED_TAGS: Record<string, boolean> = {
  HTML: true, BODY: true, HEAD: true, SCRIPT: true, STYLE: true,
  LINK: true, META: true, TITLE: true, BR: true, HR: true,
};

const COLORS = [
  ["#0d1421", "Dark"], ["#1e293b", "Slate"], ["#002A5C", "Navy"],
  ["#0077C8", "Blue"], ["#00c8ff", "Cyan"], ["#00d084", "Green"],
  ["#ffb800", "Amber"], ["#ff4757", "Red"], ["#ffffff", "White"],
];

function isEditTarget(el: Element): boolean {
  if (!el || !el.tagName || IGNORED_TAGS[el.tagName]) return false;
  if (el.classList?.contains("__viz-toolbar") || el.closest(".__viz-toolbar")) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 20 && r.height >= 10;
}

function findBestTarget(el: Element | null, body: Element): Element | null {
  while (el && el !== body) {
    if (isEditTarget(el)) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 20) return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function useIframeEdit(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const activeRef = useRef(false);
  const selectedRef = useRef<HTMLElement | null>(null);
  const hoverRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const handlersRef = useRef<{
    mouseMove: (e: MouseEvent) => void;
    mouseDown: (e: MouseEvent) => void;
    dblClick: (e: MouseEvent) => void;
    keyDown: (e: KeyboardEvent) => void;
  } | null>(null);

  const getDoc = useCallback((): Document | null => {
    return iframeRef.current?.contentDocument ?? null;
  }, [iframeRef]);

  const positionToolbar = useCallback((el: HTMLElement) => {
    const tb = toolbarRef.current;
    if (!tb) return;
    const doc = getDoc();
    if (!doc) return;
    const win = doc.defaultView;
    if (!win) return;
    const r = el.getBoundingClientRect();
    const tw = tb.offsetWidth;
    let left = r.left + (r.width - tw) / 2;
    if (left < 4) left = 4;
    if (left + tw > win.innerWidth - 4) left = win.innerWidth - tw - 4;
    let top = r.top - 44;
    if (top < 4) top = r.bottom + 8;
    tb.style.left = `${left}px`;
    tb.style.top = `${top}px`;
  }, [getDoc]);

  const deselect = useCallback(() => {
    if (selectedRef.current) {
      selectedRef.current.classList.remove("__viz-edit-selected");
      selectedRef.current = null;
    }
    if (toolbarRef.current) toolbarRef.current.style.display = "none";
  }, []);

  const createToolbar = useCallback((doc: Document) => {
    if (toolbarRef.current) toolbarRef.current.remove();
    const t = doc.createElement("div");
    t.className = "__viz-toolbar";

    COLORS.forEach(([color, name]) => {
      const b = doc.createElement("button");
      b.className = "clr-btn";
      b.style.background = color;
      b.title = name;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (selectedRef.current) selectedRef.current.style.backgroundColor = color;
      });
      t.appendChild(b);
    });

    const sep1 = doc.createElement("div"); sep1.className = "sep"; t.appendChild(sep1);

    const btnBold = doc.createElement("button");
    btnBold.innerHTML = "<b>B</b>";
    btnBold.title = "Bold";
    btnBold.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!selectedRef.current) return;
      const win = doc.defaultView;
      if (!win) return;
      const cur = win.getComputedStyle(selectedRef.current).fontWeight;
      selectedRef.current.style.fontWeight = (parseInt(cur) >= 700 || cur === "bold") ? "normal" : "bold";
    });
    t.appendChild(btnBold);

    const btnItalic = doc.createElement("button");
    btnItalic.innerHTML = "<i>I</i>";
    btnItalic.title = "Italic";
    btnItalic.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!selectedRef.current) return;
      const win = doc.defaultView;
      if (!win) return;
      const cur = win.getComputedStyle(selectedRef.current).fontStyle;
      selectedRef.current.style.fontStyle = cur === "italic" ? "normal" : "italic";
    });
    t.appendChild(btnItalic);

    const sep2 = doc.createElement("div"); sep2.className = "sep"; t.appendChild(sep2);

    const btnDel = doc.createElement("button");
    btnDel.innerHTML = "\u2715";
    btnDel.title = "Delete element";
    btnDel.style.color = "#ff4757";
    btnDel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (selectedRef.current) {
        selectedRef.current.remove();
        deselect();
      }
    });
    t.appendChild(btnDel);

    doc.body.appendChild(t);
    toolbarRef.current = t;
  }, [deselect]);

  const selectElement = useCallback((el: HTMLElement) => {
    deselect();
    selectedRef.current = el;
    el.classList.add("__viz-edit-selected");
    const doc = getDoc();
    if (doc && !toolbarRef.current) createToolbar(doc);
    if (toolbarRef.current) {
      toolbarRef.current.style.display = "flex";
      positionToolbar(el);
    }
  }, [deselect, getDoc, createToolbar, positionToolbar]);

  const enable = useCallback(() => {
    if (activeRef.current) return;
    const doc = getDoc();
    if (!doc || !doc.body) return;
    activeRef.current = true;

    let styleEl = doc.getElementById("__viz-edit-styles");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = "__viz-edit-styles";
      styleEl.textContent = EDIT_STYLES;
      doc.head.appendChild(styleEl);
    }
    doc.body.classList.add("__viz-edit-active");

    const handlers = {
      mouseMove: (e: MouseEvent) => {
        if (dragCleanupRef.current) return;
        const target = findBestTarget(e.target as Element, doc.body);
        if (target === hoverRef.current) return;
        if (hoverRef.current) hoverRef.current.classList.remove("__viz-edit-hover");
        hoverRef.current = target as HTMLElement | null;
        if (hoverRef.current && hoverRef.current !== selectedRef.current) {
          hoverRef.current.classList.add("__viz-edit-hover");
        }
      },

      mouseDown: (e: MouseEvent) => {
        const el = e.target as Element | null;
        if (el && el.nodeType === 1 && el.closest?.(".__viz-toolbar")) return;

        const target = findBestTarget(el, doc.body) as HTMLElement | null;
        if (!target) { deselect(); return; }

        e.preventDefault();
        e.stopPropagation();
        selectElement(target);

        if (!target.style.position || target.style.position === "static") {
          target.style.position = "relative";
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseInt(target.style.left) || 0;
        const origTop = parseInt(target.style.top) || 0;
        let moved = false;

        target.classList.add("__viz-edit-dragging");

        const onDragMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
          target.style.left = `${origLeft + dx}px`;
          target.style.top = `${origTop + dy}px`;
          positionToolbar(target);
        };

        const onDragEnd = () => {
          doc.removeEventListener("mousemove", onDragMove, true);
          doc.removeEventListener("mouseup", onDragEnd, true);
          target.classList.remove("__viz-edit-dragging");
          dragCleanupRef.current = null;
          if (moved) positionToolbar(target);
        };

        dragCleanupRef.current = () => {
          doc.removeEventListener("mousemove", onDragMove, true);
          doc.removeEventListener("mouseup", onDragEnd, true);
          target.classList.remove("__viz-edit-dragging");
          dragCleanupRef.current = null;
        };

        doc.addEventListener("mousemove", onDragMove, true);
        doc.addEventListener("mouseup", onDragEnd, true);
      },

      dblClick: (e: MouseEvent) => {
        const target = findBestTarget(e.target as Element, doc.body) as HTMLElement | null;
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        target.contentEditable = "true";
        target.focus();
        const onBlur = () => {
          target.contentEditable = "false";
          target.removeEventListener("blur", onBlur);
        };
        target.addEventListener("blur", onBlur);
      },

      keyDown: (e: KeyboardEvent) => {
        if (!selectedRef.current) return;
        if ((selectedRef.current as HTMLElement).isContentEditable) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          selectedRef.current.remove();
          deselect();
        }
      },
    };

    handlersRef.current = handlers;
    doc.addEventListener("mousemove", handlers.mouseMove, true);
    doc.addEventListener("mousedown", handlers.mouseDown, true);
    doc.addEventListener("dblclick", handlers.dblClick, true);
    doc.addEventListener("keydown", handlers.keyDown, true);
  }, [getDoc, deselect, selectElement, positionToolbar]);

  const disable = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (dragCleanupRef.current) dragCleanupRef.current();
    deselect();
    if (hoverRef.current) {
      hoverRef.current.classList.remove("__viz-edit-hover");
      hoverRef.current = null;
    }
    if (toolbarRef.current) {
      toolbarRef.current.remove();
      toolbarRef.current = null;
    }
    const doc = getDoc();
    if (doc && handlersRef.current) {
      doc.body?.classList.remove("__viz-edit-active");
      doc.removeEventListener("mousemove", handlersRef.current.mouseMove, true);
      doc.removeEventListener("mousedown", handlersRef.current.mouseDown, true);
      doc.removeEventListener("dblclick", handlersRef.current.dblClick, true);
      doc.removeEventListener("keydown", handlersRef.current.keyDown, true);
      handlersRef.current = null;
      const styleEl = doc.getElementById("__viz-edit-styles");
      if (styleEl) styleEl.remove();
    }
  }, [getDoc, deselect]);

  useEffect(() => {
    return () => { disable(); };
  }, [disable]);

  return { enable, disable, isActive: () => activeRef.current };
}
