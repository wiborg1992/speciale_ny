# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── meeting-visualizer/ # React + Vite frontend (Meeting AI Visualizer)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Meeting AI Visualizer

The main product artifact. A live meeting tool for industrial/engineering contexts.

### Features
- **Speech-to-text**: Web Speech API (da-DK / en-US, 2500ms commit buffer), optional Deepgram WebSocket
- **AI Visualization**: Claude (Anthropic) generates HTML+CSS visualizations from transcript
  - Types: Auto-detect, HMI/SCADA, User Journey, Workflow, Product/Hardware, Requirements, Management, Kanban, Decision Log, Timeline, Comparison Cards, Stakeholder Map
  - Models: Haiku (fast), Sonnet (balanced), Opus (best quality)
  - Streamed via SSE, rendered safely in `<iframe>` (never innerHTML)
  - Incremental updates (builds on previous) or fresh start
  - Code fence stripping (model sometimes emits ```html wrappers)
  - HMI host-tab interactivity injected via script into iframe
  - Lazy tab panels filled by separate Haiku call after first paint
- **Paste text mode**: paste Teams/Zoom transcripts as an alternative to mic recording
- **Decisions/Actions tab**: separate Claude Haiku call extracts decisions and action items
- **Version history**: in-session v1/v2/v3 pills for revisiting prior visualizations
- **Meeting context**: title, purpose, projects, participants, extra context passed to AI
- **Multi-user rooms**: 6-char room codes, SSE broadcast of segments + visualizations + participants
- **45-second auto-viz countdown**: timer resets on each generate (mic or manual)
- **Normalization**: fillword removal (da/en), Danish tech-term normalization (IEC 62443, ISO 27001, GDPR, SCADA, PLC, HMI, IE1–IE5, Grundfos products, m³/h)

### Key backend files
- `artifacts/api-server/src/lib/normalizer.ts` — transcript normalization + classification
- `artifacts/api-server/src/lib/visualizer.ts` — Anthropic streaming, fill-tab-panels, actions extraction
- `artifacts/api-server/src/lib/rooms.ts` — SSE room management (in-memory, ephemeral)
- `artifacts/api-server/src/routes/visualize.ts` — POST /api/visualize (rate-limited SSE stream), POST /api/viz/fill-tab-panels, POST /api/actions
- `artifacts/api-server/src/routes/sse.ts` — GET /api/sse?room=CODE
- `artifacts/api-server/src/routes/segment.ts` — POST /api/segment
- `artifacts/api-server/src/routes/deepgram.ts` — GET /api/deepgram-token

### Key frontend files
- `artifacts/meeting-visualizer/src/pages/Home.tsx` — Room create/join landing
- `artifacts/meeting-visualizer/src/pages/Room.tsx` — Main meeting view (mic/paste tabs + viz/decisions tabs + config row)
- `artifacts/meeting-visualizer/src/components/IframeRenderer.tsx` — Safe AI HTML renderer with host-tab injection and fill-tab-panels API call
- `artifacts/meeting-visualizer/src/hooks/use-speech.ts` — Web Speech API hook (da-DK default, 2500ms buffer)
- `artifacts/meeting-visualizer/src/hooks/use-room-sse.ts` — SSE room sync
- `artifacts/meeting-visualizer/src/hooks/use-visualize-stream.ts` — SSE visualization stream

### Environment variables required
- `ANTHROPIC_API_KEY` — Required for AI visualization
- `DEEPGRAM_API_KEY` — Optional, for Deepgram STT
- `ALLOW_DEEPGRAM_KEY_TO_BROWSER` — Set to `false` to disable Deepgram in browser (default: allowed)
- `PORT` — Set by Replit automatically

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `artifacts/meeting-visualizer` (`@workspace/meeting-visualizer`)

React + Vite frontend. Dark industrial design with split transcript/visualization panels.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
