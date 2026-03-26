import { APP_SHELL_GAMES } from "../../config/appShellConfig";
import {
  BotControllerMode,
  type BotDifficulty,
  type BotPersona,
  type BotPlayState,
  type CoachLevel,
  GlobalSection,
  type HostedRoomState,
  HostedRoomOwnerControl,
  HostedRoomVisibilityMode,
  OnlineSubSection,
  PlaySubSection,
  readShellState,
  updateShellState,
} from "../../config/shellState";
import { buildSessionAuthFetchInit } from "../../shared/authSessionClient";
import type { LobbyRoomSummary } from "../../shared/onlineProtocol";
import { getSideLabelsForRuleset } from "../../shared/sideTerminology";
import { createTabs } from "../navigation/tabs";
import { getVariantById } from "../../variants/variantRegistry";
import type { VariantId } from "../../variants/variantTypes";

export interface PlayHubAction {
  label: string;
  description: string;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}

export interface PlayHubOptions {
  currentVariantId: VariantId;
  backHref?: string;
  helpHref?: string;
  onlineAction?: PlayHubAction | null;
  botAction?: PlayHubAction | null;
  localAction?: PlayHubAction | null;
}

export interface PlayHubController {
  element: HTMLElement;
  setActiveTab(tabId: PlaySubSection): void;
}

const PLAY_HUB_STYLE_ID = "stackworks-play-hub-style";

type ResumeEntry = {
  href: string;
  label: string;
  description: string;
  roomId: string;
  serverUrl: string;
  playerId: string;
  color?: "W" | "B";
};

type OnlineModeDefinition = {
  id: OnlineSubSection;
  label: string;
  title: string;
  description: string;
  launcherLabel: string;
  launcherDescription: string;
  placeholderTitle: string;
  placeholderDescription: string;
};

type BotOption = {
  value: BotDifficulty;
  label: string;
};

type BotPersonaDefinition = {
  id: BotPersona;
  label: string;
  title: string;
  text: string;
  meta: string;
};

type CoachLevelDefinition = {
  id: CoachLevel;
  label: string;
  description: string;
};

type HostedRoomBrowserStatus = "idle" | "loading" | "ready" | "error";

type HostedRoomBrowserState = {
  status: HostedRoomBrowserStatus;
  rooms: LobbyRoomSummary[];
  error: string | null;
  serverUrl: string | null;
};

type OnlineRoomBrowserState = {
  status: HostedRoomBrowserStatus;
  rooms: LobbyRoomSummary[];
  error: string | null;
  serverUrl: string | null;
};

type CoachGuidancePreset = {
  moveHints: boolean;
  moveHintStyle: "classic" | "chesscom";
  emphasis: string;
  cadence: string;
};

type AuthMeResponse = {
  ok: true;
  user: {
    displayName: string;
  } | null;
};

const LAUNCHER_STORAGE_KEYS = {
  variantId: "lasca.variantId",
  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
  onlineVisibility: "lasca.online.visibility",
  onlineHostedOwnerControl: "stackworks.online.hosted.ownerControl",
  onlineHostedVisibility: "stackworks.online.hosted.visibility",
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  botPersonaWhite: "stackworks.bot.whitePersona",
  botPersonaBlack: "stackworks.bot.blackPersona",
  columnsBotWhite: "lasca.columnsChessBot.white",
  columnsBotBlack: "lasca.columnsChessBot.black",
  chessBotWhite: "lasca.chessbot.white",
  chessBotBlack: "lasca.chessbot.black",
  coachLevel: "stackworks.play.coachLevel",
} as const;

const HOSTED_ROOM_LOBBY_LIMIT = 6;

const BOT_PERSONAS: readonly BotPersonaDefinition[] = [
  {
    id: "teacher",
    label: "Teacher",
    title: "Teacher bot",
    text: "Leans into patient training games and calmer pressure so practice still feels readable.",
    meta: "Guided sparring",
  },
  {
    id: "balanced",
    label: "Balanced",
    title: "Balanced bot",
    text: "General-purpose resistance meant for everyday play sessions and neutral testing.",
    meta: "All-round play",
  },
  {
    id: "trickster",
    label: "Trickster",
    title: "Trickster bot",
    text: "Frames the seat as a tactical tempter that pushes sharper middlegame decisions.",
    meta: "Tactical pressure",
  },
  {
    id: "endgame",
    label: "Endgame",
    title: "Endgame bot",
    text: "Signals a slower, conversion-focused training partner built for cleaner finishes.",
    meta: "Conversion focus",
  },
] as const;

const COACH_LEVELS: readonly CoachLevelDefinition[] = [
  { id: "new-to-chess", label: "New to chess", description: "Maximum guidance, easy takebacks, and beginner-safe pacing." },
  { id: "beginner", label: "Beginner", description: "Simple tactical feedback and forgiving practice-focused play." },
  { id: "novice", label: "Novice", description: "Early improvement path with frequent hints and teaching nudges." },
  { id: "intermediate", label: "Intermediate", description: "Balanced coaching with fewer interruptions and stronger play." },
  { id: "intermediate-ii", label: "Intermediate II", description: "Sharper practice with more demanding positions and lighter coaching." },
  { id: "advanced", label: "Advanced", description: "Stronger opposition with targeted review and fewer rescue prompts." },
  { id: "expert", label: "Expert", description: "Minimal intervention and the strongest training tone reserved for confident players." },
] as const;

const ONLINE_MODE_DEFINITIONS: readonly OnlineModeDefinition[] = [
  {
    id: OnlineSubSection.QuickMatch,
    label: "Quick Match",
    title: "Quick Match",
    description: "Use the fastest path into online play while keeping the rest of the room setup nested under the same Online surface.",
    launcherLabel: "Open online launcher",
    launcherDescription: "Return to the start page and continue into live lobby, room, rejoin, or spectate flows.",
    placeholderTitle: "Quick Match stays primary",
    placeholderDescription: "The final shell will keep Quick Match as the first online action while nesting deeper room choices behind the same Online destination.",
  },
  {
    id: OnlineSubSection.CustomChallenge,
    label: "Custom Challenge",
    title: "Custom Challenge",
    description: "Keep one-off setup inside Online instead of promoting every room option to a top-level shell destination.",
    launcherLabel: "Open challenge setup",
    launcherDescription: "Return to the launcher with this variant selected and continue into color, time, and room setup controls.",
    placeholderTitle: "Flexible challenge flow reserved",
    placeholderDescription: "Custom Challenge will house room visibility, time control, invite/public setup, and color preferences without fragmenting the top-level play tabs.",
  },
  {
    id: OnlineSubSection.Friend,
    label: "Play a Friend",
    title: "Play a Friend",
    description: "Keep friend play prominent, but model it as a focused branch of Online rather than a permanent top-level tab.",
    launcherLabel: "Open friend flow",
    launcherDescription: "Return to the launcher and continue into invite-link, room code, and rematch-friendly entry points.",
    placeholderTitle: "Friend invite flow reserved",
    placeholderDescription: "This slot will become the simplified invite experience for known opponents, with sharing and rematch-first controls.",
  },
  {
    id: OnlineSubSection.HostedRooms,
    label: "Hosted Rooms",
    title: "Hosted Rooms",
    description: "Reserve a reusable community-room surface without forcing clubs, schools, and friend groups through ad hoc challenge setup.",
    launcherLabel: "Open room hub",
    launcherDescription: "Return to the launcher and continue into hosted-room discovery, ownership, and invite policy controls.",
    placeholderTitle: "Community room hub reserved",
    placeholderDescription: "Hosted Rooms will become the persistent community-space flow for recurring groups, not just a larger friend challenge form.",
  },
  {
    id: OnlineSubSection.Tournaments,
    label: "Tournaments",
    title: "Tournaments",
    description: "Keep tournament entry visible inside Online without spending permanent first-view real estate before the product area exists.",
    launcherLabel: "View tournament status",
    launcherDescription: "Return to the launcher area reserved for organized events and future tournament discovery.",
    placeholderTitle: "Tournament slot reserved",
    placeholderDescription: "Tournament entry remains nested under Online until StackWorks has enough organizer and event support to justify a larger product surface.",
  },
] as const;

function writeLauncherValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function writeBoolLauncherValue(key: string, value: boolean): void {
  writeLauncherValue(key, value ? "1" : "0");
}

function normalizeServerUrl(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  return value.replace(/\/$/, "");
}

function resolveConfiguredServerUrl(): string | null {
  const configured = normalizeServerUrl(readBotStorageValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl));
  return configured ?? "http://localhost:8788";
}

function resolveLocalAuthServerBaseUrl(): string | null {
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL;
  if (typeof envServerUrl === "string" && envServerUrl.trim()) {
    return envServerUrl.trim().replace(/\/$/, "");
  }
  try {
    const storedServerUrl = localStorage.getItem(LAUNCHER_STORAGE_KEYS.onlineServerUrl)?.trim() ?? "";
    return storedServerUrl ? storedServerUrl.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

async function fetchSignedInDisplayName(): Promise<string | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;

  const authBaseUrl = resolveLocalAuthServerBaseUrl();
  if (!authBaseUrl) return null;

  try {
    const authUrl = `${authBaseUrl}/api/auth/me`;
    const res = await fetch(authUrl, buildSessionAuthFetchInit(authBaseUrl));
    if (!res.ok) return null;
    const body = await res.json() as AuthMeResponse;
    const displayName = typeof body?.user?.displayName === "string" ? body.user.displayName.trim() : "";
    return displayName || null;
  } catch {
    return null;
  }
}

function getVariantMoveHintsKey(variantId: VariantId): string {
  return `lasca.opt.${variantId}.moveHints`;
}

function getVariantMoveHintStyleKey(variantId: VariantId): string {
  return `lasca.opt.${variantId}.moveHintStyle`;
}

function getBotPersonaStorageKey(seat: "white" | "black"): string {
  return seat === "white" ? LAUNCHER_STORAGE_KEYS.botPersonaWhite : LAUNCHER_STORAGE_KEYS.botPersonaBlack;
}

function defaultBotPersonaForLevel(level: BotDifficulty | null): BotPersona {
  switch (level) {
    case "easy":
    case "beginner":
      return "teacher";
    case "medium":
    case "intermediate":
      return "balanced";
    case "master":
      return "endgame";
    default:
      return "trickster";
  }
}

function readStoredBotPersona(seat: "white" | "black", fallbackLevel: BotDifficulty | null): BotPersona {
  const raw = readBotStorageValue(getBotPersonaStorageKey(seat));
  if (raw === "teacher" || raw === "balanced" || raw === "trickster" || raw === "endgame") return raw;
  return defaultBotPersonaForLevel(fallbackLevel);
}

function getBotPersonaDefinition(persona: BotPersona | null | undefined): BotPersonaDefinition {
  return BOT_PERSONAS.find((definition) => definition.id === persona) ?? BOT_PERSONAS[1];
}

function getCoachGuidancePreset(level: CoachLevel): CoachGuidancePreset {
  switch (level) {
    case "new-to-chess":
      return { moveHints: true, moveHintStyle: "classic", emphasis: "Foundations first", cadence: "Frequent prompts" };
    case "beginner":
      return { moveHints: true, moveHintStyle: "classic", emphasis: "Safe patterns", cadence: "Steady prompts" };
    case "novice":
      return { moveHints: true, moveHintStyle: "classic", emphasis: "Tactics and habits", cadence: "Regular prompts" };
    case "intermediate":
      return { moveHints: true, moveHintStyle: "chesscom", emphasis: "Pattern recognition", cadence: "Lighter prompts" };
    case "intermediate-ii":
      return { moveHints: true, moveHintStyle: "chesscom", emphasis: "Decision quality", cadence: "Selective prompts" };
    case "advanced":
      return { moveHints: false, moveHintStyle: "chesscom", emphasis: "Self-review", cadence: "Post-mistake nudges" };
    case "expert":
      return { moveHints: false, moveHintStyle: "classic", emphasis: "Minimal assistance", cadence: "Almost silent" };
  }
}

function buildOnlineLauncherHref(baseHref: string, args: { serverUrl?: string | null; roomId?: string; action: "create" | "join" | "spectate" }): string {
  return buildLauncherHref(baseHref, {
    mode: "online",
    ...(args.serverUrl ? { server: args.serverUrl } : {}),
    ...(args.action === "create" ? { create: "1", roomId: undefined } : {}),
    ...(args.action === "join" ? { join: "1", roomId: args.roomId } : {}),
    ...(args.action === "spectate" ? { roomId: args.roomId, join: undefined, create: undefined } : {}),
  });
}

function buildCurrentVariantOnlineHref(args: {
  action: "create" | "join" | "spectate" | "rejoin";
  serverUrl?: string | null;
  roomId?: string;
  playerId?: string;
  color?: "W" | "B";
  prefColor?: "W" | "B";
  visibility?: "public" | "private";
  suppressBotSeats?: boolean;
}): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "online");
    if (args.serverUrl) url.searchParams.set("server", args.serverUrl);
    else url.searchParams.delete("server");

    if (args.action === "create") {
      url.searchParams.set("create", "1");
      url.searchParams.delete("join");
      url.searchParams.delete("roomId");
      url.searchParams.delete("playerId");
      url.searchParams.delete("color");
      if (args.prefColor) url.searchParams.set("prefColor", args.prefColor);
      else url.searchParams.delete("prefColor");
      if (args.visibility) url.searchParams.set("visibility", args.visibility);
      else url.searchParams.delete("visibility");
      if (args.suppressBotSeats) url.searchParams.set("botSeats", "off");
      else url.searchParams.delete("botSeats");
      url.searchParams.delete("watchToken");
      return `${url.pathname}${url.search}${url.hash}`;
    }

    url.searchParams.delete("create");
    url.searchParams.delete("prefColor");
    url.searchParams.delete("visibility");
    url.searchParams.delete("botSeats");

    if (args.roomId) url.searchParams.set("roomId", args.roomId);
    else url.searchParams.delete("roomId");

    if (args.action === "join") {
      url.searchParams.set("join", "1");
      url.searchParams.delete("playerId");
      url.searchParams.delete("color");
      url.searchParams.delete("watchToken");
      return `${url.pathname}${url.search}${url.hash}`;
    }

    url.searchParams.delete("join");
    if (args.action === "spectate") {
      url.searchParams.delete("playerId");
      url.searchParams.delete("color");
      return `${url.pathname}${url.search}${url.hash}`;
    }

    if (args.playerId) url.searchParams.set("playerId", args.playerId);
    else url.searchParams.delete("playerId");
    if (args.color) url.searchParams.set("color", args.color);
    else url.searchParams.delete("color");
    url.searchParams.delete("watchToken");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return window.location.pathname;
  }
}

function formatAgeShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function describeHostedRoom(room: LobbyRoomSummary): { title: string; meta: string; seats: string } {
  const createdAtMs = typeof room.createdAt === "string" ? Date.parse(room.createdAt) : NaN;
  const age = Number.isFinite(createdAtMs) ? formatAgeShort(Date.now() - createdAtMs) : "";
  const status = room.status === "game_over"
    ? "Game over"
    : room.status === "in_game"
      ? "In game"
      : "Waiting";
  const host = typeof room.hostDisplayName === "string" && room.hostDisplayName.trim() ? room.hostDisplayName.trim() : "Community host";
  return {
    title: `${host} · ${room.roomId}`,
    meta: [status, room.visibility === "private" ? "Private" : "Public", age].filter(Boolean).join(" · "),
    seats: `Open ${room.seatsOpen.length ? room.seatsOpen.join("/") : "-"} · Taken ${room.seatsTaken.length ? room.seatsTaken.join("/") : "-"}`,
  };
}

function getBotOptionsForVariant(variantId: VariantId): readonly BotOption[] {
  if (variantId === "columns_chess") {
    return [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
      { value: "master", label: "Master" },
    ];
  }
  if (variantId === "chess_classic") {
    return [
      { value: "easy", label: "Beginner" },
      { value: "medium", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
      { value: "master", label: "Master" },
    ];
  }
  return [
    { value: "easy", label: "Beginner" },
    { value: "medium", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "master", label: "Master" },
  ];
}

function readBotStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readLegacyBotPlayState(variantId: VariantId): BotPlayState {
  if (variantId === "columns_chess") {
    const white = readBotStorageValue(LAUNCHER_STORAGE_KEYS.columnsBotWhite);
    const black = readBotStorageValue(LAUNCHER_STORAGE_KEYS.columnsBotBlack);
    return {
      white: {
        controller: white && white !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
        level: white && white !== "human" ? (white as BotDifficulty) : null,
        persona: white && white !== "human" ? readStoredBotPersona("white", white as BotDifficulty) : null,
      },
      black: {
        controller: black && black !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
        level: black && black !== "human" ? (black as BotDifficulty) : null,
        persona: black && black !== "human" ? readStoredBotPersona("black", black as BotDifficulty) : null,
      },
    };
  }

  if (variantId === "chess_classic") {
    const white = readBotStorageValue(LAUNCHER_STORAGE_KEYS.chessBotWhite);
    const black = readBotStorageValue(LAUNCHER_STORAGE_KEYS.chessBotBlack);
    return {
      white: {
        controller: white && white !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
        level: white && white !== "human" ? (white as BotDifficulty) : null,
        persona: white && white !== "human" ? readStoredBotPersona("white", white as BotDifficulty) : null,
      },
      black: {
        controller: black && black !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
        level: black && black !== "human" ? (black as BotDifficulty) : null,
        persona: black && black !== "human" ? readStoredBotPersona("black", black as BotDifficulty) : null,
      },
    };
  }

  const white = readBotStorageValue(LAUNCHER_STORAGE_KEYS.aiWhite);
  const black = readBotStorageValue(LAUNCHER_STORAGE_KEYS.aiBlack);
  return {
    white: {
      controller: white && white !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
      level: white && white !== "human" ? (white as BotDifficulty) : null,
      persona: white && white !== "human" ? readStoredBotPersona("white", white as BotDifficulty) : null,
    },
    black: {
      controller: black && black !== "human" ? BotControllerMode.Bot : BotControllerMode.Human,
      level: black && black !== "human" ? (black as BotDifficulty) : null,
      persona: black && black !== "human" ? readStoredBotPersona("black", black as BotDifficulty) : null,
    },
  };
}

function hasBotControlledSeat(state: BotPlayState | null | undefined): state is BotPlayState {
  if (!state) return false;
  return state.white.controller === BotControllerMode.Bot || state.black.controller === BotControllerMode.Bot;
}

function createDefaultBotPlayState(variantId: VariantId): BotPlayState {
  const defaultLevel = getBotOptionsForVariant(variantId)[0]?.value ?? "advanced";
  return {
    white: {
      controller: BotControllerMode.Human,
      level: null,
      persona: null,
    },
    black: {
      controller: BotControllerMode.Bot,
      level: defaultLevel,
      persona: defaultBotPersonaForLevel(defaultLevel),
    },
  };
}

function resolveInitialBotPlayState(persistedState: BotPlayState | null, variantId: VariantId): BotPlayState {
  if (hasBotControlledSeat(persistedState)) return persistedState;

  const legacyState = readLegacyBotPlayState(variantId);
  if (hasBotControlledSeat(legacyState)) return legacyState;

  return createDefaultBotPlayState(variantId);
}

function writeBotPlayStateToLauncher(variantId: VariantId, state: BotPlayState): void {
  const whiteValue = state.white.controller === BotControllerMode.Bot ? state.white.level ?? "advanced" : "human";
  const blackValue = state.black.controller === BotControllerMode.Bot ? state.black.level ?? "advanced" : "human";
  writeLauncherValue(getBotPersonaStorageKey("white"), state.white.controller === BotControllerMode.Bot ? state.white.persona ?? defaultBotPersonaForLevel(state.white.level) : "");
  writeLauncherValue(getBotPersonaStorageKey("black"), state.black.controller === BotControllerMode.Bot ? state.black.persona ?? defaultBotPersonaForLevel(state.black.level) : "");

  if (variantId === "columns_chess") {
    writeLauncherValue(LAUNCHER_STORAGE_KEYS.columnsBotWhite, whiteValue);
    writeLauncherValue(LAUNCHER_STORAGE_KEYS.columnsBotBlack, blackValue);
    return;
  }
  if (variantId === "chess_classic") {
    writeLauncherValue(LAUNCHER_STORAGE_KEYS.chessBotWhite, whiteValue);
    writeLauncherValue(LAUNCHER_STORAGE_KEYS.chessBotBlack, blackValue);
  }
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.aiWhite, whiteValue);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.aiBlack, blackValue);
}

function isCurrentPageOnlineMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("mode") === "online";
  } catch {
    return false;
  }
}

function getCurrentPageBotSelectors(): {
  whiteSelect: HTMLSelectElement;
  blackSelect: HTMLSelectElement;
  pauseButton: HTMLButtonElement | null;
  pausedStorageKeys: string[];
} | null {
  const chessWhiteSelect = document.getElementById("botWhiteSelect") as HTMLSelectElement | null;
  const chessBlackSelect = document.getElementById("botBlackSelect") as HTMLSelectElement | null;
  if (chessWhiteSelect && chessBlackSelect) {
    return {
      whiteSelect: chessWhiteSelect,
      blackSelect: chessBlackSelect,
      pauseButton: document.getElementById("botPauseBtn") as HTMLButtonElement | null,
      pausedStorageKeys: ["lasca.chessbot.paused", "lasca.columnsChessBot.paused"],
    };
  }

  const aiWhiteSelect = document.getElementById("aiWhiteSelect") as HTMLSelectElement | null;
  const aiBlackSelect = document.getElementById("aiBlackSelect") as HTMLSelectElement | null;
  if (aiWhiteSelect && aiBlackSelect) {
    return {
      whiteSelect: aiWhiteSelect,
      blackSelect: aiBlackSelect,
      pauseButton: document.getElementById("aiPauseBtn") as HTMLButtonElement | null,
      pausedStorageKeys: ["lasca.ai.paused"],
    };
  }

  return null;
}

function resolveCurrentPageBotStartAvailability(): { available: boolean; reason: string | null } {
  if (isCurrentPageOnlineMode()) {
    return {
      available: false,
      reason: "Start on this page is only available in local play. This page is currently in online mode, so use the existing online/local-bot flow or return to the launcher.",
    };
  }

  if (getCurrentPageBotSelectors()) {
    return { available: true, reason: null };
  }

  return {
    available: false,
    reason: "Start on this page is unavailable because this variant page does not expose the live bot controls needed to apply the setup directly.",
  };
}

function resolveCurrentPageLocalBotStartAvailability(): { immediate: boolean; reason: string | null } {
  const availability = resolveCurrentPageBotStartAvailability();
  return {
    immediate: availability.available,
    reason: availability.reason,
  };
}

export function applyBotPlayStateToCurrentPage(state: BotPlayState): boolean {
  const selectors = getCurrentPageBotSelectors();
  if (!selectors) return false;

  // Set bot level (difficulty) selectors
  const applySeat = (select: HTMLSelectElement, seatState: BotPlayState["white"], personaId: string): void => {
    const desiredValue = seatState.controller === BotControllerMode.Bot ? seatState.level ?? "advanced" : "human";
    const fallbackBotValue = Array.from(select.options)
      .map((option) => String(option.value ?? "").trim())
      .find((value) => value && value !== "human") ?? "human";
    const nextValue = Array.from(select.options).some((option) => option.value === desiredValue)
      ? desiredValue
      : (desiredValue === "human" ? "human" : fallbackBotValue);
    select.value = nextValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    // Also set persona selector if present
    const personaSelect = document.getElementById(personaId) as HTMLSelectElement | null;
    if (personaSelect && seatState.persona) {
      personaSelect.value = seatState.persona;
      personaSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  applySeat(selectors.whiteSelect, state.white, "botWhitePersonaSelect");
  applySeat(selectors.blackSelect, state.black, "botBlackPersonaSelect");

  // Trigger player name update (if function exists globally)
  if (typeof window.syncConfiguredPlayerNames === "function") {
    window.syncConfiguredPlayerNames();
  } else {
    // Fallback: dispatch change event to trigger listeners
    selectors.whiteSelect.dispatchEvent(new Event("change", { bubbles: true }));
    selectors.blackSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  try {
    for (const key of selectors.pausedStorageKeys) {
      localStorage.setItem(key, "false");
    }
  } catch {
    // ignore storage failures
  }

  const pauseButton = selectors.pauseButton;
  if (pauseButton && !pauseButton.disabled && /resume/i.test(pauseButton.textContent ?? "")) {
    pauseButton.click();
  }

  return true;
}

function startCurrentPageNewGame(): boolean {
  const newGameButton = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (!newGameButton || newGameButton.disabled) return false;
  newGameButton.click();
  return true;
}

function buildCurrentVariantLocalHref(): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "local");
    url.searchParams.delete("server");
    url.searchParams.delete("roomId");
    url.searchParams.delete("playerId");
    url.searchParams.delete("watchToken");
    url.searchParams.delete("color");
    url.searchParams.delete("prefColor");
    url.searchParams.delete("visibility");
    url.searchParams.delete("create");
    url.searchParams.delete("join");
    url.searchParams.delete("botSeats");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return window.location.pathname;
  }
}

function resolveHumanSeatColor(state: BotPlayState): "W" | "B" | null {
  const whiteHuman = state.white.controller === BotControllerMode.Human;
  const blackHuman = state.black.controller === BotControllerMode.Human;
  const whiteBot = state.white.controller === BotControllerMode.Bot;
  const blackBot = state.black.controller === BotControllerMode.Bot;
  if (whiteHuman && blackBot) return "W";
  if (blackHuman && whiteBot) return "B";
  return null;
}

function persistOnlineLauncherState(args: {
  variantId: VariantId;
  onlineSubSection: OnlineSubSection;
  visibility: "public" | "private";
  activeSection: GlobalSection;
}): void {
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, args.variantId);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "online");
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineAction, "create");
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineVisibility, args.visibility);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineRoomId, "");
  updateShellState({
    activeGame: args.variantId,
    activeSection: args.activeSection,
    playSubSection: PlaySubSection.Online,
    onlineSubSection: args.onlineSubSection,
  });
}

function persistHostedRoomLauncherState(args: {
  variantId: VariantId;
  hostedRoomState: HostedRoomState;
}): void {
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, args.variantId);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "online");
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineAction, "create");
  writeLauncherValue(
    LAUNCHER_STORAGE_KEYS.onlineVisibility,
    args.hostedRoomState.visibility === HostedRoomVisibilityMode.Public ? "public" : "private",
  );
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineRoomId, "");
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineHostedVisibility, args.hostedRoomState.visibility);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineHostedOwnerControl, args.hostedRoomState.ownerControl);
  updateShellState({
    activeGame: args.variantId,
    activeSection: GlobalSection.Games,
    playSubSection: PlaySubSection.Online,
    onlineSubSection: OnlineSubSection.HostedRooms,
    hostedRoomState: args.hostedRoomState,
  });
}

function buildBotPersonaMeta(persona: BotPersona | null | undefined, level: BotDifficulty | null): { title: string; text: string; meta: string } {
  const definition = getBotPersonaDefinition(persona ?? defaultBotPersonaForLevel(level));
  if (!level) {
    return { title: definition.title, text: definition.text, meta: definition.meta };
  }

  const levelMeta = (() => {
    switch (level) {
      case "easy":
      case "beginner":
        return "Entry level";
      case "medium":
      case "intermediate":
        return "Mid strength";
      case "advanced":
        return "Advanced";
      case "master":
        return "Top strength";
      default:
        return "Configured";
    }
  })();

  return {
    title: definition.title,
    text: definition.text,
    meta: `${definition.meta} · ${levelMeta}`,
  };
}

function persistCoachLauncherState(args: {
  variantId: VariantId;
  coachLevel: CoachLevel;
  botPlayState: BotPlayState;
}): void {
  const preset = getCoachGuidancePreset(args.coachLevel);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, args.variantId);
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "local");
  writeLauncherValue(LAUNCHER_STORAGE_KEYS.coachLevel, args.coachLevel);
  writeBoolLauncherValue(getVariantMoveHintsKey(args.variantId), preset.moveHints);
  writeLauncherValue(getVariantMoveHintStyleKey(args.variantId), preset.moveHintStyle);
  writeBotPlayStateToLauncher(args.variantId, args.botPlayState);
  updateShellState({
    activeGame: args.variantId,
    activeSection: GlobalSection.Games,
    playSubSection: PlaySubSection.Coach,
    coachLevel: args.coachLevel,
    botPlayState: args.botPlayState,
  });
}

function ensurePlayHubStyles(): void {
  if (document.getElementById(PLAY_HUB_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PLAY_HUB_STYLE_ID;
  style.textContent = `
    .playHub {
      display: grid;
      gap: 12px;
    }

    .playHubHeader {
      display: grid;
      gap: 6px;
    }

    .playHubEyebrow {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .playHubTitle {
      margin: 0;
      font-size: 18px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubDescription {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.68);
    }

    .playHubTabs {
      gap: 6px;
    }

    .playHubBody {
      display: grid;
      gap: 10px;
    }

    .playHubPanel {
      display: none;
      gap: 10px;
    }

    .playHubPanel.isActive {
      display: grid;
    }

    .playHubActions,
    .playHubVariants {
      display: grid;
      gap: 8px;
    }

    .playHubAction,
    .playHubVariantButton {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 14px;
      padding: 11px 12px;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .playHubAction:hover,
    .playHubAction:focus-visible,
    .playHubVariantButton:hover,
    .playHubVariantButton:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .playHubAction:disabled,
    .playHubVariantButton:disabled {
      cursor: default;
      opacity: 0.55;
      background: rgba(255, 255, 255, 0.03);
    }

    .playHubVariantButton.isActive {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }

    .playHubActionLabel,
    .playHubVariantLabel {
      display: block;
      font-size: 12px;
      font-weight: 700;
    }

    .playHubActionDescription,
    .playHubVariantDescription {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.62);
    }

    .playHubPlaceholder {
      border-radius: 14px;
      border: 1px dashed rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
    }

    .playHubPlaceholderTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
    }

    .playHubPlaceholderText {
      margin: 6px 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.62);
    }

    .playHubSection {
      display: grid;
      gap: 8px;
    }

    .playHubSectionTitle {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .playHubOnlineModeTabs {
      gap: 6px;
    }

    .playHubOnlineModeHeader {
      display: grid;
      gap: 4px;
      padding: 2px 2px 0;
    }

    .playHubOnlineModeTitle {
      margin: 0;
      font-size: 13px;
      font-weight: 720;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubOnlineModeDescription {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.66);
    }

    .playHubOnlineModePanel {
      display: none;
      gap: 10px;
    }

    .playHubOnlineModePanel.isActive {
      display: grid;
    }

    .playHubHostedGrid,
    .playHubCoachLevels,
    .playHubBotProfiles {
      display: grid;
      gap: 8px;
    }

    .playHubHostedCard,
    .playHubCoachCard,
    .playHubBotProfileCard {
      display: grid;
      gap: 8px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
    }

    .playHubHostedCardTitle,
    .playHubCoachCardTitle,
    .playHubBotProfileTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 720;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubHostedCardText,
    .playHubCoachCardText,
    .playHubBotProfileText {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.64);
    }

    .playHubHostedFields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .playHubHostedStatus {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.64);
    }

    .playHubHostedRoomList {
      display: grid;
      gap: 8px;
    }

    .playHubHostedRoomCard {
      display: grid;
      gap: 8px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      padding: 10px;
    }

    .playHubHostedRoomTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.94);
    }

    .playHubHostedRoomMeta,
    .playHubHostedRoomSeats {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.62);
    }

    .playHubHostedRoomActions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .playHubHostedInlineAction {
      flex: 1 1 140px;
    }

    .playHubHostedField {
      display: grid;
      gap: 6px;
    }

    .playHubHostedFieldLabel {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .playHubHostedSelect {
      width: 100%;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(17, 17, 17, 0.88);
      color: rgba(255, 255, 255, 0.92);
      padding: 8px 10px;
    }

    .playHubBotProfileMeta {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(232, 191, 112, 0.72);
    }

    .playHubCoachOption {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 14px;
      padding: 12px;
      text-align: left;
      cursor: pointer;
    }

    .playHubCoachOption.isActive {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }

    .playHubCoachOptionLabel {
      display: block;
      font-size: 12px;
      font-weight: 720;
    }

    .playHubCoachOptionText {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.64);
    }

    .playHubCoachSummary {
      display: grid;
      gap: 4px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
    }

    .playHubBotSeats {
      display: grid;
      gap: 8px;
    }

    .playHubBotSeatCard {
      display: grid;
      gap: 10px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
    }

    .playHubBotSeatHeader {
      display: grid;
      gap: 4px;
    }

    .playHubBotSeatTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 720;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubBotSeatDescription {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.64);
    }

    .playHubBotSeatControls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .playHubBotField {
      display: grid;
      gap: 6px;
    }

    .playHubBotControllerRow {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .playHubBotFieldLabel {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .playHubBotSelect {
      width: 100%;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(17, 17, 17, 0.88);
      color: rgba(255, 255, 255, 0.92);
      padding: 8px 10px;
    }

    .playHubBotControllerRow .playHubBotSelect {
      flex: 1 1 auto;
      min-width: max-content;
    }

    .playHubBotControllerIdentity {
      flex: 0 0 auto;
      max-width: 100%;
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid rgba(232, 191, 112, 0.24);
      background: rgba(202, 157, 78, 0.1);
      color: rgba(255, 255, 255, 0.9);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playHubBotControllerIdentity[hidden] {
      display: none;
    }

    .playHubBotStateNote {
      border-radius: 14px;
      border: 1px solid rgba(232, 191, 112, 0.24);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.14), rgba(202, 157, 78, 0.04));
      padding: 12px;
      display: grid;
      gap: 4px;
    }

    .playHubBotStateTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 720;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubBotStateText {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.66);
    }

    .playHubBotWatchState {
      border-color: rgba(92, 128, 186, 0.24);
      background: linear-gradient(180deg, rgba(92, 128, 186, 0.14), rgba(92, 128, 186, 0.04));
    }

    @media (max-width: 560px) {
      .playHubHostedFields,
      .playHubBotSeatControls {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;

  document.head.appendChild(style);
}

function setLauncherVariant(variantId: VariantId): void {
  try {
    localStorage.setItem("lasca.variantId", variantId);
  } catch {
    // ignore
  }
}

function navigateToHref(href: string): void {
  window.location.href = href;
}

function updatePlayHubState(currentVariantId: VariantId, playSubSection: PlaySubSection, onlineSubSection?: OnlineSubSection | null): void {
  const persistedPlaySubSection = playSubSection === PlaySubSection.Resume ? PlaySubSection.Online : playSubSection;
  updateShellState({
    activeGame: currentVariantId,
    activeSection: GlobalSection.Games,
    playSubSection: persistedPlaySubSection,
    ...(onlineSubSection === undefined ? {} : { onlineSubSection }),
  });
}

function buildLauncherHref(baseHref: string, params?: Record<string, string | undefined>): string {
  try {
    const url = new URL(baseHref, window.location.href);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value && value.trim()) {
          url.searchParams.set(key, value);
        } else {
          url.searchParams.delete(key);
        }
      }
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return baseHref;
  }
}

function readResumeEntries(currentVariantId: VariantId, limit = 2): ResumeEntry[] {
  const prefix = "lasca.online.resume.";
  const records: Array<{ serverUrl: string; roomId: string; playerId: string; color?: "W" | "B"; displayName?: string; variantId?: VariantId; savedAtMs: number }> = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") continue;

      const serverUrl = typeof parsed.serverUrl === "string" ? parsed.serverUrl.trim() : "";
      const roomId = typeof parsed.roomId === "string" ? parsed.roomId.trim() : "";
      const playerId = typeof parsed.playerId === "string" ? parsed.playerId.trim() : "";
      if (!serverUrl || !roomId || !playerId) continue;

      records.push({
        serverUrl,
        roomId,
        playerId,
        ...(parsed.color === "W" || parsed.color === "B" ? { color: parsed.color } : {}),
        ...(typeof parsed.displayName === "string" && parsed.displayName.trim() ? { displayName: parsed.displayName.trim() } : {}),
        ...(typeof parsed.variantId === "string" ? { variantId: parsed.variantId as VariantId } : {}),
        savedAtMs: Number.isFinite(parsed.savedAtMs) ? Number(parsed.savedAtMs) : 0,
      });
    }
  } catch {
    return [];
  }

  const seen = new Set<string>();
  return records
    .filter((record) => !record.variantId || record.variantId === currentVariantId)
    .sort((left, right) => right.savedAtMs - left.savedAtMs)
    .filter((record) => {
      const id = `${record.serverUrl}::${record.roomId}::${record.playerId}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit)
    .map((record) => ({
      href: buildCurrentVariantOnlineHref({
        action: "rejoin",
        serverUrl: record.serverUrl,
        roomId: record.roomId,
        playerId: record.playerId,
        ...(record.color ? { color: record.color } : {}),
      }),
      label: record.displayName ? `Resume ${record.displayName}` : `Resume room ${record.roomId}`,
      description: `${record.serverUrl} · room ${record.roomId}`,
      roomId: record.roomId,
      serverUrl: record.serverUrl,
      playerId: record.playerId,
      ...(record.color ? { color: record.color } : {}),
    }));
}

function createAction(action: PlayHubAction): HTMLElement {
  const element = action.href ? document.createElement("a") : document.createElement("button");
  element.className = "playHubAction";
  element.innerHTML = `<span class="playHubActionLabel">${action.label}</span><span class="playHubActionDescription">${action.description}</span>`;

  if (element instanceof HTMLAnchorElement) {
    element.href = action.href as string;
    if (action.external) {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
    element.addEventListener("click", (event) => {
      if (action.disabled) {
        event.preventDefault();
        return;
      }
      action.onSelect?.();
    });
  } else {
    element.type = "button";
    element.disabled = Boolean(action.disabled);
    element.addEventListener("click", () => {
      if (action.disabled) return;
      action.onSelect?.();
    });
  }

  if (action.disabled) {
    element.setAttribute("aria-disabled", "true");
  }

  return element;
}

function createPlaceholder(title: string, description: string): HTMLElement {
  const placeholder = document.createElement("div");
  placeholder.className = "playHubPlaceholder";
  placeholder.innerHTML = `<p class="playHubPlaceholderTitle">${title}</p><p class="playHubPlaceholderText">${description}</p>`;
  return placeholder;
}

export function createPlayHub(opts: PlayHubOptions): PlayHubController {
  ensurePlayHubStyles();
  const resumeEntries = readResumeEntries(opts.currentVariantId);
  const persistedShellState = readShellState();
  const variant = getVariantById(opts.currentVariantId);
  const sideLabels = getSideLabelsForRuleset(variant.rulesetId, { boardSize: variant.boardSize });
  const botOptions = getBotOptionsForVariant(opts.currentVariantId);
  const configuredServerUrl = resolveConfiguredServerUrl();
  const availableTabs: PlaySubSection[] = [
    PlaySubSection.Online,
    PlaySubSection.Bots,
    PlaySubSection.Coach,
    PlaySubSection.Local,
    ...(resumeEntries.length ? [PlaySubSection.Resume] : []),
  ];
  const savedTab = persistedShellState.playSubSection === PlaySubSection.Resume
    ? PlaySubSection.Online
    : (persistedShellState.playSubSection ?? PlaySubSection.Online);
  const initialTab = availableTabs.includes(savedTab) ? savedTab : PlaySubSection.Online;
  const initialOnlineMode = ONLINE_MODE_DEFINITIONS.some((definition) => definition.id === persistedShellState.onlineSubSection)
    ? (persistedShellState.onlineSubSection as OnlineSubSection)
    : OnlineSubSection.QuickMatch;
  let botPlayState = resolveInitialBotPlayState(persistedShellState.botPlayState, opts.currentVariantId);
  let hostedRoomState: HostedRoomState = persistedShellState.hostedRoomState ?? {
    visibility: HostedRoomVisibilityMode.Public,
    ownerControl: HostedRoomOwnerControl.HostOnly,
  };
  let coachLevel: CoachLevel = persistedShellState.coachLevel ?? "beginner";
  let signedInHumanDisplayName: string | null = null;
  let hasRequestedSignedInHumanDisplayName = false;

  const root = document.createElement("section");
  root.className = "playHub";

  const header = document.createElement("div");
  header.className = "playHubHeader";
  header.innerHTML = `
    <p class="playHubEyebrow">Play hub</p>
    <h2 class="playHubTitle">Choose the next move</h2>
    <p class="playHubDescription">Route into the current game's live controls, jump back to the launcher, or switch to another StackWorks variant without relying on the legacy sidebars.</p>
  `;

  const body = document.createElement("div");
  body.className = "playHubBody";
  const panels = new Map<PlaySubSection, HTMLElement>();
  let activeOnlineMode = initialOnlineMode;
  let refreshHostedRoomDiscovery: ((force?: boolean) => Promise<void>) | null = null;

  const persistBotPlayState = (nextState: BotPlayState): void => {
    botPlayState = nextState;
    updateShellState({
      activeGame: opts.currentVariantId,
      activeSection: GlobalSection.Games,
      playSubSection: PlaySubSection.Bots,
      botPlayState: nextState,
    });
  };

  const persistHostedRoomState = (nextState: HostedRoomState): void => {
    hostedRoomState = nextState;
    updateShellState({
      activeGame: opts.currentVariantId,
      activeSection: GlobalSection.Games,
      playSubSection: PlaySubSection.Online,
      onlineSubSection: OnlineSubSection.HostedRooms,
      hostedRoomState: nextState,
    });
  };

  const persistCoachLevel = (nextLevel: CoachLevel): void => {
    coachLevel = nextLevel;
    updateShellState({
      activeGame: opts.currentVariantId,
      activeSection: GlobalSection.Games,
      playSubSection: PlaySubSection.Coach,
      coachLevel: nextLevel,
    });
  };

  const tabs = createTabs({
    className: "playHubTabs",
    activeId: initialTab,
    items: [
      {
        id: PlaySubSection.Online,
        label: "Online",
        onSelect: () => setActiveTab(PlaySubSection.Online),
      },
      {
        id: PlaySubSection.Bots,
        label: "Bots",
        onSelect: () => setActiveTab(PlaySubSection.Bots),
      },
      {
        id: PlaySubSection.Coach,
        label: "Coach",
        onSelect: () => setActiveTab(PlaySubSection.Coach),
      },
      {
        id: PlaySubSection.Local,
        label: "Local",
        onSelect: () => setActiveTab(PlaySubSection.Local),
      },
      ...(resumeEntries.length
        ? [{ id: PlaySubSection.Resume, label: "Resume", onSelect: () => setActiveTab(PlaySubSection.Resume) }]
        : []),
    ],
  });

  const setActiveTab = (tabId: PlaySubSection): void => {
    tabs.setActiveTab(tabId);
    updatePlayHubState(opts.currentVariantId, tabId);
    for (const [id, panel] of panels) {
      panel.classList.toggle("isActive", id === tabId);
    }
  };

  const onlinePanel = document.createElement("div");
  onlinePanel.className = "playHubPanel";
  const onlineModeTabs = createTabs({
    className: "playHubOnlineModeTabs",
    activeId: initialOnlineMode,
    items: ONLINE_MODE_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      onSelect: () => {
        activeOnlineMode = definition.id;
        updatePlayHubState(opts.currentVariantId, PlaySubSection.Online, definition.id);
        syncOnlineModePanels();
        if (definition.id === OnlineSubSection.HostedRooms) {
          void refreshHostedRoomDiscovery?.();
        }
      },
    })),
  });
  const onlineModePanels = new Map<OnlineSubSection, HTMLElement>();

  const syncOnlineModePanels = (): void => {
    onlineModeTabs.setActiveTab(activeOnlineMode);
    for (const [id, panel] of onlineModePanels) {
      panel.classList.toggle("isActive", id === activeOnlineMode);
    }
  };

  for (const definition of ONLINE_MODE_DEFINITIONS) {
    const modePanel = document.createElement("div");
    modePanel.className = "playHubOnlineModePanel";

    const modeHeader = document.createElement("div");
    modeHeader.className = "playHubOnlineModeHeader";
    modeHeader.innerHTML = `<h3 class="playHubOnlineModeTitle">${definition.title}</h3><p class="playHubOnlineModeDescription">${definition.description}</p>`;

    const modeActions = document.createElement("div");
    modeActions.className = "playHubActions";
    if (definition.id === OnlineSubSection.QuickMatch && configuredServerUrl) {
      modeActions.appendChild(createAction({
        label: "Host quick match here",
        description: "Reload this variant page in online create mode with a public room ready to host immediately.",
        href: buildCurrentVariantOnlineHref({ action: "create", serverUrl: configuredServerUrl, visibility: "public", suppressBotSeats: true }),
        onSelect: () => {
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, configuredServerUrl);
          persistOnlineLauncherState({
            variantId: opts.currentVariantId,
            onlineSubSection: OnlineSubSection.QuickMatch,
            visibility: "public",
            activeSection: GlobalSection.Games,
          });
        },
      }));
      if (resumeEntries.length > 0) {
        const latestResume = resumeEntries[0];
        modeActions.appendChild(createAction({
          label: latestResume.label,
          description: "Reload this variant page directly into your most recent unfinished online game for this variant.",
          href: latestResume.href,
          onSelect: () => {
            updateShellState({
              activeGame: opts.currentVariantId,
              activeSection: GlobalSection.Community,
              playSubSection: PlaySubSection.Online,
            });
          },
        }));
      }
      modeActions.appendChild(createAction({
        label: "Browse joinable rooms",
        description: "Stay on this variant page and switch to Hosted Rooms to join or spectate active public rooms.",
        onSelect: () => {
          activeOnlineMode = OnlineSubSection.HostedRooms;
          updatePlayHubState(opts.currentVariantId, PlaySubSection.Online, OnlineSubSection.HostedRooms);
          syncOnlineModePanels();
          void refreshHostedRoomDiscovery?.();
        },
      }));
    }
    if (definition.id === OnlineSubSection.QuickMatch && opts.onlineAction) {
      modeActions.appendChild(createAction(opts.onlineAction));
    }
    if (configuredServerUrl && definition.id === OnlineSubSection.CustomChallenge) {
      modeActions.appendChild(createAction({
        label: "Create custom challenge here",
        description: "Reload this variant page in online create mode with the current variant selected and challenge setup persisted.",
        href: buildCurrentVariantOnlineHref({ action: "create", serverUrl: configuredServerUrl, visibility: "public", suppressBotSeats: true }),
        onSelect: () => {
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, configuredServerUrl);
          persistOnlineLauncherState({
            variantId: opts.currentVariantId,
            onlineSubSection: OnlineSubSection.CustomChallenge,
            visibility: "public",
            activeSection: GlobalSection.Games,
          });
        },
      }));
    }
    if (configuredServerUrl && definition.id === OnlineSubSection.Friend) {
      modeActions.appendChild(createAction({
        label: "Create private invite room here",
        description: "Reload this variant page in online create mode with a private friend room ready to configure.",
        href: buildCurrentVariantOnlineHref({ action: "create", serverUrl: configuredServerUrl, visibility: "private", suppressBotSeats: true }),
        onSelect: () => {
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, configuredServerUrl);
          persistOnlineLauncherState({
            variantId: opts.currentVariantId,
            onlineSubSection: OnlineSubSection.Friend,
            visibility: "private",
            activeSection: GlobalSection.Games,
          });
        },
      }));
    }
    if (opts.backHref) {
      modeActions.appendChild(createAction({
        label: definition.launcherLabel,
        description: definition.launcherDescription,
        onSelect: () => {
          persistOnlineLauncherState({
            variantId: opts.currentVariantId,
            onlineSubSection: definition.id,
            visibility: definition.id === OnlineSubSection.Friend ? "private" : "public",
            activeSection: definition.id === OnlineSubSection.QuickMatch ? GlobalSection.Community : GlobalSection.Games,
          });
        },
        href: opts.backHref,
      }));
    }
    if (opts.helpHref && definition.id === OnlineSubSection.QuickMatch) {
      modeActions.appendChild(createAction({
        label: "Read online help",
        description: "Open the current game's rules and room guidance in a separate tab.",
        href: opts.helpHref,
        external: true,
      }));
    }

    if (definition.id === OnlineSubSection.HostedRooms) {
      const hostedBrowserState: HostedRoomBrowserState = {
        status: "idle",
        rooms: [],
        error: null,
        serverUrl: resolveConfiguredServerUrl(),
      };
      const hostedGrid = document.createElement("div");
      hostedGrid.className = "playHubHostedGrid";

      const hostedCard = document.createElement("section");
      hostedCard.className = "playHubHostedCard";
      hostedCard.innerHTML = `
        <h4 class="playHubHostedCardTitle">Room policy</h4>
        <p class="playHubHostedCardText">Choose whether the room is broadly discoverable, member-gated, or invite-only, then decide who controls access.</p>
      `;

      const hostedFields = document.createElement("div");
      hostedFields.className = "playHubHostedFields";

      const visibilityField = document.createElement("label");
      visibilityField.className = "playHubHostedField";
      visibilityField.innerHTML = '<span class="playHubHostedFieldLabel">Room type</span>';
      const visibilitySelect = document.createElement("select");
      visibilitySelect.className = "playHubHostedSelect";
      visibilitySelect.dataset.hostedField = "visibility";
      visibilitySelect.innerHTML = `
        <option value="public">Public room</option>
        <option value="private">Private room</option>
        <option value="invite-only">Invite-only room</option>
      `;
      visibilityField.appendChild(visibilitySelect);

      const ownerField = document.createElement("label");
      ownerField.className = "playHubHostedField";
      ownerField.innerHTML = '<span class="playHubHostedFieldLabel">Owner control</span>';
      const ownerSelect = document.createElement("select");
      ownerSelect.className = "playHubHostedSelect";
      ownerSelect.dataset.hostedField = "owner-control";
      ownerSelect.innerHTML = `
        <option value="host-only">Host controls invites</option>
        <option value="members-can-invite">Members can invite</option>
        <option value="organizer-managed">Organizer managed</option>
      `;
      ownerField.appendChild(ownerSelect);

      const syncHostedFields = (): void => {
        visibilitySelect.value = hostedRoomState.visibility;
        ownerSelect.value = hostedRoomState.ownerControl;
      };

      visibilitySelect.addEventListener("change", () => {
        persistHostedRoomState({
          ...hostedRoomState,
          visibility: visibilitySelect.value as HostedRoomVisibilityMode,
        });
      });
      ownerSelect.addEventListener("change", () => {
        persistHostedRoomState({
          ...hostedRoomState,
          ownerControl: ownerSelect.value as HostedRoomOwnerControl,
        });
      });
      syncHostedFields();

      hostedFields.append(visibilityField, ownerField);
      hostedCard.appendChild(hostedFields);

      const hostedDiscoveryCard = document.createElement("section");
      hostedDiscoveryCard.className = "playHubHostedCard";
      hostedDiscoveryCard.innerHTML = `
        <h4 class="playHubHostedCardTitle">Live rooms</h4>
        <p class="playHubHostedCardText">Browse the latest public rooms for this variant, then jump into join or spectate from the shell without hunting through the start page first.</p>
      `;
      const hostedStatus = document.createElement("p");
      hostedStatus.className = "playHubHostedStatus";
      hostedStatus.textContent = "Select Hosted Rooms to load active rooms.";
      const hostedRoomList = document.createElement("div");
      hostedRoomList.className = "playHubHostedRoomList";
      hostedDiscoveryCard.append(hostedStatus, hostedRoomList);

      const renderHostedRoomBrowser = (): void => {
        const serverUrl = hostedBrowserState.serverUrl;
        if (!serverUrl) {
          hostedStatus.textContent = "No online server is configured yet. Open the launcher to pick a server for Hosted Rooms.";
          hostedRoomList.replaceChildren();
          return;
        }
        if (hostedBrowserState.status === "loading") {
          hostedStatus.textContent = `Loading rooms from ${serverUrl}…`;
          hostedRoomList.replaceChildren();
          return;
        }
        if (hostedBrowserState.status === "error") {
          hostedStatus.textContent = hostedBrowserState.error ?? `Could not load rooms from ${serverUrl}.`;
          hostedRoomList.replaceChildren();
          return;
        }
        if (!hostedBrowserState.rooms.length) {
          hostedStatus.textContent = `No public ${variant.displayName} rooms are available on ${serverUrl} right now.`;
          hostedRoomList.replaceChildren();
          return;
        }

        hostedStatus.textContent = `${hostedBrowserState.rooms.length} live ${variant.displayName} room${hostedBrowserState.rooms.length === 1 ? "" : "s"} on ${serverUrl}.`;
        hostedRoomList.replaceChildren(...hostedBrowserState.rooms.map((room) => {
          const card = document.createElement("article");
          card.className = "playHubHostedRoomCard";
          const details = describeHostedRoom(room);

          const title = document.createElement("h5");
          title.className = "playHubHostedRoomTitle";
          title.textContent = details.title;

          const meta = document.createElement("p");
          meta.className = "playHubHostedRoomMeta";
          meta.textContent = details.meta;

          const seats = document.createElement("p");
          seats.className = "playHubHostedRoomSeats";
          seats.textContent = details.seats;

          const actions = document.createElement("div");
          actions.className = "playHubHostedRoomActions";
          if (serverUrl) {
            const joinAction = createAction({
              label: "Join room",
              description: "Reload this variant page directly into join mode for this room.",
              href: buildCurrentVariantOnlineHref({ action: "join", serverUrl, roomId: room.roomId }),
              disabled: room.seatsOpen.length === 0 || room.status === "game_over",
              onSelect: () => {
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, room.variantId);
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "online");
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, serverUrl);
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineAction, "join");
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineRoomId, room.roomId);
              },
            });
            joinAction.classList.add("playHubHostedInlineAction");
            actions.appendChild(joinAction);

            const spectateAction = createAction({
              label: "Spectate",
              description: room.visibility === "private"
                ? "Private rooms require a watch link."
                : "Reload this variant page in spectator mode for this room.",
              href: buildCurrentVariantOnlineHref({ action: "spectate", serverUrl, roomId: room.roomId }),
              disabled: room.visibility === "private",
              onSelect: () => {
                if (room.visibility === "private") return;
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, room.variantId);
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "online");
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, serverUrl);
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineAction, "spectate");
                writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineRoomId, room.roomId);
              },
            });
            spectateAction.classList.add("playHubHostedInlineAction");
            actions.appendChild(spectateAction);
          }

          card.append(title, meta, seats, actions);
          return card;
        }));
      };

      refreshHostedRoomDiscovery = async (force = false): Promise<void> => {
        if (!force && hostedBrowserState.status === "ready" && hostedBrowserState.rooms.length > 0) {
          renderHostedRoomBrowser();
          return;
        }

        hostedBrowserState.serverUrl = resolveConfiguredServerUrl();
        if (!hostedBrowserState.serverUrl) {
          hostedBrowserState.status = "error";
          hostedBrowserState.error = "No server configured.";
          hostedBrowserState.rooms = [];
          renderHostedRoomBrowser();
          return;
        }

        hostedBrowserState.status = "loading";
        hostedBrowserState.error = null;
        renderHostedRoomBrowser();

        try {
          const url = new URL(`/api/lobby?limit=${HOSTED_ROOM_LOBBY_LIMIT}&includeFull=1`, `${hostedBrowserState.serverUrl}/`);
          const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
          const json = await response.json() as { rooms?: LobbyRoomSummary[]; error?: string };
          if (!response.ok || typeof json?.error === "string") {
            throw new Error(typeof json?.error === "string" ? json.error : `${response.status} ${response.statusText}`);
          }
          const rooms = Array.isArray(json?.rooms) ? json.rooms : [];
          hostedBrowserState.status = "ready";
          hostedBrowserState.rooms = rooms
            .filter((room) => room.variantId === opts.currentVariantId)
            .sort((left, right) => {
              const leftCreatedAt = typeof left.createdAt === "string" ? Date.parse(left.createdAt) : 0;
              const rightCreatedAt = typeof right.createdAt === "string" ? Date.parse(right.createdAt) : 0;
              return rightCreatedAt - leftCreatedAt;
            });
        } catch (error) {
          hostedBrowserState.status = "error";
          hostedBrowserState.rooms = [];
          hostedBrowserState.error = error instanceof Error ? error.message : "Hosted room discovery failed.";
        }
        renderHostedRoomBrowser();
      };

      const hostedValueCard = document.createElement("section");
      hostedValueCard.className = "playHubHostedCard";
      hostedValueCard.innerHTML = `
        <h4 class="playHubHostedCardTitle">Community room shape</h4>
        <p class="playHubHostedCardText">Hosted Rooms are for clubs, schools, stream communities, and recurring friend groups. They keep a stable room identity instead of forcing a brand-new challenge each time.</p>
      `;

      hostedGrid.append(hostedCard, hostedDiscoveryCard, hostedValueCard);

      if (configuredServerUrl) {
        modeActions.appendChild(createAction({
          label: "Create hosted room",
          description: "Reload this variant page in online create mode with the current hosted-room policy already persisted.",
          href: buildCurrentVariantOnlineHref({
            action: "create",
            serverUrl: configuredServerUrl,
            visibility: hostedRoomState.visibility === HostedRoomVisibilityMode.Public ? "public" : "private",
            suppressBotSeats: true,
          }),
          onSelect: () => {
            writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, configuredServerUrl);
            persistHostedRoomLauncherState({ variantId: opts.currentVariantId, hostedRoomState });
          },
        }));
        modeActions.appendChild(createAction({
          label: "Refresh live rooms",
          description: "Reload the latest public rooms for this variant from the configured online server.",
          onSelect: () => {
            void refreshHostedRoomDiscovery?.(true);
          },
        }));
        if (opts.backHref) {
          modeActions.appendChild(createAction({
            label: "Open full lobby",
            description: "Return to the launcher with online mode focused on the current server.",
            href: buildOnlineLauncherHref(opts.backHref, { action: "create", serverUrl: configuredServerUrl }),
            onSelect: () => {
              writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineServerUrl, configuredServerUrl);
              writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "online");
              writeLauncherValue(LAUNCHER_STORAGE_KEYS.onlineAction, "create");
            },
          }));
        }
      }

      modePanel.append(modeHeader, hostedGrid, modeActions);
    } else {
      modePanel.append(
        modeHeader,
        modeActions,
        createPlaceholder(definition.placeholderTitle, definition.placeholderDescription),
      );
    }
    onlineModePanels.set(definition.id, modePanel);
  }

  onlinePanel.append(onlineModeTabs.element, ...onlineModePanels.values());
  panels.set(PlaySubSection.Online, onlinePanel);

  const botsPanel = document.createElement("div");
  botsPanel.className = "playHubPanel";
  const botSeatList = document.createElement("div");
  botSeatList.className = "playHubBotSeats";
  const botProfiles = document.createElement("div");
  botProfiles.className = "playHubBotProfiles";
  const botStateNote = document.createElement("div");
  botStateNote.className = "playHubBotStateNote";
  const botActions = document.createElement("div");
  botActions.className = "playHubActions";
  let syncBotPanel: (() => void) | null = null;

  const loadSignedInHumanDisplayName = async (): Promise<void> => {
    const nextDisplayName = await fetchSignedInDisplayName();
    if (signedInHumanDisplayName === nextDisplayName) return;
    signedInHumanDisplayName = nextDisplayName;
    syncBotPanel?.();
  };

  const seatBindings = ([
    { key: "white", label: sideLabels.W, description: `Choose whether ${sideLabels.W.toLowerCase()} is controlled by a person or a bot.` },
    { key: "black", label: sideLabels.B, description: `Choose whether ${sideLabels.B.toLowerCase()} is controlled by a person or a bot.` },
  ] as const).map((seat) => {
    const card = document.createElement("section");
    card.className = "playHubBotSeatCard";

    const header = document.createElement("div");
    header.className = "playHubBotSeatHeader";
    header.innerHTML = `<h3 class="playHubBotSeatTitle">${seat.label}</h3><p class="playHubBotSeatDescription">${seat.description}</p>`;

    const controls = document.createElement("div");
    controls.className = "playHubBotSeatControls";

    const controllerField = document.createElement("label");
    controllerField.className = "playHubBotField";
    controllerField.innerHTML = `<span class="playHubBotFieldLabel">Controller</span>`;
    const controllerRow = document.createElement("div");
    controllerRow.className = "playHubBotControllerRow";
    const controllerSelect = document.createElement("select");
    controllerSelect.className = "playHubBotSelect";
    controllerSelect.dataset.botSeat = seat.key;
    controllerSelect.dataset.botField = "controller";
    controllerSelect.innerHTML = '<option value="human">Human</option><option value="bot">Bot</option>';
    const controllerIdentity = document.createElement("span");
    controllerIdentity.className = "playHubBotControllerIdentity";
    controllerIdentity.dataset.botSeat = seat.key;
    controllerIdentity.dataset.botField = "controller-identity";
    controllerIdentity.hidden = true;
    controllerRow.append(controllerSelect, controllerIdentity);
    controllerField.appendChild(controllerRow);

    const levelField = document.createElement("label");
    levelField.className = "playHubBotField";
    levelField.innerHTML = `<span class="playHubBotFieldLabel">Bot level</span>`;
    const levelSelect = document.createElement("select");
    levelSelect.className = "playHubBotSelect";
    levelSelect.dataset.botSeat = seat.key;
    levelSelect.dataset.botField = "level";
    levelSelect.replaceChildren(...botOptions.map((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      return element;
    }));
    levelField.appendChild(levelSelect);

    const personaField = document.createElement("label");
    personaField.className = "playHubBotField";
    personaField.innerHTML = `<span class="playHubBotFieldLabel">Persona</span>`;
    const personaSelect = document.createElement("select");
    personaSelect.className = "playHubBotSelect";
    personaSelect.dataset.botSeat = seat.key;
    personaSelect.dataset.botField = "persona";
    personaSelect.replaceChildren(...BOT_PERSONAS.map((option) => {
      const element = document.createElement("option");
      element.value = option.id;
      element.textContent = option.label;
      return element;
    }));
    personaField.appendChild(personaSelect);

    controls.append(controllerField, levelField, personaField);
    card.append(header, controls);
    botSeatList.appendChild(card);

    return { seat, controllerSelect, controllerIdentity, levelField, levelSelect, personaField, personaSelect };
  });

  syncBotPanel = (): void => {
    if (!hasRequestedSignedInHumanDisplayName && resolveLocalAuthServerBaseUrl()) {
      hasRequestedSignedInHumanDisplayName = true;
      void loadSignedInHumanDisplayName();
    }

    for (const binding of seatBindings) {
      const state = botPlayState[binding.seat.key];
      binding.controllerSelect.value = state.controller;
      binding.levelSelect.value = state.level ?? botOptions[0]?.value ?? "advanced";
      binding.personaSelect.value = state.persona ?? defaultBotPersonaForLevel(state.level);
      const controllerIdentityText = state.controller === BotControllerMode.Human ? signedInHumanDisplayName : null;
      binding.controllerIdentity.textContent = controllerIdentityText ?? "";
      binding.controllerIdentity.hidden = !controllerIdentityText;
      const isBotSeat = state.controller === BotControllerMode.Bot;
      // Use visibility:hidden instead of display:none so the 3-column grid keeps
      // its full width — if the fields were removed from layout the card would
      // shrink and make the controller select narrower when Human is selected.
      binding.levelField.style.visibility = isBotSeat ? "" : "hidden";
      binding.levelField.style.pointerEvents = isBotSeat ? "" : "none";
      binding.levelField.removeAttribute("hidden");
      binding.personaField.style.visibility = isBotSeat ? "" : "hidden";
      binding.personaField.style.pointerEvents = isBotSeat ? "" : "none";
      binding.personaField.removeAttribute("hidden");
      binding.levelSelect.disabled = !isBotSeat;
      binding.personaSelect.disabled = !isBotSeat;
    }

    const bothHuman = botPlayState.white.controller === BotControllerMode.Human && botPlayState.black.controller === BotControllerMode.Human;
    const bothBots = botPlayState.white.controller === BotControllerMode.Bot && botPlayState.black.controller === BotControllerMode.Bot;
    botStateNote.classList.toggle("playHubBotWatchState", bothBots);
    botStateNote.innerHTML = bothHuman
      ? '<p class="playHubBotStateTitle">Route this setup to Local</p><p class="playHubBotStateText">Play Bots cannot resolve to Human vs Human. If both seats stay human, the shell should move the user to Local setup instead of pretending this is a bot match.</p>'
      : bothBots
        ? '<p class="playHubBotStateTitle">Watch Bots mode ready</p><p class="playHubBotStateText">Both seats are bot-controlled, so this setup can run as a local watch mode while preserving move history and playback.</p>'
        : '<p class="playHubBotStateTitle">Two-seat bot setup</p><p class="playHubBotStateText">Keep Human vs Bot as the default, allow Bot vs Bot for watch mode, and persist the exact seat roles before returning to the launcher.</p>';

    botProfiles.replaceChildren();
    for (const seatKey of ["white", "black"] as const) {
      const seatState = botPlayState[seatKey];
      const profile = document.createElement("section");
      profile.className = "playHubBotProfileCard";
      if (seatState.controller === BotControllerMode.Bot && seatState.level) {
        const persona = buildBotPersonaMeta(seatState.persona, seatState.level);
        profile.innerHTML = `
          <div class="playHubBotProfileMeta">${seatKey === "white" ? sideLabels.W : sideLabels.B}</div>
          <h4 class="playHubBotProfileTitle">${persona.title}</h4>
          <p class="playHubBotProfileText">${persona.text}</p>
          <p class="playHubBotProfileMeta">${persona.meta}</p>
        `;
      } else {
        const humanDisplayName = signedInHumanDisplayName || (seatKey === "white" ? sideLabels.W : sideLabels.B);
        profile.innerHTML = `
          <div class="playHubBotProfileMeta">${seatKey === "white" ? sideLabels.W : sideLabels.B}</div>
          <h4 class="playHubBotProfileTitle">${humanDisplayName}</h4>
          <p class="playHubBotProfileText">${signedInHumanDisplayName ? "Signed-in local player for this seat." : "Default local human player for this seat."}</p>
        `;
      }
      botProfiles.appendChild(profile);
    }

    botActions.replaceChildren();
    if (bothHuman) {
      botActions.appendChild(createAction({
        label: "Switch to Local setup",
        description: "Both seats are human, so this configuration belongs under Local instead of Play Bots.",
        onSelect: () => setActiveTab(PlaySubSection.Local),
      }));
      if (opts.localAction) botActions.appendChild(createAction(opts.localAction));
      return;
    }

    const localStart = resolveCurrentPageLocalBotStartAvailability();
    botActions.appendChild(createAction({
      label: bothBots ? "Start new offline watch match" : "Start new offline bot game",
      description: localStart.immediate
        ? "Apply these bot seats and reload the page to guarantee overlays and board fit are correct."
        : (localStart.reason ?? "Save this setup and reload the current page into local bot play."),
      href: !localStart.immediate || isCurrentPageOnlineMode() ? buildCurrentVariantLocalHref() : undefined,
      onSelect: () => {
        // Always persist the latest bot settings to both localStorage and shell state before reload
        writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "local");
        writeBotPlayStateToLauncher(opts.currentVariantId, botPlayState);
        updateShellState({
          activeGame: opts.currentVariantId,
          activeSection: GlobalSection.Games,
          playSubSection: PlaySubSection.Bots,
          botPlayState,
        });
        if (localStart.immediate && !isCurrentPageOnlineMode()) {
          // Always force a full reload for all configurations (bot+bot, human+bot) to
          // guarantee overlays, board fit, and player names are all initialised correctly.
          window.location.reload();
        }
      },
    }));

    const humanSeatColor = resolveHumanSeatColor(botPlayState);
    if (humanSeatColor) {
      botActions.appendChild(createAction({
        label: "Start online bot room here",
        description: "Create a new online room on this variant page with the human seat local and the opposite seat configured as a local bot.",
        href: buildCurrentVariantOnlineHref({
          action: "create",
          serverUrl: configuredServerUrl,
          prefColor: humanSeatColor,
          visibility: "public",
        }),
        onSelect: () => {
          // Assign the bot seat as a local bot for this client before creating the room.
          // This ensures hasConfiguredOnlineLocalBot returns true and the bot manager is started.
          writeBotPlayStateToLauncher(opts.currentVariantId, botPlayState);
          // Save a local seat record for the bot seat so the driver knows this client controls it.
          try {
            const serverUrl = configuredServerUrl;
            const roomId = localStorage.getItem(LAUNCHER_STORAGE_KEYS.onlineRoomId) || "";
            const localSeatPlayerIdsByColor = { W: null, B: null };
            // Assign the bot seat to this client (opposite of humanSeatColor)
            const botColor = humanSeatColor === "W" ? "B" : "W";
            localSeatPlayerIdsByColor[botColor] = "local-bot";
            window.localStorage.setItem(
              `stackworks.online.localSeat.${serverUrl}.${roomId}`,
              JSON.stringify({ serverUrl, roomId, localSeatPlayerIdsByColor, savedAtMs: Date.now() })
            );
          } catch {}
          updateShellState({
            activeGame: opts.currentVariantId,
            activeSection: GlobalSection.Games,
            playSubSection: PlaySubSection.Bots,
            botPlayState,
          });
        },
      }));
    } else if (bothBots) {
      botActions.appendChild(createAction({
        label: "Start online bot room unavailable",
        description: "Online bot rooms currently support a local human plus one configured local bot seat. Bot-vs-bot online broadcast mode is still not implemented.",
        disabled: true,
      }));
    }

    if (bothBots) {
      botActions.appendChild(createAction({
        label: "Open watch-bots launcher",
        description: "Return to the launcher with both seats bot-controlled so the match starts in bot-vs-bot watch mode.",
        href: opts.backHref,
        disabled: !opts.backHref,
        onSelect: () => {
          if (!opts.backHref) return;
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, opts.currentVariantId);
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "local");
          writeBotPlayStateToLauncher(opts.currentVariantId, botPlayState);
          updateShellState({
            activeGame: opts.currentVariantId,
            activeSection: GlobalSection.Games,
            playSubSection: PlaySubSection.Bots,
            botPlayState,
          });
        },
      }));
    }

    if (opts.backHref) {
      botActions.appendChild(createAction({
        label: "Open bot launcher",
        description: "Return to the launcher with these bot seat assignments and difficulty choices already stored for this variant.",
        href: opts.backHref,
        onSelect: () => {
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.variantId, opts.currentVariantId);
          writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "local");
          writeBotPlayStateToLauncher(opts.currentVariantId, botPlayState);
          updateShellState({
            activeGame: opts.currentVariantId,
            activeSection: GlobalSection.Games,
            playSubSection: PlaySubSection.Bots,
            botPlayState,
          });
        },
      }));
    }
    if (opts.botAction) botActions.appendChild(createAction(opts.botAction));
  };

  for (const binding of seatBindings) {
    binding.controllerSelect.addEventListener("change", () => {
      const nextController = binding.controllerSelect.value === BotControllerMode.Bot ? BotControllerMode.Bot : BotControllerMode.Human;
      const nextState: BotPlayState = {
        ...botPlayState,
        [binding.seat.key]: {
          controller: nextController,
          level: nextController === BotControllerMode.Bot ? ((binding.levelSelect.value as BotDifficulty) || botOptions[0]?.value || null) : null,
          persona: nextController === BotControllerMode.Bot ? (binding.personaSelect.value as BotPersona) : null,
        },
      };
      persistBotPlayState(nextState);
      syncBotPanel();
    });
    binding.levelSelect.addEventListener("change", () => {
      const nextState: BotPlayState = {
        ...botPlayState,
        [binding.seat.key]: {
          controller: BotControllerMode.Bot,
          level: (binding.levelSelect.value as BotDifficulty) || botOptions[0]?.value || null,
          persona: (binding.personaSelect.value as BotPersona) || defaultBotPersonaForLevel(binding.levelSelect.value as BotDifficulty),
        },
      };
      persistBotPlayState(nextState);
      syncBotPanel();
    });
    binding.personaSelect.addEventListener("change", () => {
      const nextState: BotPlayState = {
        ...botPlayState,
        [binding.seat.key]: {
          controller: BotControllerMode.Bot,
          level: (binding.levelSelect.value as BotDifficulty) || botOptions[0]?.value || null,
          persona: (binding.personaSelect.value as BotPersona) || defaultBotPersonaForLevel(binding.levelSelect.value as BotDifficulty),
        },
      };
      persistBotPlayState(nextState);
      syncBotPanel();
    });
  }

  syncBotPanel();
  botsPanel.append(botStateNote, botActions, botSeatList, botProfiles);
  panels.set(PlaySubSection.Bots, botsPanel);

  const coachPanel = document.createElement("div");
  coachPanel.className = "playHubPanel";
  const coachLevels = document.createElement("div");
  coachLevels.className = "playHubCoachLevels";
  const coachSummary = document.createElement("section");
  coachSummary.className = "playHubCoachSummary";
  const coachActions = document.createElement("div");
  coachActions.className = "playHubActions";

  const coachButtons = new Map<CoachLevel, HTMLButtonElement>();
  const syncCoachPanel = (): void => {
    for (const [id, button] of coachButtons) {
      const isActive = id === coachLevel;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    const selected = COACH_LEVELS.find((level) => level.id === coachLevel) ?? COACH_LEVELS[0];
    const preset = getCoachGuidancePreset(selected.id);
    coachSummary.innerHTML = `
      <h4 class="playHubCoachCardTitle">${selected.label}</h4>
      <p class="playHubCoachCardText">${selected.description}</p>
      <p class="playHubCoachCardText">Coach mode is level-first: the shell will launch with ${preset.moveHints ? `${preset.moveHintStyle} move hints enabled` : "move hints disabled"}, ${preset.emphasis.toLowerCase()}, and ${preset.cadence.toLowerCase()}.</p>
    `;

    coachActions.replaceChildren();
    if (opts.backHref) {
      coachActions.appendChild(createAction({
        label: `Open ${selected.label} coach`,
        description: "Return to the launcher with a human-vs-bot training setup tied to the selected coaching level.",
        href: opts.backHref,
        onSelect: () => {
          const coachBotState: BotPlayState = {
            white: { controller: BotControllerMode.Human, level: null, persona: null },
            black: {
              controller: BotControllerMode.Bot,
              level: selected.id === "new-to-chess" || selected.id === "beginner"
                ? botOptions[0]?.value ?? "easy"
                : selected.id === "novice" || selected.id === "intermediate"
                  ? botOptions[Math.min(1, botOptions.length - 1)]?.value ?? botOptions[0]?.value ?? "medium"
                  : botOptions[botOptions.length - 1]?.value ?? "advanced",
              persona: selected.id === "new-to-chess" || selected.id === "beginner"
                ? "teacher"
                : selected.id === "advanced" || selected.id === "expert"
                  ? "endgame"
                  : "balanced",
            },
          };
          persistCoachLauncherState({
            variantId: opts.currentVariantId,
            coachLevel: selected.id,
            botPlayState: coachBotState,
          });
        },
      }));
    }
  };

  for (const level of COACH_LEVELS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playHubCoachOption";
    button.dataset.coachLevel = level.id;
    button.innerHTML = `<span class="playHubCoachOptionLabel">${level.label}</span><span class="playHubCoachOptionText">${level.description}</span>`;
    button.addEventListener("click", () => {
      persistCoachLevel(level.id);
      syncCoachPanel();
    });
    coachButtons.set(level.id, button);
    coachLevels.appendChild(button);
  }

  syncCoachPanel();
  coachPanel.append(coachLevels, coachSummary, coachActions);
  panels.set(PlaySubSection.Coach, coachPanel);

  const localPanel = document.createElement("div");
  localPanel.className = "playHubPanel";
  const localActions = document.createElement("div");
  localActions.className = "playHubActions";
  if (opts.localAction) {
    localActions.appendChild(createAction(opts.localAction));
  }
  if (opts.backHref) {
    localActions.appendChild(createAction({
      label: "Open local launcher",
      description: "Return to the start page with this variant selected for offline setup, local seats, and current launch preferences.",
      onSelect: () => {
        updateShellState({
          activeGame: opts.currentVariantId,
          activeSection: GlobalSection.Games,
          playSubSection: PlaySubSection.Local,
        });
      },
      href: opts.backHref,
    }));
  }
  const variantsSection = document.createElement("div");
  variantsSection.className = "playHubSection";
  const variantsTitle = document.createElement("p");
  variantsTitle.className = "playHubSectionTitle";
  variantsTitle.textContent = "Switch variant";
  const variantsList = document.createElement("div");
  variantsList.className = "playHubVariants";
  for (const game of APP_SHELL_GAMES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playHubVariantButton";
    button.innerHTML = `<span class="playHubVariantLabel">${game.displayName}</span><span class="playHubVariantDescription">${game.subtitle}</span>`;
    const isActive = game.variantId === opts.currentVariantId;
    const isLaunchable = game.available && Boolean(game.entryUrl);
    button.classList.toggle("isActive", isActive);
    button.disabled = isActive || !isLaunchable;
    button.addEventListener("click", () => {
      if (!isLaunchable || !game.entryUrl || isActive) return;
      setLauncherVariant(game.variantId);
      updateShellState({
        activeGame: game.variantId,
        activeSection: GlobalSection.Games,
        playSubSection: PlaySubSection.Local,
      });
      navigateToHref(game.entryUrl);
    });
    variantsList.appendChild(button);
  }
  variantsSection.append(variantsTitle, variantsList);
  localPanel.append(localActions, variantsSection);
  panels.set(PlaySubSection.Local, localPanel);

  if (resumeEntries.length) {
    const resumePanel = document.createElement("div");
    resumePanel.className = "playHubPanel";
    const resumeActions = document.createElement("div");
    resumeActions.className = "playHubActions";
    for (const entry of resumeEntries) {
      resumeActions.appendChild(createAction({
        label: entry.label,
        description: entry.description,
        href: entry.href,
        onSelect: () => {
          // If this is a local/offline game, trigger a true new game initialization
          // by applying the current bot/player settings and starting a new game.
          // Otherwise, fall back to the default resume logic for online games.
          const isOffline = !entry.serverUrl || entry.serverUrl === "local" || entry.serverUrl === "";
          if (isOffline) {
            // Apply current bot/player settings (preserve user config)
            writeLauncherValue(LAUNCHER_STORAGE_KEYS.playMode, "local");
            writeBotPlayStateToLauncher(opts.currentVariantId, botPlayState);
            // Force a full reload to guarantee overlays and board fit are correct (matches manual refresh)
            window.location.reload();
          } else {
            updateShellState({
              activeGame: opts.currentVariantId,
              activeSection: GlobalSection.Community,
              playSubSection: PlaySubSection.Online,
            });
          }
        },
      }));
    }
    resumePanel.append(
      resumeActions,
      createPlaceholder(
        "Resume and rejoin",
        "Saved online seats appear here when the browser has a stored resume record, so interrupted games can be resumed without keeping Rejoin as a permanent top-level launcher mode.",
      ),
    );
    panels.set(PlaySubSection.Resume, resumePanel);
  }

  for (const panel of panels.values()) {
    body.appendChild(panel);
  }

  root.append(header, tabs.element, body);
  setActiveTab(initialTab);
  syncOnlineModePanels();
  if (initialOnlineMode === OnlineSubSection.HostedRooms) {
    void refreshHostedRoomDiscovery?.();
  }

  return {
    element: root,
    setActiveTab,
  };
}