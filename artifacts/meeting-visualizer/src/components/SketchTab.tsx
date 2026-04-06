import { forwardRef, lazy, Suspense, useCallback, useImperativeHandle, useRef } from "react";
import { Loader2 } from "lucide-react";

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.82;
const JPEG_SIZE_THRESHOLD = 1_000_000;

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
);

export interface SketchTabHandle {
  getElementCount: () => number;
  exportPng: () => Promise<{ pngBase64: string; sceneJson: string; width: number; height: number } | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any;

export const SketchTab = forwardRef<SketchTabHandle>((_, ref) => {
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

    let format: "image/png" | "image/jpeg" = "image/png";
    let pngBase64 = canvas.toDataURL("image/png").split(",")[1];

    if (pngBase64.length > JPEG_SIZE_THRESHOLD) {
      const jpegBase64 = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
      if (jpegBase64.length < pngBase64.length) {
        format = "image/jpeg";
        pngBase64 = jpegBase64;
      }
    }

    console.log(`[sketch] Exported ${format} ${outW}x${outH}, ${pngBase64.length} base64 chars`);
    return { pngBase64, sceneJson, width: outW, height: outH };
  }, []);

  useImperativeHandle(ref, () => ({ getElementCount, exportPng }), [getElementCount, exportPng]);

  const handleApiReady = useCallback(
    (api: ExcalidrawAPI) => {
      excalidrawApiRef.current = api;
    },
    [],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-3 py-1.5 border-b border-border bg-card/20 text-[10px] font-mono text-muted-foreground uppercase tracking-wider leading-snug">
        Tegn din ønskede layoutstruktur — skitsen følger med til visualisering
      </div>
      <div className="flex-1 min-h-0 relative">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
              },
            }}
          />
        </Suspense>
      </div>
      <div className="shrink-0 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground leading-snug">
        Skitsen bruges som layout-guide for AI'en. Tom canvas → ingen skitse sendes.
      </div>
    </div>
  );
});

SketchTab.displayName = "SketchTab";
