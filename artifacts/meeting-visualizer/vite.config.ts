import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** På Replit kommer PORT/BASE_PATH fra platformen; lokalt bruger vi fornuftige defaults. */
const isLocalDev = process.env.REPL_ID === undefined;

// Lokalt: brug aldrig process.env.PORT her — i monorepo-.env er PORT=3000 til Express.
// Ellers konkurrerer Vite med api-serveren, eller proxy rammer den forkerte proces → 500 på /api/*.
const rawPort = isLocalDev
  ? (process.env.VITE_DEV_SERVER_PORT ?? "5173")
  : process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? (isLocalDev ? "/" : undefined);

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

/** Lokalt: proxy af /api til Express (PORT i .env er typisk 3000). */
const apiDevTarget = `http://127.0.0.1:${process.env.API_PORT ?? process.env.VITE_API_PORT ?? "3000"}`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    ...(isLocalDev
      ? {
          proxy: {
            "/api": {
              target: apiDevTarget,
              changeOrigin: true,
              configure(proxy) {
                proxy.on("error", (err, _req, res) => {
                  console.error(
                    `[vite proxy] Ingen api-server på ${apiDevTarget}:`,
                    (err as Error).message,
                    "\n→ Start: cd artifacts/api-server && pnpm run build && node --enable-source-maps --env-file=../../.env ./dist/index.mjs",
                  );
                  const out = res as NodeJS.WritableStream & {
                    writeHead?: (
                      code: number,
                      headers: Record<string, string>,
                    ) => void;
                    end?: (chunk?: string) => void;
                  };
                  try {
                    if (out && typeof out.writeHead === "function") {
                      out.writeHead(502, {
                        "Content-Type": "application/json",
                      });
                      out.end?.(
                        JSON.stringify({
                          error: "api-server svarer ikke",
                          hint: `Forventer Express på ${apiDevTarget}.`,
                        }),
                      );
                    }
                  } catch {
                    /* ignore */
                  }
                });
              },
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
