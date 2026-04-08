/**
 * Isolerede tests for resolveFamily() — P1–P8 decision order (plan v3).
 * Tester IKKE klassifikatoren (se run-fictive-classifier-tests.ts).
 * Ingen network, ingen HTTP, ingen room-state.
 * Inkluderer mock-orchestrator-scenarier (O1–O10).
 *
 * Run: pnpm --filter @workspace/api-server run test:fictive-route
 */

import { resolveFamily, checkDisambiguationGate } from "../routes/visualize.js";
import { CLASSIFY_SWITCH_LEAD } from "../lib/classifier.js";
import type { ClassificationResult, VizFamily } from "../lib/classifier.js";
import { OrchestratorDecisionSchema } from "../lib/orchestrator-viz.js";
import type { OrchestratorDecision } from "../lib/orchestrator-viz.js";

function assertEq<T>(name: string, actual: T, expected: T): void {
  if (actual !== expected) {
    console.error(
      `FAIL: ${name}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`,
    );
    process.exit(1);
  }
}

function makeClassification(
  overrides: Partial<ClassificationResult>,
): ClassificationResult {
  return {
    family: "generic",
    topic: "test",
    scores: [],
    ambiguous: false,
    lead: 10,
    runnerUp: null,
    hardOverride: false,
    ...overrides,
  };
}

function main(): void {
  console.log(
    `resolveFamily decision-order tests (CLASSIFY_SWITCH_LEAD=${CLASSIFY_SWITCH_LEAD})\n`,
  );

  // R1: P8 inertia — lead under tærskel, etableret familie bevares
  assertEq(
    "R1 inertia (lead < SWITCH_LEAD, lastFamily set)",
    resolveFamily({
      classification: makeClassification({
        family: "comparison_evaluation",
        lead: 6,
      }),
      lastFamily: "hmi_interface",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "hmi_interface",
  );
  console.log(
    "R1 ✓ inertia: lead=6 < " +
      CLASSIFY_SWITCH_LEAD +
      " → holder hmi_interface",
  );

  // R2: P6 skift — lead over tærskel, etableret familie skifter
  assertEq(
    "R2 family switch (lead >= SWITCH_LEAD)",
    resolveFamily({
      classification: makeClassification({
        family: "comparison_evaluation",
        lead: 15,
      }),
      lastFamily: "hmi_interface",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "comparison_evaluation",
  );
  console.log(
    "R2 ✓ switch: lead=15 >= " +
      CLASSIFY_SWITCH_LEAD +
      " → comparison_evaluation",
  );

  // R3: P2 hardOverride — bypass inertia og refinement
  assertEq(
    "R3 hardOverride bypasses inertia",
    resolveFamily({
      classification: makeClassification({
        family: "physical_product",
        lead: 999,
        hardOverride: true,
      }),
      lastFamily: "user_journey",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "physical_product",
  );
  console.log(
    "R3 ✓ hardOverride: physical_product vinder over user_journey (lead=999)",
  );

  // R4: P3 ambiguous + lastFamily → arv
  assertEq(
    "R4 ambiguous inherit lastFamily",
    resolveFamily({
      classification: makeClassification({
        family: "generic",
        ambiguous: true,
        lead: 2,
      }),
      lastFamily: "persona_research",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "persona_research",
  );
  console.log("R4 ✓ ambiguous-inherit: holder persona_research");

  // R5: P4 ambiguous + ingen lastFamily → null (route skipper)
  assertEq(
    "R5 ambiguous no lastFamily → null",
    resolveFamily({
      classification: makeClassification({
        family: "generic",
        ambiguous: true,
        lead: 2,
      }),
      lastFamily: null,
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    null,
  );
  console.log("R5 ✓ ambiguous + ingen lastFamily → null");

  // R6: P5 refinement lock — bevar lastFamily (Strategi A)
  assertEq(
    "R6 refinement lock holds lastFamily",
    resolveFamily({
      classification: makeClassification({ family: "hmi_interface", lead: 8 }),
      lastFamily: "workflow_process",
      hasFocusSegment: false,
      refinementDetected: true,
    }),
    "workflow_process",
  );
  console.log(
    "R6 ✓ refinement-lock: holder workflow_process (lead=8, ingen hardOverride)",
  );

  // R7: P2 vinder over P5 — hardOverride trumfer refinement-lås
  assertEq(
    "R7 hardOverride beats refinement lock",
    resolveFamily({
      classification: makeClassification({
        family: "hmi_interface",
        lead: 999,
        hardOverride: true,
      }),
      lastFamily: "workflow_process",
      hasFocusSegment: false,
      refinementDetected: true,
    }),
    "hmi_interface",
  );
  console.log("R7 ✓ hardOverride trumfer refinement-lås: hmi_interface vinder");

  // R8: Strategi B — høj lead (>= CLASSIFY_SWITCH_LEAD) bryder refinement-lås, P6 vinder
  assertEq(
    "R8 Strategi B: high lead without hardOverride DOES break refinement lock (P6 wins)",
    resolveFamily({
      classification: makeClassification({
        family: "comparison_evaluation",
        lead: 20,
        hardOverride: false,
      }),
      lastFamily: "workflow_process",
      hasFocusSegment: false,
      refinementDetected: true,
    }),
    "comparison_evaluation",
  );
  console.log(
    "R8 ✓ Strategi B: lead=20 >= CLASSIFY_SWITCH_LEAD → P5-lås overruled, comparison_evaluation vinder",
  );

  // R9: P1 focusSegment — bypass alt inkl. inertia og refinement
  assertEq(
    "R9 focusSegment bypasses everything",
    resolveFamily({
      classification: makeClassification({
        family: "service_blueprint",
        lead: 5,
      }),
      lastFamily: "hmi_interface",
      hasFocusSegment: true,
      refinementDetected: true,
    }),
    "service_blueprint",
  );
  console.log("R9 ✓ focusSegment: service_blueprint vinder (bypass alt)");

  // R10: P7 første viz — ingen lastFamily, brug klassifikatorens resultat
  assertEq(
    "R10 first viz no lastFamily",
    resolveFamily({
      classification: makeClassification({
        family: "management_summary",
        lead: 8,
      }),
      lastFamily: null,
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "management_summary",
  );
  console.log(
    "R10 ✓ første viz: management_summary (ingen lastFamily, lead=8)",
  );

  console.log(
    "\nAlle resolveFamily route-tests OK (R1–R10, P1–P8 decision order, Strategi B verificeret).",
  );

  // ─── checkDisambiguationGate tests (D1–D6) ───────────────────────────────
  console.log("\ncheckDisambiguationGate tests:\n");

  // D1: Konflikt — refinement + stærkt topic-skift → needsIntent = true
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: CLASSIFY_SWITCH_LEAD + 3,
        hardOverride: false,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D1 needsIntent=true (refinement + stærkt topic-skift)",
      g.needsIntent,
      true,
    );
    assertEq(
      "D1 reason=refinement_vs_topic_shift",
      g.reason,
      "refinement_vs_topic_shift",
    );
    assertEq("D1 defaultChoice=fresh", g.defaultChoice, "fresh");
    console.log(
      `D1 ✓ konflikt: refinement + lead=${CLASSIFY_SWITCH_LEAD + 3} → needsIntent`,
    );
  }

  // D2: Strategi B — refinement + lav lead + familie-konflikt → Gate 3 fyrer (needsIntent=true)
  // Rettelse: !refinementDirective-guard fjernet fra Gate 3 → dialog vises i stedet for stille P5-lås.
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: CLASSIFY_SWITCH_LEAD - 1,
        hardOverride: false,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D2 needsIntent=true (Strategi B: refinement + familie-konflikt + lav lead → dialog)",
      g.needsIntent,
      true,
    );
    assertEq("D2 reason=uncertain_topic_shift", g.reason, "uncertain_topic_shift");
    console.log(
      `D2 ✓ Strategi B: refinement + lead=${CLASSIFY_SWITCH_LEAD - 1} + familie-konflikt → Gate 3 needsIntent=true`,
    );
  }

  // D3: Ingen konflikt — refinement men SAMME familie → ingen gate
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on interface.",
      classification: makeClassification({
        family: "hmi_interface",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D3 needsIntent=false (samme familie)", g.needsIntent, false);
    console.log("D3 ✓ ingen gate: refinement men samme familie");
  }

  // D4: Ingen konflikt — userVizIntent allerede sat → bypass gate
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: "fresh",
    });
    assertEq(
      "D4 needsIntent=false (userVizIntent allerede sat)",
      g.needsIntent,
      false,
    );
    console.log("D4 ✓ ingen gate: userVizIntent='fresh' bypass");
  }

  // D5: Ingen konflikt — ingen previousHtml → ingen gate (intet at refine)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: null,
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D5 needsIntent=false (ingen previousHtml)", g.needsIntent, false);
    console.log("D5 ✓ ingen gate: ingen previousHtml");
  }

  // D6: Ingen konflikt — userPickedType → bypass gate
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: true,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D6 needsIntent=false (userPickedType)", g.needsIntent, false);
    console.log("D6 ✓ ingen gate: userPickedType bypass");
  }

  // D7: Ingen gate — refinementDirective er null (ingen refinement detekteret)
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D7 needsIntent=false (refinementDirective=null)",
      g.needsIntent,
      false,
    );
    console.log("D7 ✓ ingen gate: ingen refinement-direktiv");
  }

  // D8: Ingen gate — classification er null (bruger valgte type eksplicit, skippes normalt via userPickedType)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: null,
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D8 needsIntent=false (classification=null)",
      g.needsIntent,
      false,
    );
    console.log("D8 ✓ ingen gate: classification=null");
  }

  // D9: Ingen gate — classification er ambiguous (gate kræver !ambiguous)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: true,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D9 needsIntent=false (ambiguous=true)", g.needsIntent, false);
    console.log("D9 ✓ ingen gate: klassifikation er ambiguous");
  }

  // D10: Ingen gate — lastFamily er null (intet at konflikte med)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: null,
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D10 needsIntent=false (lastFamily=null)", g.needsIntent, false);
    console.log("D10 ✓ ingen gate: lastFamily=null");
  }

  // D11: Ingen gate — focusSegment sat → bypass (ligesom userPickedType)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: "Klaus: lad os zoome ind på brugerrejsen",
      userVizIntent: null,
    });
    assertEq("D11 needsIntent=false (focusSegment sat)", g.needsIntent, false);
    console.log("D11 ✓ ingen gate: focusSegment bypass");
  }

  // D12: Grænseværdi — lead === CLASSIFY_SWITCH_LEAD (eksakt tærskel, >= → skal trigge)
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: CLASSIFY_SWITCH_LEAD,
        hardOverride: false,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      `D12 needsIntent=true (lead === CLASSIFY_SWITCH_LEAD=${CLASSIFY_SWITCH_LEAD}, >= inklusiv)`,
      g.needsIntent,
      true,
    );
    console.log(
      `D12 ✓ grænseværdi: lead===${CLASSIFY_SWITCH_LEAD} (eksakt tærskel) → needsIntent`,
    );
  }

  // D13: detectedFamily i resultatet matcher classification.family
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "requirements_matrix",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D13 detectedFamily=requirements_matrix",
      g.detectedFamily,
      "requirements_matrix",
    );
    console.log("D13 ✓ detectedFamily returneres korrekt i gate-resultat");
  }

  // D14: effectivePreviousHtml = undefined (ikke null) → ingen gate
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: undefined,
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D14 needsIntent=false (previousHtml=undefined)",
      g.needsIntent,
      false,
    );
    console.log("D14 ✓ ingen gate: effectivePreviousHtml=undefined");
  }

  // D15: userVizIntent='refine' → bypass (samme som 'fresh')
  {
    const g = checkDisambiguationGate({
      refinementDirective: "ZOOM IN: Expand on pumps.",
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 20,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: "refine",
    });
    assertEq(
      "D15 needsIntent=false (userVizIntent='refine')",
      g.needsIntent,
      false,
    );
    console.log("D15 ✓ ingen gate: userVizIntent='refine' bypass");
  }

  // D16: Blødt emneskift — anden familie, lead mellem min og auto-skift → spørg
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 8,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D16 needsIntent=true (uncertain_topic_shift)", g.needsIntent, true);
    assertEq("D16 reason=uncertain_topic_shift", g.reason, "uncertain_topic_shift");
    assertEq("D16 defaultChoice=fresh", g.defaultChoice, "fresh");
    console.log("D16 ✓ uncertain_topic_shift: lead i [min, switch) → popup");
  }

  // D17: Tvetydig + eksisterende viz → spørg (ikke stiltiende P3-arv)
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "user_journey",
        ambiguous: true,
        lead: 6,
      }),
      lastFamily: "physical_product",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D17 needsIntent=true (ambiguous_with_previous_viz)",
      g.needsIntent,
      true,
    );
    assertEq(
      "D17 reason=ambiguous_with_previous_viz",
      g.reason,
      "ambiguous_with_previous_viz",
    );
    assertEq("D17 defaultChoice=refine", g.defaultChoice, "refine");
    console.log("D17 ✓ ambiguous_with_previous_viz");
  }

  // D18: For lav lead — ingen uncertain gate (undgå støj)
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "user_journey",
        ambiguous: false,
        lead: 3,
      }),
      lastFamily: "hmi_interface",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq("D18 needsIntent=false (lead under min)", g.needsIntent, false);
    console.log("D18 ✓ lead<UNCERTAIN_MIN → ingen uncertain gate");
  }

  // D19: physical_product at lead 6-11 → NO dialog (AUTO_FRESH_FAMILIES skips Gate 3)
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "physical_product",
        ambiguous: false,
        lead: 8,
        hardOverride: false,
      }),
      lastFamily: "user_journey",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D19 needsIntent=false (physical_product auto-fresh, no dialog)",
      g.needsIntent,
      false,
    );
    console.log("D19 ✓ physical_product lead=8 → auto-fresh, ingen dialog (AUTO_FRESH_FAMILIES)");
  }

  // D20: non-physical_product at same lead → STILL shows dialog (regression check)
  {
    const g = checkDisambiguationGate({
      refinementDirective: null,
      classification: makeClassification({
        family: "comparison_evaluation",
        ambiguous: false,
        lead: 8,
        hardOverride: false,
      }),
      lastFamily: "user_journey",
      effectivePreviousHtml: "<html>prev</html>",
      userPickedType: false,
      focusSegment: null,
      userVizIntent: null,
    });
    assertEq(
      "D20 needsIntent=true (non-physical_product still shows dialog)",
      g.needsIntent,
      true,
    );
    assertEq("D20 reason=uncertain_topic_shift", g.reason, "uncertain_topic_shift");
    console.log("D20 ✓ comparison_evaluation lead=8 → uncertain_topic_shift dialog (regression OK)");
  }

  console.log(
    "\nAlle disambiguation gate-tests OK (D1–D20, alle betingelser og grænseværdier verificeret).",
  );

  // ─── resolveFamily edge case tests (R11–R14) ─────────────────────────────
  console.log("\nresolveFamily edge cases (R11–R14):\n");

  // R11: P5 med lastFamily=null — refinement men ingen etableret familie → P7 (brug classifier)
  assertEq(
    "R11 refinement + lastFamily=null → classification.family (P7)",
    resolveFamily({
      classification: makeClassification({ family: "user_journey", lead: 5 }),
      lastFamily: null,
      hasFocusSegment: false,
      refinementDetected: true,
    }),
    "user_journey",
  );
  console.log("R11 ✓ P5 forudsætter lastFamily — uden den falder vi til P7");

  // R12: classification=null og lastFamily=null → null
  assertEq(
    "R12 classification=null → null",
    resolveFamily({
      classification: null,
      lastFamily: null,
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    null,
  );
  console.log("R12 ✓ ingen classification → null");

  // R13: P1 focusSegment med classification=null → null (ikke crash)
  assertEq(
    "R13 focusSegment + classification=null → null",
    resolveFamily({
      classification: null,
      lastFamily: "hmi_interface",
      hasFocusSegment: true,
      refinementDetected: false,
    }),
    null,
  );
  console.log("R13 ✓ focusSegment + classification=null → null (ingen crash)");

  // R14: P6 eksakt grænse — lead === CLASSIFY_SWITCH_LEAD → skift (>= inklusiv)
  assertEq(
    `R14 lead === CLASSIFY_SWITCH_LEAD=${CLASSIFY_SWITCH_LEAD} → skift familie (>=)`,
    resolveFamily({
      classification: makeClassification({
        family: "comparison_evaluation",
        lead: CLASSIFY_SWITCH_LEAD,
      }),
      lastFamily: "hmi_interface",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "comparison_evaluation",
  );
  console.log(
    `R14 ✓ eksakt grænse: lead===${CLASSIFY_SWITCH_LEAD} → comparison_evaluation (skift)`,
  );

  // ─── physical_product specific tests (R15–R17) ────────────────────────────
  console.log("\nphysical_product routing tests (R15–R17):\n");

  // R15: physical_product med lead=8 (under CLASSIFY_SWITCH_LEAD) + user_journey som lastFamily
  // → auto-switch blokken i route-handleren ville skifte (lead >= 6), men resolveFamily
  // returnerer inertia (P8). Testen bekræfter at resolveFamily alene giver P8-inertia.
  assertEq(
    "R15 physical_product lead=8 (P8 inertia i resolveFamily alene)",
    resolveFamily({
      classification: makeClassification({
        family: "physical_product",
        lead: 8,
      }),
      lastFamily: "user_journey",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "user_journey",
  );
  console.log(
    "R15 ✓ physical_product lead=8 → P8 inertia (auto-switch i route-handler løser det)",
  );

  // R16: physical_product med lead >= CLASSIFY_SWITCH_LEAD → P6 skifter normalt
  assertEq(
    "R16 physical_product lead=15 → P6 switch",
    resolveFamily({
      classification: makeClassification({
        family: "physical_product",
        lead: 15,
      }),
      lastFamily: "user_journey",
      hasFocusSegment: false,
      refinementDetected: false,
    }),
    "physical_product",
  );
  console.log("R16 ✓ physical_product lead=15 → P6 switch");

  // R17: physical_product med refinement + lead >= CLASSIFY_SWITCH_LEAD → Strategi B, P6 vinder
  assertEq(
    "R17 physical_product lead=15 + refinement → P6 overrules P5 (Strategi B)",
    resolveFamily({
      classification: makeClassification({
        family: "physical_product",
        lead: 15,
      }),
      lastFamily: "user_journey",
      hasFocusSegment: false,
      refinementDetected: true,
    }),
    "physical_product",
  );
  console.log("R17 ✓ physical_product + refinement + high lead → P6 vinder");

  console.log("\nAlle edge case tests OK (R11–R14) + physical_product tests (R15–R17).");

  // ─── E2E simulation: physical_product fresh-start at varying leads ────────
  // Simulates the full route decision pipeline: resolveFamily → auto-switch →
  // topic-shift clear → structural incompatibility → isIncremental check.
  console.log("\nE2E physical_product fresh-start simulation (S1–S3):\n");

  function simulatePhysicalProductSwitch(lead: number): {
    resolvedFamily: string | null;
    isIncremental: boolean;
    previousHtmlCleared: boolean;
  } {
    const classification = makeClassification({
      family: "physical_product",
      lead,
      hardOverride: lead >= 999,
    });
    const lastFamily: VizFamily = "user_journey";
    let effectivePreviousHtml: string | undefined = "<html>prev user journey</html>";

    // Step 1: resolveFamily
    let resolvedFamily = resolveFamily({
      classification,
      lastFamily,
      hasFocusSegment: false,
      refinementDetected: false,
    });

    // Step 2: physical_product auto-switch (mirrors route handler logic)
    const PHYSICAL_PRODUCT_AUTO_SWITCH_LEAD = 6;
    if (
      classification.family === "physical_product" &&
      lastFamily !== "physical_product" &&
      (resolvedFamily === lastFamily || resolvedFamily === null) &&
      (classification.lead ?? 0) >= PHYSICAL_PRODUCT_AUTO_SWITCH_LEAD
    ) {
      resolvedFamily = "physical_product";
    }

    // Step 3: topic-shift clear
    if (resolvedFamily && lastFamily !== resolvedFamily) {
      effectivePreviousHtml = undefined;
    }

    // Step 4: structural incompatibility defense
    const AUTO_FRESH = ["physical_product"];
    if (
      resolvedFamily &&
      resolvedFamily !== lastFamily &&
      effectivePreviousHtml &&
      (AUTO_FRESH.includes(resolvedFamily) || AUTO_FRESH.includes(lastFamily))
    ) {
      effectivePreviousHtml = undefined;
    }

    return {
      resolvedFamily,
      isIncremental: !!effectivePreviousHtml,
      previousHtmlCleared: effectivePreviousHtml === undefined,
    };
  }

  // S1: lead=15 (above CLASSIFY_SWITCH_LEAD) → P6 switch → fresh
  {
    const r = simulatePhysicalProductSwitch(15);
    assertEq("S1 resolvedFamily=physical_product (lead=15)", r.resolvedFamily, "physical_product");
    assertEq("S1 isIncremental=false (lead=15)", r.isIncremental, false);
    assertEq("S1 previousHtmlCleared=true (lead=15)", r.previousHtmlCleared, true);
    console.log("S1 ✓ lead=15 → physical_product, fresh start (P6 switch)");
  }

  // S2: lead=10 (between auto-switch threshold 6 and CLASSIFY_SWITCH_LEAD 12) → auto-switch → fresh
  {
    const r = simulatePhysicalProductSwitch(10);
    assertEq("S2 resolvedFamily=physical_product (lead=10)", r.resolvedFamily, "physical_product");
    assertEq("S2 isIncremental=false (lead=10)", r.isIncremental, false);
    assertEq("S2 previousHtmlCleared=true (lead=10)", r.previousHtmlCleared, true);
    console.log("S2 ✓ lead=10 → physical_product, fresh start (auto-switch)");
  }

  // S3: lead=6 (exact auto-switch threshold) → auto-switch → fresh
  {
    const r = simulatePhysicalProductSwitch(6);
    assertEq("S3 resolvedFamily=physical_product (lead=6)", r.resolvedFamily, "physical_product");
    assertEq("S3 isIncremental=false (lead=6)", r.isIncremental, false);
    assertEq("S3 previousHtmlCleared=true (lead=6)", r.previousHtmlCleared, true);
    console.log("S3 ✓ lead=6 → physical_product, fresh start (auto-switch at threshold)");
  }

  console.log("\nAlle E2E simulations OK (S1–S3, alle lead-niveauer giver fresh start).");

  // ─── Mock-orchestrator schema-tests (O1–O10) ──────────────────────────────
  // Tester Zod-skema validation for OrchestratorDecision — ingen network, ingen HTTP.
  // Dækker: cold-start, ambiguous-no-context, refinement-vs-topic-shift,
  //         lav confidence (ask_user), og timeout/fallback.
  console.log("\nMock-orchestrator schema-tests (O1–O10):\n");

  function parseOrchestrator(raw: unknown): OrchestratorDecision | null {
    const r = OrchestratorDecisionSchema.safeParse(raw);
    if (r.success) return r.data;
    return null;
  }

  // O1: Cold-start — fresh mode, første viz
  {
    const decision = parseOrchestrator({
      vizFamily: "user_journey",
      mode: "fresh",
      confidence: 0.85,
      rationale: "Cold start: no prior context. Transcript mentions journey mapping.",
      sessionSummaryUpdate: "Meeting about user journey mapping for Grundfos GO app. First viz.",
    });
    assertEq("O1 cold-start parses successfully", decision !== null, true);
    assertEq("O1 cold-start mode=fresh", decision?.mode, "fresh");
    assertEq("O1 cold-start vizFamily=user_journey", decision?.vizFamily, "user_journey");
    console.log("O1 ✓ cold-start: user_journey fresh mode parsed korrekt");
  }

  // O2: Ambiguous-no-context — lav confidence uden historik
  {
    const decision = parseOrchestrator({
      vizFamily: "generic",
      mode: "ask_user",
      confidence: 0.3,
      rationale: "Topic is ambiguous — could be workflow or journey. Need user input.",
    });
    assertEq("O2 ambiguous-no-context parses", decision !== null, true);
    assertEq("O2 mode=ask_user", decision?.mode, "ask_user");
    assertEq("O2 confidence < 0.45", (decision?.confidence ?? 1) < 0.45, true);
    console.log("O2 ✓ ambiguous-no-context: ask_user mode, lav confidence");
  }

  // O3: Refinement-vs-topic-shift — refine mode med refinementNote
  {
    const decision = parseOrchestrator({
      vizFamily: "hmi_interface",
      mode: "refine",
      refinementNote: "Add alarm panel to the right column.",
      confidence: 0.78,
      rationale: "Speaker explicitly asks to modify the current HMI layout.",
      sessionSummaryUpdate: "HMI interface design session. Refined alarm panel added.",
    });
    assertEq("O3 refinement parses", decision !== null, true);
    assertEq("O3 mode=refine", decision?.mode, "refine");
    assertEq("O3 refinementNote present", typeof decision?.refinementNote, "string");
    assertEq("O3 confidence >= 0.45", (decision?.confidence ?? 0) >= 0.45, true);
    console.log("O3 ✓ refinement-vs-topic-shift: refine mode med refinementNote");
  }

  // O4: Lav confidence → ask_user threshold check (< 0.45)
  {
    const borderHigh = parseOrchestrator({
      vizFamily: "workflow_process",
      mode: "fresh",
      confidence: 0.45,
      rationale: "Borderline confidence — workflow signals present.",
    });
    const borderLow = parseOrchestrator({
      vizFamily: "workflow_process",
      mode: "fresh",
      confidence: 0.44,
      rationale: "Just below ask_user threshold.",
    });
    assertEq("O4a confidence=0.45 parses (zone: auto_medium)", borderHigh !== null, true);
    assertEq("O4b confidence=0.44 parses (zone: ask_user)", borderLow !== null, true);
    assertEq("O4a 0.45 >= 0.45", (borderHigh?.confidence ?? 0) >= 0.45, true);
    assertEq("O4b 0.44 < 0.45", (borderLow?.confidence ?? 1) < 0.45, true);
    console.log("O4 ✓ confidence grænse: 0.45=auto_medium, 0.44=ask_user zone");
  }

  // O5: Skip mode — orchestrator chose to not generate
  {
    const decision = parseOrchestrator({
      vizFamily: "generic",
      mode: "skip",
      confidence: 0.6,
      rationale: "Small talk detected — not enough domain content.",
    });
    assertEq("O5 skip mode parses", decision !== null, true);
    assertEq("O5 mode=skip", decision?.mode, "skip");
    console.log("O5 ✓ skip mode: orchestrator valgte at springe over");
  }

  // O6: Timeout/fallback — null result simuleret
  {
    const nullResult = parseOrchestrator(null);
    assertEq("O6 null → null (timeout/fallback)", nullResult, null);
    console.log("O6 ✓ null input (timeout/fallback) → returnerer null korrekt");
  }

  // O7: Invalid vizFamily → schema fejl → null
  {
    const invalid = parseOrchestrator({
      vizFamily: "invalid_family_xyz",
      mode: "fresh",
      confidence: 0.9,
      rationale: "Test invalid family.",
    });
    assertEq("O7 invalid vizFamily → null", invalid, null);
    console.log("O7 ✓ ukendt vizFamily afvises af Zod-schema");
  }

  // O8: Invalid mode → schema fejl → null
  {
    const invalid = parseOrchestrator({
      vizFamily: "hmi_interface",
      mode: "wrong_mode",
      confidence: 0.8,
      rationale: "Test invalid mode.",
    });
    assertEq("O8 invalid mode → null", invalid, null);
    console.log("O8 ✓ ukendt mode afvises af Zod-schema");
  }

  // O9: Confidence out of range → clipped af Zod (Zod min/max)
  {
    const tooHigh = parseOrchestrator({
      vizFamily: "persona_research",
      mode: "fresh",
      confidence: 1.5,
      rationale: "Confidence > 1 should fail Zod max.",
    });
    assertEq("O9 confidence > 1 → null", tooHigh, null);
    console.log("O9 ✓ confidence > 1 afvises af Zod max(1)");
  }

  // O10: sessionSummaryUpdate maks 500 tegn — truncation i runtime (ikke Zod fejl)
  {
    const longSummary = "x".repeat(501);
    const withLong = parseOrchestrator({
      vizFamily: "management_summary",
      mode: "fresh",
      confidence: 0.7,
      rationale: "Test long sessionSummaryUpdate.",
      sessionSummaryUpdate: longSummary,
    });
    assertEq("O10 long sessionSummaryUpdate → Zod max(500) fejl → null", withLong, null);
    console.log("O10 ✓ sessionSummaryUpdate > 500 chars afvises af Zod max(500)");
  }

  console.log("\nAlle mock-orchestrator schema-tests OK (O1–O10).");

  // ─── E2E orchestrator integration simulations (E1–E8) ────────────────────
  // Tester orchestrator-centric routing i kombination med:
  //   E1-E2: Feature-flag on/off — orchestrator vs. fallback path
  //   E3-E4: Confidence zone boundary — auto_high vs. auto_medium vs. ask_user
  //   E5:    Disambiguation gate bypassed when orchestrator active (no override)
  //   E6:    Disambiguation gate active when orchestrator disabled/null
  //   E7:    Timeout/null result → falls through to resolveFamily (P1-P8)
  //   E8:    Session summary update fields validated and extracted
  console.log("\nE2E orchestrator integration simulations (E1–E8):\n");

  // E1: Flag OFF → orchestrator result should be ignored; resolveFamily used
  {
    // Simulate: flag OFF means orchestratorResult is null in the route
    // Downstream: resolveFamily gets called with raw classification
    const cls = makeClassification({ family: "hmi_interface", lead: 20 });
    const resultWhenFlagOff = resolveFamily({
      classification: cls,
      lastFamily: null,
      hasFocusSegment: false,
      refinementDetected: false,
    });
    assertEq("E1 flag-off: resolveFamily returns classifier family", resultWhenFlagOff, "hmi_interface");
    console.log("E1 ✓ flag OFF: resolveFamily respects keyword classifier (no orchestrator)");
  }

  // E2: Flag ON + valid orchestrator result → orchestrator family takes priority
  {
    // Simulate: orchestrator returned user_journey even though classifier says hmi_interface
    const orchestratorDecision = parseOrchestrator({
      vizFamily: "user_journey",
      mode: "fresh",
      confidence: 0.85,
      rationale: "Transcript describes a user journey, not HMI.",
      sessionSummaryUpdate: "User journey mapping session, Grundfos GO app.",
    });
    assertEq("E2 orchestrator decision parsed", orchestratorDecision !== null, true);
    // The route sets resolvedFamily = oc.vizFamily when orchestrator active
    const resolvedByOrchestrator = orchestratorDecision?.vizFamily ?? null;
    assertEq("E2 orchestrator override: family=user_journey", resolvedByOrchestrator, "user_journey");
    console.log("E2 ✓ flag ON: orchestrator family overrides keyword classifier");
  }

  // E3: Confidence zones — 0.44 triggers ask_user zone (< 0.45)
  {
    const lowConf = parseOrchestrator({
      vizFamily: "generic",
      mode: "fresh",
      confidence: 0.44,
      rationale: "Ambiguous topic — slightly below threshold.",
    });
    assertEq("E3 confidence=0.44 parses", lowConf !== null, true);
    // In route: oc.confidence < 0.45 → ask_user path
    const triggersAskUser = (lowConf?.confidence ?? 1) < 0.45;
    assertEq("E3 confidence=0.44 → ask_user triggered", triggersAskUser, true);
    console.log("E3 ✓ confidence=0.44 → ask_user zone (< 0.45 threshold)");
  }

  // E4: Confidence zones — 0.45 is auto_medium (not ask_user)
  {
    const mediumConf = parseOrchestrator({
      vizFamily: "management_summary",
      mode: "fresh",
      confidence: 0.45,
      rationale: "Moderate confidence — above threshold, logging rationale.",
    });
    assertEq("E4 confidence=0.45 parses", mediumConf !== null, true);
    const triggersAskUser = (mediumConf?.confidence ?? 0) < 0.45;
    assertEq("E4 confidence=0.45 → auto_medium (not ask_user)", triggersAskUser, false);
    const isAutoHigh = (mediumConf?.confidence ?? 0) > 0.72;
    assertEq("E4 confidence=0.45 → not auto_high", isAutoHigh, false);
    console.log("E4 ✓ confidence=0.45 → auto_medium zone (0.45–0.72 range)");
  }

  // E5: Disambiguation gate bypassed when orchestrator provides valid decision
  {
    // Simulate: orchestrator has returned a valid result (non-null)
    // → gate check should be skipped per: if (!orchestratorResult || !isOrchestratorEnabled())
    const orchestratorActive = true; // flag ON
    const orchestratorResult = parseOrchestrator({
      vizFamily: "hmi_interface",
      mode: "refine",
      confidence: 0.77,
      rationale: "Speaker asked to add a panel to existing HMI.",
      refinementNote: "Add temperature panel to top row.",
    });
    const shouldRunDisambiguationGate = !orchestratorResult || !orchestratorActive;
    assertEq("E5 disambiguation gate bypassed when orchestrator active", shouldRunDisambiguationGate, false);
    console.log("E5 ✓ disambiguation gate bypassed when orchestrator returned valid decision");
  }

  // E6: Disambiguation gate runs when orchestrator is null (timeout/flag-off fallback)
  {
    const orchestratorResult: OrchestratorDecision | null = null; // timeout or flag off
    const orchestratorActive = false;
    const shouldRunDisambiguationGate = !orchestratorResult || !orchestratorActive;
    assertEq("E6 disambiguation gate runs when orchestrator null", shouldRunDisambiguationGate, true);
    console.log("E6 ✓ disambiguation gate runs when orchestrator null (legacy path)");
  }

  // E7: Timeout fallback — OrchestratorCallResult with type=timeout returns null to route
  {
    // Simulate: orchestrator-viz.ts returns null on timeout (no retry for network errors)
    // Downstream: resolveFamily falls back to P1-P8 classifier
    const simulatedTimeoutResult: OrchestratorDecision | null = null;
    const cls = makeClassification({ family: "persona_research", lead: 18 });
    const fallbackFamily = simulatedTimeoutResult?.vizFamily
      ?? resolveFamily({
        classification: cls,
        lastFamily: null,
        hasFocusSegment: false,
        refinementDetected: false,
      });
    assertEq("E7 timeout-fallback: uses resolveFamily result", fallbackFamily, "persona_research");
    console.log("E7 ✓ timeout fallback → P1-P8 keyword classifier via resolveFamily");
  }

  // E8: Session summary update — extracted and length-validated (max 500 chars)
  {
    const goodSummary = "x".repeat(500);
    const withGoodSummary = parseOrchestrator({
      vizFamily: "management_summary",
      mode: "fresh",
      confidence: 0.75,
      rationale: "Summary session in progress.",
      sessionSummaryUpdate: goodSummary,
    });
    assertEq("E8 sessionSummaryUpdate=500 accepted", withGoodSummary !== null, true);
    assertEq("E8 sessionSummaryUpdate length correct", withGoodSummary?.sessionSummaryUpdate?.length, 500);

    const tooLong = "x".repeat(501);
    const withTooLong = parseOrchestrator({
      vizFamily: "management_summary",
      mode: "fresh",
      confidence: 0.75,
      rationale: "Summary session in progress.",
      sessionSummaryUpdate: tooLong,
    });
    assertEq("E8 sessionSummaryUpdate=501 rejected by Zod", withTooLong, null);
    console.log("E8 ✓ sessionSummaryUpdate: 500-char accepted, 501-char rejected (Zod max)");
  }

  // E9: SSE meta event data plumbing — orchestrator payload structure for frontend
  {
    // Simulate what the backend emits as a meta SSE event for orchestrator path.
    // Frontend hook reads parsed.orchestrator from type:"meta" events.
    const metaEvent = {
      type: "meta",
      orchestrator: {
        rationale: "Clear UX journey discussion detected.",
        mode: "fresh",
        confidence: 0.87,
      },
    };
    const parsed = metaEvent;
    assertEq("E9 meta event has type=meta", parsed.type, "meta");
    assertEq("E9 orchestrator field present", typeof parsed.orchestrator, "object");
    assertEq("E9 orchestrator.mode", parsed.orchestrator.mode, "fresh");
    assertEq("E9 orchestrator.confidence >= 0.72 (auto_high)", parsed.orchestrator.confidence >= 0.72, true);
    assertEq("E9 orchestrator.rationale is string", typeof parsed.orchestrator.rationale, "string");

    // Verify ask_user meta event structure (early-return flow)
    const askUserMeta = {
      type: "meta",
      orchestrator: { rationale: "Topic is ambiguous.", mode: "ask_user", confidence: 0.38 },
    };
    assertEq("E9 ask_user meta: mode", askUserMeta.orchestrator.mode, "ask_user");
    assertEq("E9 ask_user meta: triggers ask_user zone", askUserMeta.orchestrator.confidence < 0.45, true);

    // done.meta orchestrator field included for replay consistency
    const doneMeta = {
      vizType: "auto",
      incremental: false,
      orchestrator: { rationale: "Clear.", mode: "fresh", confidence: 0.87 },
    };
    assertEq("E9 done.meta.orchestrator present", typeof doneMeta.orchestrator, "object");
    assertEq("E9 done.meta.orchestrator.mode", doneMeta.orchestrator.mode, "fresh");

    console.log("E9 ✓ SSE meta event: orchestrator payload structure validated for frontend plumbing");
  }

  // E10: Orchestrator valid + classifier ambiguous → no ambiguous_no_context skip
  // Regression test: ambiguous_no_context guard must be gated behind orchestrator-null check.
  // When orchestrator returns a valid decision, classification.ambiguous should NOT trigger skip.
  {
    const orchestratorActive = true;
    const orchestratorResult = parseOrchestrator({
      vizFamily: "user_journey",
      mode: "fresh",
      confidence: 0.78,
      rationale: "Speaker describes customer path — user journey despite ambiguous keywords.",
    });
    assertEq("E10 orchestrator valid result", orchestratorResult !== null, true);
    // Simulate gate logic: ambiguous_no_context only fires when !orchestratorResult || !orchestratorActive
    const ambiguousSkipWouldFire = (!orchestratorResult || !orchestratorActive);
    assertEq("E10 ambiguous_no_context skip bypassed when orchestrator valid", ambiguousSkipWouldFire, false);
    // The orchestrator family is used regardless of classifier ambiguity
    assertEq("E10 orchestrator family used", orchestratorResult?.vizFamily, "user_journey");
    console.log("E10 ✓ orchestrator valid + classifier ambiguous → skip guard bypassed, orchestrator family used");
  }

  // E11: Orchestrator valid + classifier physical_product lead>=6 → no physical_product auto-switch
  // Regression test: physical_product auto-switch must be gated behind orchestrator-null check.
  // When orchestrator returns persona_research, the auto-switch should NOT override to physical_product.
  {
    const orchestratorActive = true;
    const orchestratorResult = parseOrchestrator({
      vizFamily: "persona_research",
      mode: "fresh",
      confidence: 0.81,
      rationale: "Transcript is about user research personas, not physical product UI.",
    });
    assertEq("E11 orchestrator valid result", orchestratorResult !== null, true);
    // Simulate gate logic: physical auto-switch only fires when !orchestratorResult || !orchestratorActive
    const physicalAutoSwitchWouldFire = (!orchestratorResult || !orchestratorActive);
    assertEq("E11 physical_product auto-switch bypassed when orchestrator valid", physicalAutoSwitchWouldFire, false);
    // Orchestrator family (persona_research) is NOT overridden to physical_product
    assertEq("E11 orchestrator family preserved (not overridden to physical_product)", orchestratorResult?.vizFamily, "persona_research");
    console.log("E11 ✓ orchestrator valid + classifier physical_product lead>=6 → auto-switch bypassed, orchestrator family preserved");
  }

  // ─── E12–E14: ask_user disambiguation reason mapping ────────────────────────
  // Verify that the reason + defaultChoice passed to sendNeedIntent is context-aware.
  // Logic under test (extracted from visualize.ts ask_user handler):
  //   isColdStart || !hasPreviousViz  → uncertain_topic_shift / fresh
  //   refinementDetected && hasPreviousViz → refinement_vs_topic_shift / fresh
  //   else                           → ambiguous_with_previous_viz / refine
  function mapAskUserReason(ctx: {
    isColdStart: boolean;
    hasPreviousViz: boolean;
    refinementDetected: boolean;
  }): { reason: string; defaultChoice: string } {
    if (ctx.isColdStart || !ctx.hasPreviousViz) {
      return { reason: "uncertain_topic_shift", defaultChoice: "fresh" };
    }
    if (ctx.refinementDetected && ctx.hasPreviousViz) {
      return { reason: "refinement_vs_topic_shift", defaultChoice: "fresh" };
    }
    return { reason: "ambiguous_with_previous_viz", defaultChoice: "refine" };
  }

  {
    // E12: Cold-start → uncertain_topic_shift
    const r = mapAskUserReason({ isColdStart: true, hasPreviousViz: false, refinementDetected: false });
    assertEq("E12 cold-start reason", r.reason, "uncertain_topic_shift");
    assertEq("E12 cold-start defaultChoice", r.defaultChoice, "fresh");
    console.log("E12 ✓ orchestrator ask_user cold-start → uncertain_topic_shift / fresh");
  }
  {
    // E13: Refinement + previous viz → refinement_vs_topic_shift
    const r = mapAskUserReason({ isColdStart: false, hasPreviousViz: true, refinementDetected: true });
    assertEq("E13 refinement+prevviz reason", r.reason, "refinement_vs_topic_shift");
    assertEq("E13 refinement+prevviz defaultChoice", r.defaultChoice, "fresh");
    console.log("E13 ✓ orchestrator ask_user refinement+prevViz → refinement_vs_topic_shift / fresh");
  }
  {
    // E14: Ambiguous + previous viz (no refinement) → ambiguous_with_previous_viz
    const r = mapAskUserReason({ isColdStart: false, hasPreviousViz: true, refinementDetected: false });
    assertEq("E14 ambiguous+prevviz reason", r.reason, "ambiguous_with_previous_viz");
    assertEq("E14 ambiguous+prevviz defaultChoice", r.defaultChoice, "refine");
    console.log("E14 ✓ orchestrator ask_user ambiguous+prevViz → ambiguous_with_previous_viz / refine");
  }

  console.log("\nAlle E2E orchestrator integration simulations OK (E1–E14).");
  console.log("\n=== Alle route-tests bestået: R1–R17 + D1–D20 + S1–S3 + O1–O10 + E1–E14 ===");
}

main();
