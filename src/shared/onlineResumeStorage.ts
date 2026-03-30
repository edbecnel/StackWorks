/** Shared helpers for `lasca.online.resume.*` localStorage records (online rejoin). */

export function normalizeOnlineResumeServerUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

export function normalizeOnlineResumeRoomId(raw: string): string {
  return (raw || "").trim();
}

export function clearStoredOnlineResumeRecords(serverUrl: string, roomId: string): void {
  if (typeof window === "undefined") return;

  const normalizedServerUrl = normalizeOnlineResumeServerUrl(serverUrl);
  const normalizedRoomId = normalizeOnlineResumeRoomId(roomId);
  if (!normalizedServerUrl || !normalizedRoomId) return;

  const keysToRemove = new Set<string>([
    `lasca.online.resume.${encodeURIComponent(normalizedServerUrl)}.${encodeURIComponent(normalizedRoomId)}`,
    `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(roomId)}`,
    `lasca.online.resume.${encodeURIComponent(`${normalizedServerUrl}/`)}.${encodeURIComponent(normalizedRoomId)}`,
  ]);

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith("lasca.online.resume.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") continue;
      const recordServerUrl = normalizeOnlineResumeServerUrl(typeof parsed.serverUrl === "string" ? parsed.serverUrl : "");
      const recordRoomId = normalizeOnlineResumeRoomId(typeof parsed.roomId === "string" ? parsed.roomId : "");
      if (recordServerUrl === normalizedServerUrl && recordRoomId === normalizedRoomId) {
        keysToRemove.add(key);
      }
    }
  } catch {
    // ignore
  }

  for (const key of keysToRemove) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
