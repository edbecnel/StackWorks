import type { Player } from "../types";
import type { VariantId } from "../variants/variantTypes";
import { resolveBotPersonaDisplayName } from "./localPlayerNames";
import { resolveOnlineHumanSeat } from "./onlineHumanSeat";

const LS_KEYS = {
  localPlayerLight: "lasca.local.nameLight",
  localPlayerDark: "lasca.local.nameDark",
  onlinePrefColor: "lasca.online.prefColor",
  onlineSeatOwnerLight: "lasca.online.seatOwnerLight",
  onlineSeatOwnerDark: "lasca.online.seatOwnerDark",
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  columnsBotWhite: "lasca.columnsChessBot.white",
  columnsBotBlack: "lasca.columnsChessBot.black",
  chessBotWhite: "lasca.chessbot.white",
  chessBotBlack: "lasca.chessbot.black",
  openVariantPageIntent: "stackworks.openVariantPageIntent",
} as const;

const OPEN_VARIANT_PAGE_INTENT_TTL_MS = 60_000;

type OpenVariantPagePlayMode = "local" | "online";

type OpenVariantPageIntentRecord = {
  variantId: VariantId;
  playMode: OpenVariantPagePlayMode;
  savedAtMs: number;
};

export type OpenVariantPageOnlinePreview = {
  localColor: Player;
  names: Partial<Record<Player, string>>;
  roles: Partial<Record<Player, "human" | "bot">>;
};

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function readStoredRole(variantId: VariantId, color: Player): "human" | "bot" {
  const isWhite = color === "W";
  const raw = variantId === "columns_chess"
    ? readStorage(isWhite ? LS_KEYS.columnsBotWhite : LS_KEYS.columnsBotBlack)
    : variantId === "chess_classic"
      ? readStorage(isWhite ? LS_KEYS.chessBotWhite : LS_KEYS.chessBotBlack)
      : readStorage(isWhite ? LS_KEYS.aiWhite : LS_KEYS.aiBlack);
  return raw === "human" ? "human" : "bot";
}

function readStoredSeatOwner(color: Player): "local" | "remote" {
  return readStorage(color === "W" ? LS_KEYS.onlineSeatOwnerLight : LS_KEYS.onlineSeatOwnerDark) === "local"
    ? "local"
    : "remote";
}

function readPreferredColor(): "auto" | "W" | "B" {
  const raw = readStorage(LS_KEYS.onlinePrefColor);
  return raw === "W" || raw === "B" ? raw : "auto";
}

function readStoredLocalPlayerName(color: Player): string {
  return readStorage(color === "W" ? LS_KEYS.localPlayerLight : LS_KEYS.localPlayerDark);
}

export function saveOpenVariantPageIntent(args: {
  variantId: VariantId;
  playMode: OpenVariantPagePlayMode;
}): void {
  try {
    const record: OpenVariantPageIntentRecord = {
      variantId: args.variantId,
      playMode: args.playMode,
      savedAtMs: Date.now(),
    };
    localStorage.setItem(LS_KEYS.openVariantPageIntent, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function readOpenVariantPageOnlinePreview(variantId: VariantId): OpenVariantPageOnlinePreview | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.openVariantPageIntent);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OpenVariantPageIntentRecord> | null;
    if (!parsed || parsed.variantId !== variantId || parsed.playMode !== "online") return null;
    const savedAtMs = Number(parsed.savedAtMs);
    if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > OPEN_VARIANT_PAGE_INTENT_TTL_MS) return null;
  } catch {
    return null;
  }

  const whiteRole = readStoredRole(variantId, "W");
  const blackRole = readStoredRole(variantId, "B");
  const localColor = resolveOnlineHumanSeat({
    whiteRole,
    blackRole,
    whiteOwner: readStoredSeatOwner("W"),
    blackOwner: readStoredSeatOwner("B"),
    preferredColor: readPreferredColor(),
  });
  if (!localColor) return null;

  const opponentColor: Player = localColor === "W" ? "B" : "W";
  const names: Partial<Record<Player, string>> = {};
  const roles: Partial<Record<Player, "human" | "bot">> = {
    [localColor]: "human",
  };
  const localName = readStoredLocalPlayerName(localColor);
  if (localName) names[localColor] = localName;

  const opponentRole = opponentColor === "W" ? whiteRole : blackRole;
  roles[opponentColor] = opponentRole;
  if (opponentRole === "human") names[opponentColor] = "Online player";
  else {
    const botName = resolveBotPersonaDisplayName(opponentColor);
    if (botName) names[opponentColor] = botName;
  }

  return { localColor, names, roles };
}