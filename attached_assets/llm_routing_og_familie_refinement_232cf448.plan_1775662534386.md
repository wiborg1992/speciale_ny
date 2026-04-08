---
name: LLM routing og familie/refinement
overview: Afklar kodestruktur (kort klassifikationsvindue, P5/refinement, gates); ret policy så live workshops uden domæne-triggers ikke låses forkert; tilføj semantisk lag (LLM routing og/eller løbende resumé) så emnet forstås, ikke kun nøgleord; valgfri orkestrator med skemavalidering.
todos:
  - id: diagnose-logs
    content: "Kortlæg i logs: refinementDirective vs classification.family/lead vs resolvedFamily og om topic-shift clear kører (reproducer med realistisk snippet)."
    status: pending
  - id: policy-p5-p6
    content: "Beslut ny præcedens: familie-skift med lead>=switch slår refinement-lås, eller kræv høj refinement-confidence; opdater resolveFamily + fictive tests."
    status: pending
  - id: gate-gap
    content: Udvid checkDisambiguationGate så refinement + family mismatch ikke falder i hullet mellem gates.
    status: pending
  - id: refinement-detector
    content: Stram detectRefinementIntent (mønstre, negation, dansk) for at reducere false positives.
    status: pending
  - id: llm-routing-optional
    content: "Hvis ønsket: design JSON routing-prompt + integration i visualize.ts med confidence fallback til keyword-klassifikator."
    status: pending
  - id: llm-orchestrator-optional
    content: "Hvis ønsket (tung): ét struktureret LLM-kald (eller tool-agent) der normaliserer viz-beslutning + parametre; Zod/JSON Schema-validering på server; repair-pass eller fallback ved parse-fejl; evt. kort output-check på HTML."
    status: pending
  - id: workshop-context-path
    content: "Efter A: prioriter B3/B1 for auto-viz i workshop (ved ambiguous, lav lead, eller refinement+konflikt); overvej B2 så meetingEssence ikke kun spejler keyword-klassifikatoren."
    status: pending
  - id: stability-sse
    content: "Verificér at ‘crash’ i felt er HTTP/SSE/ufærdig HTML (isHtmlQualityOk) vs. forkert familie — afslut fetch-branches og fejl-UI i useVisualizeStream/Room ved behov."
    status: pending
isProject: false
---

# Plan: Korrekt viz-familie vs. incremental, og dybere kontekst (LLM)

## Kodestruktur — hvad der *faktisk* begrænser “forståelse”

Dette er ikke “én bug”, men et **pipeline-design** der er optimeret til hastighed og determinisme — hvilket **straffer live workshop-sprog** (omskrivninger, meta-snak, ingen HMI/journey-triggers).

- **Klassifikations-input:** [`visualize.ts`](artifacts/api-server/src/routes/visualize.ts) — `CLASSIFY_TAIL_WORDS = 280` sendes som hoved-`transcript` til [`classifyVisualizationIntent`](artifacts/api-server/src/lib/classifier.ts). Emnet kan ligge uden for tailen; `lead` bliver lav selv om mødet “handler om” noget tidligere.
- **Zoner:** [`classifier.ts`](artifacts/api-server/src/lib/classifier.ts) — tail på tegn (~12k), men merging er **substring-vægtning** på `VIZ_FAMILY_SIGNALS`, ikke betydningsforståelse → uden signalord: `ambiguous` / `generic` / inertia.
- **Seneste tale:** `getRecentSegments(roomId, 30_000)` som `latestChunk` — godt til hvad der lige blev sagt, stadig keyword-baseret.
- **Refinement:** [`refinement-detector.ts`](artifacts/api-server/src/lib/refinement-detector.ts) — tilfældige regex-matches → **P5 låser `lastFamily`** i [`resolveFamily`](artifacts/api-server/src/routes/visualize.ts).
- **Møde-essens:** [`meeting-essence.ts`](artifacts/api-server/src/lib/meeting-essence.ts) — bullets fra sidste klassifikation → **feedback-loop** (forkert/tvetydigt spor kan forstærkes).
- **Regen-gate:** [`visualize.ts`](artifacts/api-server/src/routes/visualize.ts) — `MIN_NEW_WORDS_FOR_REGEN` (10) uden familie-skift → **skipped** ved pauser / lav ordvækst.

**Konklusion:** Så længe **routing = scorer + regex + inertia/P5**, vil “korrekte triggers” aldrig være nødvendige i teori — men i praksis **er** systemet trigger-afhængigt. For **emne-forståelse** skal der et **semantisk lag** (mindst B3/B1, stærkt understøttet af B2) *eller* meget bredere/brugerstyret input (fast viz-type, fokus-segment).

---

## Live workshop: “crash” vs. forkert adfærd

- **Teknisk fejl:** Express `next(err)` hvis headers ikke er sendt; ellers SSE `type: "error"` (fx Claude 503/529) eller `"Generated visualization was incomplete"` når [`isHtmlQualityOk`](artifacts/api-server/src/lib/visualizer.ts) fejler — se [`useVisualizeStream`](artifacts/meeting-visualizer/src/hooks/use-visualize-stream.ts).  
- **Oplevet “crash”:** Ofte **forkert incremental / forkert familie / skipped** uden at serveren dør — det kræver **routing- og policy-fixes + semantik**, ikke kun try/catch.

Todo `stability-sse` handler om at **bekræfte** hvilken kategori I ser i felt.

---

## Diagnose (hvorfor du ser adfærden)

To uafhængige mekanismer i [`artifacts/api-server/src/routes/visualize.ts`](artifacts/api-server/src/routes/visualize.ts) forklarer det meste:

### 1. P5 refinement-lås (`resolveFamily`)

I [`resolveFamily`](artifacts/api-server/src/routes/visualize.ts) (ca. linje 35–106): når **`refinementDetected`** er sand **og** der findes en **`lastFamily`**, returneres **altid** `lastFamily` — **medmindre** P2 `hardOverride` slår til. En “rigtig” ny familie fra keyword-klassifikatoren med høj `lead` **vinder ikke** over låsen.

Det matcher testene i [`run-fictive-route-tests.ts`](artifacts/api-server/src/scripts/run-fictive-route-tests.ts) (R6/R8: “Strategi A”).

### 2. `refinementDetected` kommer fra regex, ikke semantik

[`detectRefinementIntent`](artifacts/api-server/src/lib/refinement-detector.ts) matcher **faste mønstre** på de sidste ~N tegn af transskriptet. **False positives** (fx ord der ligner “focus on”, “forbedre”, danske varianter, eller tillægsord der trigger) giver `refinementDirective` → P5 → **forkert familie bevares**.

### 3. Topic-shift rydder ikke `previousHtml`, når refinement er sat

Samme fil (ca. 529–547): **`effectivePreviousHtml` nulstilles** ved familie-skift **kun når** `!refinementDirective`. Med et refinement-signal (også falsk) **bevares** gammel HTML → [`isIncremental`](artifacts/api-server/src/routes/visualize.ts) forbliver typisk sand sammen med incremental-branches i [`streamVisualization`](artifacts/api-server/src/lib/visualizer.ts).

### 4. Disambiguation-gaten dækker ikke alle “refinement + lav/midt lead”-huller

[`checkDisambiguationGate`](artifacts/api-server/src/routes/visualize.ts):

- `refinement_vs_topic_shift` kræver bl.a. `lead >= CLASSIFY_SWITCH_LEAD` (samme tærskel som P6).
- `uncertain_topic_shift` kræver udtrykkeligt **`!refinementDirective`**.

Derfor: **refinement-signal + familie konflikt + lead under switch** kan ende med **ingen dialog**, **P5-lås**, og **ingen topic-shift clear** — præcis “det blev incremental selv om familien burde skifte”.

### 5. “Reasoning” om familie er i praksis keyword-score + kort vindue

Klassifikation kører på et **fast sidste-ord-vindue** (**ca. 280 ord** fra route; se tabel ovenfor) af **normaliseret** tekst — ikke fuld semantisk læsning af hele mødet. Det er hurtigt og deterministisk, men **svagt** på nuancer, dansk tale, omskrivninger uden signalord og “hvad arbejder vi på **nu**”, hvis det ikke ligger i tailen.

---

```mermaid
flowchart TD
  subgraph input [Input]
    T[Transskript]
    R[Regex refinement]
    C[Keyword classify tail]
  end
  R --> P5{P5 refinement lock?}
  C --> P5
  last[lastFamily]
  P5 -->|ja| LF[resolved = lastFamily]
  P5 -->|nej| P6[P6/P7/P8 ...]
  LF --> TS{topic-shift clear}
  TS -->|refinement sat| keepPrev[Bevar previousHtml]
  TS -->|ingen refinement| clearPrev[Ryd previousHtml]
```

---

## Retning A — Hurtige, lav-risiko policy-rettelser (uden ekstra LLM)

**Mål:** Færre false positives og færre “låst forkert familie”.

1. **Når klassifikatoren er entydig ny familie med `lead >= CLASSIFY_SWITCH_LEAD` og `classification.family !== lastFamily`:** ignorér eller **nedprioritér** refinement-lås (eller kræv højere refinement-`confidence` end “medium”), så P6 kan vinde — **eller** altid kør topic-shift clear selv ved refinement når familie konflikter (strammere end i dag).
2. **Udvid `checkDisambiguationGate`:** Tillad `uncertain_topic_shift` (eller ny årsag) **også når** `refinementDirective` er sat, men familie og lead ligger i “grå zone” — så brugeren vælger fresh/refine i stedet for stille lås.
3. **Finjustér [`refinement-detector.ts`](artifacts/api-server/src/lib/refinement-detector.ts):** tilføj **negation**/kontekst (dansk), højere vægt-tærskel, eller “kun hvis sætning også indeholder opdaterings-verber i forhold til *diagram/viz*”.
4. **Øg observabilitet:** log struktureret `resolvedFamily`, `classification.family`, `lead`, `refinementDirective`, om topic-shift clear kørte — så I kan verificere i prod/logs.

*Opdater [`run-fictive-route-tests.ts`](artifacts/api-server/src/scripts/run-fictive-route-tests.ts) hvis I ændrer P5/P6-præcedens.*

---

## Retning B — “Dyb intelligens”: LLM som routing / kontekst (mellem omkostning og kvalitet)

**Mål:** Bedre forståelse af **helhed** og **aktivt arbejdsemne** uden at sende hele 50k tokens hver gang.

### B1. Billig routing-call (anbefalet først)

- **Én lille LLM** (eller samme model, lav `max_tokens`) med **struktureret output** JSON:  
  `{ vizFamily, confidence, isRefinement, refinementSummary?, currentFocus, reason }`  
  på grundlag af:
  - seneste X minutters transskript **+** kort **rule-based summary** (eller eksisterende [`meeting-essence`](artifacts/api-server/src/lib/meeting-essence.ts) payload fra [`roomToMeetingEssencePayload`](artifacts/api-server/src/lib/meeting-essence.ts)),
  - `lastFamily` + evt. ét afsnit om sidste viz-overskrift.
- **Policy:** LLM-routing **overskriver** eller **vægtes mod** keyword-`resolveFamily` kun når LLM `confidence` > tærskel, ellers fallback til nuværende (sikkerhedsnet).
- **Integration:** nyt skridt i [`visualize.ts`](artifacts/api-server/src/routes/visualize.ts) *før* `resolveFamily`, eller erstat del af logikken når `vizType === "auto"`.

### B2. Løbende “running summary” (tungere)

- Periodisk (fx hver N segmenter eller ved viz): opdater **kompakt bullet-summary** i DB/room-state via LLM; injicér i viz-prompt og i classifier-input.  
- **Fordele:** Bedre “helhed”; **ulemper:** ekstra kald, staleness, mer kompleks tilstand.

### B3. Kun ved gate / konflikt (billig hybrid)

- Kald LLM **kun** når: `refinementDirective && classification.family !== lastFamily`, eller keyword `ambiguous`, eller lav lead — for at afgøre `fresh vs refine` og målfamilie.

---

## Retning C — “Fuld” LLM der forstår mere og håndterer API-ind/ud (hvad der *kan* og *ikke kan*)

**Kort svar:** Ja, du kan lægge en **stærkere / større kontekst** ind (hele eller næsten hele mødet + sidste viz-meta), så modellen tager **én samlet beslutning** om fx familie, incremental vs fresh, og evt. visualiserings-parametre. Men **“sikrer korrekt API input og output”** i ingeniørforstand kræver **ikke** kun LLM — det kræver en **kontrakt uden for modellen**:

1. **Input til API/et:** Struktureret payload (JSON) som **parses og valideres** på serveren (fx Zod/JSON Schema der matcher jeres eksisterende route-body). Ugyldigt felt → afvis eller clamp, **ikke** send blindt videre til Claude viz-stream.
2. **Output fra viz-LLM:** Bevar nuværende sanitization/streaming — evt. **let post-check** (fx at der findes én komplet HTML-struktur, ingen tom body ved success), og **retry med kort fejlfeedback** ved parse/skeleton-fejl. En “fuld” forståelses-LLM **garanterer ikke** perfekt HTML; den **reducerer** logiske fejl i *beslutningen* før hovedkaldet.
3. **Hvor i pipeline:** Typisk **før** `resolveFamily` / `streamVisualization`: ét kald der returnerer `{ resolvedFamily, isIncremental, refinementEffective, rationale }` (eller rigere), som derefter **tvinger** resten af koden ned ad én gren — så keyword+regex kan blive ren fallback.

```mermaid
flowchart LR
  subgraph pre [Pre_flight]
    T[Transskript_plus_meta]
    O[Orchestrator_LLM]
    V[Schema_validate]
  end
  subgraph main [Eksisterende]
    R[resolveFamily_policy]
    S[streamVisualization]
  end
  T --> O
  O --> V
  V -->|OK| R
  V -->|fejl| F[Fallback_keyword_eller_retry]
  F --> R
  R --> S
```

**Realistiske ulemper:** højere **latency og omkostning** pr. viz hvis I altid kører C; risiko for **drift** (modellen ændrer mening mellem versioner) — derfor **versionér prompts** og hold **policy A** som jordslået fallback.

**Praktisk anbefaling:** Implementér **A (+ evt. B3)** først; tilføj **C** kun hvis I måler at routing stadig fejler efter bedre policies, *og* I accepterer prisen for ekstra kald.

---

## Afhængigheder og risici

- **Latency/omkostning:** Hver routing-call tilføjer 200ms–få sekunder + tokens; B3 minimerer det.
- **Konsistens:** Nye LLM-beslutninger skal **spejles** i meta-events til frontend (allerede `meta` med classification/refinement).
- **Test:** Udvid fictive tests for **ny** præcedens hvis I ændrer P5; tilføj golden tests for LLM-json med mock.

---

## Anbefalet rækkefølge

1. **Retning A** (policy + refinement-finurl + gate-hul) — stopper en stor klasse **stille forkerte** tilstande (P5 + huller), uden ny model.  
2. **Retning B3 → B1** — for **workshop/auto**: LLM først når keyword/regex er svag (**B3** billigst), derefter bredere routing (**B1**) hvis stadig utilstrækkeligt.  
3. **B2 (running summary)** — når essensen i [`meeting-essence.ts`](artifacts/api-server/src/lib/meeting-essence.ts) skal **afbryde keyword-loopen** og give modellen “hvad handler dagen om” uden at sige `journey` eller `SCADA`.  
4. **Valgfrit:** Øg `CLASSIFY_TAIL_WORDS` eller **erstat/berig** `classificationInput` med et kort LLM-resumé (samme effekt som del af B2, billigere end fuld C).  
5. **Retning C** — kun hvis I vil betale latency/tokens for **samlet orkestrering + hård skemavalidering**; stadig **ikke** erstatning for validering i kode.
