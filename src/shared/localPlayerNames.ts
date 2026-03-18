import type { Player } from "../types";

export const LOCAL_PLAYER_NAME_KEYS = {
  light: "lasca.local.nameLight",
  dark: "lasca.local.nameDark",
} as const;

function sideStorageKey(side: Player): string {
  return side === "W" ? LOCAL_PLAYER_NAME_KEYS.light : LOCAL_PLAYER_NAME_KEYS.dark;
}

function sideSelectIds(side: Player): readonly string[] {
  return side === "W" ? ["botWhiteSelect", "aiWhiteSelect"] : ["botBlackSelect", "aiBlackSelect"];
}

function readStoredName(side: Player): string {
  try {
    return localStorage.getItem(sideStorageKey(side))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function isLocalBotSide(side: Player, root: ParentNode = document): boolean {
  for (const id of sideSelectIds(side)) {
    const select = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    if (!select) continue;
    return (select.value ?? "human") !== "human";
  }
  return false;
}

export function resolveConfiguredLocalPlayerName(side: Player, root: ParentNode = document): string {
  const rawName = readStoredName(side);
  if (!rawName) return "";
  return isLocalBotSide(side, root) ? `${rawName}-bot` : rawName;
}

export function resolveConfiguredLocalPlayerNames(root: ParentNode = document): Record<Player, string> {
  return {
    W: resolveConfiguredLocalPlayerName("W", root),
    B: resolveConfiguredLocalPlayerName("B", root),
  };
}