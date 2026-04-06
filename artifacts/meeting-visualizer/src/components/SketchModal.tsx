import { forwardRef, lazy, Suspense, useCallback, useImperativeHandle, useRef } from "react";
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
  onSave: (result: { pngBase64: string; previewDataUrl: string; elementCount: number }) => void;
  title?: string;
}

export const SketchModal = forwardRef<SketchModalHandle, SketchModalProps>(
  ({ open, onClose, onSave, title = "Tegn en skitse til din session" }, ref) => {
    const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);

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
      const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);
      if (elements.length === 0) return null;

      const sceneJson = JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements,
        appState: api.getAppState(),
      });

      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements,
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
      if (count === 0) {
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
        previewDataUrl: result.previewDataUrl,
        elementCount: count,
      });
    }, [getElementCount, exportPng, onSave, onClose]);

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
                <span>{title}</span>
                <span className="text-zinc-500 text-[11px]">— tom canvas → ingen skitse sendes</span>
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
                  Fortsæt uden skitse
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="text-xs font-mono bg-primary hover:bg-primary/90"
                  onClick={handleSave}
                >
                  Gem og fortsæt →
                </Button>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 min-h-0 relative">
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
                  theme="dark"
                  UIOptions={{
                    canvasActions: {
                      saveAsImage: false,
                      loadScene: false,
                      export: false,
                    },
                  }}
                />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

SketchModal.displayName = "SketchModal";
