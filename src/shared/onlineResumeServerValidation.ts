import { checkCurrentPlayerLost } from "../game/gameOver.ts";
import type { GameState } from "../game/state.ts";
import type { VariantId } from "../variants/variantTypes";
import { buildSessionAuthFetchInit } from "./authSessionClient";
import type { GetRoomMetaResponse, GetRoomSnapshotResponse } from "./onlineProtocol";
import { clearStoredOnlineResumeRecords } from "./onlineResumeStorage";
import { deserializeWireGameState, type WireGameState } from "./wireState.ts";

export type ResumeSeatRef = {
  serverUrl: string;
  roomId: string;
  playerId: string;
};

/** Map ws/wss realtime URLs to HTTP(S) origins for REST `/api/room/...` calls. */
export function toOnlineHttpApiBase(serverUrl: string): string {
  const t = String(serverUrl || "").trim();
  if (/^wss:/i.test(t)) return `https:${t.slice("wss:".length)}`;
  if (/^ws:/i.test(t)) return `http:${t.slice("ws:".length)}`;
  return t.replace(/\/+$/, "");
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJsonWithSession(
  url: string,
  serverUrlForAuth: string,
): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  try {
    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { ...buildSessionAuthFetchInit(serverUrlForAuth), signal: ctrl.signal });
    window.clearTimeout(tid);
    const raw = await res.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function isRoomMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("room not found") ||
    lower.includes("no such room") ||
    lower.includes("invalid room") ||
    lower.includes("invalid room id")
  );
}

/**
 * Returns whether this browser's saved seat still points to an **active** game on the server
 * for the **current** variant page. Clears local resume storage when the server reports the
 * room is finished or gone so the Play Hub does not stay enabled on stale data.
 */
export async function validateOnlineResumeSeatActive(
  entry: ResumeSeatRef,
  currentVariantId: VariantId,
): Promise<{ active: boolean }> {
  const base = toOnlineHttpApiBase(entry.serverUrl);
  if (!base) return { active: false };

  const metaUrl = `${base}/api/room/${encodeURIComponent(entry.roomId)}/meta`;
  const metaRes = await fetchJsonWithSession(metaUrl, entry.serverUrl);
  const mj = metaRes.json as GetRoomMetaResponse | null;

  if (!metaRes.ok || !mj || typeof mj !== "object" || "error" in mj) {
    const errMsg = mj && typeof (mj as { error?: unknown }).error === "string" ? String((mj as { error: string }).error) : "";
    if (metaRes.status === 400 && errMsg && isRoomMissingError(errMsg)) {
      clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
    }
    return { active: false };
  }

  if (mj.isOver) {
    clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
    return { active: false };
  }

  if (mj.variantId && mj.variantId !== currentVariantId) {
    return { active: false };
  }

  const snapUrl = `${base}/api/room/${encodeURIComponent(entry.roomId)}?playerId=${encodeURIComponent(entry.playerId)}`;
  const snapRes = await fetchJsonWithSession(snapUrl, entry.serverUrl);
  const sj = snapRes.json as GetRoomSnapshotResponse | null;

  if (!snapRes.ok || !sj || typeof sj !== "object" || "error" in sj) {
    const errMsg = sj && typeof (sj as { error?: unknown }).error === "string" ? String((sj as { error: string }).error) : "";
    if (isRoomMissingError(errMsg) || /invalid player/i.test(errMsg)) {
      clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
    }
    return { active: false };
  }

  const presence = sj.presence;
  if (!presence || !Object.prototype.hasOwnProperty.call(presence, entry.playerId)) {
    clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
    return { active: false };
  }

  const forced = (sj as { snapshot?: { state?: { forcedGameOver?: unknown } } }).snapshot?.state?.forcedGameOver;
  if (forced && typeof forced === "object") {
    clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
    return { active: false };
  }

  // `GET .../meta` uses a narrow `isOver` flag; finished positions (checkmate, etc.) can still
  // report `isOver: false` until `forcedGameOver` is populated. Match start-page rejoin logic.
  try {
    const wireState = sj.snapshot?.state;
    if (!wireState || typeof wireState !== "object") {
      return { active: false };
    }
    const state = deserializeWireGameState(wireState as WireGameState);
    const terminal = checkCurrentPlayerLost(state as GameState);
    if (terminal.reason) {
      clearStoredOnlineResumeRecords(entry.serverUrl, entry.roomId);
      return { active: false };
    }
  } catch {
    return { active: false };
  }

  return { active: true };
}
