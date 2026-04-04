/**
 * Offline fictive transcript tests: long multi-speaker workshops (~20–30 min read aloud,
 * approximated by character budget) + last-segment overrides. No network.
 *
 * Run from repo: pnpm --filter @workspace/api-server run test:fictive-classifier
 */

import { classifyVisualizationIntent } from "../lib/classifier.js";
import { normalizeTranscript } from "../lib/normalizer.js";

/** ~130–180 ord/min talt dansk ≈ 650–900 tegn/min; 25 min → ~20k tegn som grov proxy */
const CHARS_PER_MIN_SPOKEN_LOW = 650;
const SPEAKERS = ["Jesper", "Klaus", "Maria", "Anna"] as const;

function assertEq<T>(name: string, actual: T, expected: T): void {
  if (actual !== expected) {
    console.error(
      `FAIL: ${name}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`,
    );
    process.exit(1);
  }
}

function segment(speaker: string, line: string): string {
  return `\n[${speaker}]: ${line.trim()}`;
}

/** Bygger et langt transskript med skiftende talere indtil ca. minChars. */
function buildLongMeeting(bodyLine: string, minChars: number): string {
  let out = "";
  let i = 0;
  while (out.length < minChars) {
    const sp = SPEAKERS[i % SPEAKERS.length];
    out += segment(sp, `${bodyLine} (tur ${i}).`);
    i++;
  }
  return out;
}

function runThroughPipeline(
  raw: string,
): ReturnType<typeof classifyVisualizationIntent> {
  const normalized = normalizeTranscript(raw);
  return classifyVisualizationIntent(normalized, "gabriel");
}

function runGrundfos(
  fullRaw: string,
  latestChunkRaw: string | null,
): ReturnType<typeof classifyVisualizationIntent> {
  const normalized = normalizeTranscript(fullRaw);
  const latestNorm = latestChunkRaw
    ? normalizeTranscript(latestChunkRaw)
    : null;
  return classifyVisualizationIntent(normalized, "grundfos", latestNorm);
}

function describeVolume(chars: number): string {
  const minsLow = (chars / CHARS_PER_MIN_SPOKEN_LOW).toFixed(1);
  return `${chars} tegn (~≥ ${minsLow} min talt tekst, grov nedre grænse)`;
}

function main(): void {
  const longHmiBody =
    "Vi gennemgår alarmvisning og navigationstab i SCADA med live værdier fra PLC, synoptisk procesbillede og betjeningspanel på touchskærmen";

  // Sikrer at vi er over klassifikatorens 12k-tail, så tidligere emne ligger uden for vinduet
  const approxWorkshopChars = 28_000;
  const prefix = buildLongMeeting(longHmiBody, approxWorkshopChars);

  console.log(
    "Fiktive classifier-tests (Gabriel-workspace, mange [Taler]: segmenter)\n",
  );
  console.log(
    `Transskript-længde (kun krop): ${describeVolume(prefix.length)}`,
  );

  const t1Raw =
    prefix +
    segment(
      "Gabriel",
      "Kan vi få det i excel arket med pivottabel til KPI og marketing dashboard?",
    );

  const t1 = runThroughPipeline(t1Raw);
  console.log(
    `\n1) Lang HMI-diskussion → sidste ytring: Excel/pivot/dashboard\n   family=${t1.family} ambiguous=${t1.ambiguous}`,
  );
  assertEq("case1 family", t1.family, "management_summary");

  const t2Raw =
    prefix +
    segment(
      "Gabriel",
      "Lad os skifte emne — jeg vil gerne starte forfra med noget helt andet.",
    );

  const t2 = runThroughPipeline(t2Raw);
  console.log(
    `\n2) Samme lange krop → sidste: skifte emne / forfra\n   family=${t2.family}`,
  );
  assertEq("case2 family", t2.family, "generic");

  const excelHeavy =
    buildLongMeeting(
      "Her er tallene fra kampagnen: reach, impressions og CTR i vores data dashboard og CSV-eksport til regneark",
      approxWorkshopChars,
    ) +
    segment(
      "Klaus",
      "Nu laver vi et interface med navigationstab og operator screen til alarm list.",
    );

  const t3 = runThroughPipeline(excelHeavy);
  console.log(
    `\n3) Lang data/excel-krop → sidste: interface/HMI\n   family=${t3.family} topic=${t3.topic}`,
  );
  assertEq("case3 family", t3.family, "hmi_interface");

  const t4Raw =
    prefix +
    segment(
      "Gabriel",
      "Sammenlign de to kolonner i leverandør-scoren og vis fordele og ulemper.",
    );

  const t4 = classifyVisualizationIntent(normalizeTranscript(t4Raw), "gabriel");
  console.log(
    `\n4) HMI-krop → sidste: sammenlign kolonner\n   family=${t4.family}`,
  );
  assertEq("case4 family", t4.family, "comparison_evaluation");

  // ── Grundfos / fysisk hardware vs journey + workflow (latestChunk som “live” tale) ──
  const longJourneyBody =
    "customer user journey map touchpoints pain points swimlane when the technician arrives at the site PIN code handover to customer CRA compliance problem";
  const prefixGrundfos = buildLongMeeting(longJourneyBody, approxWorkshopChars);

  const physicalPivot =
    "\n[Speaker 1]: And, alright, that leads us to look at the physical hardware in this case, we're going to look at the physical pump and how to design the pump with the normal display and insert button for the PIN code.";
  const t5 = runGrundfos(prefixGrundfos + physicalPivot, physicalPivot.trim());
  console.log(
    `\n5) Lang journey-krop (Grundfos) → latest: physical hardware / pump design\n   family=${t5.family} ambiguous=${t5.ambiguous}`,
  );
  assertEq(
    "case5 family (physical after journey)",
    t5.family,
    "physical_product",
  );

  const handoverNoise =
    "\n[Speaker 1]: To have a look at the hardware. What we're going to visualize now is the front panel design pin insert section login screen sign in handover to customer European regulation.";
  const t6 = runGrundfos(prefixGrundfos + handoverNoise, handoverNoise.trim());
  console.log(
    `\n6) Samme krop → latest: hardware + front panel (handover-ord i teksten)\n   family=${t6.family} ambiguous=${t6.ambiguous}`,
  );
  assertEq(
    "case6 family (hardware vs workflow noise)",
    t6.family,
    "physical_product",
  );

  // ── Nye kalibreringscases — én pr. familie ──────────────────────────────────

  const neutralBody = "vi har haft et godt møde og diskuteret mange ting i dag";
  const prefixNeutral = buildLongMeeting(neutralBody, approxWorkshopChars);

  // Case 7: workflow_process — swimlanes + beslutningspunkt (ikke user_journey)
  const t7Raw =
    prefixNeutral +
    segment(
      "Klaus",
      "Når ordren kommer fra ERP, starter batchjobbet, QA godkender, og så frigives til laget — vi tegner det med swimlanes og beslutningspunkt ved afvigelse.",
    );
  const t7 = runThroughPipeline(t7Raw);
  console.log(
    `\n7) Neutral krop → ERP/batch/swimlanes/beslutningspunkt\n   family=${t7.family} ambiguous=${t7.ambiguous}`,
  );
  assertEq("case7 family (workflow swimlanes)", t7.family, "workflow_process");

  // Case 8: management_summary — executive resume, risici, kvartal
  const t8Raw =
    prefixNeutral +
    segment(
      "Maria",
      "Executive resume: tre risici, kapitalbehov næste kvartal, beslutning om pilot site A — kort opsummering til styregruppen.",
    );
  const t8 = runThroughPipeline(t8Raw);
  console.log(
    `\n8) Neutral krop → executive resume / kvartal / kapitalbehov\n   family=${t8.family} ambiguous=${t8.ambiguous}`,
  );
  assertEq(
    "case8 family (management summary)",
    t8.family,
    "management_summary",
  );

  // Case 9: generic — eksplicit "ingen diagramtype / saml tankerne"
  const t9Raw =
    prefix +
    segment(
      "Anna",
      "Saml tankerne fra i dag uden fast diagramtype — bare en simpel oversigt med punkter og links.",
    );
  const t9 = runThroughPipeline(t9Raw);
  console.log(
    `\n9) Lang HMI-krop → saml tankerne / ingen diagramtype\n   family=${t9.family} ambiguous=${t9.ambiguous}`,
  );
  assertEq("case9 family (generic override)", t9.family, "generic");

  // Case 10: physical_product — drejeknap, RJ45, front panel hardware
  const t10Raw =
    prefixNeutral +
    segment(
      "Jesper",
      "Front modulet har LED-ringe, drejeknap og RJ45-stik — vi viser front panel hardware på bordet og diskuterer hvad der skal med.",
    );
  const t10 = runThroughPipeline(t10Raw);
  console.log(
    `\n10) Neutral krop → drejeknap / RJ45 / front panel hardware\n   family=${t10.family} ambiguous=${t10.ambiguous}`,
  );
  assertEq(
    "case10 family (physical product connectors)",
    t10.family,
    "physical_product",
  );

  // Case 11: requirements_matrix — FR-12, IEC62443, sporbarhedsmatrix
  const t11Raw =
    prefixNeutral +
    segment(
      "Klaus",
      "FR-12 spores til IEC62443 og politik PL-08 — sporbarhed og status pr. krav i traceability matrix.",
    );
  const t11 = runThroughPipeline(t11Raw);
  console.log(
    `\n11) Neutral krop → FR-12 / IEC62443 / sporbarhed\n   family=${t11.family} ambiguous=${t11.ambiguous}`,
  );
  assertEq(
    "case11 family (requirements traceability)",
    t11.family,
    "requirements_matrix",
  );

  // Case 12: user_journey — touchpoints + eskaleringsfølelser (ikke service_blueprint)
  // Neutral krop + ét workflow-segment langt tilbage, derefter klart journey-segment.
  // Tester at "journey-map + touchpoints + eskaleres" vinder over en enkelt workflow-mention.
  const t12Raw =
    prefixNeutral +
    segment(
      "Klaus",
      "Vi kørte det som et batchjob med godkendelsesflow og QA approval.",
    ) +
    segment(
      "Maria",
      "Fra operatøren opdager en alarm, til den eskaleres til vedligehold — journey-map med touchpoints og følelser langs rejsen.",
    );
  const t12 = runThroughPipeline(t12Raw);
  console.log(
    `\n12) Neutral krop + workflow-segment → journey-map / touchpoints / eskaleres sidst\n   family=${t12.family} ambiguous=${t12.ambiguous}`,
  );
  assertEq(
    "case12 family (user journey vs workflow)",
    t12.family,
    "user_journey",
  );

  // Case 13: comparison_evaluation — vendor A vs B, TCO, scorekort
  const t13Raw =
    prefixNeutral +
    segment(
      "Anna",
      "Vendor A vs B: latency, TCO og integrationsmodenhed — scorekort med vægtning og fordele og ulemper.",
    );
  const t13 = runThroughPipeline(t13Raw);
  console.log(
    `\n13) Neutral krop → vendor comparison / TCO / scorekort\n   family=${t13.family} ambiguous=${t13.ambiguous}`,
  );
  assertEq(
    "case13 family (vendor comparison)",
    t13.family,
    "comparison_evaluation",
  );

  // Case 14: design_system — design tokens, datagrid, typografi, ensretning på tværs af web og HMI
  const t14Raw =
    prefix + // lang HMI-krop
    segment(
      "Klaus",
      "Design tokens for spacing, typografi, farver, knapper og datagrid — ensret web og HMI med fælles komponentbibliotek.",
    );
  const t14 = runThroughPipeline(t14Raw);
  console.log(
    `\n14) Lang HMI-krop → design tokens / datagrid / ensret web og HMI\n   family=${t14.family} ambiguous=${t14.ambiguous}`,
  );
  assertEq("case14 family (design system vs hmi)", t14.family, "design_system");

  // Case 15: persona_research — primær persona, mål, frustrationer, tillid
  const longJourneyBody2 =
    "user journey map customer journey touchpoints pain points storyboard when the user arrives experience map emotion curve";
  const prefixJourney2 = buildLongMeeting(
    longJourneyBody2,
    approxWorkshopChars,
  );
  const t15Raw =
    prefixJourney2 +
    segment(
      "Maria",
      "Primær persona 'Nattekontrolløren': mål, frustrationer, værktøjer og tillid til alarmprioritering — lad os definere hvem brugeren er.",
    );
  const t15 = runThroughPipeline(t15Raw);
  console.log(
    `\n15) Lang journey-krop → primær persona / mål / frustrationer\n   family=${t15.family} ambiguous=${t15.ambiguous}`,
  );
  assertEq(
    "case15 family (persona vs user_journey)",
    t15.family,
    "persona_research",
  );

  // Case 16: service_blueprint — supportlinje, tier 2, backstage, spare parts
  // Neutral krop + service blueprint-terminologi i sidste segment.
  const t16Raw =
    prefixNeutral +
    segment(
      "Jesper",
      "Supportlinje, tier 2 tekniker backstage, spare parts og reservedele — frontstage og backstage på linje i service blueprint.",
    );
  const t16 = runThroughPipeline(t16Raw);
  console.log(
    `\n16) Neutral krop → supportlinje / tier 2 / backstage / spare parts\n   family=${t16.family} ambiguous=${t16.ambiguous}`,
  );
  assertEq(
    "case16 family (service blueprint)",
    t16.family,
    "service_blueprint",
  );

  console.log(
    "\nAlle fictive cases OK (klassifikator + normalizer, sidste segment/topic-shift på lang transskript, Grundfos hardware-regression, nye kalibreringscases 7-16).",
  );
}

main();
