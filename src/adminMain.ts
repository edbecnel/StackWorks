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

function buildLobbyUrl(serverUrl: string, includeFull: boolean, limit: number, adminToken?: string): string {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (includeFull) q.set("includeFull", "1");
  const token = typeof adminToken === "string" ? adminToken.trim() : "";
  if (token) q.set("adminToken", token);
  return `${serverUrl}/api/lobby?${q.toString()}`;
}

async function fetchLobby(serverUrl: string, includeFull: boolean, limit: number, adminToken?: string): Promise<LobbyRoomSummary[]> {
  const url = buildLobbyUrl(serverUrl, includeFull, limit, adminToken);
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
  if (room.status === "game_over") parts.push("game over");
  if (typeof room.statusReason === "string" && room.statusReason.trim()) {
    parts.push(room.statusReason.trim());
  }
  if (!room.hostIdentity && typeof room.hostDisplayName === "string" && room.hostDisplayName.trim()) {
    parts.push(`host: ${room.hostDisplayName.trim()}`);
  }
  return parts.join(" • ");
}

function getUniqueRoomIds(roomIdsRaw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const roomIdRaw of roomIdsRaw) {
    const roomId = (roomIdRaw || "").trim();
    if (!roomId || seen.has(roomId)) continue;
    seen.add(roomId);
    out.push(roomId);
  }
  return out;
}

function summarizeRoomIds(roomIds: readonly string[]): string {
  if (roomIds.length <= 6) return roomIds.join("\n");
  const shown = roomIds.slice(0, 6).join("\n");
  return `${shown}\n+${roomIds.length - 6} more`;
}

const selectedLobbyRoomIds = new Set<string>();

function syncSelectedLobbyRoomIds(rooms: readonly LobbyRoomSummary[]): void {
  const available = new Set(rooms.map((room) => String(room.roomId || "").trim()).filter(Boolean));
  for (const roomId of [...selectedLobbyRoomIds]) {
    if (!available.has(roomId)) selectedLobbyRoomIds.delete(roomId);
  }
}

function updateBulkDeleteButton(): void {
  const button = document.getElementById("adminDeleteSelectedBtn") as HTMLButtonElement | null;
  if (!button) return;
  button.disabled = deleteConfirmBusy || selectedLobbyRoomIds.size === 0;
}

function removeRoomsFromLobbyState(roomIdsRaw: readonly string[]): void {
  const roomIds = new Set(getUniqueRoomIds(roomIdsRaw));
  if (roomIds.size === 0) return;

  lastRooms = lastRooms.filter((room) => !roomIds.has((room.roomId || "").trim()));
  for (const roomId of roomIds) selectedLobbyRoomIds.delete(roomId);
  rerenderLobbyFromCache();
}

function renderLobby(rooms: LobbyRoomSummary[]): void {
  const list = byId<HTMLDivElement>("adminLobbyList");
  list.replaceChildren();
  const serverUrl = getServerUrl();
  syncSelectedLobbyRoomIds(rooms);

  const createdAtMs = (r: LobbyRoomSummary): number => {
    if (typeof r.createdAt !== "string") return 0;
    const ms = Date.parse(r.createdAt);
    return Number.isFinite(ms) ? ms : 0;
  };

  const sorted = [...rooms].sort((a, b) => createdAtMs(b) - createdAtMs(a));
  for (const room of sorted) {
    const item = document.createElement("div");
    item.className = "lobbyItem";

    const selectWrap = document.createElement("label");
    selectWrap.className = "lobbyItemSelect";

    const select = document.createElement("input");
    select.type = "checkbox";
    select.className = "lobbySelectCheckbox";
    select.checked = selectedLobbyRoomIds.has(room.roomId);
    select.setAttribute("aria-label", `Select room ${room.roomId}`);
    select.addEventListener("change", () => {
      if (select.checked) selectedLobbyRoomIds.add(room.roomId);
      else selectedLobbyRoomIds.delete(room.roomId);
      updateBulkDeleteButton();
    });
    selectWrap.appendChild(select);

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
    item.append(selectWrap, left, right);
    list.append(item);
  }

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "subtle";
    empty.textContent = "No rooms returned.";
    list.append(empty);
  }

  updateBulkDeleteButton();
}

type DeleteSource = "row" | "input" | "bulk";

let lastRooms: LobbyRoomSummary[] = [];
let pendingDelete: { roomIds: string[]; refreshAfter: boolean; source: DeleteSource } | null = null;
let deleteConfirmBusy = false;

function getDeleteConfirmDialog(): HTMLDialogElement | null {
  return document.getElementById("adminDeleteConfirmDialog") as HTMLDialogElement | null;
}

function setDeleteConfirmBusy(isBusy: boolean): void {
  deleteConfirmBusy = isBusy;

  const yes = document.getElementById("adminDeleteConfirmYes") as HTMLButtonElement | null;
  const no = document.getElementById("adminDeleteConfirmNo") as HTMLButtonElement | null;
  const isBulk = (pendingDelete?.roomIds.length ?? 0) > 1 || pendingDelete?.source === "bulk";
  if (yes) {
    yes.disabled = isBusy;
    yes.textContent = isBusy ? "Deleting..." : (isBulk ? "Delete selected" : "Delete room");
  }
  if (no) no.disabled = isBusy;
  updateBulkDeleteButton();
}

function setDeleteConfirmError(message: string | null): void {
  const el = document.getElementById("adminDeleteConfirmError") as HTMLDivElement | null;
  if (!el) return;
  const text = (message || "").trim();
  el.hidden = !text;
  el.textContent = text;
}

function setDeleteConfirmVisible(isVisible: boolean): void {
  const dialog = getDeleteConfirmDialog();
  if (!dialog) return;

  if (isVisible) {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    return;
  }

  if (!dialog.open) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function requestDeleteRoomsConfirm(roomIdsRaw: readonly string[], opts: { refreshAfter: boolean; source: DeleteSource }): void {
  const roomIds = getUniqueRoomIds(roomIdsRaw);
  if (roomIds.length === 0) {
    setStatus("Enter a Room ID", "error");
    return;
  }

  // Put the roomId into the input so the user sees what will be deleted.
  const elRoomId = document.getElementById("adminDeleteRoomId") as HTMLInputElement | null;
  if (elRoomId && roomIds.length === 1 && opts.source !== "bulk") elRoomId.value = roomIds[0];

  pendingDelete = { roomIds, refreshAfter: opts.refreshAfter, source: opts.source };

  const text = document.getElementById("adminDeleteConfirmText") as HTMLDivElement | null;
  if (text) {
    text.textContent =
      roomIds.length === 1
        ? "Delete this room? This cannot be undone."
        : `Delete ${roomIds.length} selected rooms? This cannot be undone.`;
  }

  const roomText = document.getElementById("adminDeleteConfirmRoomId") as HTMLDivElement | null;
  if (roomText) roomText.textContent = summarizeRoomIds(roomIds);

  setDeleteConfirmError(null);
  setDeleteConfirmBusy(false);
  setDeleteConfirmVisible(true);
}

function requestDeleteRoomConfirm(roomIdRaw: string, opts: { refreshAfter: boolean; source: "row" | "input" }): void {
  requestDeleteRoomsConfirm([roomIdRaw], opts);
}

async function deleteRooms(roomIdsRaw: readonly string[], opts: { refreshAfter: boolean; source: DeleteSource }): Promise<boolean> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    setDeleteConfirmError("Set Server URL first.");
    setStatus("Set Server URL first", "error");
    return false;
  }

  const roomIds = getUniqueRoomIds(roomIdsRaw);
  if (roomIds.length === 0) {
    setDeleteConfirmError("Enter a Room ID first.");
    setStatus("Enter a Room ID", "error");
    return false;
  }

  const token = getToken();
  if (!token) {
    setDeleteConfirmError("Enter the admin token before deleting a room.");
    setStatus("Enter Admin token", "error");
    return false;
  }

  const deletedRoomIds: string[] = [];

  for (const [index, roomId] of roomIds.entries()) {
    setStatus(
      roomIds.length === 1 ? `Deleting ${roomId}…` : `Deleting ${index + 1}/${roomIds.length}: ${roomId}…`,
      "info",
    );

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
      let detail = `Delete failed: ${err}`;
      if (res.status === 404) {
        detail =
          "Delete failed: the admin delete route is not enabled on this server. " +
          "For local development, start the backend with LASCA_ADMIN_TOKEN set before launching the server, for example: " +
          "$env:LASCA_ADMIN_TOKEN = \"change-me-please\"; npm run online:dev " +
          "or $env:LASCA_ADMIN_TOKEN = \"change-me-please\"; npm run online:server, then enter the same token here.";
      } else if (res.status === 403) {
        detail = "Delete failed: the admin token was rejected by the server.";
      }
      if (deletedRoomIds.length > 0) {
        detail += ` Deleted ${deletedRoomIds.length} room${deletedRoomIds.length === 1 ? "" : "s"} before the failure.`;
        removeRoomsFromLobbyState(deletedRoomIds);
      }
      setDeleteConfirmError(detail);
      setStatus(detail, "error");
      return false;
    }

    deletedRoomIds.push(roomId);
    selectedLobbyRoomIds.delete(roomId);
  }

  if (deletedRoomIds.length > 0) removeRoomsFromLobbyState(deletedRoomIds);

  setDeleteConfirmError(null);
  setStatus(
    roomIds.length === 1 ? `Deleted ${roomIds[0]}` : `Deleted ${roomIds.length} rooms`,
    "ok",
  );

  // If delete came from the input, clear it.
  if (opts.source === "input") {
    byId<HTMLInputElement>("adminDeleteRoomId").value = "";
  }

  if (opts.refreshAfter) {
    await refreshLobby();
  }

  return true;
}

async function refreshLobby(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    setStatus("Set Server URL first", "error");
    return;
  }

  const includeFull = byId<HTMLInputElement>("adminIncludeFull").checked;
  const limitRaw = byId<HTMLInputElement>("adminLobbyLimit").value;
  const limit = clamp(Math.round(Number(limitRaw)), 1, 1000);
  const adminToken = getToken();
  byId<HTMLInputElement>("adminLobbyLimit").value = String(limit);
  writeInt(LS_KEYS.lobbyLimit, limit);

  setStatus("Loading lobby…", "info");
  try {
    const rooms = await fetchLobby(serverUrl, includeFull, limit, adminToken);
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

  const deleteSelectedBtn = document.getElementById("adminDeleteSelectedBtn") as HTMLButtonElement | null;
  deleteSelectedBtn?.addEventListener("click", () => {
    requestDeleteRoomsConfirm([...selectedLobbyRoomIds], { refreshAfter: true, source: "bulk" });
  });
  updateBulkDeleteButton();

  byId<HTMLButtonElement>("adminDeleteBtn").onclick = async () => {
    const roomId = byId<HTMLInputElement>("adminDeleteRoomId").value;
    requestDeleteRoomConfirm(roomId, { refreshAfter: true, source: "input" });
  };

  const elConfirmDialog = getDeleteConfirmDialog();
  const elConfirmYes = document.getElementById("adminDeleteConfirmYes") as HTMLButtonElement | null;
  const elConfirmNo = document.getElementById("adminDeleteConfirmNo") as HTMLButtonElement | null;

  elConfirmDialog?.addEventListener("cancel", (event) => {
    if (deleteConfirmBusy) {
      event.preventDefault();
      return;
    }
    pendingDelete = null;
    setStatus("Delete cancelled", "info");
  });

  elConfirmDialog?.addEventListener("click", (event) => {
    if (deleteConfirmBusy) return;
    if (event.target !== elConfirmDialog) return;
    pendingDelete = null;
    setDeleteConfirmVisible(false);
    setStatus("Delete cancelled", "info");
  });

  elConfirmNo?.addEventListener("click", () => {
    if (deleteConfirmBusy) return;
    pendingDelete = null;
    setDeleteConfirmVisible(false);
    setStatus("Delete cancelled", "info");
  });

  elConfirmYes?.addEventListener("click", async () => {
    const p = pendingDelete;
    if (!p) {
      setStatus("Nothing to confirm", "error");
      return;
    }

    setDeleteConfirmBusy(true);
    try {
      const deleted = await deleteRooms(p.roomIds, { refreshAfter: p.refreshAfter, source: p.source });
      if (!deleted) return;
      pendingDelete = null;
      setDeleteConfirmVisible(false);
    } finally {
      setDeleteConfirmBusy(false);
    }
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
