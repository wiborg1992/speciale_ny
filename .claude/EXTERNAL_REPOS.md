# Eksterne Claude-repos — relevans for **Speciale**

Speciale er et **pnpm-monorepo**: TypeScript 5.9, **Express 5** (`artifacts/api-server`), **React + Vite** (`artifacts/meeting-visualizer`), **PostgreSQL + Drizzle**, Orval/OpenAPI, SSE, mødevisualisering / Grundfos-kontekst.

Nedenfor: hvad der typisk giver mest værdi, og hvad du bør være varsom med.

---

## 1. `everything-claude-code` (affaan-m)

| Aspekt | Vurdering |
|--------|-----------|
| **Høj værdi** | `rules/common/*` (coding-style, security, testing, git), udvalgte **skills** (fx `frontend-patterns`, `backend-patterns`, `postgres-patterns`, `verification-loop`, `e2e-testing` hvis I tilføjer Playwright). |
| **Pas på** | Fuld plugin-installation + alt på én gang ⇒ overlap med jeres nuværende `rules/` og **token-forbrug**. Vælg et **kurateret** udtræk eller brug `ecc-universal` efter upstream-dokumentation. |
| **Aktivering** | Klon ligger under `external/everything-claude-code/`. Følg repoets README / “Shorthand Guide”: typisk symlinks, npm-plugin eller kopiering af udvalgte `skills/` til `~/.claude/skills` eller projektets `.claude/skills`. |

---

## 2. `dotclaude` (poshan0126)

| Aspekt | Vurdering |
|--------|-----------|
| **Høj værdi** | **Lean** dagligdags-setup: `skills/` (tdd, debug-fix, ship), `rules/` (frontend, database, security), **agents/**. Passer godt til jeres stack (React + DB). |
| **Pas på** | **settings.json** og **hooks/*.sh** — merge manuelt; shell-hooks på Windows kræver Git Bash/WSL eller omskrivning. Undgå at overskrive hele `.claude` uden backup. |
| **Aktivering** | Sammenlign fil for fil med `external/dotclaude/` — kopér f.eks. `skills/ship`, `rules/database.md`, og tilpas til Drizzle/Postgres-terminologi. Kør `/setupdotclaude` i Claude Code efter import (jf. dotclaude README). |

---

## 3. `get-shit-done` (gsd-build)

| Aspekt | Vurdering |
|--------|-----------|
| **Høj værdi** | **Spec-drevet arbejde**, kontekst-engineering, mindsker “context rot” i lange sessioner — nyttigt når I både rører **api-server**, **meeting-visualizer** og **lib/db**. |
| **Pas på** | Det er et **særskilt workflow** (CLI / `npx get-shit-done-cc`); supplerer ikke nødvendigvis 1:1 jeres eksisterende `commands/plan.md`. Brug det som **ramme for store features**, ikke obligatorisk for hver lille fix. |
| **Aktivering** | Se `external/get-shit-done/README.md` og `docs/USER-GUIDE.md`. Installer/kør efter behov; ingen krav om at kopiere filer ind i `.claude/`. |

---

## 4. `claude-mem` (thedotmack)

| Aspekt | Vurdering |
|--------|-----------|
| **Høj værdi** | **Persistens på tværs af sessioner** — stærkt når du skifter fra Replit til lokal udvikling og arbejder på Speciale over uger. |
| **Pas på** | Separat **service** (Node), **AGPL-licens**, opbevaring af uddrag af samtaler — vurder **privatliv / NDA / Grundfos-data**. Kør helst lokalt. |
| **Aktivering** | Følg `external/claude-mem/README.md`: installation, MCP/hooks integration til Claude Code. Ikke bundet til monorepoets build. |

---

## Anbefalet rækkefølge for dig

1. Brug det **allerede mergede** `rules/` + `commands/` som baseline i Claude Code.
2. Tilføj **kurateret** indhold fra **dotclaude** (skills + regler der mangler).
3. Udvid med **everything-claude-code** efter behov (ét område ad gangen — fx kun Postgres + frontend).
4. **claude-mem** når du vil have lang hukommelse; læs install-guide først.
5. **get-shit-done** når du starter et større, velafgrænset leveranceforløb.

---

## URLs

- https://github.com/affaan-m/everything-claude-code  
- https://github.com/poshan0126/dotclaude  
- https://github.com/gsd-build/get-shit-done  
- https://github.com/thedotmack/claude-mem  
