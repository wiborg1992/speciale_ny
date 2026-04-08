/**
 * Let møde-"essens" til prompten: kort hukommelse fra sidste viz + klassifikation,
 * uden at erstatte aktuelt fokus (tail) eller fuldt transskript som sekundær reference.
 */

import {
  VIZ_FAMILY_LABEL,
  type ClassificationResult,
  type VizFamily,
} from "./classifier.js";

export type MeetingEssenceForPrompt = {
  lastVizTitle: string | null;
  lastFamilyLabel: string | null;
  bullets: string[];
};

const MAX_TITLE_FROM_HTML = 84;
const MAX_BULLETS = 6;

/** Kendte Grundfos-produktnavne og centrale termer der er værd at fange i essens. */
const KNOWN_PRODUCT_TERMS = [
  "comfort go", "comfort ta", "magna3", "magna", "scala2", "scala",
  "lc 231", "cu 352", "upm3", "upm", "cra", "nis2", "iec 62443", "iso 27001",
  "bacnet", "modbus", "profinet", "opc-ua", "mqtt",
  "cornforz go", "grundfos go", "face id",
  "hmi", "scada", "plc",
];

const DA_EN_STOPWORDS = new Set([
  "og", "er", "det", "at", "en", "af", "til", "i", "på", "med", "den", "der",
  "vi", "de", "du", "har", "hvad", "som", "kan", "ikke", "eller", "men", "et",
  "for", "fra", "om", "så", "nu", "her", "var", "jeg", "man", "se", "vil", "han",
  "the", "and", "is", "to", "of", "a", "in", "we", "that", "it", "this", "be",
  "have", "for", "on", "with", "so", "are", "as", "from", "or", "an", "our",
  "they", "if", "what", "now", "here", "how", "but", "also", "all", "can",
  "need", "going", "look", "think", "going", "gonna", "alright", "okay", "yeah",
  "actually", "very", "just", "like", "then", "about", "some", "more", "will",
  "want", "when", "way", "one", "out", "into", "there", "been", "would",
]);

/**
 * Uddrager produktnavne og top-nøgleord fra de seneste ~400 ord af transcriptet.
 * Bruges til at berige essence-bullets med faktisk mødeindhold.
 */
function extractContentFromTail(transcript: string): {
  products: string[];
  topKeywords: string[];
  numbersSpecs: string[];
} {
  const words = transcript.split(/\s+/).filter(Boolean);
  const tail = words.slice(-400).join(" ").toLowerCase();

  // 1) Kendte produktnavne
  const products: string[] = [];
  for (const term of KNOWN_PRODUCT_TERMS) {
    if (tail.includes(term) && !products.includes(term)) {
      products.push(term);
    }
  }

  // 2) Top-frekvens indholds-ord (substantiver der ikke er stopwords)
  const freq = new Map<string, number>();
  for (const w of tail.split(/\s+/)) {
    const clean = w.replace(/[^a-zæøåA-ZÆØÅ0-9-]/g, "").toLowerCase();
    if (clean.length < 4) continue;
    if (DA_EN_STOPWORDS.has(clean)) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }
  const topKeywords = [...freq.entries()]
    .filter(([, c]) => c >= 2) // min. 2 forekomster
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([w]) => w);

  // 3) Nøgletal og specs (flow, pressure, temperature, %)
  const specPattern = /\d+(?:[.,]\d+)?\s*(?:m³\/h|bar|°[cCf]|rpm|kw|%|hz|db)/gi;
  const numbersSpecs = [...new Set(tail.match(specPattern) ?? [])].slice(0, 3);

  return { products, topKeywords, numbersSpecs };
}

export function extractVizTitleFromHtml(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]?.trim()) return h1[1].trim().slice(0, MAX_TITLE_FROM_HTML);
  const h2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (h2?.[1]?.trim()) return h2[1].trim().slice(0, MAX_TITLE_FROM_HTML);
  return null;
}

/**
 * 4–6 korte bullets til næste requests mødehukommelse (opdateres efter hver succesfuld viz).
 * transcript: den normaliserede tekst (bruges til indholds-ekstraktion).
 */
export function computeEssenceBullets(
  classification: ClassificationResult | null,
  resolvedFamily: VizFamily | null,
  transcript?: string | null,
): string[] {
  const bullets: string[] = [];
  const fam = resolvedFamily ?? classification?.family ?? null;

  // Bullet 1: hvilken viz-type
  if (fam && VIZ_FAMILY_LABEL[fam]) {
    bullets.push(`Seneste viz-type: ${VIZ_FAMILY_LABEL[fam]}`);
  }

  // Bullet 2: næststærke signal (kun hvis det er forskelligt og relevant)
  const scores = classification?.scores;
  if (scores && scores.length > 1) {
    const s = scores[1];
    if (s && s.score > 0 && s.label && s.id !== fam) {
      bullets.push(`Næststærkt signal: ${s.label} (score ${s.score})`);
    }
  }

  // Bullet 3+4: indholds-ekstraktion fra transcript-tail
  if (transcript) {
    const { products, topKeywords, numbersSpecs } = extractContentFromTail(transcript);

    if (products.length > 0) {
      bullets.push(`Produkter/systemer nævnt: ${products.slice(0, 3).join(", ")}`);
    }

    if (topKeywords.length > 0) {
      bullets.push(`Hyppigste termer: ${topKeywords.join(", ")}`);
    }

    if (numbersSpecs.length > 0) {
      bullets.push(`Nøgletal/specs nævnt: ${numbersSpecs.join(", ")}`);
    }
  }

  return bullets.slice(0, MAX_BULLETS);
}

export function roomToMeetingEssencePayload(room: {
  lastVizTitle: string | null;
  lastFamily: string | null;
  meetingEssenceBullets: string[];
}): MeetingEssenceForPrompt | null {
  const fam = room.lastFamily as VizFamily | null;
  const label =
    fam && VIZ_FAMILY_LABEL[fam] ? VIZ_FAMILY_LABEL[fam] : room.lastFamily;
  const hasAnything =
    !!room.lastVizTitle ||
    room.meetingEssenceBullets.length > 0 ||
    !!label?.trim();
  if (!hasAnything) return null;
  return {
    lastVizTitle: room.lastVizTitle,
    lastFamilyLabel: label,
    bullets: room.meetingEssenceBullets.slice(0, MAX_BULLETS),
  };
}
