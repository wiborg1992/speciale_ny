import type { SessionEvalReport } from "@/lib/session-eval-report";

/**
 * Valgfri POST af hele rapporten til din egen endpoint (n8n, Zapier, Slack-incoming,
 * lille Cloud Function, osv.). Sæt VITE_SESSION_EVAL_WEBHOOK_URL i .env — ellers sker intet.
 * Cursor/Claude modtager ikke automatisk; du skal selv videresende fra webhook-målet.
 */
export async function tryPostSessionEvalWebhook(
  report: SessionEvalReport,
): Promise<{ attempted: boolean; ok: boolean; message?: string }> {
  const url = import.meta.env.VITE_SESSION_EVAL_WEBHOOK_URL?.trim();
  if (!url) {
    return { attempted: false, ok: true };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        message: `HTTP ${res.status}`,
      };
    }
    return { attempted: true, ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "fetch failed";
    return { attempted: true, ok: false, message };
  }
}

export function sessionEvalWebhookConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SESSION_EVAL_WEBHOOK_URL?.trim());
}
