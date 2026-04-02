---
name: deploy-check
description: Validér Railway-deploy-readiness. Tjek env-variabler, build, health-check og dependencies.
when_to_use: Før deploy eller når brugeren nævner Railway, deploy, production eller staging.
allowed-tools:
  - Bash
  - Read
---

# Deploy Check — Railway Readiness

Validér trin for trin:
1. `.env.example` indeholder ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, DATABASE_URL, PORT
2. Kør: `pnpm --filter @workspace/api-server run build`
3. Health-check: GET /api/health → `{ status: "ok" }`
4. PORT læses fra `process.env.PORT`
5. `node_modules` er ikke i git
6. `pnpm-lock.yaml` er opdateret og committed
7. start-script bruger `dist/` ikke ts-filer direkte

Rapportér resultater som tjekliste på dansk med ✅/❌ per punkt.
