import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/deepgram-token", (_req, res): void => {
  const allowBrowser = process.env.ALLOW_DEEPGRAM_KEY_TO_BROWSER !== "false";
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!allowBrowser || !apiKey) {
    res.status(403).json({ error: "Deepgram token delivery is disabled." });
    return;
  }

  res.json({ key: apiKey });
});

export default router;
