    # Meeting AI Visualizer — Speciale (Jakob, AAU Cand.IT 10. semester)

## Projekt
Real-time mødetransskription → AI-genererede HTML-visualiseringer.
Stack: Node.js + Express, AssemblyAI v3 (dansk transskription), Claude API (streaming), Railway deploy.
Monorepo: pnpm workspaces (`packages/api-server`, `packages/meeting-visualizer`).

**Specialet handler om vibe-coding som design research-metode (Research through Design).**

## Regler
1. Output er ALTID renderbar kode — aldrig beskrivelser af hvad du ville gøre
2. Kommunikér på dansk
3. HTML-visualiseringer skal kunne renderes direkte i en browser
4. Brug try/catch og fallback-UI i alle visuelle komponenter
5. Commit aldrig automatisk
6. Kør relevante tests efter ændringer
7. Påstå aldrig at noget virker uden at have verificeret det
8. Brug condition-based waiting — aldrig faste timeouts eller sleep()

## Arkitektur
@.claude/context/architecture.md

## Domæne-termer
@.claude/context/domain-terms.md

## Claude Code-konfiguration
Se `.claude/README.md` for komplet oversigt over hooks, skills, agents og commands.
Se `.claude/ACTIVATION.md` for manuel opsætning (plugins, lokale overrides).
Se `.claude/WINDOWS.md` for Windows-specifikke krav (bash + jq til hooks).

## Build & tjek
```
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```
