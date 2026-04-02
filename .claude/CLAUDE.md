# Supplerende instruktioner — Meeting AI Visualizer

## Streaming-mønster
Alle Claude API-kald bruger streaming. HTML-output genereres chunk-for-chunk
og sendes via Server-Sent Events til frontend. Undgå at buffere hele svaret.

## Fejlhåndtering
- AssemblyAI-fejl: Returnér brugervenlig dansk fejlbesked + retry-knap
- Claude API-fejl: Fallback til simpel tekst-visning af transcript
- Railway deploy: Brug health-check endpoint, respektér PORT env-variabel

## Kodestil
- TypeScript-strict hvor muligt
- ESM imports, async/await, aldrig callbacks
- Danske kommentarer i forretningslogik, engelske i teknisk kode

## Agents i dette projekt
- `frontend-designer` — til visualiserings-UI (anti-AI-slop æstetik)
- `security-reviewer` — før commits med API-kald
- `code-reviewer` — efter alle ændringer i core-logik
- `performance-reviewer` — ved SSE-streaming og database-queries
