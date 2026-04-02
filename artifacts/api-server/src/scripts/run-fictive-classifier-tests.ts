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
    console.error(`FAIL: ${name}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
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

function runThroughPipeline(raw: string): ReturnType<typeof classifyVisualizationIntent> {
  const normalized = normalizeTranscript(raw);
  return classifyVisualizationIntent(normalized, "gabriel");
}

function runGrundfos(
  fullRaw: string,
  latestChunkRaw: string | null,
): ReturnType<typeof classifyVisualizationIntent> {
  const normalized = normalizeTranscript(fullRaw);
  const latestNorm = latestChunkRaw ? normalizeTranscript(latestChunkRaw) : null;
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

  console.log("Fiktive classifier-tests (Gabriel-workspace, mange [Taler]: segmenter)\n");
  console.log(`Transskript-længde (kun krop): ${describeVolume(prefix.length)}`);

  const t1Raw =
    prefix +
    segment("Gabriel", "Kan vi få det i excel arket med pivottabel til KPI og marketing dashboard?");

  const t1 = runThroughPipeline(t1Raw);
  console.log(
    `\n1) Lang HMI-diskussion → sidste ytring: Excel/pivot/dashboard\n   family=${t1.family} ambiguous=${t1.ambiguous}`
  );
  assertEq("case1 family", t1.family, "management_summary");

  const t2Raw =
    prefix +
    segment("Gabriel", "Lad os skifte emne — jeg vil gerne starte forfra med noget helt andet.");

  const t2 = runThroughPipeline(t2Raw);
  console.log(`\n2) Samme lange krop → sidste: skifte emne / forfra\n   family=${t2.family}`);
  assertEq("case2 family", t2.family, "generic");

  const excelHeavy =
    buildLongMeeting(
      "Her er tallene fra kampagnen: reach, impressions og CTR i vores data dashboard og CSV-eksport til regneark",
      approxWorkshopChars
    ) + segment("Klaus", "Nu laver vi et interface med navigationstab og operator screen til alarm list.");

  const t3 = runThroughPipeline(excelHeavy);
  console.log(`\n3) Lang data/excel-krop → sidste: interface/HMI\n   family=${t3.family} topic=${t3.topic}`);
  assertEq("case3 family", t3.family, "hmi_interface");

  const t4Raw =
    prefix +
    segment("Gabriel", "Sammenlign de to kolonner i leverandør-scoren og vis fordele og ulemper.");

  const t4 = classifyVisualizationIntent(normalizeTranscript(t4Raw), "gabriel");
  console.log(`\n4) HMI-krop → sidste: sammenlign kolonner\n   family=${t4.family}`);
  assertEq("case4 family", t4.family, "comparison_evaluation");

  // ── Grundfos / fysisk hardware vs journey + workflow (latestChunk som “live” tale) ──
  const longJourneyBody =
    "customer user journey map touchpoints pain points swimlane when the technician arrives at the site PIN code handover to customer CRA compliance problem";
  const prefixGrundfos = buildLongMeeting(longJourneyBody, approxWorkshopChars);

  const physicalPivot =
    "\n[Speaker 1]: And, alright, that leads us to look at the physical hardware in this case, we're going to look at the physical pump and how to design the pump with the normal display and insert button for the PIN code.";
  const t5 = runGrundfos(prefixGrundfos + physicalPivot, physicalPivot.trim());
  console.log(
    `\n5) Lang journey-krop (Grundfos) → latest: physical hardware / pump design\n   family=${t5.family} ambiguous=${t5.ambiguous}`
  );
  assertEq("case5 family (physical after journey)", t5.family, "physical_product");

  const handoverNoise =
    "\n[Speaker 1]: To have a look at the hardware. What we're going to visualize now is the front panel design pin insert section login screen sign in handover to customer European regulation.";
  const t6 = runGrundfos(prefixGrundfos + handoverNoise, handoverNoise.trim());
  console.log(
    `\n6) Samme krop → latest: hardware + front panel (handover-ord i teksten)\n   family=${t6.family} ambiguous=${t6.ambiguous}`
  );
  assertEq("case6 family (hardware vs workflow noise)", t6.family, "physical_product");

  console.log(
    "\nAlle fictive cases OK (klassifikator + normalizer, sidste segment/topic-shift på lang transskript, Grundfos hardware-regression)."
  );
}

main();
