import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * GET /api/openai-realtime-token
 *
 * Returns an ephemeral client_secret for the OpenAI Realtime API (gpt-4o-realtime-preview).
 * The Replit AI Integration proxy doesn't support the /realtime/sessions endpoint,
 * so we call api.openai.com directly using the integration's API key.
 * Falls back to a user-supplied OPENAI_API_KEY if the integration key is absent.
 */
router.get("/openai-realtime-token", async (_req, res): Promise<void> => {
  // Prefer an explicit OPENAI_API_KEY; fall back to the AI Integration key.
  // The Replit AI Integration proxy doesn't support /realtime/sessions, so both
  // paths call api.openai.com directly — a real OpenAI API key is required.
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!apiKey) {
    res.status(503).json({
      error:
        "No OpenAI API key configured. Add OPENAI_API_KEY to Replit Secrets.",
    });
    return;
  }

  const realtimeModel =
    process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: realtimeModel }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("[openai-realtime] Sessions API error:", r.status, text);
      res
        .status(r.status)
        .json({ error: `OpenAI Realtime error (${r.status}): ${text}` });
      return;
    }

    const data = (await r.json()) as {
      client_secret?: { value?: string; expires_at?: number } | string;
      expires_at?: number;
    };

    const secret =
      typeof data.client_secret === "object"
        ? data.client_secret?.value
        : (data.client_secret as string | undefined);
    const expiresAt =
      typeof data.client_secret === "object"
        ? data.client_secret?.expires_at
        : data.expires_at;

    if (!secret) {
      res
        .status(502)
        .json({ error: "OpenAI did not return a client_secret." });
      return;
    }

    res.json({ clientSecret: secret, expiresAt, model: realtimeModel });
  } catch (err: any) {
    console.error("[openai-realtime] Token fetch error:", err);
    res.status(500).json({
      error: err?.message ?? "Failed to fetch OpenAI Realtime session token",
    });
  }
});

export default router;
