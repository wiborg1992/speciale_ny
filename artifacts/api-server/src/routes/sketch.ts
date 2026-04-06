import { Router, type IRouter } from "express";
import { z } from "zod";
import { saveSketch, getOrCreateMeeting } from "../lib/meeting-store.js";

const router: IRouter = Router();

const PutSketchBodySchema = z.object({
  sceneJson: z.string().min(2),
  previewPngBase64: z.string().min(10),
});

/** PUT /meetings/:roomId/sketch
 * Gemmer Excalidraw scene-JSON + PNG-preview i DB.
 * Returnerer { sketchId } som klienten sender med POST /visualize.
 */
router.put("/meetings/:roomId/sketch", async (req, res): Promise<void> => {
  const { roomId } = req.params;

  const parsed = PutSketchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sceneJson, previewPngBase64 } = parsed.data;

  const MAX_PNG_CHARS = 3_000_000;
  if (previewPngBase64.length > MAX_PNG_CHARS) {
    res.status(413).json({ error: "Skitse PNG er for stor (max ~2 MB base64)." });
    return;
  }

  // Opret room i DB hvis den ikke eksisterer endnu (sketch kan uploades før første segment)
  await getOrCreateMeeting(roomId);

  const sketchId = await saveSketch(roomId, sceneJson, previewPngBase64);
  if (!sketchId) {
    res.status(503).json({ error: "Kunne ikke gemme skitse — DB utilgængelig." });
    return;
  }

  console.log(`[sketch] saved sketchId=${sketchId} for room=${roomId} (${previewPngBase64.length} base64 chars)`);
  res.json({ sketchId });
});

export default router;
