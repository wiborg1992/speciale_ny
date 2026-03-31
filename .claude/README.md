# Claude Code-konfiguration (Speciale)

## Hvad er aktiveret i projektet

| Mappe / fil | Rolle |
|-------------|--------|
| **`settings.json`** | Tilladelser (**pnpm**-centreret) + **hooks** (Pre/Post/SessionStart) der kalder scripts under `hooks/`. |
| **`hooks/*.sh`** | Beskyttelse af `.env`/nøgler, blokering af farlige bash-kommandoer, format efter skriv, git-kontekst ved sessionstart (fra dotclaude). |
| **`skills/`** | dotclaude-skills (**tdd**, **ship**, **debug-fix**, …) + ECC-skills (**postgres-patterns**, **frontend-patterns**, **backend-patterns**, **verification-loop**, **coding-standards**, **security-review**, **database-migrations**). |
| **`agents/`** | Markdown-agents (code-reviewer, security-reviewer, …) til under-agenter i Claude Code. |
| **`rules/`** | Baseline fra specialev-rkt-j + supplement **`dotclaude-*.md`** (frontend, database, …) uden at overskrive eksisterende filer. |
| **`commands/`** | Slash-playbooks fra specialev-rkt-j. |

**Opsætning der kræver din maskine:** Læs **[WINDOWS.md](./WINDOWS.md)** (`bash` + `jq`).  
**Hvad der stadig er manuelt:** **[ACTIVATION.md](./ACTIVATION.md)** (claude-mem plugins, GSD, `settings.local.json`).

## Merge fra specialev-rkt-j

`rules/*.md` og `commands/*.md` uden `dotclaude-`-præfix kommer fra `specialev-rkt-j\.claude`.

## Eksterne referencer

Se **[EXTERNAL_REPOS.md](./EXTERNAL_REPOS.md)**. Reference-kloner i **`external/`** (gitignored):
`.\.claude\fetch-external.ps1`
