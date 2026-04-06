const SPEAKER_COLORS = [
  {
    bg: "bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-300",
    dot: "bg-blue-400",
  },
  {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  {
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  {
    bg: "bg-violet-500/15",
    border: "border-violet-500/30",
    text: "text-violet-300",
    dot: "bg-violet-400",
  },
  {
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    text: "text-rose-300",
    dot: "bg-rose-400",
  },
  {
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/30",
    text: "text-cyan-300",
    dot: "bg-cyan-400",
  },
  {
    bg: "bg-orange-500/15",
    border: "border-orange-500/30",
    text: "text-orange-300",
    dot: "bg-orange-400",
  },
  {
    bg: "bg-pink-500/15",
    border: "border-pink-500/30",
    text: "text-pink-300",
    dot: "bg-pink-400",
  },
  {
    bg: "bg-lime-500/15",
    border: "border-lime-500/30",
    text: "text-lime-300",
    dot: "bg-lime-400",
  },
  {
    bg: "bg-indigo-500/15",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    dot: "bg-indigo-400",
  },
] as const;

export type SpeakerColorSet = (typeof SPEAKER_COLORS)[number];

export function getSpeakerColor(
  speakerName: string,
  speakerMap: Map<string, number>,
): SpeakerColorSet {
  if (!speakerMap.has(speakerName)) {
    speakerMap.set(speakerName, speakerMap.size);
  }
  const idx = speakerMap.get(speakerName)! % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[idx];
}
