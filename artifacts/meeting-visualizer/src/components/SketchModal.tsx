import "@excalidraw/excalidraw/index.css";
import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.85;
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
  /** Screenshot af den aktuelle visualisering — vises som låst baggrundsbillede i Excalidraw */
  backgroundImageDataUrl?: string | null;
  /** Annotation-mode: ændr knaptekster og hints */
  isAnnotationMode?: boolean;
}

function useImageDimensions(dataUrl: string | null | undefined) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!dataUrl) { setDims(null); return; }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  }, [dataUrl]);
  return dims;
}

export const SketchModal = forwardRef<SketchModalHandle, SketchModalProps>(
  ({ open, onClose, onSave, initialSceneJson, title, backgroundImageDataUrl, isAnnotationMode = false }, ref) => {
    const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);
    const bgDims = useImageDimensions(backgroundImageDataUrl);

    const resolvedTitle = title ?? (isAnnotationMode
      ? "Tegn annotationer oven på visualiseringen"
      : "Tegn en skitse til din session"
    );

    const initialData = (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const files: Record<string, any> = {};

      // Baggrundsbillede (screenshottet viz) — låst, ikke-redigerbart
      if (backgroundImageDataUrl && bgDims) {
        const fileId = "viz-background";
        files[fileId] = {
          mimeType: backgroundImageDataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
          id: fileId,
          dataURL: backgroundImageDataUrl,
          created: Date.now(),
          lastRetrieved: Date.now(),
        };
        elements.push({
          type: "image",
          id: "viz-background-el",
          fileId,
          x: 0,
          y: 0,
          width: bgDims.w,
          height: bgDims.h,
          angle: 0,
          isDeleted: false,
          locked: true,
          opacity: 100,
          seed: 999999,
          version: 1,
          versionNonce: 1,
          boundElements: null,
          link: null,
          updated: Date.now(),
          groupIds: [],
          frameId: null,
          customData: null,
          status: "saved",
          scale: [1, 1],
        });
      }

      // Brugerens tidligere tegnede elementer (genindlæs scene)
      if (initialSceneJson && !backgroundImageDataUrl) {
        try {
          const parsed = JSON.parse(initialSceneJson) as { elements?: unknown[] };
          if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
            elements.push(...parsed.elements);
          }
        } catch {
          // ignore
        }
      }

      if (elements.length === 0 && Object.keys(files).length === 0) return undefined;

      return {
        elements,
        files,
        appState: backgroundImageDataUrl
          ? { viewBackgroundColor: "#0d1421" }
          : undefined,
      };
    })();

    const getElementCount = useCallback(() => {
      const api = excalidrawApiRef.current;
      if (!api) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return api.getSceneElements().filter((el: any) => !el.isDeleted && el.id !== "viz-background-el").length;
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
    }, []);

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

            {/* Canvas */}
            <div className="flex-1 min-h-0 relative" style={{ height: "calc(100vh - 48px)" }}>
              {backgroundImageDataUrl && !bgDims && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  <span className="ml-2 text-zinc-500 text-sm font-mono">Indlæser baggrundsbillede…</span>
                </div>
              )}
              {(!backgroundImageDataUrl || bgDims) && (
                <Suspense
                  fallback={
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                      <p className="text-zinc-500 text-sm font-mono">Indlæser canvas…</p>
                    </div>
                  }
                >
                  <div style={{ width: "100%", height: "100%" }}>
                    <Excalidraw
                      excalidrawAPI={handleApiReady}
                      theme="dark"
                      initialData={initialData}
                      UIOptions={{
                        canvasActions: {
                          saveAsImage: false,
                          loadScene: false,
                          export: false,
                        },
                      }}
                    />
                  </div>
                </Suspense>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

SketchModal.displayName = "SketchModal";
