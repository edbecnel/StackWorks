import type { OnlineGameDriver } from "../driver/gameDriver.ts";
import type { PlayerColor, LocalSeatPlayerIdsByColor, OnlineBotSeatRequest } from "./onlineProtocol.ts";
import { resolveBotPersonaDisplayName } from "./localPlayerNames";
import type { VariantId } from "../variants/variantTypes";

const LS_KEYS = {
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  columnsBotWhite: "lasca.columnsChessBot.white",
  columnsBotBlack: "lasca.columnsChessBot.black",
  chessBotWhite: "lasca.chessbot.white",
  chessBotBlack: "lasca.chessbot.black",
  localPlayerLight: "lasca.local.nameLight",
  localPlayerDark: "lasca.local.nameDark",
} as const;

type OnlineLocalSeatRecord = {
  serverUrl: string;
  roomId: string;
  localSeatPlayerIdsByColor: LocalSeatPlayerIdsByColor;
  savedAtMs: number;
};

function normalizeServerUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function normalizeRoomId(raw: string): string {
  return (raw || "").trim();
}

function localSeatStorageKey(serverUrl: string, roomId: string): string {
  return `lasca.online.localSeats.${encodeURIComponent(normalizeServerUrl(serverUrl))}.${encodeURIComponent(normalizeRoomId(roomId))}`;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readTrimmedStorage(key: string): string {
  return (readStorage(key) ?? "").trim();
}

function sanitizeDisplayName(raw: string): string | undefined {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 24) : undefined;
}

function isConfiguredBotColor(variantId: VariantId, color: PlayerColor): boolean {
  const isWhite = color === "W";
  if (variantId === "columns_chess") {
    return readTrimmedStorage(isWhite ? LS_KEYS.columnsBotWhite : LS_KEYS.columnsBotBlack) !== "human";
  }
  if (variantId === "chess_classic") {
    return readTrimmedStorage(isWhite ? LS_KEYS.chessBotWhite : LS_KEYS.chessBotBlack) !== "human";
  }
  return readTrimmedStorage(isWhite ? LS_KEYS.aiWhite : LS_KEYS.aiBlack) !== "human";
}

function readHumanSeatDisplayName(color: PlayerColor): string | undefined {
  return sanitizeDisplayName(readTrimmedStorage(color === "W" ? LS_KEYS.localPlayerLight : LS_KEYS.localPlayerDark));
}

function readBotSeatDisplayName(color: PlayerColor): string | undefined {
  return sanitizeDisplayName(resolveBotPersonaDisplayName(color));
}

export function buildOnlineBotSeatRequests(args: {
  variantId: VariantId;
  creatorColor: PlayerColor;
}): OnlineBotSeatRequest[] {
  const out: OnlineBotSeatRequest[] = [];
  for (const color of ["W", "B"] as const) {
    if (color === args.creatorColor) continue;
    if (!isConfiguredBotColor(args.variantId, color)) continue;
    out.push({
      color,
      ...(readBotSeatDisplayName(color) ? { displayName: readBotSeatDisplayName(color) } : {}),
    });
  }
  return out;
}

export function hasConfiguredOnlineLocalBot(args: {
  driver: OnlineGameDriver;
  variantId: VariantId;
}): boolean {
  const anyDriver = args.driver as OnlineGameDriver & {
    controlsColor?: (color: PlayerColor) => boolean;
    isLocalBotColor?: (color: PlayerColor) => boolean;
  };
  const playerColor = typeof anyDriver.getPlayerColor === "function" ? anyDriver.getPlayerColor() : null;
  return (["W", "B"] as const).some((color) => {
    if (!isConfiguredBotColor(args.variantId, color)) return false;
    if (typeof anyDriver.isLocalBotColor === "function") return anyDriver.isLocalBotColor(color);
    if (typeof anyDriver.controlsColor === "function") {
      return anyDriver.controlsColor(color) && playerColor !== color;
    }
    return false;
  });
}

export function saveOnlineLocalSeatRecord(args: {
  serverUrl: string;
  roomId: string;
  localSeatPlayerIdsByColor: LocalSeatPlayerIdsByColor;
}): void {
  try {
    if (!args.serverUrl || !args.roomId) return;
    const record: OnlineLocalSeatRecord = {
      serverUrl: normalizeServerUrl(args.serverUrl),
      roomId: normalizeRoomId(args.roomId),
      localSeatPlayerIdsByColor: {
        ...(args.localSeatPlayerIdsByColor.W ? { W: args.localSeatPlayerIdsByColor.W } : {}),
        ...(args.localSeatPlayerIdsByColor.B ? { B: args.localSeatPlayerIdsByColor.B } : {}),
      },
      savedAtMs: Date.now(),
    };
    localStorage.setItem(localSeatStorageKey(record.serverUrl, record.roomId), JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function loadOnlineLocalSeatRecord(args: {
  serverUrl: string;
  roomId: string;
}): LocalSeatPlayerIdsByColor | null {
  try {
    const raw = localStorage.getItem(localSeatStorageKey(args.serverUrl, args.roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnlineLocalSeatRecord;
    if (!parsed || typeof parsed !== "object") return null;
    const W = typeof parsed.localSeatPlayerIdsByColor?.W === "string" ? parsed.localSeatPlayerIdsByColor.W.trim() : "";
    const B = typeof parsed.localSeatPlayerIdsByColor?.B === "string" ? parsed.localSeatPlayerIdsByColor.B.trim() : "";
    const next: LocalSeatPlayerIdsByColor = {
      ...(W ? { W } : {}),
      ...(B ? { B } : {}),
    };
    return Object.keys(next).length ? next : null;
  } catch {
    return null;
  }
}