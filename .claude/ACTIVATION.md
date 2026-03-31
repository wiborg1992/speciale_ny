# Aktivering af Claude Code-opsætningen (Speciale)

## Automatisk ved hver session

| Element | Hvornår | Forudsætning |
|--------|---------|--------------|
| **`settings.json`** — tilladelser + hooks | Projektrod = `Speciale`, ny Claude Code-session | Se [WINDOWS.md](./WINDOWS.md) for `bash` + `jq` |
| **`rules/*.md`** | Altid som projektkontekst | Ingen |
| **`commands/*.md`** | Slash-kommandoer (`/plan`, `/verify`, …) | Ingen |
| **`skills/*/SKILL.md`** | Claude kan indlæse skill når relevant | Skills opdaget fra `.claude/skills` (standard Claude Code) |
| **Hooks** | `PreToolUse` / `PostToolUse` / `SessionStart` som konfigureret | `bash` finder hook-scripts; se WINDOWS.md |

## Manuelt (én gang pr. maskine / Claude Code)

### Claude-Mem (hukommelse på tværs af sessioner)

Kan **ikke** fuldt aktiveres fra filer i repoet alene. Følg upstream:

1. I Claude Code:  
   `/plugin marketplace add thedotmack/claude-mem`  
   `/plugin install claude-mem`
2. Genstart Claude Code.

Reference: `external/claude-mem/README.md` (Quick Start).

### Get Shit Done (spec-drevet workflow)

Valgfrit meta-workflow — installer når du vil bruge det:

```bash
npx get-shit-done-cc@latest
```

Det erstatter ikke projektets `commands/`; bruges til større leverancer. Se `external/get-shit-done/README.md`.

### Lokale overrides

Kopiér `settings.local.json.example` til `settings.local.json` (hvis du opretter den) og tilføj tilladelser — **commit ikke** secrets. Tilføj `settings.local.json` til root `.gitignore` hvis filen kan indeholde maskinspecifikke stier.

## Efter `git clone` uden `external/`

Kør fra repo-roden:

```powershell
.\.claude\fetch-external.ps1
```

Så har du igen reference-kopier af upstream-repos (valgfrit for dig; skills/hooks/agents i `.claude` er allerede selvstændige kopier).
