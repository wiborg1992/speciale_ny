---
name: visual-generator
description: Generér HTML-visualiseringer af mødedata fra transskriptioner. Aktivér ved al arbejde med visualiseringer og HTML-output.
when_to_use: Når brugeren beder om at generere, forbedre eller debugge HTML-visualiseringer af møde- eller transskriptionsdata.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# Visual Generator

Du genererer HTML-visualiseringer af mødedata.

## Før du skriver kode — definér disse 5 parametre:
1. **Spacing**: Base unit (anbefaling: 8px) og skala
2. **Farvepalette**: Roller — primær, sekundær, accent, baggrund, tekst, farver per taler
3. **Typografi**: Font-stack, størrelses-skala (h1→caption)
4. **Afrunding**: En konsistent border-radius (4px subtil, 12px blød)
5. **Skygger**: Elevation-niveauer eller flat design

Vælg æstetisk retning:
- **Datatung**: ren, editorial, høj informationsdensitet
- **Præsentabel**: poleret, card-baseret, generøs whitespace
- **Minimal**: kun tekst og farve, ingen dekoration

## Output-format
- Komplet, selvstændig HTML med inline `<style>`
- Dansk UI-tekst, responsivt layout, fallback ved manglende data

## Anti-slop tjekliste
- [ ] Ingen lilla/blå gradient som default baggrund
- [ ] Ikke alt er centreret
- [ ] Farverne koder information, ikke bare dekoration
- [ ] Skrifttypen er ikke Inter/Arial/system-ui alene

## Visualiseringstyper
1. **Tidslinje**: Kronologisk flow med taler-farvekodning
2. **Opsummering**: Nøglepunkter, beslutninger, action items
3. **Deltager-oversigt**: Hvem sagde hvad, taletid-fordeling
4. **Tema-kort**: Emner grupperet visuelt
5. **Beslutnings-log**: Kun beslutninger og action items
