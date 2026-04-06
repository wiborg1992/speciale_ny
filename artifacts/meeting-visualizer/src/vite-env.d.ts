/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Valgfri POST-URL ved session-eval eksport (byg-tid env). */
  readonly VITE_SESSION_EVAL_WEBHOOK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
