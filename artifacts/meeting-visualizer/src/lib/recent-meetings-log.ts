/** Lokalt “møde log” på login — supplerer API når DB er tom eller offline. */

const LS_KEY = "meetingVisualizer_recentMeetingsLog";
const MAX_ENTRIES = 24;

export interface LocalMeetingLogEntry {
  roomId: string;
  title: string;
  visitedAt: string;
}

function readRaw(): LocalMeetingLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is LocalMeetingLogEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as LocalMeetingLogEntry).roomId === "string" &&
          (e as LocalMeetingLogEntry).roomId.length >= 3
      )
      .map((e) => ({
        roomId: (e.roomId || "").toUpperCase().slice(0, 8),
        title: typeof e.title === "string" ? e.title : "",
        visitedAt: typeof e.visitedAt === "string" ? e.visitedAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function getLocalMeetingLog(): LocalMeetingLogEntry[] {
  return readRaw().sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()
  );
}

/** Kald fra Room når brugeren er i et rum (bevarer titel når den findes). */
/** Fjern ét besøg fra den lokale log (fx efter slet på forsiden). */
export function removeMeetingFromLocalLog(roomId: string): void {
  if (typeof window === "undefined" || !roomId || roomId.length < 3) return;
  const id = roomId.toUpperCase().slice(0, 8);
  const list = readRaw().filter((e) => e.roomId !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export function clearMeetingLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
}

export function recordMeetingVisit(roomId: string, title: string): void {
  if (typeof window === "undefined" || !roomId || roomId.length < 3) return;
  const id = roomId.toUpperCase().slice(0, 8);
  const now = new Date().toISOString();
  const list = readRaw().filter((e) => e.roomId !== id);
  const prev = readRaw().find((e) => e.roomId === id);
  const mergedTitle = (title && title.trim()) || prev?.title || "";
  list.unshift({ roomId: id, title: mergedTitle, visitedAt: now });
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}
