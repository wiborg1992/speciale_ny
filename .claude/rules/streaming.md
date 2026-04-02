---
paths:
  - "packages/api-server/src/**"
---

# Streaming — API-server regler

Claude API-kald skal bruge streaming:
- Brug `stream: true` i Anthropic SDK
- Send chunks via SSE til frontend
- Håndtér stream-afbrydelser gracefully
- Log token-forbrug per request
- Implementér timeout (max 60s per visualisering)
- Brug condition-based waiting — ALDRIG sleep() eller faste timeouts
- Implementér eksplicit fejlhåndtering ved SSE-reconnection
