import "@excalidraw/excalidraw/index.css";
import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, PenLine, X } from "lucide-react";
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

    // Skriv HTML til baggrundsiframen hver gang backgroundHtml ændres
    useEffect(() => {
      const iframe = bgIframeRef.current;
      if (!iframe || !backgroundHtml) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(backgroundHtml);
      doc.close();
    }, [backgroundHtml]);

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
                  scrolling="no"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: "none",
                    pointerEvents: "none",
                    zIndex: 0,
                  }}
                />
              )}

              {/* Excalidraw canvas — transparent i annotation-mode, normal i sketch-mode */}
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
                    <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                    <p className="text-zinc-500 text-sm font-mono">Indlæser canvas…</p>
                  </div>
                }
              >
                <div
                  className={isAnnotationMode ? "annotation-excalidraw" : undefined}
                  style={{ position: "absolute", inset: 0, zIndex: 1, background: "transparent" }}
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
                </div>
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

SketchModal.displayName = "SketchModal";
