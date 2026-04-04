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
const MAX_TOPIC_CHARS = 220;
const MAX_BULLETS = 5;

export function extractVizTitleFromHtml(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]?.trim()) return h1[1].trim().slice(0, MAX_TITLE_FROM_HTML);
  const h2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (h2?.[1]?.trim()) return h2[1].trim().slice(0, MAX_TITLE_FROM_HTML);
  return null;
}

/**
 * 3–5 korte bullets til næste requests mødehukommelse (opdateres efter hver succesfuld viz).
 */
export function computeEssenceBullets(
  classification: ClassificationResult | null,
  resolvedFamily: VizFamily | null,
): string[] {
  const bullets: string[] = [];
  const fam = resolvedFamily ?? classification?.family ?? null;
  if (fam && VIZ_FAMILY_LABEL[fam]) {
    bullets.push(`Denne viz var: ${VIZ_FAMILY_LABEL[fam]}`);
  }
  if (classification?.topic?.trim()) {
    const t = classification.topic.trim().slice(0, MAX_TOPIC_CHARS);
    bullets.push(`Klassifikator opsummerede: ${t}`);
  }
  const scores = classification?.scores;
  if (scores && scores.length > 1) {
    const s = scores[1];
    if (s && s.score > 0 && s.label) {
      bullets.push(`Næststærke spor: ${s.label} (${s.score})`);
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
