import "@excalidraw/excalidraw/index.css";
import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, Loader2, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.88;
const JPEG_SIZE_THRESHOLD = 1_200_000;

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any;

export interface SketchModalHandle {
  getElementCount: () => number;
  exportPng: () => Promise<{ pngBase64: string; sceneJson: string; width: number; height: number } | null>;
}

interface SketchModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (result: { pngBase64: string; sceneJson: string; previewDataUrl: string; elementCount: number }) => void;
  initialSceneJson?: string | null;
  title?: string;
  /** Fuldt renderet HTML-dokument fra visualiseringen — renderes i en baggrundsiframe */
  backgroundHtml?: string | null;
  /** Annotation-mode: ændr knaptekster og hints */
  isAnnotationMode?: boolean;
}

export const SketchModal = forwardRef<SketchModalHandle, SketchModalProps>(
  ({ open, onClose, onSave, initialSceneJson, title, backgroundHtml, isAnnotationMode = false }, ref) => {
    const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);
    const bgIframeRef = useRef<HTMLIFrameElement | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);

    const resolvedTitle = title ?? (isAnnotationMode
      ? "Tegn annotationer oven på visualiseringen"
      : "Tegn en skitse til din session"
    );

    // Hjælpefunktion til at scrolle baggrundsiframen — brugt af knapper og wheel-listener
    const scrollBg = useCallback((dy: number) => {
      const iwin = bgIframeRef.current?.contentWindow as (Window & { _bgScrollBy?: (n: number) => void }) | null;
      iwin?._bgScrollBy?.(dy);
    }, []);

    // Skriv HTML til baggrundsiframen.
    // Injicér _bgScrollBy() og scroll-CSS direkte i dokumentet
    // så vi kan scrolle uanset om AI-HTML bruger window-scroll eller inner-container-scroll.
    useEffect(() => {
      const iframe = bgIframeRef.current;
      if (!iframe || !backgroundHtml) return;
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Script der prøver alle scroll-strategier
      const scrollScript = `<script id="_bgScrollHelper">(function(){
  function doScroll(dy){
    // Strategi 1: window scroll
    try{window.scrollBy({top:dy,behavior:'instant'});}catch(_){}
    // Strategi 2: documentElement / body direkte
    try{document.documentElement.scrollTop+=dy;}catch(_){}
    try{document.body.scrollTop+=dy;}catch(_){}
    // Strategi 3: den største scrollable descendant
    var best=null,bestSH=0;
    try{document.querySelectorAll('*').forEach(function(el){
      var ov=getComputedStyle(el).overflowY;
      if((ov==='auto'||ov==='scroll')&&el.scrollHeight>el.clientHeight+10&&el.scrollHeight>bestSH){
        bestSH=el.scrollHeight;best=el;
      }
    });if(best)best.scrollTop+=dy;}catch(_){}
  }
  window._bgScrollBy=doScroll;
}());<\/script>`;

      // CSS der sikrer body/html kan scrolle (AI-HTML sætter tit overflow:hidden)
      const scrollCSS = `<style id="_bgScrollCSS">html,body{overflow:auto!important;height:auto!important;min-height:100%!important;}</style>`;

      // Injicer script inden </body> og CSS til sidst
      const enriched = backgroundHtml.includes("</body>")
        ? backgroundHtml.replace("</body>", scrollScript + "</body>")
        : backgroundHtml + scrollScript;

      doc.open();
      doc.write(enriched + scrollCSS);
      doc.close();
    }, [backgroundHtml]);

    // Wheel-forwarding: lyt på window capture (kører FØR Excalidraw's listeners)
    // Bruger _bgScrollBy() som prøver alle scroll-strategier
    useEffect(() => {
      if (!open || !isAnnotationMode) return;
      const handleWheel = (e: WheelEvent) => { scrollBg(e.deltaY); };
      window.addEventListener("wheel", handleWheel, { passive: true, capture: true });
      return () => window.removeEventListener("wheel", handleWheel, { capture: true });
    }, [open, isAnnotationMode, scrollBg]);

    // MutationObserver: gør Excalidraw toolbar draggable (click-and-drag position)
    const annotationWrapperRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!open || !isAnnotationMode) return;
      const wrapper = annotationWrapperRef.current;
      const container = canvasContainerRef.current;
      if (!wrapper) return;

      let cleanupDrag: (() => void) | null = null;

      const setupDraggableToolbar = () => {
        const toolbar = wrapper.querySelector<HTMLElement>(".App-toolbar");
        if (!toolbar || toolbar.dataset.draggable === "true") return;
        toolbar.dataset.draggable = "true";

        // Gør toolbar-content vertikal (lodret palette)
        const content = toolbar.querySelector<HTMLElement>(".App-toolbar-content");
        if (content) {
          content.style.setProperty("flex-direction", "column", "important");
          content.style.setProperty("gap", "2px", "important");
          content.style.setProperty("justify-content", "center", "important");
        }

        // Start-position: venstre side, vertikal center
        toolbar.style.setProperty("position", "absolute", "important");
        toolbar.style.setProperty("width", "auto", "important");
        toolbar.style.setProperty("pointer-events", "all", "important");
        toolbar.style.setProperty("z-index", "20", "important");
        toolbar.style.setProperty("cursor", "grab", "important");
        toolbar.style.setProperty("user-select", "none", "important");
        toolbar.style.setProperty("touch-action", "none", "important");

        // Sæt startposition — venstre side, lodret centreret
        const resolveInitialPosition = () => {
          const containerH = container?.clientHeight ?? wrapper.clientHeight ?? 600;
          const toolbarH = toolbar.offsetHeight || 200;
          toolbar.style.setProperty("left", "12px", "important");
          toolbar.style.setProperty("top", `${Math.max(8, Math.round((containerH - toolbarH) / 2))}px`, "important");
          toolbar.style.removeProperty("transform");
          toolbar.style.removeProperty("bottom");
        };
        resolveInitialPosition();

        // Drag logic — min. 4px bevægelse aktiverer drag (ellers er det et klik på et ikon)
        let isPotentialDrag = false;
        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        const onMouseDown = (e: MouseEvent) => {
          isPotentialDrag = true;
          isDragging = false;
          startX = e.clientX;
          startY = e.clientY;
          startLeft = parseInt(toolbar.style.left, 10) || 12;
          startTop = parseInt(toolbar.style.top, 10) || 0;
        };

        const onMouseMove = (e: MouseEvent) => {
          if (!isPotentialDrag) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (!isDragging && Math.sqrt(dx * dx + dy * dy) > 4) {
            isDragging = true;
            toolbar.style.setProperty("cursor", "grabbing", "important");
          }
          if (isDragging) {
            toolbar.style.setProperty("left", `${startLeft + dx}px`, "important");
            toolbar.style.setProperty("top", `${startTop + dy}px`, "important");
            e.preventDefault();
          }
        };

        const onMouseUp = () => {
          isPotentialDrag = false;
          isDragging = false;
          toolbar.style.setProperty("cursor", "grab", "important");
        };

        toolbar.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        cleanupDrag = () => {
          toolbar.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
      };

      // Kør med det samme + observer for når Excalidraw renderes (lazy-load)
      setupDraggableToolbar();
      const observer = new MutationObserver(setupDraggableToolbar);
      observer.observe(wrapper, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        cleanupDrag?.();
        // Nulstil draggable-flag så næste åbning sætter op fra bunden
        wrapper.querySelectorAll<HTMLElement>("[data-draggable]").forEach((el) => {
          delete el.dataset.draggable;
        });
      };
    }, [open, isAnnotationMode]);

    // I annotation-mode: Excalidraw starter tom (baggrundsbilledet er i iframen, ikke et element)
    // I normal mode: genindlæs tidligere scene-elementer
    const initialData = (() => {
      if (isAnnotationMode) {
        return {
          elements: [],
          appState: { viewBackgroundColor: "rgba(0,0,0,0)" },
        };
      }

      if (initialSceneJson) {
        try {
          const parsed = JSON.parse(initialSceneJson) as { elements?: unknown[] };
          if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
            return { elements: parsed.elements };
          }
        } catch { /* ignore */ }
      }
      return undefined;
    })();

    const getElementCount = useCallback(() => {
      const api = excalidrawApiRef.current;
      if (!api) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return api.getSceneElements().filter((el: any) => !el.isDeleted).length;
    }, []);

    const exportPng = useCallback(async () => {
      const api = excalidrawApiRef.current;
      if (!api) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allElements = api.getSceneElements().filter((el: any) => !el.isDeleted);

      const sceneJson = JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: allElements,
        appState: api.getAppState(),
      });

      const { exportToBlob } = await import("@excalidraw/excalidraw");

      // Annotation-mode: kompositer baggrundsiframe + annotations
      if (isAnnotationMode && backgroundHtml && bgIframeRef.current) {
        const iframe = bgIframeRef.current;
        const container = canvasContainerRef.current;
        const cW = container?.clientWidth ?? iframe.clientWidth;
        const cH = container?.clientHeight ?? iframe.clientHeight;

        // 1. Fang baggrundsiframen med html2canvas — den er fuld størrelse (no scaling)
        const html2canvas = (await import("html2canvas")).default;
        const iframeDoc = iframe.contentDocument;
        const bgCanvas = iframeDoc
          ? await html2canvas(iframeDoc.documentElement, {
              allowTaint: true,
              useCORS: true,
              backgroundColor: null,
              scale: 1,
              width: cW,
              height: cH,
              windowWidth: cW,
              windowHeight: cH,
              logging: false,
            })
          : null;

        const outW = Math.min(cW, MAX_DIMENSION);
        const outH = Math.round(cH * (outW / cW));
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d")!;

        // 2. Tegn baggrundsiframe-capture
        if (bgCanvas) {
          ctx.drawImage(bgCanvas, 0, 0, outW, outH);
        }

        // 3. Eksportér annotation-elementer med transparent baggrund
        if (allElements.length > 0) {
          const annotationBlob = await exportToBlob({
            elements: allElements,
            appState: {
              ...api.getAppState(),
              exportBackground: false,
            },
            files: api.getFiles(),
            mimeType: "image/png",
          });

          const annotBitmap = await createImageBitmap(annotationBlob);
          // Annotationslaget dækker hele Excalidraw-canvas (=containeren)
          // → skalér til output-dimensioner
          ctx.drawImage(annotBitmap, 0, 0, outW, outH);
          annotBitmap.close();
        }

        let pngBase64 = canvas.toDataURL("image/png").split(",")[1];
        if (pngBase64.length > JPEG_SIZE_THRESHOLD) {
          const jpegBase64 = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
          if (jpegBase64.length < pngBase64.length) pngBase64 = jpegBase64;
        }
        const previewDataUrl = canvas.toDataURL("image/jpeg", 0.6);
        return { pngBase64, sceneJson, width: outW, height: outH, previewDataUrl };
      }

      // Normal sketch-mode: eksportér Excalidraw-scenen direkte
      const blob = await exportToBlob({
        elements: allElements,
        appState: { ...api.getAppState(), exportBackground: true },
        files: api.getFiles(),
        mimeType: "image/png",
      });

      const imgBitmap = await createImageBitmap(blob);
      const origW = imgBitmap.width;
      const origH = imgBitmap.height;
      let outW = origW;
      let outH = origH;
      if (origW > MAX_DIMENSION || origH > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / origW, MAX_DIMENSION / origH);
        outW = Math.round(origW * ratio);
        outH = Math.round(origH * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imgBitmap, 0, 0, outW, outH);
      imgBitmap.close();

      let pngBase64 = canvas.toDataURL("image/png").split(",")[1];
      if (pngBase64.length > JPEG_SIZE_THRESHOLD) {
        const jpegBase64 = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
        if (jpegBase64.length < pngBase64.length) pngBase64 = jpegBase64;
      }

      const previewDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      return { pngBase64, sceneJson, width: outW, height: outH, previewDataUrl };
    }, [isAnnotationMode, backgroundHtml]);

    useImperativeHandle(ref, () => ({ getElementCount, exportPng }), [getElementCount, exportPng]);

    const handleApiReady = useCallback((api: ExcalidrawAPI) => {
      excalidrawApiRef.current = api;
    }, []);

    const handleSave = useCallback(async () => {
      const count = getElementCount();
      if (count === 0 && !isAnnotationMode) {
        onClose();
        return;
      }
      const result = await exportPng();
      if (!result) {
        onClose();
        return;
      }
      onSave({
        pngBase64: result.pngBase64,
        sceneJson: result.sceneJson,
        previewDataUrl: result.previewDataUrl,
        elementCount: count,
      });
    }, [getElementCount, exportPng, onSave, onClose, isAnnotationMode]);

    const hintText = isAnnotationMode
      ? "— tegn ændringer, pile og noter oven på visualiseringen"
      : "— tom canvas → ingen skitse sendes";

    const saveLabel = isAnnotationMode ? "Gem annotation →" : "Gem og fortsæt →";
    const closeLabel = isAnnotationMode ? "Annuller" : "Fortsæt uden skitse";

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex flex-col bg-zinc-950"
          >
            {/* Header */}
            <div className="shrink-0 h-12 flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-mono text-white">
                <PenLine className="w-4 h-4 text-primary" />
                <span>{resolvedTitle}</span>
                <span className="text-zinc-500 text-[11px]">{hintText}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white text-xs font-mono"
                  onClick={onClose}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  {closeLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="text-xs font-mono bg-primary hover:bg-primary/90"
                  onClick={handleSave}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>

            {/* Canvas-område */}
            <div
              ref={canvasContainerRef}
              className="flex-1 min-h-0 relative overflow-hidden"
            >
              {/* Annotation-mode: vis visualiserings-HTML i en baggrundsiframe */}
              {isAnnotationMode && (
                <iframe
                  ref={bgIframeRef}
                  title="Visualisering baggrund"
                  sandbox="allow-scripts allow-same-origin"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: "none",
                    pointerEvents: "none",
                    zIndex: 0,
                    overflow: "auto",
                  }}
                />
              )}

              {/* Scroll-knapper — bruges når wheel-events ikke kan nå igennem Excalidraw */}
              {isAnnotationMode && (
                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 25,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    pointerEvents: "all",
                  }}
                >
                  <button
                    type="button"
                    title="Scroll op"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); scrollBg(-250); }}
                    style={{
                      width: 32, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(24,24,27,0.85)", color: "#fff", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    title="Scroll ned"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); scrollBg(250); }}
                    style={{
                      width: 32, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(24,24,27,0.85)", color: "#fff", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}

              {/* Excalidraw canvas — transparent i annotation-mode, normal i sketch-mode */}
              {/* Wrapper-div er UDENFOR Suspense så ref sættes med det samme (MutationObserver kan lytte) */}
              <div
                ref={isAnnotationMode ? annotationWrapperRef : undefined}
                className={isAnnotationMode ? "annotation-excalidraw" : undefined}
                style={{ position: "absolute", inset: 0, zIndex: 1, background: "transparent" }}
              >
                <Suspense
                  fallback={
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                      <p className="text-zinc-500 text-sm font-mono">Indlæser canvas…</p>
                    </div>
                  }
                >
                  <Excalidraw
                    excalidrawAPI={handleApiReady}
                    theme={isAnnotationMode ? "light" : "dark"}
                    initialData={initialData}
                    UIOptions={{
                      canvasActions: {
                        saveAsImage: false,
                        loadScene: false,
                        export: false,
                        changeViewBackgroundColor: false,
                      },
                    }}
                  />
                </Suspense>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

SketchModal.displayName = "SketchModal";
