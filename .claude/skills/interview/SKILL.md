---
name: interview
description: Interview brugeren i dybden via AskUserQuestion for at bygge en præcis spec. Læser et spec-fil eller emne, stiller ikke-åbenlyse spørgsmål, og skriver den færdige spec til filen.
argument-hint: "[sti til SPEC.md eller emnebeskrivelse]"
disable-model-invocation: true
---

Du skal interviewe brugeren i dybden for at bygge en præcis og komplet specifikation.

**Input**: $ARGUMENTS

## Fase 1: Forberedelse

Hvis $ARGUMENTS er en filsti:

- Læs filen med Read-toolet
- Identificér hvad der allerede er defineret og hvad der mangler
- Forbered spørgsmål ud fra hullerne — ikke ud fra det åbenlyse

Hvis $ARGUMENTS er et emne/beskrivelse:

- Brug det som udgangspunkt
- Forbered spørgsmål der afklarer implicitte antagelser og skjulte tradeoffs

## Fase 2: Interview med AskUserQuestion

Brug AskUserQuestion-toolet gentagne gange. Regler:

**Spørgsmålskvalitet**:

- Stil IKKE åbenlyse spørgsmål ("hvad skal systemet gøre?")
- Stil spørgsmål om implicitte antagelser, edge cases, og tradeoffs
- Fokusér på beslutninger der er dyre at omgøre senere
- Max 4 spørgsmål per runde — men kør mange runder

**Spørgsmålstyper der er velkomne**:

- "Hvad sker der når X fejler?" (fejlhåndtering)
- "Hvis du vælger A nu, mister du B — er det bevidst?"
- "Hvem ejer denne beslutning — dig eller systemet?"
- "Har du set dette fungere et andet sted? Hvad fungerede ikke?"
- "Hvad er successkriteriet om 3 måneder?"
- Tekniske: arkitektur-tradeoffs, performance-grænser, skaleringsantagelser
- UX: hvem er brugeren, hvad ved de i forvejen, hvad tolererer de ikke

**Fortsæt indtil**:

- Alle kritiske beslutninger er afklaret
- Der er ingen åbne antagelser tilbage
- Du kan implementere uden at gætte

## Fase 3: Skriv spec

Når interviewet er komplet, skriv en struktureret spec til filen (eller `SPEC.md` hvis intet argument):

```markdown
# Spec: [titel]

## Kontekst

[Hvad og hvorfor]

## Krav

### Funktionelle

- ...

### Ikke-funktionelle

- ...

## Arkitektur-beslutninger

| Beslutning | Valg | Fravalgt | Begrundelse |
| ---------- | ---- | -------- | ----------- |
| ...        | ...  | ...      | ...         |

## Edge cases & fejlhåndtering

- ...

## Succeskriterie

- ...

## Åbne spørgsmål

- (kun hvis noget bevidst er udskudt)
```

Brug Write-toolet til at gemme filen.

## Vigtige regler

- Stil aldrig et spørgsmål du kan besvare selv ud fra konteksten
- Brug `multiSelect: true` når svaret kan have flere korrekte valg
- Brug `preview`-feltet til at vise kode-eksempler eller mockups når alternativerne er konkrete
- Afslut ALDRIG interviewet for tidligt — hellere én runde for meget end at gætte
- Kommunikér på dansk
