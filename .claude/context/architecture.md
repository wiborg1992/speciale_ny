# Arkitektur — Meeting AI Visualizer

## Backend (packages/api-server)
- Express med TypeScript
- AssemblyAI SDK v3 — real-time dansk transskription
- Anthropic SDK — Claude API med streaming responses
- SSE (Server-Sent Events) til frontend-kommunikation
- Drizzle ORM — PostgreSQL (møde-database)

## Frontend (packages/meeting-visualizer)
- Vite dev-server + React
- Proxy: /api → api-server
- Modtager streaming HTML-chunks via SSE
- Renderer HTML direkte i DOM

## Shared Libraries (lib/)
- `api-spec/` — OpenAPI spec (orval-genereret)
- `api-client-react/` — Genereret React-klient
- `api-zod/` — Zod-validerede typer
- `db/` — Drizzle-schema og migrations

## Deploy
- Railway med monorepo-support, pnpm workspaces
- `.env`: ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, DATABASE_URL
- Health-check: GET /api/health

## Dataflow
1. Bruger uploader/streamer lyd → frontend
2. Frontend → /api/transcribe → api-server
3. api-server → AssemblyAI v3 (dansk transskription)
4. Transcript → Claude API (streaming, system-prompt for visualisering)
5. Claude API streamer HTML-chunks → SSE → frontend
6. Frontend renderer HTML direkte i DOM
7. Mødedata persisteres i PostgreSQL via Drizzle
