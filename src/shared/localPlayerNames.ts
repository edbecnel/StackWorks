import { buildSessionAuthFetchInit } from "./authSessionClient";
import type { Player } from "../types";

export const LOCAL_PLAYER_NAME_KEYS = {
  light: "lasca.local.nameLight",
  dark: "lasca.local.nameDark",
} as const;

const BOT_PERSONA_STORAGE_KEYS = {
  W: "stackworks.bot.whitePersona",
  B: "stackworks.bot.blackPersona",
} as const;

const BOT_PERSONA_TITLES = {
  teacher: "Teacher bot",
  balanced: "Balanced bot",
  trickster: "Trickster bot",
  endgame: "Endgame bot",
} as const;

type BotPersonaId = keyof typeof BOT_PERSONA_TITLES;

type LocalSeatDisplayNameOptions = {
  root?: ParentNode;
  sideLabel?: string | null;
  fallbackDisplayName?: string | null;
  signedInDisplayName?: string | null;
};

type LocalSeatDisplayNamesOptions = {
  root?: ParentNode;
  sideLabels?: Partial<Record<Player, string | null | undefined>>;
  fallbackDisplayNames?: Partial<Record<Player, string | null | undefined>>;
  signedInDisplayName?: string | null;
};

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

function botPersonaStorageKey(side: Player): string {
  return BOT_PERSONA_STORAGE_KEYS[side];
}

function readStoredBotPersona(side: Player): BotPersonaId | null {
  try {
    const raw = localStorage.getItem(botPersonaStorageKey(side))?.trim() ?? "";
    return raw in BOT_PERSONA_TITLES ? (raw as BotPersonaId) : null;
  } catch {
    return null;
  }
}

function defaultSideLabel(side: Player): string {
  return side === "W" ? "White" : "Black";
}

export function hasAnyLocalBotSide(root: ParentNode = document): boolean {
  return isLocalBotSide("W", root) || isLocalBotSide("B", root);
}

export function resolveBotPersonaDisplayName(side: Player, fallbackSideLabel?: string | null): string {
  const persona = readStoredBotPersona(side);
  if (persona) return BOT_PERSONA_TITLES[persona];
  const sideLabel = typeof fallbackSideLabel === "string" && fallbackSideLabel.trim()
    ? fallbackSideLabel.trim()
    : defaultSideLabel(side);
  return `${sideLabel} bot`;
}

export function resolveActiveLocalSeatDisplayName(side: Player, options: LocalSeatDisplayNameOptions = {}): string {
  const root = options.root ?? document;
  const sideLabel = typeof options.sideLabel === "string" && options.sideLabel.trim()
    ? options.sideLabel.trim()
    : defaultSideLabel(side);
  const fallbackDisplayName = typeof options.fallbackDisplayName === "string" ? options.fallbackDisplayName.trim() : "";
  const signedInDisplayName = typeof options.signedInDisplayName === "string" ? options.signedInDisplayName.trim() : "";

  if (isLocalBotSide(side, root)) {
    return resolveBotPersonaDisplayName(side, sideLabel);
  }

  const storedName = readStoredName(side);

  if (hasAnyLocalBotSide(root)) {
    // Prefer the stored name (set by Start Page or shell launch) over the
    // signed-in identity, so explicitly-named players are always shown.
    return storedName || signedInDisplayName || sideLabel;
  }

  return storedName || fallbackDisplayName || sideLabel;
}

export function resolveActiveLocalSeatDisplayNames(options: LocalSeatDisplayNamesOptions = {}): Record<Player, string> {
  const root = options.root ?? document;
  return {
    W: resolveActiveLocalSeatDisplayName("W", {
      root,
      sideLabel: options.sideLabels?.W,
      fallbackDisplayName: options.fallbackDisplayNames?.W,
      signedInDisplayName: options.signedInDisplayName,
    }),
    B: resolveActiveLocalSeatDisplayName("B", {
      root,
      sideLabel: options.sideLabels?.B,
      fallbackDisplayName: options.fallbackDisplayNames?.B,
      signedInDisplayName: options.signedInDisplayName,
    }),
  };
}

export function resolveLocalAuthServerBaseUrl(): string | null {
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL;
  if (typeof envServerUrl === "string" && envServerUrl.trim()) {
    return envServerUrl.trim().replace(/\/$/, "");
  }
  try {
    const storedServerUrl = localStorage.getItem("lasca.online.serverUrl")?.trim() ?? "";
    if (storedServerUrl) return storedServerUrl.replace(/\/$/, "");
  } catch {
    // ignore storage lookup failures
  }
  if (typeof window === "undefined") return null;
  if (!/^https?:$/i.test(window.location.protocol)) return null;
  return window.location.origin.replace(/\/$/, "");
}

export async function fetchSignedInLocalDisplayName(): Promise<string | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;

  const authBaseUrl = resolveLocalAuthServerBaseUrl();
  if (!authBaseUrl) return null;

  try {
    const response = await fetch(`${authBaseUrl}/api/auth/me`, buildSessionAuthFetchInit(authBaseUrl));
    if (!response.ok) return null;
    const body = await response.json() as { user?: { displayName?: string | null } | null };
    const displayName = typeof body?.user?.displayName === "string" ? body.user.displayName.trim() : "";
    return displayName || null;
  } catch {
    return null;
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