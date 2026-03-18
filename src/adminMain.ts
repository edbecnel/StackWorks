import type { GetLobbyResponse, LobbyRoomSummary, PlayerColor } from "./shared/onlineProtocol";
import { createLobbyIdentityChip } from "./ui/lobby/lobbyIdentityChip";

const LS_KEYS = {
  onlineServerUrl: "lasca.online.serverUrl",
  adminToken: "lasca.admin.token",
  rememberToken: "lasca.admin.rememberToken",
  includeFull: "lasca.admin.includeFull",
  lobbyLimit: "lasca.admin.lobbyLimit",
} as const;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeServerUrl(raw: string): string {
  const s = (raw || "").trim();
  return s.replace(/\/+$/, "");
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function writeBool(key: string, v: boolean): void {
  localStorage.setItem(key, v ? "1" : "0");
}

function readInt(key: string, fallback: number, lo: number, hi: number): number {
  const raw = localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), lo, hi);
}

function writeInt(key: string, v: number): void {
  localStorage.setItem(key, String(Math.round(v)));
}

function formatAgeShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function setStatus(text: string, kind: "ok" | "error" | "info" = "info"): void {
  const el = byId<HTMLDivElement>("adminStatus");
  el.textContent = text;
  el.classList.toggle("isOk", kind === "ok");
  el.classList.toggle("isError", kind === "error");
}

function getServerUrl(): string {
  const v = byId<HTMLInputElement>("adminServerUrl").value;
  return normalizeServerUrl(v);
}

function getToken(): string {
  return (byId<HTMLInputElement>("adminToken").value || "").trim();
}

function buildLobbyUrl(serverUrl: string, includeFull: boolean, limit: number): string {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (includeFull) q.set("includeFull", "1");
  return `${serverUrl}/api/lobby?${q.toString()}`;
}

async function fetchLobby(serverUrl: string, includeFull: boolean, limit: number): Promise<LobbyRoomSummary[]> {
  const url = buildLobbyUrl(serverUrl, includeFull, limit);
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = (json && typeof json.error === "string" && json.error) || `${res.status} ${res.statusText}`;
    throw new Error(`Lobby fetch failed: ${err}`);
  }

  const body = json as GetLobbyResponse;
  if (!body || typeof body !== "object") {
    throw new Error("Lobby fetch failed: invalid response");
  }
  if ("error" in (body as any) && typeof (body as any).error === "string") {
    throw new Error(`Lobby fetch failed: ${(body as any).error}`);
  }
  if (!Array.isArray((body as any).rooms)) {
    throw new Error("Lobby fetch failed: invalid response");
  }
  return (body as any).rooms as LobbyRoomSummary[];
}

function roomLabel(room: LobbyRoomSummary): string {
  const visibility = room.visibility === "private" ? "private" : "public";
  const variant = (room.variantId || "?").toString();

  const filledSeats = Array.isArray(room.seatsTaken) ? room.seatsTaken.length : 0;
  const openSeats = Array.isArray(room.seatsOpen) ? room.seatsOpen.length : 0;
  const maxSeats = Math.max(1, filledSeats + openSeats);
  const seats = `${filledSeats}/${maxSeats}`;

  const createdAtMs = typeof room.createdAt === "string" ? Date.parse(room.createdAt) : NaN;
  const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : NaN;
  const age = formatAgeShort(ageMs);

  return `${variant} • ${visibility} • ${seats}${age ? ` • ${age} ago` : ""}`;
}

function roomSub(room: LobbyRoomSummary): string {
  const parts: string[] = [];

  if (typeof room.createdAt === "string") {
    const ms = Date.parse(room.createdAt);
    if (Number.isFinite(ms)) parts.push(new Date(ms).toLocaleString());
  }
  if (room.status === "waiting") parts.push("waiting");
  if (room.status === "in_game") parts.push("in game");
  if (!room.hostIdentity && typeof room.hostDisplayName === "string" && room.hostDisplayName.trim()) {
    parts.push(`host: ${room.hostDisplayName.trim()}`);
  }
  return parts.join(" • ");
}

function renderLobby(rooms: LobbyRoomSummary[]): void {
  const list = byId<HTMLDivElement>("adminLobbyList");
  list.replaceChildren();
  const serverUrl = getServerUrl();

  const createdAtMs = (r: LobbyRoomSummary): number => {
    if (typeof r.createdAt !== "string") return 0;
    const ms = Date.parse(r.createdAt);
    return Number.isFinite(ms) ? ms : 0;
  };

  const sorted = [...rooms].sort((a, b) => createdAtMs(b) - createdAtMs(a));
  for (const room of sorted) {
    const item = document.createElement("div");
    item.className = "lobbyItem";

    const left = document.createElement("div");
    left.className = "lobbyItemLeft";

    const title = document.createElement("div");
    title.className = "lobbyItemTitle mono";
    title.textContent = room.roomId;

    const sub1 = document.createElement("div");
    sub1.className = "lobbyItemSub";
    sub1.textContent = roomLabel(room);

    const identityByColor = room.identityByColor as Partial<Record<PlayerColor, {
      displayName?: string;
      avatarUrl?: string;
      countryCode?: string;
      countryName?: string;
    }>> | undefined;
    const identityRow = document.createElement("div");
    identityRow.className = "lobbyIdentityRow";
    const whiteChip = createLobbyIdentityChip({
      serverUrl,
      seatLabel: "White",
      identity: identityByColor?.W,
      color: "W",
    });
    const blackChip = createLobbyIdentityChip({
      serverUrl,
      seatLabel: "Black",
      identity: identityByColor?.B,
      color: "B",
    });
    if (whiteChip) identityRow.appendChild(whiteChip);
    if (blackChip) identityRow.appendChild(blackChip);

    const sub2 = document.createElement("div");
    sub2.className = "lobbyItemSub";
    sub2.textContent = roomSub(room);

    left.append(title, sub1);
    if (identityRow.childElementCount) left.append(identityRow);
    left.append(sub2);

    const right = document.createElement("div");
    right.className = "lobbyItemRight";

    const copyBtn = document.createElement("button");
    copyBtn.className = "panelBtn";
    copyBtn.textContent = "Copy";
    copyBtn.title = "Copy room ID";
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(room.roomId);
        setStatus(`Copied ${room.roomId}`, "ok");
      } catch {
        setStatus("Copy failed (clipboard permission)", "error");
      }
    };

    const delBtn = document.createElement("button");
    delBtn.className = "panelBtn";
    delBtn.textContent = "Delete";
    delBtn.onclick = async () => {
      requestDeleteRoomConfirm(room.roomId, { refreshAfter: true, source: "row" });
    };

    right.append(copyBtn, delBtn);
    item.append(left, right);
    list.append(item);
  }

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "subtle";
    empty.textContent = "No rooms returned.";
    list.append(empty);
  }
}

let pendingDelete: { roomId: string; refreshAfter: boolean; source: "row" | "input" } | null = null;

function setDeleteConfirmVisible(isVisible: boolean): void {
  const bar = document.getElementById("adminDeleteConfirm") as HTMLDivElement | null;
  if (!bar) return;
  bar.hidden = !isVisible;
}

function requestDeleteRoomConfirm(roomIdRaw: string, opts: { refreshAfter: boolean; source: "row" | "input" }): void {
  const roomId = (roomIdRaw || "").trim();
  if (!roomId) {
    setStatus("Enter a Room ID", "error");
    return;
  }

  // Put the roomId into the input so the user sees what will be deleted.
  const elRoomId = document.getElementById("adminDeleteRoomId") as HTMLInputElement | null;
  if (elRoomId) elRoomId.value = roomId;

  pendingDelete = { roomId, refreshAfter: opts.refreshAfter, source: opts.source };

  const text = document.getElementById("adminDeleteConfirmText") as HTMLDivElement | null;
  if (text) text.textContent = `Delete room ${roomId}? This cannot be undone.`;

  setDeleteConfirmVisible(true);
}

async function deleteRoom(roomIdRaw: string, opts: { refreshAfter: boolean; source: "row" | "input" }): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    setStatus("Set Server URL first", "error");
    return;
  }

  const roomId = (roomIdRaw || "").trim();
  if (!roomId) {
    setStatus("Enter a Room ID", "error");
    return;
  }

  const token = getToken();
  if (!token) {
    setStatus("Enter Admin token", "error");
    return;
  }

  setStatus(`Deleting ${roomId}…`, "info");

  const res = await fetch(`${serverUrl}/api/admin/room/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "x-lasca-admin-token": token,
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = (json && typeof json.error === "string" && json.error) || `${res.status} ${res.statusText}`;
    setStatus(`Delete failed: ${err}`, "error");
    return;
  }

  setStatus(`Deleted ${roomId}`, "ok");

  // If delete came from the input, clear it.
  if (opts.source === "input") {
    byId<HTMLInputElement>("adminDeleteRoomId").value = "";
  }

  if (opts.refreshAfter) {
    await refreshLobby();
  }
}

let lastRooms: LobbyRoomSummary[] = [];

async function refreshLobby(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    setStatus("Set Server URL first", "error");
    return;
  }

  const includeFull = byId<HTMLInputElement>("adminIncludeFull").checked;
  const limitRaw = byId<HTMLInputElement>("adminLobbyLimit").value;
  const limit = clamp(Math.round(Number(limitRaw)), 1, 1000);
  byId<HTMLInputElement>("adminLobbyLimit").value = String(limit);
  writeInt(LS_KEYS.lobbyLimit, limit);

  setStatus("Loading lobby…", "info");
  try {
    const rooms = await fetchLobby(serverUrl, includeFull, limit);
    lastRooms = rooms;
    renderLobby(rooms);
    byId<HTMLSpanElement>("adminLobbySummary").textContent = `${rooms.length} rooms`;
    setStatus("Lobby loaded", "ok");
  } catch (e: any) {
    renderLobby([]);
    byId<HTMLSpanElement>("adminLobbySummary").textContent = "—";
    setStatus(e?.message ? String(e.message) : "Lobby load failed", "error");
  }
}

function rerenderLobbyFromCache(): void {
  renderLobby(lastRooms);
  byId<HTMLSpanElement>("adminLobbySummary").textContent = `${lastRooms.length} rooms`;
}

function init(): void {
  const elServerUrl = byId<HTMLInputElement>("adminServerUrl");
  const elToken = byId<HTMLInputElement>("adminToken");
  const elTokenToggle = (document.getElementById("adminTokenToggle") as HTMLButtonElement | null) ?? null;
  const elRemember = byId<HTMLInputElement>("adminRememberToken");
  const elIncludeFull = byId<HTMLInputElement>("adminIncludeFull");
  const elLimit = byId<HTMLInputElement>("adminLobbyLimit");

  const bc: BroadcastChannel | null = (() => {
    try {
      return typeof BroadcastChannel === "function" ? new BroadcastChannel("lasca-admin-config") : null;
    } catch {
      return null;
    }
  })();

  const broadcastServerUrlChanged = (): void => {
    if (!bc) return;
    try {
      bc.postMessage({ type: "serverUrlChanged" });
    } catch {
      // ignore
    }
  };

  const serverUrl = localStorage.getItem(LS_KEYS.onlineServerUrl) || "http://localhost:8788";
  elServerUrl.value = normalizeServerUrl(serverUrl);

  const remember = readBool(LS_KEYS.rememberToken, false);
  elRemember.checked = remember;

  const token = remember ? localStorage.getItem(LS_KEYS.adminToken) : sessionStorage.getItem(LS_KEYS.adminToken);
  if (token) elToken.value = token;

  const syncTokenToggle = (): void => {
    if (!elTokenToggle) return;
    const hidden = (elToken.type || "password") === "password";
    elTokenToggle.textContent = hidden ? "Show" : "Hide";
  };

  // Default to hidden/masked.
  try {
    elToken.type = "password";
  } catch {
    // ignore
  }
  syncTokenToggle();

  elTokenToggle?.addEventListener("click", () => {
    try {
      elToken.type = elToken.type === "password" ? "text" : "password";
    } catch {
      // ignore
    }
    syncTokenToggle();
    // Keep focus on the token field for quick paste/edit.
    try {
      elToken.focus();
      elToken.select();
    } catch {
      // ignore
    }
  });

  elIncludeFull.checked = readBool(LS_KEYS.includeFull, true);
  elLimit.value = String(readInt(LS_KEYS.lobbyLimit, 200, 1, 1000));

  elServerUrl.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineServerUrl, normalizeServerUrl(elServerUrl.value));
    broadcastServerUrlChanged();
  });

  elRemember.addEventListener("change", () => {
    writeBool(LS_KEYS.rememberToken, elRemember.checked);

    const current = (elToken.value || "").trim();
    // Move token between storages.
    localStorage.removeItem(LS_KEYS.adminToken);
    sessionStorage.removeItem(LS_KEYS.adminToken);
    if (!current) return;
    if (elRemember.checked) {
      localStorage.setItem(LS_KEYS.adminToken, current);
    } else {
      sessionStorage.setItem(LS_KEYS.adminToken, current);
    }
  });

  elToken.addEventListener("input", () => {
    const current = (elToken.value || "").trim();
    localStorage.removeItem(LS_KEYS.adminToken);
    sessionStorage.removeItem(LS_KEYS.adminToken);
    if (!current) return;
    if (elRemember.checked) {
      localStorage.setItem(LS_KEYS.adminToken, current);
    } else {
      sessionStorage.setItem(LS_KEYS.adminToken, current);
    }
  });

  elIncludeFull.addEventListener("change", () => {
    writeBool(LS_KEYS.includeFull, elIncludeFull.checked);
    void refreshLobby();
  });

  elLimit.addEventListener("change", () => {
    const n = clamp(Math.round(Number(elLimit.value)), 1, 1000);
    elLimit.value = String(n);
    writeInt(LS_KEYS.lobbyLimit, n);
  });

  byId<HTMLButtonElement>("adminRefreshLobby").onclick = async () => {
    await refreshLobby();
  };

  const refresh2 = document.getElementById("adminRefreshLobby2") as HTMLButtonElement | null;
  if (refresh2) {
    refresh2.onclick = async () => {
      await refreshLobby();
    };
  }

  byId<HTMLButtonElement>("adminDeleteBtn").onclick = async () => {
    const roomId = byId<HTMLInputElement>("adminDeleteRoomId").value;
    requestDeleteRoomConfirm(roomId, { refreshAfter: true, source: "input" });
  };

  const elConfirmYes = document.getElementById("adminDeleteConfirmYes") as HTMLButtonElement | null;
  const elConfirmNo = document.getElementById("adminDeleteConfirmNo") as HTMLButtonElement | null;

  elConfirmNo?.addEventListener("click", () => {
    pendingDelete = null;
    setDeleteConfirmVisible(false);
    setStatus("Delete cancelled", "info");
  });

  elConfirmYes?.addEventListener("click", () => {
    const p = pendingDelete;
    pendingDelete = null;
    setDeleteConfirmVisible(false);
    if (!p) {
      setStatus("Nothing to confirm", "error");
      return;
    }
    void deleteRoom(p.roomId, { refreshAfter: p.refreshAfter, source: p.source });
  });

  byId<HTMLButtonElement>("adminCopyRoomIdBtn").onclick = async () => {
    const roomId = (byId<HTMLInputElement>("adminDeleteRoomId").value || "").trim();
    if (!roomId) {
      setStatus("Enter a Room ID first", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(roomId);
      setStatus(`Copied ${roomId}`, "ok");
    } catch {
      setStatus("Copy failed (clipboard permission)", "error");
    }
  };

  setStatus("Ready", "info");
}

init();
