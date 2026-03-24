const AUTH_SESSION_STORAGE_PREFIX = "lasca.auth.session.";
const AUTH_SESSION_USER_STORAGE_PREFIX = "lasca.auth.session.user.";

function normalizeServerBaseUrl(raw: string | null | undefined): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function authSessionStorageKey(serverBaseUrl: string): string | null {
  const normalized = normalizeServerBaseUrl(serverBaseUrl);
  if (!normalized) return null;
  try {
    return `${AUTH_SESSION_STORAGE_PREFIX}${new URL(normalized).origin}`;
  } catch {
    return `${AUTH_SESSION_STORAGE_PREFIX}${normalized}`;
  }
}

function authSessionUserStorageKey(serverBaseUrl: string): string | null {
  const normalized = normalizeServerBaseUrl(serverBaseUrl);
  if (!normalized) return null;
  try {
    return `${AUTH_SESSION_USER_STORAGE_PREFIX}${new URL(normalized).origin}`;
  } catch {
    return `${AUTH_SESSION_USER_STORAGE_PREFIX}${normalized}`;
  }
}

export function readAuthSessionToken(serverBaseUrl: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = authSessionStorageKey(serverBaseUrl ?? "");
    if (!key) return null;
    const token = window.localStorage.getItem(key)?.trim() ?? "";
    return token || null;
  } catch {
    return null;
  }
}

export function writeAuthSessionToken(serverBaseUrl: string | null | undefined, token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const key = authSessionStorageKey(serverBaseUrl ?? "");
    if (!key) return;
    const nextToken = (token || "").trim();
    if (!nextToken) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, nextToken);
  } catch {
    // ignore storage failures
  }
}

export function clearAuthSessionToken(serverBaseUrl: string | null | undefined): void {
  writeAuthSessionToken(serverBaseUrl, null);
}

export function readAuthSessionUserId(serverBaseUrl: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = authSessionUserStorageKey(serverBaseUrl ?? "");
    if (!key) return null;
    const userId = window.localStorage.getItem(key)?.trim() ?? "";
    return userId || null;
  } catch {
    return null;
  }
}

export function writeAuthSessionUserId(serverBaseUrl: string | null | undefined, userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const key = authSessionUserStorageKey(serverBaseUrl ?? "");
    if (!key) return;
    const nextUserId = (userId || "").trim();
    if (!nextUserId) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, nextUserId);
  } catch {
    // ignore storage failures
  }
}

export function clearAuthSessionUserId(serverBaseUrl: string | null | undefined): void {
  writeAuthSessionUserId(serverBaseUrl, null);
}

export function persistAuthSessionFromPayload(serverBaseUrl: string | null | undefined, payload: unknown): void {
  const token = typeof (payload as any)?.sessionToken === "string" ? String((payload as any).sessionToken).trim() : "";
  if (!token) return;
  writeAuthSessionToken(serverBaseUrl, token);
}

export function buildSessionAuthFetchInit(serverBaseUrl: string | null | undefined, init?: RequestInit): RequestInit {
  const token = readAuthSessionToken(serverBaseUrl);
  const next: RequestInit = {
    ...(init ?? {}),
    credentials: "include",
  };
  if (!token) return next;

  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  next.headers = Object.fromEntries(headers.entries());
  return next;
}