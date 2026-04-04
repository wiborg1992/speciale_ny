/**
 * Isolerede tests for resolveFamily() — P1–P8 decision order (plan v3).
 * Tester IKKE klassifikatoren (se run-fictive-classifier-tests.ts).
 * Ingen network, ingen HTTP, ingen room-state.
 *
 * Run: pnpm --filter @workspace/api-server run test:fictive-route
 */

import { resolveFamily, checkDisambiguationGate } from "../routes/visualize.js";
import { CLASSIFY_SWITCH_LEAD } from "../lib/classifier.js";
import type { ClassificationResult, VizFamily } from "../lib/classifier.js";

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

  // R8: Strategi A — høj lead UDEN hardOverride bryder ikke refinement-lås
  assertEq(
    "R8 Strategi A: high lead without hardOverride does NOT break refinement lock",
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
    "workflow_process",
  );
  console.log(
    "R8 ✓ Strategi A: lead=20 uden hardOverride → holder workflow_process (refinement-lås)",
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
    "\nAlle resolveFamily route-tests OK (R1–R10, P1–P8 decision order, Strategi A verificeret).",
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

  // D2: Ingen konflikt — refinement + svag klassifikation (lead under tærskel) → ingen gate
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
    assertEq("D2 needsIntent=false (lead under tærskel)", g.needsIntent, false);
    console.log(`D2 ✓ ingen gate: lead=${CLASSIFY_SWITCH_LEAD - 1} < tærskel`);
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

  console.log(
    "\nAlle disambiguation gate-tests OK (D1–D15, alle betingelser og grænseværdier verificeret).",
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

  console.log("\nAlle edge case tests OK (R11–R14).");
  console.log("\n=== Alle route-tests bestået: R1–R14 + D1–D15 ===");
}

main();
