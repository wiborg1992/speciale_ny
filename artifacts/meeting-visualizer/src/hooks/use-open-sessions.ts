import { useLocalStorage } from "./use-local-storage";

export interface OpenSession {
  roomId: string;
  title: string;
}

const MAX_OPEN_SESSIONS = 10;

export function useOpenSessions() {
  const [sessions, setSessions] = useLocalStorage<OpenSession[]>(
    "meetingVisualizer_openSessions",
    [],
  );

  function addSession(roomId: string, title = "") {
    setSessions((prev: OpenSession[]) => {
      if (prev.some((s) => s.roomId === roomId)) return prev;
      return [...prev, { roomId, title }].slice(-MAX_OPEN_SESSIONS);
    });
  }

  function removeSession(roomId: string) {
    setSessions((prev: OpenSession[]) =>
      prev.filter((s) => s.roomId !== roomId),
    );
  }

  function updateTitle(roomId: string, title: string) {
    setSessions((prev: OpenSession[]) =>
      prev.map((s) => (s.roomId === roomId ? { ...s, title } : s)),
    );
  }

  return { sessions, addSession, removeSession, updateTitle };
}
