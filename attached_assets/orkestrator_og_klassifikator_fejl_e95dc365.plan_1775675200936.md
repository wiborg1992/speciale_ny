---
name: Orkestrator og klassifikator fejl
overview: "Implementationsplan v3: v2 + Cursor-skærpelser — struktur-guard (inkompatible familiepar), post-validering af refinementNote med fallback, præcis alignment fail-regel, REFINE CONSTRAINT i orchestrator-prompt, AUTO_FRESH erstattes på orchestrator-stien af guard + log."
todos:
  - id: fase-0-precedence-env
    content: "Fase 0: P0–P3 præcedence; VIZ_ROUTING_POLICY orchestrator_first; .env.example ORCHESTRATOR_VIZ=1; CI ORCHESTRATOR_VIZ=0 + mock; hint MOBILE CONTEXT som tekst-label (ingen tal-cap)."
    status: pending
  - id: fase-1-prompt-guard-schema
    content: "Fase 1: GRUNDFOS DISAMBIGUATION + REFINE CONSTRAINT (aldrig refine ved inkompatibelt skift — fresh); optional forbiddenFamilies; ORCHESTRATOR_HIGH_CONFIDENCE_THRESHOLD (default 0.72, sæt 0.80 til eksperiment + rollback); verificér model-ID."
    status: pending
  - id: fase-2-refine-parse-inject
    content: "Fase 2a+2c+2d: parseRefinementNote; refinementNoteValid false → beregn effectiveConfidence = decision.confidence - 0.1 lokalt i route (ingen mutation af OrchestratorDecision); brug i viz-decision-trace + alignment context; injection i streamVisualization; orchestrator-path routing."
    status: pending
  - id: fase-2-structure-guard
    content: "Fase 2b+2d: applyStructureGuard efter orchestrator; AUTO_FRESH_FAMILIES KUN fjernet på orchestrator-stien — bevares uændret på P3 keyword-fallback (ingen struktur-guard dér); nulstil previousHtml ved forced fresh; INCOMPATIBLE_LIST + kodekommentar (workflow_process bevidst udeladt)."
    status: pending
  - id: fase-3-alignment-trace
    content: "Fase 3: alignment-auditor (LLM + rubric); §3b; trace-felter; SSE; persist alignment/session-eval — vælg ny Drizzle-tabel (migration) ELLER JSON-kolonne på eksisterende meeting/session-række; dokumentér i todo før implementering."
    status: pending
  - id: fase-4-golden-ci
    content: "Fase 4: golden-transcript fixture + eval:golden (mock); valgfrit eval:golden:live nightly."
    status: pending
  - id: fase-5-badge
    content: "Fase 5: AlignmentBadge.tsx; fail → manuel regenerer."
    status: pending
isProject: false
---

# Implementationsplan v3 — autonom styring + verifikation

## Ændringer v2 → v3

| # | Ændring | Kilde |
|---|---------|--------|
| 2b | Eksplicit **struktur-guard** (`INCOMPATIBLE_FAMILY_PAIRS`, `applyStructureGuard`, log `structural_guard_overrides_refine`); **AUTO_FRESH** fjernes som selvstændig sti når orchestrator er aktiv — guard erstatter med præcis semantik | Cursor (skærpelse af v2.1) |
| 2a | **Post-validering** af `refinementNote` + fallback (Zod alene ikke nok); `valid: false` → ingen hard fail, evt. confidence −0.1 i trace | Cursor |
| 3b | **Fail-regel præciseret:** LLM `fail` → fail; LLM `warn` + **kritisk rubric** → fail; LLM `warn` + rubric ok → warn; LLM `ok` → ok (rubric ignoreret); rubric alene → højst warn | Cursor |
| Øvrigt | Uændret fra v2 ift. KPI’er, præcedence, env, golden CI, badge | — |
| v3.1 | AUTO_FRESH kun fjernet på **orchestrator-stien**; **bevares på P3**; `effectiveConfidence` lokalt (ingen mutation af decision); session-eval **migration eller JSON-kolonne**; `workflow_process` kommentar ved inkompatibilitetsliste | Review (ikke blokker) |

## Forhold til Claudes kritik (fastholdt fra v2)

**Cursor accepterer** Claudes linje: KPI’er frem for blotte løfter; **præcedence**; **hint som relativ label** (rå scores 0–999+, ingen arbitrær cap); env-drevet prod vs CI; **optional `forbiddenFamilies`**; **decision trace**; rubric som supplement; golden + mock orchestrator.

**Cursor forkaster ikke** confidence-eksperimentet som «blind skærpelse»: **0.80 kun via env** med **måling og rollback til 0.72** hvis `ask_user` stiger for meget. Default i kode bør forblive **0.72** indtil golden viser gevinst.

**v3 inkorporerer** den væsentligste Cursor-indvending mod «blind orkestrator»: **struktur-guard** + **REFINE CONSTRAINT** i prompt, så inkrementel læk på tværs af journey / mobile / physical ikke afhænger af ren LLM-lydighed.

---

## KPI’er (målbart)

- **routing_error_rate:** \<2% forkert familie på golden — `run-golden-transcript-tests.ts`.
- **alignment_fail_rate:** \<5% sessions med `severity=fail` — SSE meta + session-eval DB.
- **refine_structure_loss:** 0% hvor `mode=refine` og rubric detekterer fuld struktur-nulstilling — post-render.
- **orchestrator_fallback_rate:** \<10% kald til ren P1–P8 — `orchestrator-viz-fallback` events.

Hypoteser testes i Fase 4 — ikke solgt som garanti.

---

## Fase 0 — Autoritet, præcedence, miljø

**Filer:** [`orchestrator-viz.ts`](artifacts/api-server/src/lib/orchestrator-viz.ts), [`visualize.ts`](artifacts/api-server/src/routes/visualize.ts), `.env.example`

**0a. Præcedence**

- **P0** `userPickedType` → final, bypass alt.
- **P1** `focusSegment` → final, bypass orchestrator.
- **P2** orchestrator (gyldigt svar, ikke null, flag on) → final over **P3–P8**.
- **P3** keyword P1–P8 → kun ved orchestrator-fejl (timeout / null / flag off).

`VIZ_ROUTING_POLICY=orchestrator_first`: under P2 ignorér klassifikatorens familie og inertia for slut-routing (ikke P0/P1).

**0b. Hints** — ingen tal-cap; relativ label, fx `physical_product:${physicalScore} [MOBILE CONTEXT DETECTED — treat as low-confidence hint]` når både mobil- og fysisk-score \> 0 (samme signallogik som klassifikatorens vindue hvor muligt).

**0c. Env** — kode `ORCHESTRATOR_VIZ === "1"` uændret; `.env.example` / Railway med kommentar om nøgle; CI `ORCHESTRATOR_VIZ=0` + mock.

---

## Fase 1 — Orchestrator system prompt + schema

**1a. GRUNDFOS DISAMBIGUATION** (i `ORCHESTRATOR_SYSTEM`)

- **mobile_app:** GO app, Grundfos GO, mobile skærm, telefon/tablet UI, app-onboarding; «front panel» når foranlediget af app/mobile/phone.
- **physical_product:** kun ved tydelig pump-hardware (impeller, CU 200/300, LED-ring, drejeknap på enhed, wet end, pump curve, fysiske knapper); «front panel» alene = utilstrækkeligt.
- **user_journey:** kræver navngivne lanes (customer, technician, installer); «flow» alene ≠ journey.

**REFINE CONSTRAINT (kritisk):** Returnér aldrig `mode=refine` når `vizFamily` afviger fra sidste familie **og** parret er strukturelt inkompatibelt (journey-HTML kan ikke hoste physical illustration osv.). Returnér i stedet `mode=fresh`. (Supplerer kode-guarden i 2b; dobbelt sikkerhed.)

**1b.** `forbiddenFamilies: z.array(z.string()).optional()` — kun informativt i log/alignment; tvinger ikke routing i v1.

**1c.** `ORCHESTRATOR_HIGH_CONFIDENCE_THRESHOLD`: **default 0.72** i kode; sæt env til **0.80** for baseline-eksperiment; rollback til 0.72 hvis `ask_user`-rate \>15% efter måling.

**1d.** Model-ID — verificér mod repo (fx `claude-haiku-4-5`); ingen ændring uden bekræftelse.

---

## Fase 2 — Inkrementel refinement + struktur-guard

**2a. Struktureret `refinementNote` + post-validering**

- Zod sikrer tilstedeværelsestype; **format** via regex, fx `ADD:.+\|KEEP:.+` (i praksis også `AVOID` anbefalet i prompt).
- `parseRefinementNote(raw)`: ved match → `{ note: raw, valid: true }`; ellers fallback `ADD: ${raw} | KEEP: existing structure`, `valid: false`, `console.warn`, **ingen** stop af visualisering.
- `refinementNoteValid === false` → beregn **`effectiveConfidence = orchestratorDecision.confidence - 0.1`** **lokalt i route-handleren** (clamp til \[0,1\] hvis I bruger det interval). Brug `effectiveConfidence` i **viz-decision-trace** og som **kontekst til alignment-auditoren**. **`OrchestratorDecision` forbliver immutable** — ingen felter overskrives på det parsete objekt.

**2b. Struktur-guard (`applyStructureGuard`)**

- Efter `orchestratorVizDecision()`, før endelig family/mode: hvis `decision.mode === "refine"` og `lastFamily` findes, og `(lastFamily, decision.vizFamily)` matcher **foruddefineret inkompatibilitetsliste** (minimum: journey ↔ physical_product, journey ↔ mobile_app, physical_product ↔ mobile_app, hmi_interface ↔ physical_product; udvid efter behov), så **tving `mode: "fresh"`**, log `structural_guard_overrides_refine` (JSON med `from`, `to`, `reason`).
- **Kodekommentar ved listen:** `workflow_process` er **bevidst ikke** med på listen — det kan ofte refineres til/fra mange familier uden struktur-læk; undgår at fremtidige udviklere tilføjer det som «åbenbart manglende».
- **`effectivePreviousHtml` nulstilles** når resultatet efter guard er `fresh`.
- **AUTO_FRESH_FAMILIES** anvendes **ikke** som parallel sti når orchestrator er aktiv — semantikken erstattes af denne guard + REFINE CONSTRAINT.

**2c. Viz-prompt injection** — i `streamVisualization`: hvis `refinementNote`, prepand «REFINEMENT INSTRUCTION (HIGHEST PRIORITY)» + FORBIDDEN fuld reset af HTML når refine.

**2d. Route** — P0/P1 håndteres før orchestrator; derefter `guarded = applyStructureGuard(orchestratorDecision, lastFamily)`; `effectiveFamily` / `effectiveMode` fra guarded; keyword P3–P8 kun uden gyldig orchestrator-beslutning.

**AUTO_FRESH_FAMILIES og P3 (eksplicit):** Logikken **fjernes kun på orchestrator-stien** (P2), hvor struktur-guard + REFINE CONSTRAINT bærer ansvaret. På **P3 keyword-fallback** er der **ingen** `applyStructureGuard` — her **bevares eksisterende AUTO_FRESH_FAMILIES-adfærd uændret**, ellers risikerer implementeringen at slette frisk-genskift for begge stier. Kodereview: tjek at betingelsen er `routingAuthority === "orchestrator"` (eller ækvivalent), ikke «global fjernelse».

---

## Fase 3 — Alignment audit + decision trace

**3a. LLM-dommer** — input: seneste ~2000 tegn transcript, orchestrator rationale, `refinementNote`, overskrifter/aria (regex, ikke fuld HTML); timeout 3s, ingen retry; parallel med `isHtmlQualityOk` hvor relevant.

**3b. Samlet severity**

- LLM `fail` → **fail**.
- LLM `warn` + **kritisk** rubric-hit → **fail** (strukturelle, meningsforandrende: fx tom navngiven lane; pump-SVG som primært indhold i `mobile_app` der kræver app-krom — definér per familie; kosmetik opgraderer ikke).
- LLM `warn`, rubric ok → **warn**.
- LLM `ok` → **ok** (rubric-træk bruges ikke til at sænke under ok).
- Rubric fejl **alene** → **warn** (maks).

Ingen automatisk retry; SSE alignment + persist i session-eval; frontend **«Foreslå regenerering»** ved fail.

**3c. Decision trace** (ét JSON-objekt pr. viz), feltforslag:

`event`, `roomId`, `vizFamily`, `mode`, `routingAuthority`, `structureGuardApplied`, `classifierTop3`, `orchestratorRaw`, `orchestratorConfidence` (rå), `effectiveConfidence` (efter refinementNote-justering), `refinementNoteValid`, `alignmentResult`, `elapsedMs`.

**Persistens (session-eval):** Eksisterende Drizzle-skema har sandsynligvis **ikke** en færdig `session_eval`-tabel. **Inden implementering:** vælg **enten** (a) **ny tabel** + migration, **eller** (b) **JSON-kolonne** på eksisterende meeting-/session-lagring. Fase 3-todo skal nævne filsti til schema/migration så det ikke opdages sent.

---

## Fase 4 — Golden transcript + CI

- Fixture min. én versionsstyret `golden-transcript.json` med `expectedFamily`, `forbiddenFamilies`, `requiredHtmlContent`, noter.
- CI: `ORCHESTRATOR_VIZ=0`, mock orchestrator, `pnpm run eval:golden`.
- Valgfrit nightly: `ORCHESTRATOR_VIZ=1`, `pnpm run eval:golden:live`.

---

## Fase 5 — Frontend

- [`AlignmentBadge.tsx`](artifacts/meeting-visualizer/src/components/AlignmentBadge.tsx) ved iframe; fail → manuel regenerer; ingen auto-retry-loop.

---

## Prioriteret rækkefølge

1. Fase 0 (env + præcedence + hints)  
2. Fase 1a–1b (prompt + REFINE CONSTRAINT + optional forbidden)  
3. **Fase 2a+2b+2c+2d** (refinement + struktur-guard — kritisk)  
4. Fase 3 (alignment + trace)  
5. Fase 4 (golden)  
6. Fase 5 (badge)

---

## Kort notat: hvor Cursor stadig «trodde» Claude

Claude havde ret i at **hypoteser skal måles**; Cursor **fastholder** at **0.80-tærskel** er et **målt eksperiment**, ikke et PR-løfte. **v3** løser den reelle arkitektur-risiko: **prompt + kode-guard** mod refine på inkompatible familier, så AUTO_FRESH ikke bare fjernes uden erstatning.
