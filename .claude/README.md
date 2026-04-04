# Claude Code-konfiguration (Speciale)

## Navigationsprincip (mindre støj, samme dækning)

**Kernen** er altid defineret i rod-`CLAUDE.md` + `@.claude/context/architecture.md` + `@.claude/context/domain-terms.md`.  
Alt andet i `.claude/rules/` er **on-demand**: hent med `@sti` når opgaven matcher, i stedet for at forvente at alt er indlæst på én gang.

### Tier A — projekt (hent ofte ved vis/visualisering/streaming)

| Fil | Brug når |
|-----|----------|
| `rules/danish.md` | Dansk UI og fejltekster |
| `rules/streaming.md` | SSE, chunks, streaming-adfærd |
| `rules/visual-output.md` | Krav til HTML-visualiseringer |
| `rules/visual-consistency.md` | Samme udtryk på tværs af viz |
| `rules/anti-slop.md` | Undgå generisk “AI”-UI |

### Tier B — engineering (hent efter behov)

| Fil / område | Brug når |
|--------------|----------|
| `rules/testing.md`, `dotclaude-testing.md` | Teststrategi, CI |
| `rules/security.md`, `dotclaude-security.md` | Auth, input, hemmeligheder |
| `rules/performance.md` | Bottlenecks, SSE, DB |
| `rules/dotclaude-database.md`, `dotclaude-frontend.md`, … | DB-, UI- eller migrations-fokus |
| `rules/git-workflow.md`, `development-workflow.md` | Git/PR-rytme |

### Tier C — orkestrering

| Fil | Brug når |
|-----|----------|
| `rules/agents.md` | Hvilke **globale** agenter (planner, tdd-guide, …) der findes |
| `commands/*.md` | Slash-playbooks (`/plan`, `/verify`, …) |

---

## Hvilken skill? (kort matrix)

| Situation | Start her |
|-----------|-----------|
| HTML-viz fra mødetekst / prompts til Claude-output | **`/visual-generator`** (skill) |
| Railway / env / build før deploy | **`/deploy-check`** |
| Uklar root cause — undersøg før fix | **`/systematic-debug`** |
| Konkret fejl, stack trace, issues | **`/debug-fix`** |
| Hurtig produktionsrettelse med minimal risiko | **`/hotfix`** |
| Ny adfærd — tests først | **`/tdd`** |
| Brede tests efter feature | **`/test-writer`** (eller eksplicit efter behov) |
| Sikker refaktor med tests | **`/refactor`** |
| Forstå én fil/komponent | **`/explain`** |
| Leverance: commit/PR (med bekræftelser) | **`/ship`** |
| Gennemgå ændringer/agenter | **`/pr-review`** |
| Dotclaude sync til stack | **`/setupdotclaude`** |

**Backend-/mønster-dybde** (sjældnere som slash, typisk auto eller eksplicit): `backend-patterns`, `frontend-patterns`, `postgres-patterns`, `coding-standards`, `database-migrations`, `security-review`, `verification-loop`.

Se også [`skills/README.md`](./skills/README.md) for dok om skill-format.

---

## Agenter: lokalt i repo vs globalt

| Område | Hvor | Eksempler |
|--------|------|-----------|
| **Projekt-agenter** (Markdown i dette repo) | `.claude/agents/*.md` | `@frontend-designer`, `@code-reviewer`, `@security-reviewer`, `@performance-reviewer`, `@doc-reviewer` |
| **Globale / standard-agenter** | `~/.claude/agents/` og evt. plugins | Se `rules/agents.md` (planner, tdd-guide, build-error-resolver, …) |

Invoke projekt-agenter med **`@navn`** når du vil have isoleret review/UX uden at blande med hovedchat-historik.

---

## Hvad er aktiveret i projektet

| Mappe / fil | Rolle |
|-------------|--------|
| **`settings.json`** | Tilladelser (**pnpm**-centreret) + **hooks** (Pre/Post/SessionStart) der kalder scripts under `hooks/`. |
| **`hooks/*.sh`** | Beskyttelse af `.env`/nøgler, blokering af farlige bash-kommandoer, format efter skriv, git-kontekst ved sessionstart (fra dotclaude). |
| **`skills/`** | Dotclaude-skills (**tdd**, **ship**, **debug-fix**, …) + ECC-skills + speciale (**visual-generator**, **deploy-check**, **systematic-debug**). |
| **`agents/`** | Markdown-agents til under-agenter i Claude Code. |
| **`rules/`** | Baseline fra specialev-rkt-j + supplement **`dotclaude-*.md`**. Brug tier-modellen ovenfor. |
| **`commands/`** | Slash-playbooks fra specialev-rkt-j. |

**Opsætning der kræver din maskine:** Læs **[WINDOWS.md](./WINDOWS.md)** (`bash` + `jq`).  
**Hvad der stadig er manuelt:** **[ACTIVATION.md](./ACTIVATION.md)** (claude-mem plugins, GSD, `settings.local.json`).

---

## Merge fra specialev-rkt-j

`rules/*.md` og `commands/*.md` uden `dotclaude-`-præfix kommer fra `specialev-rkt-j\.claude`.

## Eksterne referencer

Se **[EXTERNAL_REPOS.md](./EXTERNAL_REPOS.md)**. Reference-kloner i **`external/`** (gitignored):
`.\.claude\fetch-external.ps1`
