import { DEFAULT_THEME_ID, getThemeById, THEMES } from "./theme/themes";
import { DEFAULT_VARIANT_ID, VARIANTS, getVariantById, isVariantId } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import type { GetLobbyResponse, GetRoomMetaResponse, LobbyRoomSummary, PlayerColor, RoomVisibility } from "./shared/onlineProtocol.ts";
import { setGuestDisplayName } from "./shared/guestIdentity.ts";
import { createSfxManager } from "./ui/sfx";
import type { AuthMeResponse, AuthOkResponse, AuthErrorResponse, AuthUser } from "./shared/authProtocol.ts";
import { listCountryOptions, listTimeZones, normalizeCountryCode, resolveCountryName, resolveLocalTimeZone } from "./shared/profileMetadata.ts";
import { normalizeCheckerboardThemeId } from "./render/checkerboardTheme";
import {
  normalizeAnalysisSquareHighlightStyle,
  normalizeLastMoveHighlightStyle,
  normalizeMoveHintStyle,
  normalizeSelectionStyle,
} from "./render/highlightStyles";
import { getSideLabelsForRuleset } from "./shared/sideTerminology";
import { applyPanelLayoutMode, installPanelLayoutStartPageOptionUI, readPanelLayoutMode } from "./ui/panelLayoutMode";
import { readBoardViewportMode, writeBoardViewportMode } from "./ui/boardViewportMode";
import { createLobbyIdentityChip } from "./ui/lobby/lobbyIdentityChip";
import { initStartPageAppShell } from "./ui/shell/appShell";
import { GlobalSection, readShellState } from "./config/shellState";
import { installPlayerBotSelector, syncPlayerBotSelector } from "./ui/bot/playerBotSelector";
import {
  buildSessionAuthFetchInit,
  clearAuthSessionToken,
  persistAuthSessionFromPayload,
  readAuthSessionToken,
} from "./shared/authSessionClient";
import {
  deriveOnlineLaunchIdentity as deriveOnlineLaunchIdentityFromSeatConfig,
  resolveOnlineHumanSeat,
} from "./shared/onlineHumanSeat.ts";

const LS_KEYS = {
  theme: "lasca.theme",
  chessTheme: "lasca.chess.theme",
  columnsChessTheme: "lasca.columnsChess.theme",
  checkersTheme: "lasca.checkers.theme",
  checkersCheckerboardTheme: "lasca.checkers.checkerboardTheme",
  glassBg: "lasca.theme.glassBg",
  glassPalette: "lasca.theme.glassPalette",
  startSplashSeen: "lasca.start.splashSeen",
  startSectionsOpen: "lasca.start.sectionsOpen",
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  aiDelayMs: "lasca.ai.delayMs",
  aiPaused: "lasca.ai.paused",

  columnsBotWhite: "lasca.columnsChessBot.white",
  columnsBotBlack: "lasca.columnsChessBot.black",
  columnsBotDelayMs: "lasca.columnsChessBot.delayMs",
  columnsBotPaused: "lasca.columnsChessBot.paused",

  variantId: "lasca.variantId",

  optMoveHints: "lasca.opt.moveHints",
  optMoveHintStyle: "lasca.opt.moveHintStyle",
  optAnimations: "lasca.opt.animations",
  optShowResizeIcon: "lasca.opt.showResizeIcon",
  optBoardCoords: "lasca.opt.boardCoords",
  optBoardCoordsInSquares: "lasca.opt.boardCoordsInSquares",
  optFlipBoard: "lasca.opt.flipBoard",
  optChessHighlightSquares: "lasca.opt.chess.highlightSquares",
  optBoard8x8Checkered: "lasca.opt.board8x8Checkered",
  optCheckerboardTheme: "lasca.opt.checkerboardTheme",
  optLastMoveHighlights: "lasca.opt.lastMoveHighlights",
  optLastMoveHighlightStyle: "lasca.opt.lastMoveHighlightStyle",
  optChessMovePreviewMode: "lasca.opt.chess.movePreviewMode",
  optChessSelectionStyle: "lasca.opt.chess.selectionStyle",
  optChessLastMoveHighlightStyle: "lasca.opt.chess.lastMoveHighlightStyle",
  optColumnsLastMoveHighlightStyle: "lasca.opt.columnsChess.lastMoveHighlightStyle",
  optChessAnalysisSquareHighlightStyle: "lasca.opt.chess.analysisSquareHighlightStyle",
  optColumnsAnalysisSquareHighlightStyle: "lasca.opt.columnsChess.analysisSquareHighlightStyle",
  optThreefold: "lasca.opt.threefold",
  optToasts: "lasca.opt.toasts",
  optSfx: "lasca.opt.sfx",
  optShowPlayerNames: "lasca.opt.chess.showPlayerNames",

  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
  onlinePrefColor: "lasca.online.prefColor",
  onlineVisibility: "lasca.online.visibility",

  lobbyMineOnly: "lasca.lobby.mineOnly",
  localPlayerLight: "lasca.local.nameLight",
  localPlayerDark: "lasca.local.nameDark",
  onlineSeatOwnerLight: "lasca.online.seatOwnerLight",
  onlineSeatOwnerDark: "lasca.online.seatOwnerDark",
} as const;

const START_SPLASH_MS = 3500;

type ChessMovePreviewMode = "off" | "stackworks" | "stackworks-squares" | "chesscom";

function getLastMoveHighlightStyleKey(variantId: VariantId): string {
  if (variantId === "chess_classic") return LS_KEYS.optChessLastMoveHighlightStyle;
  if (variantId === "columns_chess") return LS_KEYS.optColumnsLastMoveHighlightStyle;
  return LS_KEYS.optLastMoveHighlightStyle;
}

function normalizeChessMovePreviewMode(value: string | null | undefined): ChessMovePreviewMode {
  switch (value) {
    case "off":
    case "stackworks":
    case "stackworks-squares":
    case "chesscom":
      return value;
    default:
      return "stackworks";
  }
}

function deriveLegacyChessMovePreviewMode(): ChessMovePreviewMode {
  const moveHintsEnabled = readBool(LS_KEYS.optMoveHints, true);
  if (!moveHintsEnabled) return "off";

  const moveHintStyle = normalizeMoveHintStyle(localStorage.getItem(LS_KEYS.optMoveHintStyle));
  if (moveHintStyle === "chesscom") return "chesscom";

  const highlightSquaresEnabled = readBool(LS_KEYS.optChessHighlightSquares, false);
  return highlightSquaresEnabled ? "stackworks-squares" : "stackworks";
}

type StartSectionOpenMap = Record<string, boolean>;

function initStartPageCollapsibleSections(): void {
  const els = Array.from(document.querySelectorAll('details[data-start-section]')) as HTMLDetailsElement[];
  if (!els.length) return;

  let saved: StartSectionOpenMap | null = null;
  try {
    const raw = localStorage.getItem(LS_KEYS.startSectionsOpen);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") saved = parsed as StartSectionOpenMap;
    }
  } catch {
    saved = null;
  }

  if (saved) {
    for (const el of els) {
      const key = (el.dataset.startSection || "").trim();
      if (!key) continue;
      const v = saved[key];
      if (typeof v === "boolean") el.open = v;
    }
  } else {
    // First time (or storage cleared): default all expanded.
    for (const el of els) el.open = true;
  }

  const persist = (): void => {
    const next: StartSectionOpenMap = {};
    for (const el of els) {
      const key = (el.dataset.startSection || "").trim();
      if (!key) continue;
      next[key] = Boolean(el.open);
    }
    try {
      localStorage.setItem(LS_KEYS.startSectionsOpen, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  for (const el of els) {
    el.addEventListener("toggle", persist);
  }
}

function initStartSplash(): (() => void) | null {
  const root = document.documentElement;
  if (!root.classList.contains("showStartSplash")) return null;

  try {
    localStorage.setItem(LS_KEYS.startSplashSeen, "1");
  } catch {
    // ignore
  }

  // Anchor to navigation start (performance.now() is measured from there).
  // This means "elapsed" reflects how long the user has already been looking at
  // the splash — including the time spent downloading and parsing the JS bundle —
  // so a slow CDN load counts toward the minimum branding delay.
  const startedAt = 0;
  const dismiss = () => root.classList.remove("showStartSplash");

  // Fallback: always dismiss after START_SPLASH_MS even if finalizeSplash is never called.
  let fallbackTimer: ReturnType<typeof window.setTimeout> | null = window.setTimeout(dismiss, START_SPLASH_MS);

  // Called when startup is complete. If startup took longer than START_SPLASH_MS
  // (e.g. slow CDN parse time), dismisses immediately. Otherwise waits only the
  // remaining portion of the minimum branding delay.
  return () => {
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    const elapsed = performance.now() - startedAt;
    const remaining = START_SPLASH_MS - elapsed;
    if (remaining <= 0) {
      dismiss();
    } else {
      window.setTimeout(dismiss, remaining);
    }
  };
}

function maybeResetCheckersThemePrefs(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resetCheckersTheme") !== "1") return;

    localStorage.removeItem(LS_KEYS.checkersTheme);
    localStorage.removeItem(LS_KEYS.checkersCheckerboardTheme);

    params.delete("resetCheckersTheme");
    const qs = params.toString();
    const nextUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(null, "", nextUrl);
  } catch {
    // ignore
  }
}

type PreferredColor = "auto" | "W" | "B";

type Difficulty = "human" | "easy" | "medium" | "advanced";
type ColumnsBotSide = "human" | "bot";
type PlayMode = "local" | "online";
type OnlineAction = "create" | "join" | "spectate" | "rejoin";
type GlassBg = "original" | "felt" | "walnut";
type GlassPaletteId =
  | "yellow_blue"
  | "cyan_violet"
  | "mint_magenta"
  | "pearl_smoke"
  | "lavender_sapphire"
  | "aqua_amber";

type OnlineResumeRecord = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  color?: "W" | "B";
  /** Informational: display name used when this seat was created/joined. */
  displayName?: string;
  savedAtMs: number;
};

const CHESSBOT_LS_KEYS = {
  white: "lasca.chessbot.white",
  black: "lasca.chessbot.black",
  paused: "lasca.chessbot.paused",
  delay: "lasca.chessbot.delayMs",
} as const;

type ChessBotSideSetting = "human" | "beginner" | "intermediate" | "strong";

function difficultyToChessBotSide(raw: string): ChessBotSideSetting {
  if (raw === "easy") return "beginner";
  if (raw === "medium") return "intermediate";
  if (raw === "advanced") return "strong";
  return "human";
}

function chessBotSideToDifficulty(raw: string | null): Difficulty {
  if (raw === "beginner") return "easy";
  if (raw === "intermediate") return "medium";
  if (raw === "strong") return "advanced";
  return "human";
}

function readColumnsBotSide(key: string, fallback: ColumnsBotSide): ColumnsBotSide {
  try {
    const raw = localStorage.getItem(key);
    return raw === "bot" ? "bot" : "human";
  } catch {
    return fallback;
  }
}

function writeColumnsBotSide(key: string, value: ColumnsBotSide): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function sanitizeResumeDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const cleaned = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const capped = cleaned.slice(0, 24);
  return capped || undefined;
}

function sanitizeResumePlayerId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "spectator") return undefined;
  // Player IDs are server-generated hex IDs.
  if (!/^[0-9a-f]+$/i.test(s)) return undefined;
  if (s.length < 4) return undefined;
  return s;
}

function resumeStorageKey(serverUrl: string, roomId: string): string {
  const s = normalizeServerUrl(serverUrl);
  const r = (roomId || "").trim();
  return `lasca.online.resume.${encodeURIComponent(s)}.${encodeURIComponent(r)}`;
}

function findAnyResumeRecordsForRoomId(roomId: string): OnlineResumeRecord[] {
  const r = (roomId || "").trim();
  if (!r) return [];

  const out: OnlineResumeRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("lasca.online.resume.")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const rec = JSON.parse(raw) as any;
      if (!rec || typeof rec !== "object") continue;

      const recRoom = (typeof rec.roomId === "string" ? rec.roomId : "").trim();
      if (recRoom !== r) continue;

      const recServer = normalizeServerUrl(typeof rec.serverUrl === "string" ? rec.serverUrl : "");
      if (!recServer) continue;

      const playerId = sanitizeResumePlayerId(rec.playerId);
      if (!playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const displayName = sanitizeResumeDisplayName(rec.displayName);
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      out.push({
        serverUrl: recServer,
        roomId: r,
        playerId,
        ...(color ? { color } : {}),
        ...(displayName ? { displayName } : {}),
        savedAtMs,
      });
    }
  } catch {
    // ignore
  }
  return out;
}

function resolveOnlineResumeRecord(serverUrl: string, roomId: string): OnlineResumeRecord | null {
  const direct = readOnlineResumeRecord(serverUrl, roomId);
  if (direct) return direct;
  const matches = findAnyResumeRecordsForRoomId(roomId);
  if (matches.length === 1) return matches[0];
  return null;
}

function readOnlineResumeRecord(serverUrl: string, roomId: string): OnlineResumeRecord | null {
  try {
    const s = normalizeServerUrl(serverUrl);
    const r = (roomId || "").trim();

    // Try preferred key first, then legacy key patterns.
    const keysToTry = [
      resumeStorageKey(s, r),
      `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(r)}`,
      `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(roomId)}`,
      `lasca.online.resume.${encodeURIComponent(`${s}/`)}.${encodeURIComponent(r)}`,
    ];

    for (const key of keysToTry) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const rec = JSON.parse(raw) as any;
      if (!rec || typeof rec !== "object") continue;

      const recServer = normalizeServerUrl(typeof rec.serverUrl === "string" ? rec.serverUrl : "");
      const recRoom = (typeof rec.roomId === "string" ? rec.roomId : "").trim();
      if (recServer !== s) continue;
      if (recRoom !== r) continue;

      const playerId = sanitizeResumePlayerId(rec.playerId);
      if (!playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const displayName = sanitizeResumeDisplayName(rec.displayName);
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      return {
        serverUrl: s,
        roomId: r,
        playerId,
        ...(color ? { color } : {}),
        ...(displayName ? { displayName } : {}),
        savedAtMs,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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

function readDifficulty(key: string, fallback: Difficulty): Difficulty {
  const raw = localStorage.getItem(key);
  if (raw === "human" || raw === "easy" || raw === "medium" || raw === "advanced") return raw;
  return fallback;
}

function readDelayMs(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 5000);
}

function readPlayMode(key: string, fallback: PlayMode): PlayMode {
  const raw = localStorage.getItem(key);
  if (raw === "local" || raw === "online") return raw;
  return fallback;
}

function readVisibility(key: string, fallback: RoomVisibility): RoomVisibility {
  const raw = localStorage.getItem(key);
  if (raw === "public" || raw === "private") return raw;
  return fallback;
}

function readPreferredColor(key: string, fallback: PreferredColor): PreferredColor {
  const raw = localStorage.getItem(key);
  if (raw === "auto" || raw === "W" || raw === "B") return raw;
  return fallback;
}

function normalizeServerUrl(raw: string): string {
  const s = (raw || "").trim();
  return s.replace(/\/+$/, "");
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 5000);
}

function isPlausibleRoomId(roomId: string): boolean {
  const r = (roomId || "").trim();
  if (!r) return false;
  if (!/^[0-9a-f]+$/i.test(r)) return false;
  if (r.length < 4) return false;
  return true;
}

function formatAgeShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}


function readVariantId(key: string, fallback: VariantId): VariantId {
  const raw = localStorage.getItem(key);
  if (raw && isVariantId(raw)) return raw;
  return fallback;
}

function readGlassBg(key: string, fallback: GlassBg): GlassBg {
  const raw = localStorage.getItem(key);
  if (raw === "original" || raw === "felt" || raw === "walnut") return raw;
  return fallback;
}

function readGlassPaletteId(key: string, fallback: GlassPaletteId): GlassPaletteId {
  const raw = localStorage.getItem(key);
  if (
    raw === "yellow_blue" ||
    raw === "cyan_violet" ||
    raw === "mint_magenta" ||
    raw === "pearl_smoke" ||
    raw === "lavender_sapphire" ||
    raw === "aqua_amber"
  ) {
    return raw;
  }
  return fallback;
}

function isGlassPaletteId(v: unknown): v is GlassPaletteId {
  return (
    v === "yellow_blue" ||
    v === "cyan_violet" ||
    v === "mint_magenta" ||
    v === "pearl_smoke" ||
    v === "lavender_sapphire" ||
    v === "aqua_amber"
  );
}

// Speculatively fetch the selected game's HTML entry point so the browser
// has it (and its embedded <link rel="modulepreload"> hints) ready before
// the user clicks Launch. Called on page load and whenever the variant changes.
function prefetchGamePage(gameSelect: HTMLSelectElement): void {
  try {
    const vId = (isVariantId(gameSelect.value) ? gameSelect.value : DEFAULT_VARIANT_ID) as VariantId;
    const entryUrl = getVariantById(vId).entryUrl;
    if (!entryUrl) return;

    const prev = document.getElementById("variantPagePrefetch") as HTMLLinkElement | null;
    if (prev?.getAttribute("href") === entryUrl) return; // already prefetching this one
    prev?.remove();

    const link = document.createElement("link");
    link.id = "variantPagePrefetch";
    link.rel = "prefetch";
    link.href = entryUrl;
    document.head.appendChild(link);
  } catch {
    // ignore — graceful degradation
  }
}

window.addEventListener("DOMContentLoaded", () => {
  maybeResetCheckersThemePrefs();
  const finalizeSplash = initStartSplash();
  initStartPageCollapsibleSections();

  installPanelLayoutStartPageOptionUI();
  applyPanelLayoutMode(readPanelLayoutMode());

  const elGame = byId<HTMLSelectElement>("launchGame");
  const elGameNote = byId<HTMLElement>("launchGameNote");
  const elTheme = byId<HTMLSelectElement>("launchTheme");

  const elColumnsChessBoardThemeRow = (document.getElementById("launchColumnsChessBoardThemeRow") as HTMLElement | null) ?? null;
  const elColumnsChessBoardTheme = (document.getElementById("launchColumnsChessBoardTheme") as HTMLSelectElement | null) ?? null;

  const elGlassColorsRow = (document.getElementById("launchGlassColorsRow") as HTMLElement | null) ?? null;
  const elGlassColors = (document.getElementById("launchGlassColorsSelect") as HTMLSelectElement | null) ?? null;

  const elGlassBgRow = (document.getElementById("launchGlassBgRow") as HTMLElement | null) ?? null;
  const elGlassBg = (document.getElementById("launchGlassBgSelect") as HTMLSelectElement | null) ?? null;

  const elPlayMode = byId<HTMLSelectElement>("launchPlayMode");
  const elOnlineOptions = (document.getElementById("launchOnlineOptions") as HTMLElement | null) ?? null;
  const elOnlineVisibilityLabel = byId<HTMLElement>("launchOnlineVisibilityLabel");
  const elOnlineVisibility = byId<HTMLSelectElement>("launchOnlineVisibility");
  const elOnlineHint = (document.getElementById("launchOnlineHint") as HTMLElement | null) ?? null;
  const elOnlinePlayerIdLabel = byId<HTMLElement>("launchOnlinePlayerIdLabel");
  const elOnlinePlayerId = byId<HTMLInputElement>("launchOnlinePlayerId");
  const elOnlineRoomIdLabel = byId<HTMLElement>("launchOnlineRoomIdLabel");
  const elOnlineRoomId = byId<HTMLInputElement>("launchOnlineRoomId");

  const elLobbySection = (document.getElementById("launchLobbySection") as HTMLElement | null) ?? null;
  const elLobbyStatus = (document.getElementById("launchLobbyStatus") as HTMLElement | null) ?? null;
  const elLobbyRefresh = (document.getElementById("launchLobbyRefresh") as HTMLButtonElement | null) ?? null;
  const elLobbyList = (document.getElementById("launchLobbyList") as HTMLElement | null) ?? null;
  const elLobbyMineOnly = (document.getElementById("launchLobbyMineOnly") as HTMLInputElement | null) ?? null;
  const elLobbyRoomDialog = (document.getElementById("launchLobbyRoomDialog") as HTMLDialogElement | null) ?? null;
  const elLobbyRoomDialogTitle = (document.getElementById("launchLobbyRoomDialogTitle") as HTMLElement | null) ?? null;
  const elLobbyRoomDialogSubtitle = (document.getElementById("launchLobbyRoomDialogSubtitle") as HTMLElement | null) ?? null;
  const elLobbyRoomDialogDetails = (document.getElementById("launchLobbyRoomDialogDetails") as HTMLElement | null) ?? null;
  const elLobbyRoomDialogPlayers = (document.getElementById("launchLobbyRoomDialogPlayers") as HTMLElement | null) ?? null;
  const elLobbyRoomAvatarPreview = (document.getElementById("launchLobbyRoomAvatarPreview") as HTMLElement | null) ?? null;
  const elLobbyRoomAvatarPreviewImage = (document.getElementById("launchLobbyRoomAvatarPreviewImage") as HTMLImageElement | null) ?? null;
  const elLobbyRoomDialogPrimary = (document.getElementById("launchLobbyRoomDialogPrimary") as HTMLButtonElement | null) ?? null;
  const elLobbyRoomDialogSpectate = (document.getElementById("launchLobbyRoomDialogSpectate") as HTMLButtonElement | null) ?? null;
  const elLobbyRoomDialogClose = (document.getElementById("launchLobbyRoomDialogClose") as HTMLButtonElement | null) ?? null;

  const elAccountSection = (document.getElementById("launchAccountSection") as HTMLElement | null) ?? null;
  const elAccountStatus = (document.getElementById("launchAccountStatus") as HTMLElement | null) ?? null;
  const elAccountDiagnosticBadge = (document.getElementById("launchAccountDiagnosticBadge") as HTMLElement | null) ?? null;
  const elAccountDiagnosticText = (document.getElementById("launchAccountDiagnosticText") as HTMLElement | null) ?? null;
  const elAccountEmail = (document.getElementById("accountEmail") as HTMLInputElement | null) ?? null;
  const elAccountPassword = (document.getElementById("accountPassword") as HTMLInputElement | null) ?? null;
  const elAccountPasswordToggle = (document.getElementById("accountPasswordToggle") as HTMLButtonElement | null) ?? null;
  const elAccountLoginForm = (document.getElementById("accountLoginForm") as HTMLFormElement | null) ?? null;
  const elAccountDisplayName = (document.getElementById("accountDisplayName") as HTMLInputElement | null) ?? null;
  const elAccountCountry = (document.getElementById("accountCountry") as HTMLSelectElement | null) ?? null;
  const elAccountTimeZone = (document.getElementById("accountTimeZone") as HTMLSelectElement | null) ?? null;
  const elAccountAvatarUrl = (document.getElementById("accountAvatarUrl") as HTMLInputElement | null) ?? null;
  const elAccountAvatarFile = (document.getElementById("accountAvatarFile") as HTMLInputElement | null) ?? null;
  const elAccountRefresh = (document.getElementById("accountRefresh") as HTMLButtonElement | null) ?? null;
  const elAccountRegister = (document.getElementById("accountRegister") as HTMLButtonElement | null) ?? null;
  const elAccountLogin = (document.getElementById("accountLogin") as HTMLButtonElement | null) ?? null;
  const elAccountUpdateProfile = (document.getElementById("accountUpdateProfile") as HTMLButtonElement | null) ?? null;
  const elAccountUploadAvatar = (document.getElementById("accountUploadAvatar") as HTMLButtonElement | null) ?? null;
  const elAccountLogout = (document.getElementById("accountLogout") as HTMLButtonElement | null) ?? null;

  const elShowResizeIcon = (document.getElementById("launchShowResizeIcon") as HTMLInputElement | null) ?? null;
  const elShowPlayerNames = (document.getElementById("launchShowPlayerNames") as HTMLInputElement | null) ?? null;
  const elShowPlayerNamesRow = (document.getElementById("launchShowPlayerNamesRow") as HTMLElement | null) ?? null;
  const elShowPlayerNamesHint = (document.getElementById("launchShowPlayerNamesHint") as HTMLElement | null) ?? null;
  const elBoardViewport = byId<HTMLSelectElement>("launchBoardViewport");
  const elBoardCoords = byId<HTMLInputElement>("launchBoardCoords");
  const elBoardCoordsInSquares = (document.getElementById("launchBoardCoordsInSquares") as HTMLInputElement | null) ?? null;
  const elBoardCoordsInSquaresRow = (elBoardCoordsInSquares?.closest(".checkRow") as HTMLElement | null) ?? null;
  const elBoardCoordsInSquaresHint = (elBoardCoordsInSquaresRow?.nextElementSibling as HTMLElement | null) ?? null;
  const elFlipBoard = byId<HTMLInputElement>("launchFlipBoard");
  const elLastMoveHighlights = byId<HTMLInputElement>("launchLastMoveHighlights");
  const elLastMoveStyleRow = (document.getElementById("launchLastMoveStyleRow") as HTMLElement | null) ?? null;
  const elLastMoveStyleHint = (document.getElementById("launchLastMoveStyleHint") as HTMLElement | null) ?? null;
  const elLastMoveStyle = (document.getElementById("launchLastMoveStyle") as HTMLSelectElement | null) ?? null;
  const elSelectionStyleRow = (document.getElementById("launchSelectionStyleRow") as HTMLElement | null) ?? null;
  const elSelectionStyleHint = (document.getElementById("launchSelectionStyleHint") as HTMLElement | null) ?? null;
  const elSelectionStyle = (document.getElementById("launchSelectionStyle") as HTMLSelectElement | null) ?? null;
  const elMoveHints = byId<HTMLInputElement>("launchMoveHints");
  const elMoveHintsRow = (elMoveHints.closest(".checkRow") as HTMLElement | null) ?? null;
  const elMoveHintsHint = (elMoveHintsRow?.nextElementSibling as HTMLElement | null) ?? null;
  const elChessMovePreviewModeRow = (document.getElementById("launchChessMovePreviewModeRow") as HTMLElement | null) ?? null;
  const elChessMovePreviewModeHint = (document.getElementById("launchChessMovePreviewModeHint") as HTMLElement | null) ?? null;
  const elChessMovePreviewMode = (document.getElementById("launchChessMovePreviewMode") as HTMLSelectElement | null) ?? null;
  const elMoveHintStyleRow = (document.getElementById("launchMoveHintStyleRow") as HTMLElement | null) ?? null;
  const elMoveHintStyleHint = (document.getElementById("launchMoveHintStyleHint") as HTMLElement | null) ?? null;
  const elMoveHintStyle = (document.getElementById("launchMoveHintStyle") as HTMLSelectElement | null) ?? null;
  const elAnalysisSquareStyleRow = (document.getElementById("launchAnalysisSquareStyleRow") as HTMLElement | null) ?? null;
  const elAnalysisSquareStyleHint = (document.getElementById("launchAnalysisSquareStyleHint") as HTMLElement | null) ?? null;
  const elAnalysisSquareStyle = (document.getElementById("launchAnalysisSquareStyle") as HTMLSelectElement | null) ?? null;
  const elBoard8x8Checkered = byId<HTMLInputElement>("launchBoard8x8Checkered");
  const elBoard8x8CheckeredRow = (elBoard8x8Checkered.closest(".checkRow") as HTMLElement | null) ?? null;
  const elBoard8x8CheckeredHint = (elBoard8x8CheckeredRow?.nextElementSibling as HTMLElement | null) ?? null;
  const elToasts = byId<HTMLInputElement>("launchToasts");
  const elSfx = byId<HTMLInputElement>("launchSfx");

  const elAiWhite = byId<HTMLSelectElement>("launchAiWhite");
  const elAiBlack = byId<HTMLSelectElement>("launchAiBlack");
  const elAiWhiteRoleSelect = byId<HTMLSelectElement>("launchAiWhiteRoleSelect");
  const elAiBlackRoleSelect = byId<HTMLSelectElement>("launchAiBlackRoleSelect");
  const elPlayerNameLight = (document.getElementById("launchPlayerNameLight") as HTMLInputElement | null) ?? null;
  const elPlayerNameDark = (document.getElementById("launchPlayerNameDark") as HTMLInputElement | null) ?? null;
  const elOnlineSeatOwnerLight = (document.getElementById("launchOnlineSeatOwnerLight") as HTMLSelectElement | null) ?? null;
  const elOnlineSeatOwnerDark = (document.getElementById("launchOnlineSeatOwnerDark") as HTMLSelectElement | null) ?? null;
  const elAiWhiteLabel = (document.querySelector('label[for="launchAiWhiteRoleSelect"]') as HTMLElement | null) ?? null;
  const elAiBlackLabel = (document.querySelector('label[for="launchAiBlackRoleSelect"]') as HTMLElement | null) ?? null;
  const elAiDelay = byId<HTMLInputElement>("launchAiDelay");
  const elAiDelayReset = byId<HTMLButtonElement>("launchAiDelayReset");
  const elAiDelayLabel = byId<HTMLElement>("launchAiDelayLabel");
  const elBotSection = (elAiWhite.closest('[data-start-section="bot"]') as HTMLElement | null) ?? null;

  const elWarning = byId<HTMLElement>("launchWarning");
  const elLaunch = byId<HTMLButtonElement>("launchBtn");

  const setWarning = (text: string, opts?: { isError?: boolean }): void => {
    const msg = (text || "").trim();
    elWarning.textContent = msg || "—";
    elWarning.classList.toggle("isError", Boolean(opts?.isError));
  };

  const setRoomIdError = (isError: boolean): void => {
    elOnlineRoomId.classList.toggle("isError", isError);
    elOnlineRoomIdLabel.classList.toggle("isError", isError);
  };

  const setLobbyStatus = (text: string): void => {
    if (!elLobbyStatus) return;
    elLobbyStatus.textContent = (text || "").trim() || "—";
  };

  const setLobbyRoomDialogOpen = (open: boolean): void => {
    if (!elLobbyRoomDialog) return;
    if (open) {
      if (!elLobbyRoomDialog.open) {
        if (typeof elLobbyRoomDialog.showModal === "function") elLobbyRoomDialog.showModal();
        else elLobbyRoomDialog.setAttribute("open", "");
      }
      return;
    }
    hideLobbyRoomAvatarPreview();
    if (elLobbyRoomDialog.open) {
      if (typeof elLobbyRoomDialog.close === "function") elLobbyRoomDialog.close();
      else elLobbyRoomDialog.removeAttribute("open");
    }
  };

  const hideLobbyRoomAvatarPreview = (): void => {
    if (!elLobbyRoomAvatarPreview || !elLobbyRoomAvatarPreviewImage) return;
    elLobbyRoomAvatarPreview.classList.remove("isVisible");
    elLobbyRoomAvatarPreviewImage.removeAttribute("src");
  };

  const positionLobbyRoomAvatarPreview = (x: number, y: number): void => {
    if (!elLobbyRoomAvatarPreview) return;
    const previewWidth = 256;
    const previewHeight = 256;
    const gap = 18;
    const maxLeft = Math.max(8, window.innerWidth - previewWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - previewHeight - 8);
    const left = Math.min(Math.max(8, x + gap), maxLeft);
    const top = Math.min(Math.max(8, y + gap), maxTop);
    elLobbyRoomAvatarPreview.style.left = `${left}px`;
    elLobbyRoomAvatarPreview.style.top = `${top}px`;
  };

  const showLobbyRoomAvatarPreview = (src: string, x: number, y: number): void => {
    if (!elLobbyRoomAvatarPreview || !elLobbyRoomAvatarPreviewImage) return;
    if (!src) return;
    elLobbyRoomAvatarPreviewImage.src = src;
    positionLobbyRoomAvatarPreview(x, y);
    elLobbyRoomAvatarPreview.classList.add("isVisible");
  };

  const bindLobbyRoomDialogAvatarPreview = (chip: HTMLElement | null): void => {
    if (!chip) return;
    const avatar = chip.querySelector(".lobbyIdentityAvatar") as HTMLElement | null;
    const image = chip.querySelector("img.lobbyIdentityAvatarImage") as HTMLImageElement | null;
    if (!avatar || !image) return;

    const previewSrc = image.currentSrc || image.src;
    if (!previewSrc) return;

    avatar.tabIndex = 0;
    avatar.title = "Preview avatar";

    avatar.addEventListener("mouseenter", (event) => {
      const mouse = event as MouseEvent;
      showLobbyRoomAvatarPreview(previewSrc, mouse.clientX, mouse.clientY);
    });
    avatar.addEventListener("mousemove", (event) => {
      const mouse = event as MouseEvent;
      positionLobbyRoomAvatarPreview(mouse.clientX, mouse.clientY);
    });
    avatar.addEventListener("mouseleave", () => hideLobbyRoomAvatarPreview());
    avatar.addEventListener("focus", () => {
      const rect = avatar.getBoundingClientRect();
      showLobbyRoomAvatarPreview(previewSrc, rect.right, rect.top);
    });
    avatar.addEventListener("blur", () => hideLobbyRoomAvatarPreview());
  };

  const clearLobbyRoomDialogDetails = (): void => {
    if (!elLobbyRoomDialogDetails) return;
    elLobbyRoomDialogDetails.textContent = "";
  };

  const clearLobbyRoomDialogPlayers = (): void => {
    if (!elLobbyRoomDialogPlayers) return;
    elLobbyRoomDialogPlayers.textContent = "";
  };

  const appendLobbyRoomDialogDetail = (label: string, value: string): void => {
    if (!elLobbyRoomDialogDetails) return;
    const nextValue = (value || "").trim();
    if (!nextValue) return;

    const dt = document.createElement("div");
    dt.className = "lobbyRoomDialogLabel";
    dt.textContent = label;

    const dd = document.createElement("div");
    dd.className = "lobbyRoomDialogValue";
    dd.textContent = nextValue;

    elLobbyRoomDialogDetails.append(dt, dd);
  };

  const bindLobbyRoomTrigger = (el: HTMLElement | null, onActivate: () => void): void => {
    if (!el) return;
    el.classList.add("lobbyRoomTrigger");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    if (!el.title) el.title = "Open room details";
    el.addEventListener("click", () => onActivate());
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate();
    });
  };

  const showLobbyRoomDialog = (r: LobbyRoomSummary, serverUrl: string): void => {
    const variant = getVariantById(r.variantId);
    const labels = getSideLabelsForRuleset(variant.rulesetId, { boardSize: variant.boardSize });
    const createdAtMs = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
    const age = Number.isFinite(createdAtMs) ? formatAgeShort(Date.now() - createdAtMs) : "";
    const status =
      r.status === "game_over"
        ? "Game over"
        : r.status === "in_game"
          ? "In game"
          : r.status === "waiting"
            ? "Waiting"
            : "Unknown";
    const statusReason = typeof r.statusReason === "string" ? r.statusReason.trim() : "";
    const hostDisplayName = typeof (r as any)?.hostDisplayName === "string" ? String((r as any).hostDisplayName).trim() : "";
    const byColor = r.displayNameByColor as Partial<Record<PlayerColor, string>> | undefined;
    const identityByColor = r.identityByColor as Partial<Record<PlayerColor, Pick<PlayerIdentity, "displayName" | "avatarUrl" | "countryCode" | "countryName">>> | undefined;
    const lightName = typeof byColor?.W === "string" ? byColor.W.trim() : "";
    const darkName = typeof byColor?.B === "string" ? byColor.B.trim() : "";
    const whiteIdentity = identityByColor?.W ?? (lightName ? { displayName: lightName } : undefined);
    const blackIdentity = identityByColor?.B ?? (darkName ? { displayName: darkName } : undefined);
    const players = `${labels.W}: ${lightName || "—"} · ${labels.B}: ${darkName || "—"}`;
    const openSeats = r.seatsOpen.length ? r.seatsOpen.join("/") : "—";
    const takenSeats = r.seatsTaken.length ? r.seatsTaken.join("/") : "—";
    const resume = serverUrl ? readOnlineResumeRecord(serverUrl, r.roomId) : null;
    const canRejoin = Boolean(resume);
    const isGameOver = r.status === "game_over";
    const canJoin = !canRejoin && !isGameOver && r.seatsOpen.length > 0;
    const canSpectate = r.visibility !== "private";
    const fallbackVariantId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;

    if (elLobbyRoomDialogTitle) elLobbyRoomDialogTitle.textContent = variant.displayName;
    if (elLobbyRoomDialogSubtitle) {
      elLobbyRoomDialogSubtitle.textContent = `Room ${r.roomId}`;
      elLobbyRoomDialogSubtitle.title = `Room ${r.roomId}`;
    }

    clearLobbyRoomDialogDetails();
    clearLobbyRoomDialogPlayers();
    appendLobbyRoomDialogDetail("Room ID", r.roomId);
    appendLobbyRoomDialogDetail("Status", status);
    appendLobbyRoomDialogDetail("Message", statusReason || "—");
    appendLobbyRoomDialogDetail("Age", age || "—");
    appendLobbyRoomDialogDetail("Visibility", r.visibility === "public" ? "Public" : "Private");
    appendLobbyRoomDialogDetail("Open", openSeats);
    appendLobbyRoomDialogDetail("Taken", takenSeats);
    appendLobbyRoomDialogDetail("Players", players);
    appendLobbyRoomDialogDetail("Host", hostDisplayName || "—");
    if (r.timeControl?.mode === "clock") {
      appendLobbyRoomDialogDetail(
        "Clock",
        `${r.timeControl.initialMs} ms + ${typeof r.timeControl.incrementMs === "number" ? r.timeControl.incrementMs : 0} ms`
      );
    } else if (r.timeControl?.mode === "none") {
      appendLobbyRoomDialogDetail("Clock", "None");
    }

    if (elLobbyRoomDialogPlayers) {
      const whiteChip = createLobbyIdentityChip({ serverUrl, seatLabel: labels.W, identity: whiteIdentity, color: "W" });
      const blackChip = createLobbyIdentityChip({ serverUrl, seatLabel: labels.B, identity: blackIdentity, color: "B" });
      if (whiteChip) {
        elLobbyRoomDialogPlayers.appendChild(whiteChip);
        bindLobbyRoomDialogAvatarPreview(whiteChip);
      }
      if (blackChip) {
        elLobbyRoomDialogPlayers.appendChild(blackChip);
        bindLobbyRoomDialogAvatarPreview(blackChip);
      }
    }

    if (elLobbyRoomDialogPrimary) {
      elLobbyRoomDialogPrimary.textContent = canRejoin ? "Rejoin" : "Join";
      elLobbyRoomDialogPrimary.disabled = !canRejoin && !canJoin;
      elLobbyRoomDialogPrimary.title = canRejoin
        ? "Rejoin this room using the saved seat in this browser."
        : isGameOver
          ? (statusReason || "This game has ended.")
          : r.seatsOpen.length === 0
            ? "No seats are currently open in this room."
            : "Join this room as a player.";
      elLobbyRoomDialogPrimary.onclick = () => {
        if (!canRejoin && !canJoin) return;
        setLobbyRoomDialogOpen(false);
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");
        persistStartPageLaunchPrefs();
        void launchOnline({
          action: canRejoin ? "rejoin" : "join",
          serverUrl,
          roomId: r.roomId,
          fallbackVariantId,
        });
      };
    }

    if (elLobbyRoomDialogSpectate) {
      elLobbyRoomDialogSpectate.disabled = !canSpectate;
      elLobbyRoomDialogSpectate.title = canSpectate
        ? "Spectate this room."
        : "Private rooms require a secret watch link/token to spectate.";
      elLobbyRoomDialogSpectate.onclick = () => {
        if (!canSpectate) return;
        setLobbyRoomDialogOpen(false);
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");
        persistStartPageLaunchPrefs();
        void launchOnline({
          action: "spectate",
          serverUrl,
          roomId: r.roomId,
          fallbackVariantId,
        });
      };
    }

    if (elLobbyRoomDialogClose) {
      elLobbyRoomDialogClose.onclick = () => setLobbyRoomDialogOpen(false);
    }

    setLobbyRoomDialogOpen(true);
  };

  const setAccountStatus = (text: string, opts?: { isError?: boolean }): void => {
    if (!elAccountStatus) return;
    elAccountStatus.textContent = (text || "").trim() || "—";
    elAccountStatus.classList.toggle("isError", Boolean(opts?.isError));
  };

  const describeAccountSessionDiagnostic = (args: {
    serverUrl: string | null;
    status: "loading" | "signed-out" | "signed-in" | "error";
  }): { label: string; detail: string; tone: "neutral" | "good" | "warn" } => {
    if (!args.serverUrl) {
      return {
        label: "Session: no server",
        detail: "Set a valid multiplayer server URL before the account UI can verify or persist a session.",
        tone: "warn",
      };
    }

    const storedToken = readAuthSessionToken(args.serverUrl);
    if (storedToken) {
      return {
        label: "Session fallback saved",
        detail: "A bearer session token is stored for this multiplayer server, so account identity can survive browsers that drop cross-site cookies.",
        tone: "good",
      };
    }

    if (args.status === "signed-in") {
      return {
        label: "Cookie session only",
        detail: "This browser is currently relying on the auth cookie only. Logging in again on this build will also store a fallback token.",
        tone: "warn",
      };
    }

    return {
      label: "No saved fallback",
      detail: "No bearer fallback token is currently stored for this multiplayer server.",
      tone: "neutral",
    };
  };

  const setAccountDiagnostic = (diagnostic: { label: string; detail: string; tone: "neutral" | "good" | "warn" }): void => {
    if (elAccountDiagnosticBadge) {
      elAccountDiagnosticBadge.textContent = diagnostic.label;
      if (diagnostic.tone === "neutral") delete elAccountDiagnosticBadge.dataset.tone;
      else elAccountDiagnosticBadge.dataset.tone = diagnostic.tone;
      elAccountDiagnosticBadge.title = diagnostic.detail;
    }
    if (elAccountDiagnosticText) elAccountDiagnosticText.textContent = diagnostic.detail;
  };

  let syncShellAccountState = (_state: {
    status: "loading" | "signed-out" | "signed-in" | "error";
    displayName?: string;
    email?: string;
    avatarUrl?: string | null;
    countryName?: string | null;
    timeZone?: string | null;
    message?: string;
    diagnosticLabel?: string;
    diagnosticDetail?: string;
    diagnosticTone?: "neutral" | "good" | "warn";
  }): void => {
    // app shell mounts later in startup; keep account refresh safe before that.
  };
  let signedInAccountDisplayName = "";
  let syncingOnlineHumanSeat = false;

  const readStoredPlayerName = (side: "W" | "B"): string => {
    try {
      return localStorage.getItem(side === "W" ? LS_KEYS.localPlayerLight : LS_KEYS.localPlayerDark)?.trim() ?? "";
    } catch {
      return "";
    }
  };

  const writeStoredPlayerName = (side: "W" | "B", name: string): void => {
    try {
      localStorage.setItem(side === "W" ? LS_KEYS.localPlayerLight : LS_KEYS.localPlayerDark, name);
    } catch {
      // ignore
    }
  };

  const writeOnlinePreferredColor = (color: "W" | "B"): void => {
    try {
      localStorage.setItem(LS_KEYS.onlinePrefColor, color);
    } catch {
      // ignore
    }
  };

  const readOnlineSeatOwner = (side: "W" | "B"): "remote" | "local" => {
    try {
      const raw = localStorage.getItem(side === "W" ? LS_KEYS.onlineSeatOwnerLight : LS_KEYS.onlineSeatOwnerDark);
      return raw === "local" ? "local" : "remote";
    } catch {
      return "remote";
    }
  };

  const writeOnlineSeatOwner = (side: "W" | "B", owner: "remote" | "local"): void => {
    try {
      localStorage.setItem(side === "W" ? LS_KEYS.onlineSeatOwnerLight : LS_KEYS.onlineSeatOwnerDark, owner);
    } catch {
      // ignore
    }
  };

  const syncOnlineSeatOwnerSelect = (side: "W" | "B", select: HTMLSelectElement | null): void => {
    if (!select) return;

    const accountName = signedInAccountDisplayName.trim();
    const optionSig = accountName ? `remote|local:${accountName}` : "remote";
    if (select.dataset.optionsSig !== optionSig) {
      const remoteOption = document.createElement("option");
      remoteOption.value = "remote";
      remoteOption.textContent = "Online player";

      const options = [remoteOption];
      if (accountName) {
        const localOption = document.createElement("option");
        localOption.value = "local";
        localOption.textContent = accountName;
        options.push(localOption);
      }

      select.replaceChildren(...options);
      select.dataset.optionsSig = optionSig;
    }

    const storedOwner = readOnlineSeatOwner(side);
    const nextValue = storedOwner === "local" && accountName ? "local" : "remote";
    select.value = nextValue;
  };

  const setOnlineSeatOwnerControlVisibility = (args: {
    textInput: HTMLInputElement | null;
    ownerSelect: HTMLSelectElement | null;
    showTextInput: boolean;
  }): void => {
    if (args.textInput) {
      args.textInput.hidden = !args.showTextInput;
      args.textInput.disabled = !args.showTextInput;
      args.textInput.style.display = args.showTextInput ? "" : "none";
    }
    if (args.ownerSelect) {
      args.ownerSelect.hidden = args.showTextInput;
      args.ownerSelect.disabled = args.showTextInput;
      args.ownerSelect.style.display = args.showTextInput ? "none" : "";
    }
  };

  const prefillLocalPlayerNamesFromSignedInAccount = (): void => {
    if (!elPlayerNameLight || !elPlayerNameDark) return;
    if (elPlayMode.value === "online") return;

    const accountName = signedInAccountDisplayName.trim();
    if (!accountName) return;

    const lightStored = readStoredPlayerName("W");
    const darkStored = readStoredPlayerName("B");

    if (!lightStored) {
      elPlayerNameLight.value = accountName;
      writeStoredPlayerName("W", accountName);
    }
    if (!darkStored) {
      elPlayerNameDark.value = accountName;
      writeStoredPlayerName("B", accountName);
    }
  };

  const setHumanRoleOptionDisabled = (roleSelect: HTMLSelectElement, disabled: boolean): void => {
    const humanOption = Array.from(roleSelect.options).find((option) => option.value === "human") ?? null;
    if (humanOption) humanOption.disabled = disabled;
  };

  const syncOnlinePlayerSeatInputs = (): void => {
    if (!elPlayerNameLight || !elPlayerNameDark) return;

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const lightStored = readStoredPlayerName("W");
    const darkStored = readStoredPlayerName("B");
    const accountName = signedInAccountDisplayName.trim();

    if (playMode !== "online") {
      setHumanRoleOptionDisabled(elAiWhiteRoleSelect, false);
      setHumanRoleOptionDisabled(elAiBlackRoleSelect, false);
      elAiWhiteRoleSelect.disabled = false;
      elAiBlackRoleSelect.disabled = false;
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameLight,
        ownerSelect: elOnlineSeatOwnerLight,
        showTextInput: true,
      });
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameDark,
        ownerSelect: elOnlineSeatOwnerDark,
        showTextInput: true,
      });
      elPlayerNameLight.readOnly = false;
      elPlayerNameDark.readOnly = false;
      elPlayerNameLight.value = lightStored;
      elPlayerNameDark.value = darkStored;
      elPlayerNameLight.placeholder = "Player name (optional)";
      elPlayerNameDark.placeholder = "Player name (optional)";
      syncPlayerBotSelector("launchAiWhite");
      syncPlayerBotSelector("launchAiBlack");
      return;
    }

    if (syncingOnlineHumanSeat) return;

    syncOnlineSeatOwnerSelect("W", elOnlineSeatOwnerLight);
    syncOnlineSeatOwnerSelect("B", elOnlineSeatOwnerDark);

    const preferredColor = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
    const resolvedHumanSeat = resolveOnlineHumanSeat({
      whiteRole: elAiWhite.value === "human" ? "human" : "bot",
      blackRole: elAiBlack.value === "human" ? "human" : "bot",
      whiteOwner: readOnlineSeatOwner("W"),
      blackOwner: readOnlineSeatOwner("B"),
      preferredColor,
    });

    const whiteLocalHuman = elAiWhite.value === "human" && readOnlineSeatOwner("W") === "local" && Boolean(accountName);
    const blackLocalHuman = elAiBlack.value === "human" && readOnlineSeatOwner("B") === "local" && Boolean(accountName);
    if (whiteLocalHuman && blackLocalHuman && resolvedHumanSeat) {
      syncingOnlineHumanSeat = true;
      const remoteSide = resolvedHumanSeat === "W" ? "B" : "W";
      writeOnlineSeatOwner(remoteSide, "remote");
      syncOnlineSeatOwnerSelect("W", elOnlineSeatOwnerLight);
      syncOnlineSeatOwnerSelect("B", elOnlineSeatOwnerDark);
      syncingOnlineHumanSeat = false;
    }

    if (resolvedHumanSeat) writeOnlinePreferredColor(resolvedHumanSeat);

    setHumanRoleOptionDisabled(elAiWhiteRoleSelect, false);
    setHumanRoleOptionDisabled(elAiBlackRoleSelect, false);

    if (elAiWhite.value === "human") {
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameLight,
        ownerSelect: elOnlineSeatOwnerLight,
        showTextInput: false,
      });
      syncOnlineSeatOwnerSelect("W", elOnlineSeatOwnerLight);
    } else {
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameLight,
        ownerSelect: elOnlineSeatOwnerLight,
        showTextInput: true,
      });
      elPlayerNameLight.value = lightStored;
      elPlayerNameLight.readOnly = false;
      elPlayerNameLight.placeholder = "Bot name (optional)";
    }

    if (elAiBlack.value === "human") {
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameDark,
        ownerSelect: elOnlineSeatOwnerDark,
        showTextInput: false,
      });
      syncOnlineSeatOwnerSelect("B", elOnlineSeatOwnerDark);
    } else {
      setOnlineSeatOwnerControlVisibility({
        textInput: elPlayerNameDark,
        ownerSelect: elOnlineSeatOwnerDark,
        showTextInput: true,
      });
      elPlayerNameDark.value = darkStored;
      elPlayerNameDark.readOnly = false;
      elPlayerNameDark.placeholder = "Bot name (optional)";
    }
  };

  const populateAccountCountryOptions = (): void => {
    if (!elAccountCountry) return;
    const currentValue = elAccountCountry.value;
    const fragment = document.createDocumentFragment();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose country";
    fragment.appendChild(placeholder);

    for (const option of listCountryOptions()) {
      const el = document.createElement("option");
      el.value = option.code;
      el.textContent = option.name;
      fragment.appendChild(el);
    }

    elAccountCountry.replaceChildren(fragment);
    elAccountCountry.value = normalizeCountryCode(currentValue) ?? "";
  };

  const populateAccountTimeZoneOptions = (): void => {
    if (!elAccountTimeZone) return;
    const currentValue = elAccountTimeZone.value;
    const fragment = document.createDocumentFragment();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose time zone";
    fragment.appendChild(placeholder);

    for (const timeZone of listTimeZones()) {
      const el = document.createElement("option");
      el.value = timeZone;
      el.textContent = timeZone;
      fragment.appendChild(el);
    }

    elAccountTimeZone.replaceChildren(fragment);
    elAccountTimeZone.value = currentValue || resolveLocalTimeZone() || "";
  };

  populateAccountCountryOptions();
  populateAccountTimeZoneOptions();

  installPlayerBotSelector({
    storageSelectId: "launchAiWhite",
    roleSelectId: "launchAiWhiteRoleSelect",
    levelSelectId: "launchAiWhiteLevelSelect",
    levelWrapId: "launchAiWhiteLevelWrap",
  });
  installPlayerBotSelector({
    storageSelectId: "launchAiBlack",
    roleSelectId: "launchAiBlackRoleSelect",
    levelSelectId: "launchAiBlackLevelSelect",
    levelWrapId: "launchAiBlackLevelWrap",
  });

  elAiWhiteRoleSelect.addEventListener("change", () => {
    if (elPlayMode.value !== "online") return;
    if (elAiWhiteRoleSelect.value !== "human") return;
    writeOnlineSeatOwner("W", "remote");
  });

  elAiBlackRoleSelect.addEventListener("change", () => {
    if (elPlayMode.value !== "online") return;
    if (elAiBlackRoleSelect.value !== "human") return;
    writeOnlineSeatOwner("B", "remote");
  });

  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
  const defaultServerUrl = (() => {
    if (typeof envServerUrl === "string" && envServerUrl.trim()) return envServerUrl.trim();
    try {
      const proto = window.location.protocol || "http:";
      const host = window.location.hostname;
      if (host) return `${proto}//${host}:8788`;
    } catch {
      // ignore
    }
    return "http://localhost:8788";
  })();

  const resolveConfiguredServerUrl = (): string => {
    try {
      const stored = localStorage.getItem(LS_KEYS.onlineServerUrl);
      const raw = (typeof stored === "string" && stored.trim()) ? stored : defaultServerUrl;
      return normalizeServerUrl(raw);
    } catch {
      return normalizeServerUrl(defaultServerUrl);
    }
  };

  let lastConfiguredServerUrl = resolveConfiguredServerUrl();

  const onConfiguredServerUrlMaybeChanged = (): void => {
    const next = resolveConfiguredServerUrl();
    if (next === lastConfiguredServerUrl) return;
    lastConfiguredServerUrl = next;

    // Refresh account state regardless of play mode; lobby still only matters online.
    try {
      syncAvailability();
      void refreshAccountUi();
      if (elPlayMode.value === "online") {
        void fetchLobby();
      }
    } catch {
      // ignore
    }
  };

  const resolveServerUrlForAccount = (): string | null => {
    const s = resolveConfiguredServerUrl();
    if (!s) return null;
    try {
      // eslint-disable-next-line no-new
      new URL(s);
      return s;
    } catch {
      return null;
    }
  };

  const resolveAccountAvatarUrl = (avatarUrl: string | null | undefined): string | null => {
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    const serverUrl = resolveServerUrlForAccount();
    if (!serverUrl) return null;
    try {
      return new URL(avatarUrl, `${serverUrl}/`).toString();
    } catch {
      return null;
    }
  };

  const syncAccountFormFromUser = (user: AuthUser | null): void => {
    if (elAccountDisplayName) elAccountDisplayName.value = user?.displayName ?? "";
    if (elAccountAvatarUrl) elAccountAvatarUrl.value = user?.avatarUrl ?? "";
    if (elAccountCountry) elAccountCountry.value = normalizeCountryCode(user?.countryCode) ?? "";
    if (elAccountTimeZone) elAccountTimeZone.value = user?.timeZone ?? resolveLocalTimeZone() ?? "";
  };

  const fetchAuthJson = async <TRes>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: TRes | AuthErrorResponse }> => {
      const serverUrl = resolveServerUrlForAccount();
      if (!serverUrl) return { ok: false, status: 0, json: { error: "Invalid Server URL" } };

      const res = await fetch(`${serverUrl}${path}`, buildSessionAuthFetchInit(serverUrl, init));

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : raw?.trim() || `HTTP ${res.status}`;
        return { ok: false, status: res.status, json: { error: msg } };
      }

      return { ok: true, status: res.status, json: (json ?? ({} as any)) as TRes };
    };

  const refreshAccountUi = async (): Promise<void> => {
    if (!elAccountSection || !elAccountStatus) return;

    const serverUrl = resolveServerUrlForAccount();
    if (!serverUrl) {
      setAccountStatus("Account: set a valid Server URL first.", { isError: true });
      const diagnostic = describeAccountSessionDiagnostic({ serverUrl: null, status: "error" });
      setAccountDiagnostic(diagnostic);
      syncShellAccountState({
        status: "error",
        message: "Set a valid multiplayer server URL to use account features.",
        diagnosticLabel: diagnostic.label,
        diagnosticDetail: diagnostic.detail,
        diagnosticTone: diagnostic.tone,
      });
      return;
    }

    setAccountStatus("Account: checking session…");
    const loadingDiagnostic = describeAccountSessionDiagnostic({ serverUrl, status: "loading" });
    setAccountDiagnostic(loadingDiagnostic);
    syncShellAccountState({
      status: "loading",
      message: "Contacting the configured multiplayer server.",
      diagnosticLabel: loadingDiagnostic.label,
      diagnosticDetail: loadingDiagnostic.detail,
      diagnosticTone: loadingDiagnostic.tone,
    });
    const r = await fetchAuthJson<AuthMeResponse>("/api/auth/me");
    if (!r.ok) {
      setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Request failed")}`, { isError: true });
      const diagnostic = describeAccountSessionDiagnostic({ serverUrl, status: "error" });
      setAccountDiagnostic(diagnostic);
      syncShellAccountState({
        status: "error",
        message: String((r.json as any)?.error ?? "Request failed"),
        diagnosticLabel: diagnostic.label,
        diagnosticDetail: diagnostic.detail,
        diagnosticTone: diagnostic.tone,
      });
      return;
    }

    const me = r.json as any;
    if (!me || me.ok !== true) {
      setAccountStatus("Account: unexpected response", { isError: true });
      const diagnostic = describeAccountSessionDiagnostic({ serverUrl, status: "error" });
      setAccountDiagnostic(diagnostic);
      syncShellAccountState({
        status: "error",
        message: "Unexpected account response.",
        diagnosticLabel: diagnostic.label,
        diagnosticDetail: diagnostic.detail,
        diagnosticTone: diagnostic.tone,
      });
      return;
    }

    const user = me.user;
    if (!user) {
      clearAuthSessionToken(serverUrl);
      const diagnostic = describeAccountSessionDiagnostic({ serverUrl, status: "signed-out" });
      signedInAccountDisplayName = "";
      setAccountStatus("Account: signed out");
      setAccountDiagnostic(diagnostic);
      syncAccountFormFromUser(null);
      syncShellAccountState({
        status: "signed-out",
        diagnosticLabel: diagnostic.label,
        diagnosticDetail: diagnostic.detail,
        diagnosticTone: diagnostic.tone,
      });
      syncOnlinePlayerSeatInputs();
      return;
    }

    const name = typeof user.displayName === "string" ? user.displayName : "(no name)";
    signedInAccountDisplayName = name.trim();
    const email = typeof user.email === "string" ? user.email : "";
    const countryName = user.countryName ?? resolveCountryName(user.countryCode ?? "") ?? null;
    const timeZone = user.timeZone ?? null;
    const diagnostic = describeAccountSessionDiagnostic({ serverUrl, status: "signed-in" });
    setAccountStatus(
      `Account: signed in as ${name}${email ? ` (${email})` : ""}${countryName ? ` · ${countryName}` : ""}${timeZone ? ` · ${timeZone}` : ""}`,
    );
    setAccountDiagnostic(diagnostic);
    syncAccountFormFromUser(user);
    syncShellAccountState({
      status: "signed-in",
      displayName: name,
      email,
      avatarUrl: resolveAccountAvatarUrl(user.avatarUrl),
      countryName,
      timeZone,
      message: "Profile identity is reused across the shell and multiplayer account tools.",
      diagnosticLabel: diagnostic.label,
      diagnosticDetail: diagnostic.detail,
      diagnosticTone: diagnostic.tone,
    });

    prefillLocalPlayerNamesFromSignedInAccount();
    syncOnlinePlayerSeatInputs();
    syncOnlineIdentityFromBotSection();
  };

  const withAccountBusy = async (fn: () => Promise<void>): Promise<void> => {
    const btns = [
      elAccountRefresh,
      elAccountRegister,
      elAccountLogin,
      elAccountUpdateProfile,
      elAccountUploadAvatar,
      elAccountLogout,
    ].filter(Boolean) as HTMLButtonElement[];
    for (const b of btns) b.disabled = true;
    try {
      await fn();
    } finally {
      for (const b of btns) b.disabled = false;
    }
  };

  const inferAvatarContentType = (file: File): "image/png" | "image/svg+xml" | null => {
    const t = (file.type || "").toLowerCase();
    if (t === "image/png") return "image/png";
    if (t === "image/svg+xml") return "image/svg+xml";
    const n = (file.name || "").toLowerCase();
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".svg")) return "image/svg+xml";
    return null;
  };

  if (elAccountSection && elAccountStatus) {
    const tryOfferToSavePassword = async (email: string, password: string): Promise<void> => {
      // Chrome often won't offer to save when login happens via fetch() (especially cross-origin).
      // If Credential Management API is available, explicitly store a PasswordCredential.
      const e = (email || "").trim();
      if (!e || !password) return;

      try {
        const navAny = navigator as any;
        if (!navAny?.credentials || typeof navAny.credentials.store !== "function") return;

        const PwCred = (window as any).PasswordCredential as any;
        if (typeof PwCred !== "function") return;

        let cred: any = null;
        try {
          // Prefer constructing from the form so the browser can associate fields.
          if (elAccountLoginForm) cred = new PwCred(elAccountLoginForm);
        } catch {
          cred = null;
        }

        if (!cred) {
          // Fallback for browsers that don't support the form constructor.
          cred = new PwCred({ id: e, password, name: e });
        }

        await navAny.credentials.store(cred);
      } catch {
        // Ignore: browser may reject, user may have disabled password saving, etc.
      }
    };

    const syncPasswordToggleUi = (): void => {
      if (!elAccountPassword || !elAccountPasswordToggle) return;
      const isRevealed = elAccountPassword.type === "text";
      elAccountPasswordToggle.classList.toggle("isRevealed", isRevealed);
      elAccountPasswordToggle.setAttribute("aria-pressed", String(isRevealed));
      const label = isRevealed ? "Hide password" : "Show password";
      elAccountPasswordToggle.setAttribute("aria-label", label);
      elAccountPasswordToggle.title = label;
    };

    syncPasswordToggleUi();

    elAccountPasswordToggle?.addEventListener("click", () => {
      if (!elAccountPassword) return;
      elAccountPassword.type = (elAccountPassword.type === "password") ? "text" : "password";
      syncPasswordToggleUi();
      elAccountPassword.focus();
    });

    const doAccountLogin = async (): Promise<void> => {
      const email = (elAccountEmail?.value || "").trim();
      const password = elAccountPassword?.value || "";

      setAccountStatus("Account: logging in…");
      const r = await fetchAuthJson<AuthOkResponse>("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!r.ok) {
        setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Login failed")}`, { isError: true });
        return;
      }

      const ok = r.json as any;
      persistAuthSessionFromPayload(resolveServerUrlForAccount(), ok);
      setAccountStatus(`Account: signed in as ${ok?.user?.displayName ?? "(unknown)"}`);

      // Best-effort: nudge the browser to offer saving credentials.
      void tryOfferToSavePassword(email, password);

      await refreshAccountUi();
    };

    elAccountLoginForm?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      void withAccountBusy(async () => {
        await doAccountLogin();
      });
    });

    elAccountRefresh?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        await refreshAccountUi();
      });
    });

    elAccountRegister?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        const email = (elAccountEmail?.value || "").trim();
        const password = elAccountPassword?.value || "";
        const displayName = (elAccountDisplayName?.value || "").trim();
        const countryCode = normalizeCountryCode(elAccountCountry?.value) ?? undefined;
        const timeZone = (elAccountTimeZone?.value || "").trim() || undefined;

        setAccountStatus("Account: registering…");
        const r = await fetchAuthJson<AuthOkResponse>("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            ...(displayName ? { displayName } : {}),
            ...(countryCode ? { countryCode } : {}),
            ...(timeZone ? { timeZone } : {}),
          }),
        });

        if (!r.ok) {
          setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Register failed")}`, { isError: true });
          return;
        }

        const ok = r.json as any;
        if (!ok?.ok || !ok?.user) {
          setAccountStatus("Account: unexpected response", { isError: true });
          return;
        }
        persistAuthSessionFromPayload(resolveServerUrlForAccount(), ok);
        setAccountStatus(`Account: registered as ${ok.user.displayName} (${ok.user.email})`);

        // Best-effort: on first registration, offer to save immediately.
        void tryOfferToSavePassword(email, password);

        await refreshAccountUi();
      });
    });

    elAccountUpdateProfile?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        const displayName = (elAccountDisplayName?.value || "").trim();
        const avatarUrl = (elAccountAvatarUrl?.value || "").trim();
        const countryCode = normalizeCountryCode(elAccountCountry?.value) ?? "";
        const timeZone = (elAccountTimeZone?.value || "").trim();

        if (!displayName && !avatarUrl && !countryCode && !timeZone) {
          setAccountStatus("Account: nothing to update (set profile fields first)", { isError: true });
          return;
        }

        setAccountStatus("Account: updating profile…");
        const r = await fetchAuthJson<AuthOkResponse>("/api/auth/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(displayName ? { displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
            countryCode,
            timeZone,
          }),
        });

        if (!r.ok) {
          setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Update failed")}`, { isError: true });
          return;
        }

        const ok = r.json as any;
        setAccountStatus(`Account: updated (${ok?.user?.displayName ?? ""})`);
        await refreshAccountUi();
      });
    });

    elAccountUploadAvatar?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        const file = elAccountAvatarFile?.files?.[0] ?? null;
        if (!file) {
          setAccountStatus("Account: choose a PNG or SVG file first", { isError: true });
          return;
        }

        if (file.size > 512 * 1024) {
          setAccountStatus("Account: avatar too large (max 512KB)", { isError: true });
          return;
        }

        const ct = inferAvatarContentType(file);
        if (!ct) {
          setAccountStatus("Account: unsupported file (use .png or .svg)", { isError: true });
          return;
        }

        setAccountStatus("Account: uploading avatar…");
        const r = await fetchAuthJson<AuthOkResponse>("/api/auth/me/avatar", {
          method: "PUT",
          headers: { "content-type": ct },
          body: file,
        });

        if (!r.ok) {
          setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Upload failed")}`, { isError: true });
          return;
        }

        const ok = r.json as any;
        const nextUrl = typeof ok?.user?.avatarUrl === "string" ? ok.user.avatarUrl : "";
        if (elAccountAvatarUrl && nextUrl) elAccountAvatarUrl.value = nextUrl;

        setAccountStatus("Account: avatar uploaded");
        await refreshAccountUi();
      });
    });

    elAccountLogout?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        setAccountStatus("Account: logging out…");
        const r = await fetchAuthJson<{ ok: true }>("/api/auth/logout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!r.ok) {
          setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Logout failed")}`, { isError: true });
          return;
        }
        clearAuthSessionToken(resolveServerUrlForAccount());
        setAccountStatus("Account: signed out");
        await refreshAccountUi();
      });
    });

    // Auto-refresh once on load so it behaves like a real UI.
    void withAccountBusy(async () => {
      await refreshAccountUi();
    });
  }

  const roomCreatedAtMs = (r: LobbyRoomSummary): number => {
    const ms = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
    return Number.isFinite(ms) ? ms : 0;
  };

  const persistStartPageLaunchPrefs = (): void => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const isColumnsChess = vId === "columns_chess";
    const isClassicChess = vId === "chess_classic";
    const isCheckers = getVariantById(vId).rulesetId === "checkers_us";

    if (isColumnsChess) {
      const next = (elTheme.value === "raster3d" || elTheme.value === "raster2d" || elTheme.value === "neo") ? elTheme.value : "columns_classic";
      localStorage.setItem(LS_KEYS.columnsChessTheme, next);
    } else if (isClassicChess) {
      const next = (elTheme.value === "raster3d" || elTheme.value === "raster2d" || elTheme.value === "neo") ? elTheme.value : "raster3d";
      localStorage.setItem(LS_KEYS.chessTheme, next);
    } else if (isCheckers) {
      localStorage.setItem(LS_KEYS.checkersTheme, elTheme.value || "checkers");
    } else {
      localStorage.setItem(LS_KEYS.theme, elTheme.value);
    }

    if (!isColumnsChess && elTheme.value === "glass" && elGlassColors) {
      const raw = elGlassColors.value;
      const next: GlassPaletteId = isGlassPaletteId(raw) ? raw : "yellow_blue";
      localStorage.setItem(LS_KEYS.glassPalette, next);
      elGlassColors.value = next;
    }

    if (!isColumnsChess && elTheme.value === "glass" && elGlassBg) {
      const v = (elGlassBg.value === "felt" || elGlassBg.value === "walnut") ? elGlassBg.value : "original";
      localStorage.setItem(LS_KEYS.glassBg, v);
    }

    // Force these UI prefs.
    writeBool(LS_KEYS.optMoveHints, elMoveHints.checked);
    writeBool(LS_KEYS.optAnimations, true);
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon?.checked ?? false);
    if (isClassicChess && elShowPlayerNames) writeBool(LS_KEYS.optShowPlayerNames, elShowPlayerNames.checked);
    const boardViewportMode = elBoardViewport.value === "playable" ? "playable" : "framed";
    writeBoardViewportMode(boardViewportMode);
    writeBool(LS_KEYS.optBoardCoords, elBoardCoords.checked);
    if (elBoardCoordsInSquares) {
      // In playable-area viewport mode, we force inside-square coordinates.
      writeBool(LS_KEYS.optBoardCoordsInSquares, boardViewportMode === "playable" ? true : elBoardCoordsInSquares.checked);
    }
    writeBool(LS_KEYS.optFlipBoard, elFlipBoard.checked);
    writeBool(LS_KEYS.optLastMoveHighlights, elLastMoveHighlights.checked);
    if (isClassicChess) {
      const nextMovePreviewMode = normalizeChessMovePreviewMode(elChessMovePreviewMode?.value ?? deriveLegacyChessMovePreviewMode());
      const moveHintsEnabled = nextMovePreviewMode !== "off";
      const moveHintStyle = nextMovePreviewMode === "chesscom" ? "chesscom" : "classic";
      const highlightSquaresEnabled = nextMovePreviewMode === "stackworks-squares" || nextMovePreviewMode === "chesscom";
      localStorage.setItem(LS_KEYS.optChessMovePreviewMode, nextMovePreviewMode);
      localStorage.setItem(LS_KEYS.optMoveHintStyle, moveHintStyle);
      writeBool(LS_KEYS.optMoveHints, moveHintsEnabled);
      writeBool(LS_KEYS.optChessHighlightSquares, highlightSquaresEnabled);
      if (elSelectionStyle) {
        localStorage.setItem(LS_KEYS.optChessSelectionStyle, normalizeSelectionStyle(elSelectionStyle.value));
      }
      if (elLastMoveStyle) {
        localStorage.setItem(LS_KEYS.optChessLastMoveHighlightStyle, normalizeLastMoveHighlightStyle(elLastMoveStyle.value));
      }
      if (elAnalysisSquareStyle) {
        localStorage.setItem(
          LS_KEYS.optChessAnalysisSquareHighlightStyle,
          normalizeAnalysisSquareHighlightStyle(elAnalysisSquareStyle.value),
        );
      }
    } else if (isColumnsChess) {
      if (elMoveHintStyle) localStorage.setItem(LS_KEYS.optMoveHintStyle, normalizeMoveHintStyle(elMoveHintStyle.value));
      if (elLastMoveStyle) {
        localStorage.setItem(LS_KEYS.optColumnsLastMoveHighlightStyle, normalizeLastMoveHighlightStyle(elLastMoveStyle.value));
      }
      if (elAnalysisSquareStyle) {
        localStorage.setItem(
          LS_KEYS.optColumnsAnalysisSquareHighlightStyle,
          normalizeAnalysisSquareHighlightStyle(elAnalysisSquareStyle.value),
        );
      }
    } else {
      if (elMoveHintStyle) localStorage.setItem(LS_KEYS.optMoveHintStyle, normalizeMoveHintStyle(elMoveHintStyle.value));
    }
    if ((isColumnsChess || isClassicChess || isCheckers) && elColumnsChessBoardTheme) {
      const next = normalizeCheckerboardThemeId(elColumnsChessBoardTheme.value);
      localStorage.setItem(LS_KEYS.optCheckerboardTheme, next);
      if (isCheckers) localStorage.setItem(LS_KEYS.checkersCheckerboardTheme, next);
      // Keep the control sanitized in case the DOM was modified.
      elColumnsChessBoardTheme.value = next;
    }
    // Repetition rules are always enforced; not user-configurable.
    writeBool(LS_KEYS.optThreefold, true);
    writeBool(LS_KEYS.optToasts, elToasts.checked);
    writeBool(LS_KEYS.optSfx, elSfx.checked);

    if (isColumnsChess) {
      // Columns Chess uses a separate offline bot (Human/Bot). Keep generic AI prefs untouched.
      writeColumnsBotSide(LS_KEYS.columnsBotWhite, (elAiWhite.value === "bot" ? "bot" : "human") as ColumnsBotSide);
      writeColumnsBotSide(LS_KEYS.columnsBotBlack, (elAiBlack.value === "bot" ? "bot" : "human") as ColumnsBotSide);
    } else {
      localStorage.setItem(LS_KEYS.aiWhite, elAiWhite.value);
      localStorage.setItem(LS_KEYS.aiBlack, elAiBlack.value);
    }

    // Classic Chess uses a separate offline bot system (Stockfish) with its own localStorage keys.
    if (isClassicChess) {
      localStorage.setItem(CHESSBOT_LS_KEYS.white, difficultyToChessBotSide(elAiWhite.value));
      localStorage.setItem(CHESSBOT_LS_KEYS.black, difficultyToChessBotSide(elAiBlack.value));
      localStorage.setItem(CHESSBOT_LS_KEYS.paused, "false");
    }

    const delayMs = parseDelayMs(elAiDelay.value || "500", 500);
    if (isColumnsChess) {
      localStorage.setItem(LS_KEYS.columnsBotDelayMs, String(delayMs));
      localStorage.setItem(LS_KEYS.columnsBotPaused, "false");
    } else {
      localStorage.setItem(LS_KEYS.aiDelayMs, String(delayMs));
      // Let AIManager own startup pause state so fresh offline launches can show
      // the resume toast when a bot is to move first (for example US Checkers).
      localStorage.removeItem(LS_KEYS.aiPaused);
    }
  };

  const launchOnline = async (args: {
    action: OnlineAction;
    serverUrl: string;
    roomId?: string;
    prefColor?: PreferredColor;
    visibility?: RoomVisibility;
    fallbackVariantId: VariantId;
  }): Promise<void> => {
    const fallbackVariant = getVariantById(args.fallbackVariantId);
    if (!fallbackVariant.available || !fallbackVariant.entryUrl) return;

    const serverUrl = normalizeServerUrl(args.serverUrl);
    const roomId = (args.roomId || "").trim();
    const prefColor = (args.prefColor === "W" || args.prefColor === "B") ? args.prefColor : "auto";
    const visibility = (args.visibility === "private" ? "private" : "public") as RoomVisibility;

    if (!serverUrl) {
      setServerError(true);
      setWarning("Invalid Server: (empty)", { isError: true });
      return;
    }

    try {
      // eslint-disable-next-line no-new
      new URL(serverUrl);
    } catch {
      setServerError(true);
      setWarning(`Invalid Server: ${serverUrl}`, { isError: true });
      return;
    }

    if ((args.action === "join" || args.action === "spectate" || args.action === "rejoin") && !roomId) {
      setRoomIdError(true);
      setWarning("Missing Room ID", { isError: true });
      return;
    }

    if ((args.action === "join" || args.action === "spectate" || args.action === "rejoin") && !isPlausibleRoomId(roomId)) {
      setRoomIdError(true);
      setWarning(`Invalid Room ID: ${roomId} (must be hex).`, { isError: true });
      return;
    }

    const resume = args.action === "rejoin" ? resolveOnlineResumeRecord(serverUrl, roomId) : null;
    if (args.action === "rejoin" && !resume) {
      setWarning("No saved seat for this room on this browser.", { isError: true });
      return;
    }

    // If joining/rejoining/spectating, prefer the room's authoritative variant.
    let targetVariant = fallbackVariant;
    if (args.action === "join" || args.action === "rejoin" || args.action === "spectate") {
      try {
        const res = await fetch(`${serverUrl}/api/room/${encodeURIComponent(roomId)}/meta`);
        const json = (await res.json()) as any;

        if (!res.ok || json?.error) {
          const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
          const lower = String(msg).toLowerCase();
          const isRoomError =
            lower.includes("room not found") ||
            lower.includes("no such room") ||
            lower.includes("invalid room") ||
            lower.includes("invalid room id");

          if (isRoomError) setRoomIdError(true);
          else setServerError(true);

          setWarning(`Online room check failed: ${msg}`, { isError: true });
          return;
        }

        const roomVariantId = json?.variantId as string | undefined;
        if (roomVariantId && isVariantId(roomVariantId)) {
          targetVariant = getVariantById(roomVariantId);
          localStorage.setItem(LS_KEYS.variantId, targetVariant.variantId);
        }
      } catch {
        setServerError(true);
        setWarning(`Online room check failed (network error) — server: ${serverUrl}`, { isError: true });
        return;
      }
    }

    if (!targetVariant.available || !targetVariant.entryUrl) {
      setWarning(`${targetVariant.displayName} is not available yet in this build.`, { isError: true });
      return;
    }

    const url = new URL(targetVariant.entryUrl, window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", serverUrl);
    if (args.action === "create") {
      url.searchParams.set("create", "1");
      if (prefColor !== "auto") url.searchParams.set("prefColor", prefColor);
      url.searchParams.set("visibility", visibility);
    } else if (args.action === "join") {
      url.searchParams.set("join", "1");
      url.searchParams.set("roomId", roomId);
    } else if (args.action === "spectate") {
      url.searchParams.set("roomId", roomId);
    } else {
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("playerId", (resume as OnlineResumeRecord).playerId);
      if ((resume as OnlineResumeRecord).color) url.searchParams.set("color", (resume as OnlineResumeRecord).color as any);
    }

    window.location.assign(url.toString());
  };

  const renderLobby = (rooms: LobbyRoomSummary[], serverUrlForRejoin?: string): { shown: number; total: number } => {
    const total = rooms.length;
    if (!elLobbyList) return { shown: 0, total };
    elLobbyList.textContent = "";

    const serverUrl = normalizeServerUrl(serverUrlForRejoin ?? "");

    const mineOnly = Boolean(elLobbyMineOnly?.checked);
    const filtered = mineOnly && serverUrl
      ? rooms.filter((r) => Boolean(readOnlineResumeRecord(serverUrl, r.roomId)))
      : rooms;

    const sorted = filtered
      .slice()
      .sort((a, b) => roomCreatedAtMs(b) - roomCreatedAtMs(a));

    if (!sorted.length) {
      const el = document.createElement("div");
      el.className = "hint";
      el.style.marginLeft = "0";
      el.textContent = mineOnly ? "No rooms with a saved seat in this browser." : "No public rooms.";
      elLobbyList.appendChild(el);
      return { shown: 0, total };
    }

    for (const r of sorted) {
      const v = getVariantById(r.variantId);

      const labels = getSideLabelsForRuleset(v.rulesetId, { boardSize: v.boardSize });
      const wLabel = labels.W;
      const bLabel = labels.B;

      const item = document.createElement("div");
      item.className = "lobbyItem";

      const left = document.createElement("div");
      left.className = "lobbyItemLeft";

      const title = document.createElement("div");
      title.className = "lobbyItemTitle";
      title.textContent = `${v.displayName} — `;
      const rid = document.createElement("span");
      rid.className = "mono";
      rid.textContent = r.roomId;
      title.appendChild(rid);
      title.title = title.textContent;

      const status =
        r.status === "game_over"
          ? "Status: Game over"
          : r.status === "in_game"
            ? "Status: In game"
            : r.status === "waiting"
              ? "Status: Waiting"
              : "";
      const statusReason = typeof r.statusReason === "string" ? r.statusReason.trim() : "";
      const createdAtMs = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
      const age = Number.isFinite(createdAtMs) ? `Age: ${formatAgeShort(Date.now() - createdAtMs)}` : "";

      const hostDisplayName = typeof (r as any)?.hostDisplayName === "string" ? String((r as any).hostDisplayName).trim() : "";
      const byColor = r.displayNameByColor as Partial<Record<"W" | "B", string>> | undefined;
      const identityByColor = r.identityByColor as Partial<Record<PlayerColor, {
        displayName?: string;
        avatarUrl?: string;
        countryCode?: string;
        countryName?: string;
      }>> | undefined;
      const lightName = typeof byColor?.W === "string" ? byColor.W.trim() : "";
      const darkName = typeof byColor?.B === "string" ? byColor.B.trim() : "";
      const whiteIdentity = identityByColor?.W ?? (lightName ? { displayName: lightName } : undefined);
      const blackIdentity = identityByColor?.B ?? (darkName ? { displayName: darkName } : undefined);

      const identityRow = document.createElement("div");
      identityRow.className = "lobbyIdentityRow";
      const whiteChip = createLobbyIdentityChip({ serverUrl, seatLabel: wLabel, identity: whiteIdentity, color: "W" });
      const blackChip = createLobbyIdentityChip({ serverUrl, seatLabel: bLabel, identity: blackIdentity, color: "B" });
      if (whiteChip) identityRow.appendChild(whiteChip);
      if (blackChip) identityRow.appendChild(blackChip);
      const hasIdentityRow = identityRow.childElementCount > 0;

      const sub = document.createElement("div");
      sub.className = "lobbyItemSub";
      const open = r.seatsOpen.length ? `Open: ${r.seatsOpen.join("/")}` : "Open: —";
      const taken = r.seatsTaken.length ? `Taken: ${r.seatsTaken.join("/")}` : "Taken: —";
      const host = !hasIdentityRow && hostDisplayName ? `Host: ${hostDisplayName}` : "";
      const players = !hasIdentityRow && (lightName || darkName)
        ? `Players: ${lightName ? `${wLabel}=${lightName}` : `${wLabel}=—`} · ${darkName ? `${bLabel}=${darkName}` : `${bLabel}=—`}`
        : "";

      sub.textContent = [status, statusReason, age, host, open, taken, players, r.visibility === "public" ? "Public" : "Private"]
        .filter(Boolean)
        .join(" · ");
      if (sub.textContent) sub.title = sub.textContent;

      left.appendChild(title);
      if (hasIdentityRow) left.appendChild(identityRow);
      left.appendChild(sub);

      bindLobbyRoomTrigger(title, () => showLobbyRoomDialog(r, serverUrl));
      bindLobbyRoomTrigger(sub, () => showLobbyRoomDialog(r, serverUrl));
      if (whiteChip) bindLobbyRoomTrigger(whiteChip, () => showLobbyRoomDialog(r, serverUrl));
      if (blackChip) bindLobbyRoomTrigger(blackChip, () => showLobbyRoomDialog(r, serverUrl));

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "panelBtn";
      const resume = serverUrl ? readOnlineResumeRecord(serverUrl, r.roomId) : null;
      const canRejoin = Boolean(resume);
      const isGameOver = r.status === "game_over";
      joinBtn.textContent = canRejoin ? "Rejoin" : "Join";
      // Rejoin should be available even if the room is full.
      joinBtn.disabled = canRejoin ? false : (r.seatsOpen.length === 0 || isGameOver);
      if (!canRejoin && isGameOver) {
        joinBtn.title = statusReason || "This game has ended.";
      }
      joinBtn.addEventListener("click", () => {
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        // Persist current prefs (theme/options/AI) and launch directly.
        persistStartPageLaunchPrefs();
        void launchOnline({
          action: canRejoin ? "rejoin" : "join",
          serverUrl: serverUrl,
          roomId: r.roomId,
          fallbackVariantId: (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId,
        });
      });

      right.appendChild(joinBtn);

      const spectateBtn = document.createElement("button");
      spectateBtn.type = "button";
      spectateBtn.className = "panelBtn";
      spectateBtn.textContent = "Spectate";
      if (r.visibility === "private") {
        spectateBtn.disabled = true;
        spectateBtn.title = "Private rooms require a secret watch link/token to spectate.";
      }
      spectateBtn.addEventListener("click", () => {
        if (r.visibility === "private") return;
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        persistStartPageLaunchPrefs();
        void launchOnline({
          action: "spectate",
          serverUrl: serverUrl,
          roomId: r.roomId,
          fallbackVariantId: (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId,
        });
      });

      right.appendChild(spectateBtn);

      item.appendChild(left);
      item.appendChild(right);
      elLobbyList.appendChild(item);
    }

    return { shown: sorted.length, total };
  };


  let lobbyFetchInFlight = false;
  let lobbyLastKey = "";
  let lobbyLastRooms: LobbyRoomSummary[] = [];
  let lobbyLastServerUrl = "";

  elLobbyRoomDialog?.addEventListener("click", (event) => {
    if (event.target === elLobbyRoomDialog) setLobbyRoomDialogOpen(false);
  });

  const fetchLobby = async (): Promise<void> => {
    if (!elLobbySection || !elLobbySection.offsetParent) return; // hidden
    const serverUrl = resolveConfiguredServerUrl();
    if (!serverUrl) {
      setLobbyStatus("Lobby: online server is not configured.");
      lobbyLastRooms = [];
      lobbyLastServerUrl = "";
      renderLobby([]);
      return;
    }

    const key = serverUrl;
    if (lobbyFetchInFlight) return;

    lobbyFetchInFlight = true;
    elLobbyRefresh && (elLobbyRefresh.disabled = true);
    setLobbyStatus("Lobby: loading…");

    try {
      const res = await fetch(`${serverUrl}/api/lobby?limit=200&includeFull=1`);
      const raw = await res.text();
      let json: GetLobbyResponse | null = null;
      try {
        json = (raw ? JSON.parse(raw) : null) as any;
      } catch {
        json = null;
      }

      if (!res.ok || (json as any)?.error) {
        const msg =
          typeof (json as any)?.error === "string"
            ? (json as any).error
            : raw && raw.trim()
              ? raw.trim().slice(0, 120)
              : `HTTP ${res.status}`;
        setLobbyStatus(`Lobby: failed (${msg})`);
        lobbyLastRooms = [];
        lobbyLastServerUrl = "";
        renderLobby([]);
        return;
      }

      const rooms = Array.isArray((json as any)?.rooms) ? (((json as any).rooms as any[]) as LobbyRoomSummary[]) : [];
      lobbyLastRooms = rooms;
      lobbyLastServerUrl = serverUrl;
      const { shown, total } = renderLobby(rooms, serverUrl);
      setLobbyStatus(`Lobby: ${shown}/${total} room${total === 1 ? "" : "s"}.`);
      lobbyLastKey = key;
    } catch {
      setLobbyStatus(`Lobby: network error — server: ${serverUrl}`);
      lobbyLastRooms = [];
      lobbyLastServerUrl = "";
      renderLobby([]);
    } finally {
      lobbyFetchInFlight = false;
      elLobbyRefresh && (elLobbyRefresh.disabled = false);
    }
  };

  // Populate variant select
  elGame.textContent = "";
  for (const v of VARIANTS) {
    const opt = document.createElement("option");
    opt.value = v.variantId;
    opt.textContent = v.displayName;
    if (!v.available) opt.disabled = true;
    elGame.appendChild(opt);
  }

  // Populate theme select
  const populateThemeSelect = (themeIds: readonly string[]): void => {
    elTheme.textContent = "";
    for (const id of themeIds) {
      const t = getThemeById(id);
      if (!t) continue;
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      elTheme.appendChild(opt);
    }
  };

  const populateColumnsChessThemeSelect = (): void => {
    // Columns Chess intentionally exposes only a small subset of themes.
    elTheme.textContent = "";

    const optDiscs = document.createElement("option");
    optDiscs.value = "columns_classic";
    optDiscs.textContent = "Discs";
    elTheme.appendChild(optDiscs);

    const opt2d = document.createElement("option");
    opt2d.value = "raster2d";
    opt2d.textContent = "2D";
    elTheme.appendChild(opt2d);

    const opt3d = document.createElement("option");
    opt3d.value = "raster3d";
    opt3d.textContent = "3D";
    elTheme.appendChild(opt3d);

    const optNeo = document.createElement("option");
    optNeo.value = "neo";
    optNeo.textContent = "Neo";
    elTheme.appendChild(optNeo);
  };

  const populateClassicChessThemeSelect = (): void => {
    // Classic Chess intentionally exposes only a small subset of themes.
    elTheme.textContent = "";

    const opt2d = document.createElement("option");
    opt2d.value = "raster2d";
    opt2d.textContent = "2D";
    elTheme.appendChild(opt2d);

    const opt3d = document.createElement("option");
    opt3d.value = "raster3d";
    opt3d.textContent = "3D";
    elTheme.appendChild(opt3d);

    const optNeo = document.createElement("option");
    optNeo.value = "neo";
    optNeo.textContent = "Neo";
    elTheme.appendChild(optNeo);
  };

  const visibleThemeIds = (): string[] => THEMES.filter((t) => !t.hidden).map((t) => t.id);

  populateThemeSelect(visibleThemeIds());

  // Read saved settings (or defaults matching lasca.html)
  const savedTheme = localStorage.getItem(LS_KEYS.theme);
  const initialTheme = (savedTheme && getThemeById(savedTheme) && !getThemeById(savedTheme)?.hidden) ? savedTheme : DEFAULT_THEME_ID;
  elTheme.value = initialTheme;

  type ThemeSelectMode = "all" | "columns_chess_only" | "chess_only";
  let themeSelectMode: ThemeSelectMode = "all";
  let savedThemeBeforeColumnsChess: string = initialTheme;
  let savedThemeBeforeChess: string = initialTheme;

  const normalizeColumnsChessTheme = (raw: string | null | undefined): "columns_classic" | "raster2d" | "raster3d" | "neo" => {
    const v = String(raw ?? "").trim().toLowerCase();
    if (v === "neo") return "neo";
    if (v === "raster3d" || v === "3d") return "raster3d";
    if (v === "raster2d" || v === "2d") return "raster2d";
    if (v === "columns_classic" || v === "classic" || v === "discs" || v === "disc") return "columns_classic";
    return "columns_classic";
  };

  const normalizeClassicChessTheme = (raw: string | null | undefined): "raster2d" | "raster3d" | "neo" => {
    const v = String(raw ?? "").trim().toLowerCase();
    if (v === "neo") return "neo";
    if (v === "raster2d" || v === "2d") return "raster2d";
    if (v === "raster3d" || v === "3d") return "raster3d";
    return "raster3d";
  };

  const syncThemeConstraintsForVariant = (variantId: VariantId): void => {
    const variant = getVariantById(variantId);
    const isColumnsChess = variantId === "columns_chess";
    const isClassicChess = variantId === "chess_classic";
    const isCheckers = variant.rulesetId === "checkers_us";

    // Checkerboard theme:
    // - Always applicable to Columns Chess / Classic Chess.
    // - Always applicable to US Checkers (it is always played on a checkerboard).
    // - For other 8×8 variants, it applies only when the optional checkered 8×8 board is enabled.
    //   Still show the control (disabled) so the option is discoverable.
    const shouldShowCheckerboardTheme = isColumnsChess || isClassicChess || variant.boardSize === 8;
    const canUseCheckerboardTheme =
      isColumnsChess ||
      isClassicChess ||
      isCheckers ||
      (variant.boardSize === 8 && Boolean(elBoard8x8Checkered?.checked));

    if (elColumnsChessBoardThemeRow) elColumnsChessBoardThemeRow.style.display = shouldShowCheckerboardTheme ? "" : "none";
    if (elColumnsChessBoardTheme) {
      elColumnsChessBoardTheme.disabled = !canUseCheckerboardTheme;
      const raw = isCheckers ? localStorage.getItem(LS_KEYS.checkersCheckerboardTheme) : localStorage.getItem(LS_KEYS.optCheckerboardTheme);
      const next = normalizeCheckerboardThemeId(raw ?? (isCheckers ? "checkers" : null));
      elColumnsChessBoardTheme.value = next;
      if (isCheckers && !raw) {
        try {
          localStorage.setItem(LS_KEYS.checkersCheckerboardTheme, next);
        } catch {
          // ignore
        }
      }
    }

    if (isColumnsChess) {
      if (themeSelectMode !== "columns_chess_only") {
        if (themeSelectMode === "all") savedThemeBeforeColumnsChess = elTheme.value;
        themeSelectMode = "columns_chess_only";
        populateColumnsChessThemeSelect();
      }
      const savedColumnsTheme = localStorage.getItem(LS_KEYS.columnsChessTheme);
      elTheme.value = normalizeColumnsChessTheme(savedColumnsTheme);
      elTheme.disabled = false;
      syncGlassThemeOptions();
    } else if (isClassicChess) {
      if (themeSelectMode !== "chess_only") {
        if (themeSelectMode === "all") savedThemeBeforeChess = elTheme.value;
        themeSelectMode = "chess_only";
        populateClassicChessThemeSelect();
      }
      const savedChessTheme = localStorage.getItem(LS_KEYS.chessTheme) ?? localStorage.getItem(LS_KEYS.theme);
      elTheme.value = normalizeClassicChessTheme(savedChessTheme);
      elTheme.disabled = false;
      syncGlassThemeOptions();
    } else {
      if (themeSelectMode !== "all") {
        themeSelectMode = "all";
        populateThemeSelect(visibleThemeIds());
      }
      elTheme.disabled = false;
      if (isCheckers) {
        const raw = localStorage.getItem(LS_KEYS.checkersTheme);
        const next = (raw && getThemeById(raw) && !getThemeById(raw)?.hidden) ? raw : "checkers";
        elTheme.value = next;
        if (!raw || raw !== next) {
          try {
            localStorage.setItem(LS_KEYS.checkersTheme, next);
          } catch {
            // ignore
          }
        }
      } else {
        const savedThemeNow = localStorage.getItem(LS_KEYS.theme);
        const restore = (savedThemeNow && getThemeById(savedThemeNow) && !getThemeById(savedThemeNow)?.hidden)
          ? savedThemeNow
          : (savedThemeBeforeColumnsChess || savedThemeBeforeChess);
        if (restore && getThemeById(restore) && !getThemeById(restore)?.hidden) elTheme.value = restore;
      }
      syncGlassThemeOptions();
    }
  };

  if (elGlassBg) {
    elGlassBg.value = readGlassBg(LS_KEYS.glassBg, "original");
  }

  if (elGlassColors) {
    elGlassColors.value = readGlassPaletteId(LS_KEYS.glassPalette, "yellow_blue");
  }

  const syncGlassThemeOptions = () => {
    const isGlass = elTheme.value === "glass";
    if (elGlassColorsRow) elGlassColorsRow.style.display = isGlass ? "" : "none";
    if (elGlassColors) elGlassColors.disabled = !isGlass;
    if (elGlassBgRow) elGlassBgRow.style.display = isGlass ? "" : "none";
    if (elGlassBg) elGlassBg.disabled = !isGlass;
  };

  syncGlassThemeOptions();

  elTheme.addEventListener("change", () => {
    syncGlassThemeOptions();

    if (themeSelectMode === "columns_chess_only") {
      const next = (elTheme.value === "raster3d" || elTheme.value === "raster2d" || elTheme.value === "neo") ? elTheme.value : "columns_classic";
      elTheme.value = next;
      localStorage.setItem(LS_KEYS.columnsChessTheme, next);
      return;
    }

    if (themeSelectMode === "chess_only") {
      const next = (elTheme.value === "raster3d" || elTheme.value === "raster2d" || elTheme.value === "neo") ? elTheme.value : "raster3d";
      elTheme.value = next;
      localStorage.setItem(LS_KEYS.chessTheme, next);
      return;
    }

    savedThemeBeforeColumnsChess = elTheme.value;
    savedThemeBeforeChess = elTheme.value;
  });

  elGlassColors?.addEventListener("change", () => {
    if (elTheme.value !== "glass") return;
    const raw = elGlassColors.value;
    const next: GlassPaletteId = isGlassPaletteId(raw) ? raw : "yellow_blue";
    localStorage.setItem(LS_KEYS.glassPalette, next);
    elGlassColors.value = next;
  });

  elGlassBg?.addEventListener("change", () => {
    if (elTheme.value !== "glass") return;
    const v = (elGlassBg.value === "felt" || elGlassBg.value === "walnut") ? elGlassBg.value : "original";
    localStorage.setItem(LS_KEYS.glassBg, v);
    // Keep the control sanitized in case the DOM was modified.
    elGlassBg.value = v;
  });

  const initialShellState = readShellState();
  const initialVariantId = initialShellState.activeGame ?? readVariantId(LS_KEYS.variantId, DEFAULT_VARIANT_ID);
  elGame.value = initialVariantId;
  prefetchGamePage(elGame);

  elPlayMode.value = readPlayMode(LS_KEYS.playMode, "local");
  localStorage.setItem(LS_KEYS.onlineAction, "create");
  elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, "public");
  elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";

  if (elShowResizeIcon) elShowResizeIcon.checked = readBool(LS_KEYS.optShowResizeIcon, false);
  if (elShowPlayerNames) elShowPlayerNames.checked = readBool(LS_KEYS.optShowPlayerNames, true);
  elBoardViewport.value = readBoardViewportMode();
  elBoardCoords.checked = readBool(LS_KEYS.optBoardCoords, false);
  if (elBoardCoordsInSquares) elBoardCoordsInSquares.checked = readBool(LS_KEYS.optBoardCoordsInSquares, false);
  elFlipBoard.checked = readBool(LS_KEYS.optFlipBoard, false);
  elLastMoveHighlights.checked = readBool(LS_KEYS.optLastMoveHighlights, true);
  elMoveHints.checked = readBool(LS_KEYS.optMoveHints, true);
  if (elLastMoveStyle) {
    const initialLastMoveStyle = normalizeLastMoveHighlightStyle(
      localStorage.getItem(getLastMoveHighlightStyleKey(initialVariantId))
        ?? localStorage.getItem(LS_KEYS.optChessLastMoveHighlightStyle)
        ?? localStorage.getItem(LS_KEYS.optColumnsLastMoveHighlightStyle)
        ?? localStorage.getItem(LS_KEYS.optLastMoveHighlightStyle),
    );
    elLastMoveStyle.value = initialLastMoveStyle;
  }
  if (elChessMovePreviewMode) {
    elChessMovePreviewMode.value = normalizeChessMovePreviewMode(
      localStorage.getItem(LS_KEYS.optChessMovePreviewMode) ?? deriveLegacyChessMovePreviewMode(),
    );
  }
  if (elSelectionStyle) {
    elSelectionStyle.value = normalizeSelectionStyle(localStorage.getItem(LS_KEYS.optChessSelectionStyle));
  }
  if (elMoveHintStyle) {
    elMoveHintStyle.value = normalizeMoveHintStyle(localStorage.getItem(LS_KEYS.optMoveHintStyle));
  }
  if (elAnalysisSquareStyle) {
    const initialAnalysisSquareStyle = normalizeAnalysisSquareHighlightStyle(
      localStorage.getItem(LS_KEYS.optChessAnalysisSquareHighlightStyle)
        ?? localStorage.getItem(LS_KEYS.optColumnsAnalysisSquareHighlightStyle),
    );
    elAnalysisSquareStyle.value = initialAnalysisSquareStyle;
  }
  elBoard8x8Checkered.checked = readBool(LS_KEYS.optBoard8x8Checkered, false);
  elToasts.checked = readBool(LS_KEYS.optToasts, true);
  elSfx.checked = readBool(LS_KEYS.optSfx, false);

  if (elColumnsChessBoardTheme) {
    elColumnsChessBoardTheme.value = normalizeCheckerboardThemeId(localStorage.getItem(LS_KEYS.optCheckerboardTheme));
  }

  const sfx = createSfxManager();
  sfx.setEnabled(elSfx.checked);

  elAiWhite.value = readDifficulty(LS_KEYS.aiWhite, "human");
  elAiBlack.value = readDifficulty(LS_KEYS.aiBlack, "human");

  const initialVariant = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
  if (initialVariant === "columns_chess") {
    elAiWhite.value = readColumnsBotSide(LS_KEYS.columnsBotWhite, "human");
    elAiBlack.value = readColumnsBotSide(LS_KEYS.columnsBotBlack, "human");
  } else if (initialVariant === "chess_classic") {
    elAiWhite.value = chessBotSideToDifficulty(localStorage.getItem(CHESSBOT_LS_KEYS.white));
    elAiBlack.value = chessBotSideToDifficulty(localStorage.getItem(CHESSBOT_LS_KEYS.black));
  }
  syncPlayerBotSelector("launchAiWhite");
  syncPlayerBotSelector("launchAiBlack");

  const initialDelayKey = initialVariant === "columns_chess"
    ? LS_KEYS.columnsBotDelayMs
    : initialVariant === "chess_classic"
    ? CHESSBOT_LS_KEYS.delay
    : LS_KEYS.aiDelayMs;
  const delay = readDelayMs(initialDelayKey, 1000);
  elAiDelay.value = String(delay);
  elAiDelayLabel.textContent = `${delay} ms`;

  if (elPlayerNameLight) elPlayerNameLight.value = localStorage.getItem(LS_KEYS.localPlayerLight) ?? "";
  if (elPlayerNameDark) elPlayerNameDark.value = localStorage.getItem(LS_KEYS.localPlayerDark) ?? "";

  // Populate player name datalist from the signed-in account.
  void (async () => {
    try {
      const serverUrl = resolveConfiguredServerUrl();
      if (!serverUrl) return;
      const normalizedServerUrl = serverUrl.replace(/\/$/, "");
      const res = await fetch(`${normalizedServerUrl}/api/auth/me`, buildSessionAuthFetchInit(normalizedServerUrl));
      if (!res.ok) return;
      const body = await res.json() as { ok: boolean; user?: { displayName?: string } | null };
      const name = typeof body?.user?.displayName === "string" ? body.user.displayName.trim() : "";
      if (!name) return;
      // Add the logged-in name as a suggestion in the shared datalist.
      const datalist = document.getElementById("launchPlayerNameSuggestions") as HTMLDataListElement | null;
      if (datalist && !datalist.querySelector(`option[value=${JSON.stringify(name)}]`)) {
        const opt = document.createElement("option");
        opt.value = name;
        datalist.appendChild(opt);
      }
      signedInAccountDisplayName = name;
      prefillLocalPlayerNamesFromSignedInAccount();
      syncOnlinePlayerSeatInputs();
      syncOnlineIdentityFromBotSection();
    } catch { /* ignore */ }
  })();

  const startPageWrap = document.querySelector(".wrap") as HTMLElement | null;
  if (!startPageWrap) throw new Error("Missing start page root: .wrap");

  const appShell = initStartPageAppShell({
    contentRoot: startPageWrap,
    initialVariantId,
    initialPlayMode: (elPlayMode.value === "online" ? "online" : "local") as PlayMode,
    helpHref: "./start-help",
    onSelectGame: (variantId) => {
      elGame.value = variantId;
      elGame.dispatchEvent(new Event("change", { bubbles: true }));
    },
    onSelectPlayMode: (playMode) => {
      elPlayMode.value = playMode;
      elPlayMode.dispatchEvent(new Event("change", { bubbles: true }));
    },
    onOpenLobby: () => {
      void fetchLobby();
    },
    onRequestAccountAction: (action) => {
      appShell.setActiveSection(GlobalSection.Account);
      const accountSection = document.getElementById("launchAccountSection") as HTMLDetailsElement | null;
      if (accountSection) {
        accountSection.open = true;
        accountSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const accountSummary = accountSection?.querySelector("summary") as HTMLElement | null;
      if (action === "logout") {
        accountSummary?.focus();
        elAccountLogout?.click();
        return;
      }
      if (action === "signup") {
        elAccountDisplayName?.focus();
        return;
      }
      if (action === "login") {
        accountSummary?.focus();
        elAccountLogin?.click();
        return;
      }
      elAccountDisplayName?.focus();
    },
  });
  syncShellAccountState = appShell.setAccountState;

  const syncDelayLabel = () => {
    const min = Number(elAiDelay.min || "0");
    const max = Number(elAiDelay.max || "5000");
    const fallback = 1000;
    const v = clamp(parseDelayMs(elAiDelay.value || String(fallback), fallback), Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 5000);
    elAiDelay.value = String(v);
    elAiDelayLabel.textContent = `${v} ms`;
  };

  const persistLaunchDelayPref = (): void => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const delayMs = parseDelayMs(elAiDelay.value || "1000", 1000);
    if (vId === "columns_chess") {
      localStorage.setItem(LS_KEYS.columnsBotDelayMs, String(delayMs));
      return;
    }
    if (vId === "chess_classic") {
      localStorage.setItem(CHESSBOT_LS_KEYS.delay, String(delayMs));
      return;
    }
    localStorage.setItem(LS_KEYS.aiDelayMs, String(delayMs));
  };

  const readOnlineLaunchIdentity = (): { guestName: string; prefColor: PreferredColor } => {
    return deriveOnlineLaunchIdentityFromSeatConfig({
      whiteRole: elAiWhite.value === "human" ? "human" : "bot",
      blackRole: elAiBlack.value === "human" ? "human" : "bot",
      whiteOwner: readOnlineSeatOwner("W"),
      blackOwner: readOnlineSeatOwner("B"),
      preferredColor: readPreferredColor(LS_KEYS.onlinePrefColor, "auto"),
      signedInDisplayName: signedInAccountDisplayName,
      lightName: readStoredPlayerName("W"),
      darkName: readStoredPlayerName("B"),
    });
  };

  const syncOnlineIdentityFromBotSection = (): void => {
    const { guestName } = readOnlineLaunchIdentity();
    setGuestDisplayName(guestName);
  };

  // When switching into playable-area viewport mode, we force "Inside squares"
  // on and lock it. Preserve the user's previous selection so it can be
  // restored when switching back to framed mode.
  let boardCoordsInSquaresBeforePlayable: boolean | null = null;

  elAiDelay.addEventListener("input", syncDelayLabel);
  elAiDelay.addEventListener("input", persistLaunchDelayPref);
  elAiDelay.addEventListener("change", persistLaunchDelayPref);
  elAiDelayReset.addEventListener("click", () => {
    elAiDelay.value = "1000";
    syncDelayLabel();
    persistLaunchDelayPref();
  });

  if (elPlayerNameLight) {
    elPlayerNameLight.addEventListener("input", () => {
      localStorage.setItem(LS_KEYS.localPlayerLight, elPlayerNameLight.value.trim());
      syncOnlineIdentityFromBotSection();
    });
  }
  if (elPlayerNameDark) {
    elPlayerNameDark.addEventListener("input", () => {
      localStorage.setItem(LS_KEYS.localPlayerDark, elPlayerNameDark.value.trim());
      syncOnlineIdentityFromBotSection();
    });
  }
  elOnlineSeatOwnerLight?.addEventListener("change", () => {
    writeOnlineSeatOwner("W", elOnlineSeatOwnerLight.value === "local" ? "local" : "remote");
    if (elOnlineSeatOwnerLight.value === "local" && elAiBlack.value === "human") {
      writeOnlineSeatOwner("B", "remote");
    }
    syncOnlinePlayerSeatInputs();
    syncOnlineIdentityFromBotSection();
    syncAvailability();
  });
  elOnlineSeatOwnerDark?.addEventListener("change", () => {
    writeOnlineSeatOwner("B", elOnlineSeatOwnerDark.value === "local" ? "local" : "remote");
    if (elOnlineSeatOwnerDark.value === "local" && elAiWhite.value === "human") {
      writeOnlineSeatOwner("W", "remote");
    }
    syncOnlinePlayerSeatInputs();
    syncOnlineIdentityFromBotSection();
    syncAvailability();
  });

  syncOnlinePlayerSeatInputs();
  syncOnlineIdentityFromBotSection();

  const syncAvailability = () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);
    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;

    appShell.setSelectedGame(vId, { playMode });

    // Terminology:
    // - When using the Checkers (Red/Black) *pieces* (theme id: "checkers"): use Red/Black for disc games.
    // - Otherwise: Dama uses White/Black; other disc games use Light/Dark.
    // - Chess-like games always use White/Black.
    {
      const labels = getSideLabelsForRuleset(v.rulesetId, { boardSize: v.boardSize });
      const wLabel = labels.W;
      const bLabel = labels.B;

      if (elAiWhiteLabel) elAiWhiteLabel.textContent = wLabel;
      if (elAiBlackLabel) elAiBlackLabel.textContent = bLabel;
    }

    syncThemeConstraintsForVariant(vId);

    elGameNote.textContent = v.subtitle;
    localStorage.setItem(LS_KEYS.variantId, v.variantId);

    const baseOk = Boolean(v.available && v.entryUrl);

    const isColumnsChess = vId === "columns_chess";
    const isClassicChess = vId === "chess_classic";
    const isCheckers = v.rulesetId === "checkers_us";
    const usesColumnsChessBoard = isColumnsChess || isClassicChess;
    const supportsModernLastMoveStyle = true;
    const supportsAnalysisSquareStyle = isColumnsChess || isClassicChess;

    // "Show player names" only applies to Classic Chess (the only game with SVG name rendering).
    {
      const show = isClassicChess;
      if (elShowPlayerNamesRow) elShowPlayerNamesRow.style.display = show ? "" : "none";
      if (elShowPlayerNamesHint) elShowPlayerNamesHint.style.display = show ? "" : "none";
    }

    // Board coordinate style (Inside squares) applies to 8x8 checkerboard boards:
    // - Chess / Columns Chess always use a checkerboard board.
    // - US Checkers always uses a checkerboard board.
    // - Other 8x8 disc games only when "Use checkered board (8×8)" is enabled.
    {
      const usesCheckerboard =
        v.boardSize === 8 && (usesColumnsChessBoard || isCheckers || Boolean(elBoard8x8Checkered?.checked));
      if (elBoardCoordsInSquaresRow) elBoardCoordsInSquaresRow.style.display = usesCheckerboard ? "" : "none";
      if (elBoardCoordsInSquaresHint) elBoardCoordsInSquaresHint.style.display = usesCheckerboard ? "" : "none";
      if (elBoardCoordsInSquares) {
        const forceInSquares = elBoardViewport.value === "playable";
        if (forceInSquares) {
          if (boardCoordsInSquaresBeforePlayable === null) boardCoordsInSquaresBeforePlayable = elBoardCoordsInSquares.checked;
          elBoardCoordsInSquares.checked = true;
        } else if (boardCoordsInSquaresBeforePlayable !== null) {
          elBoardCoordsInSquares.checked = boardCoordsInSquaresBeforePlayable;
          boardCoordsInSquaresBeforePlayable = null;
        }
        elBoardCoordsInSquares.disabled = !usesCheckerboard || !elBoardCoords.checked || forceInSquares;
        if (elBoardCoordsInSquaresRow) elBoardCoordsInSquaresRow.style.opacity = forceInSquares ? "0.45" : "";
      }
    }

    // "Use checkered board for 8×8 games" does not apply to:
    // - Columns Chess / Classic Chess (they have their own board SVG)
    // - US Checkers (it is always played on a checkerboard)
    {
      const show = !usesColumnsChessBoard && !isCheckers && v.boardSize === 8;
      if (elBoard8x8CheckeredRow) elBoard8x8CheckeredRow.style.display = show ? "" : "none";
      if (elBoard8x8CheckeredHint) elBoard8x8CheckeredHint.style.display = show ? "" : "none";
      elBoard8x8Checkered.disabled = !show;
    }

    {
      const showChessMovePreview = isClassicChess;
      const showSelectionStyle = isClassicChess && (elChessMovePreviewMode?.value ?? "stackworks") === "off";
      const showMoveHints = !isClassicChess;
      const showMoveHintStyle = showMoveHints && Boolean(elMoveHints.checked);
      const showLastMoveStyle = supportsModernLastMoveStyle && Boolean(elLastMoveHighlights.checked);

      if (elChessMovePreviewModeRow) elChessMovePreviewModeRow.style.display = showChessMovePreview ? "" : "none";
      if (elChessMovePreviewModeHint) elChessMovePreviewModeHint.style.display = showChessMovePreview ? "" : "none";
      if (elSelectionStyleRow) elSelectionStyleRow.style.display = showSelectionStyle ? "" : "none";
      if (elSelectionStyleHint) elSelectionStyleHint.style.display = showSelectionStyle ? "" : "none";

      if (elMoveHintsRow) elMoveHintsRow.style.display = showMoveHints ? "" : "none";
      if (elMoveHintsHint) elMoveHintsHint.style.display = showMoveHints ? "" : "none";
      if (elMoveHintStyleRow) elMoveHintStyleRow.style.display = showMoveHintStyle ? "" : "none";
      if (elMoveHintStyleHint) elMoveHintStyleHint.style.display = showMoveHintStyle ? "" : "none";

      if (elLastMoveStyleRow) elLastMoveStyleRow.style.display = showLastMoveStyle ? "" : "none";
      if (elLastMoveStyleHint) elLastMoveStyleHint.style.display = showLastMoveStyle ? "" : "none";

      if (elAnalysisSquareStyleRow) elAnalysisSquareStyleRow.style.display = supportsAnalysisSquareStyle ? "" : "none";
      if (elAnalysisSquareStyleHint) elAnalysisSquareStyleHint.style.display = supportsAnalysisSquareStyle ? "" : "none";

      if (elLastMoveStyle) {
        const variantLastMoveKey = getLastMoveHighlightStyleKey(vId);
        elLastMoveStyle.value = normalizeLastMoveHighlightStyle(localStorage.getItem(variantLastMoveKey));
      }
      if (elAnalysisSquareStyle) {
        const variantAnalysisKey = isClassicChess
          ? LS_KEYS.optChessAnalysisSquareHighlightStyle
          : LS_KEYS.optColumnsAnalysisSquareHighlightStyle;
        if (supportsAnalysisSquareStyle) {
          elAnalysisSquareStyle.value = normalizeAnalysisSquareHighlightStyle(localStorage.getItem(variantAnalysisKey));
        }
      }
    }

    // Variant-specific bot dropdown options.
    {
      const setOptions = (el: HTMLSelectElement, sig: string, html: string) => {
        if (el.dataset.optionsSig === sig) return;
        el.innerHTML = html;
        el.dataset.optionsSig = sig;
      };

      const classicAiOptions =
        '<option value="human">Human</option>' +
        '<option value="easy">Beginner</option>' +
        '<option value="medium">Intermediate</option>' +
        '<option value="advanced">Strong</option>';

      const columnsBotOptions = '<option value="human">Human</option><option value="bot">Standard</option>';

      if (isColumnsChess) {
        setOptions(elAiWhite, "columns", columnsBotOptions);
        setOptions(elAiBlack, "columns", columnsBotOptions);

        elAiWhite.value = readColumnsBotSide(LS_KEYS.columnsBotWhite, "human");
        elAiBlack.value = readColumnsBotSide(LS_KEYS.columnsBotBlack, "human");
        syncPlayerBotSelector("launchAiWhite");
        syncPlayerBotSelector("launchAiBlack");

        const delayMs = readDelayMs(LS_KEYS.columnsBotDelayMs, 1000);
        elAiDelay.value = String(delayMs);
        syncDelayLabel();
      } else {
        // Restore classic AI options for non-Columns variants.
        setOptions(elAiWhite, "classic", classicAiOptions);
        setOptions(elAiBlack, "classic", classicAiOptions);

        // Sync stored difficulties.
        elAiWhite.value = readDifficulty(LS_KEYS.aiWhite, "human");
        elAiBlack.value = readDifficulty(LS_KEYS.aiBlack, "human");

        // Classic Chess bot settings are stored under chessbot.* keys; sync them into the Start Page UI.
        if (isClassicChess) {
          elAiWhite.value = chessBotSideToDifficulty(localStorage.getItem(CHESSBOT_LS_KEYS.white));
          elAiBlack.value = chessBotSideToDifficulty(localStorage.getItem(CHESSBOT_LS_KEYS.black));
        }
        syncPlayerBotSelector("launchAiWhite");
        syncPlayerBotSelector("launchAiBlack");

        const delayKey = isClassicChess ? CHESSBOT_LS_KEYS.delay : LS_KEYS.aiDelayMs;
        const delayMs = readDelayMs(delayKey, 1000);
        elAiDelay.value = String(delayMs);
        syncDelayLabel();
      }
    }

    if (elBotSection) elBotSection.style.display = "";

    elAiWhite.disabled = false;
    elAiBlack.disabled = false;
    syncPlayerBotSelector("launchAiWhite");
    syncPlayerBotSelector("launchAiBlack");
    syncOnlinePlayerSeatInputs();
    // Delay is a built-in AI throttle; Classic Chess bots use Stockfish movetime presets instead.
    // Columns Chess bot uses this delay setting.
    elAiDelay.disabled = false;
    elAiDelayReset.disabled = false;

    const serverUrl = resolveConfiguredServerUrl();

    if (elAccountSection) {
      elAccountSection.style.display = "";
    }

    let ok = baseOk;
    let warning: string | null = null;

    if (!baseOk) {
      warning = `${v.displayName} is not available yet in this build.`;
    } else if (playMode === "online") {
      const whiteHuman = elAiWhite.value === "human";
      const blackHuman = elAiBlack.value === "human";
      const localHumanSeat = resolveOnlineHumanSeat({
        whiteRole: whiteHuman ? "human" : "bot",
        blackRole: blackHuman ? "human" : "bot",
        whiteOwner: readOnlineSeatOwner("W"),
        blackOwner: readOnlineSeatOwner("B"),
        preferredColor: readPreferredColor(LS_KEYS.onlinePrefColor, "auto"),
      });

      if (!serverUrl) {
        ok = false;
        warning = "Online mode is not configured.";
      } else if (whiteHuman && blackHuman && !localHumanSeat) {
        ok = false;
        warning = "Choose your seat by selecting your player name for one Human player.";
      }
    }

    // Player ID field is not used from the Start Page anymore.
    elOnlinePlayerId.value = "";

    elLaunch.disabled = !ok;
    setWarning(warning ?? "—", { isError: false });
    setRoomIdError(false);

    // If we are in online mode and the server URL changed, auto-refresh lobby once.
    if (playMode === "online") {
      const serverUrlNow = resolveConfiguredServerUrl();
      if (serverUrlNow && serverUrlNow !== lobbyLastKey) {
        void fetchLobby();
      }
    }

  };

  // When navigating back to the Start Page from a game tab, browsers may restore
  // this page from the back/forward cache without re-running DOMContentLoaded.
  // Re-hydrate online fields from localStorage so newly-created Room IDs appear.
  window.addEventListener("pageshow", () => {
    try {
      elPlayMode.value = readPlayMode(LS_KEYS.playMode, (elPlayMode.value === "online" ? "online" : "local") as PlayMode);
      localStorage.setItem(LS_KEYS.onlineAction, "create");
      elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, (elOnlineVisibility.value as any) ?? "public");
      elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
    } catch {
      // ignore
    }
    syncOnlineIdentityFromBotSection();
    syncOnlineVisibility();
    syncAvailability();
    onConfiguredServerUrlMaybeChanged();
  });

  // Admin-configured server URL updates (from admin page or other tabs).
  window.addEventListener("storage", (ev) => {
    if (ev.key === LS_KEYS.onlineServerUrl) onConfiguredServerUrlMaybeChanged();
  });

  // Best-effort instant same-origin detection (e.g. admin page updates server URL).
  // Storage events don't fire in the same document, so use a BroadcastChannel when available.
  // Keep a light polling fallback for older browsers.
  const bc: BroadcastChannel | null = (() => {
    try {
      return typeof BroadcastChannel === "function" ? new BroadcastChannel("lasca-admin-config") : null;
    } catch {
      return null;
    }
  })();

  if (bc) {
    bc.addEventListener("message", (ev) => {
      const msg: any = (ev as any)?.data;
      if (msg && msg.type === "serverUrlChanged") onConfiguredServerUrlMaybeChanged();
    });
  } else {
    window.setInterval(() => onConfiguredServerUrlMaybeChanged(), 1500);
  }

  elGame.addEventListener("change", () => {
    syncAvailability();
    prefetchGamePage(elGame);
  });

  // Persist disc-game piece theme immediately so terminology can update live on the Start Page.
  elTheme.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const isColumnsChess = vId === "columns_chess";
    const isClassicChess = vId === "chess_classic";
    const isCheckers = getVariantById(vId).rulesetId === "checkers_us";
    if (isCheckers) {
      try {
        localStorage.setItem(LS_KEYS.checkersTheme, elTheme.value || "checkers");
      } catch {
        // ignore
      }
    } else if (!isColumnsChess && !isClassicChess) {
      try {
        localStorage.setItem(LS_KEYS.theme, elTheme.value);
      } catch {
        // ignore
      }
    }
    syncAvailability();
  });
  elPlayMode.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.playMode, elPlayMode.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineVisibility.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineVisibility, elOnlineVisibility.value);
    syncAvailability();
  });

  if (elShowResizeIcon) {
    elShowResizeIcon.addEventListener("change", () => {
      writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
    });
  }

  elBoardViewport.addEventListener("change", () => {
    writeBoardViewportMode(elBoardViewport.value === "playable" ? "playable" : "framed");
    syncAvailability();
  });

  // This setting controls whether the “Inside squares” sub-option is enabled.
  // (We persist the actual prefs when launching.)
  elBoardCoords.addEventListener("change", () => {
    syncAvailability();
  });

  elFlipBoard.addEventListener("change", () => {
    writeBool(LS_KEYS.optFlipBoard, elFlipBoard.checked);
  });

  elLastMoveHighlights.addEventListener("change", () => {
    writeBool(LS_KEYS.optLastMoveHighlights, elLastMoveHighlights.checked);
    syncAvailability();
  });

  elMoveHints.addEventListener("change", () => {
    writeBool(LS_KEYS.optMoveHints, elMoveHints.checked);
    syncAvailability();
  });

  elLastMoveStyle?.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const key = getLastMoveHighlightStyleKey(vId);
    localStorage.setItem(key, normalizeLastMoveHighlightStyle(elLastMoveStyle.value));
  });

  elChessMovePreviewMode?.addEventListener("change", () => {
    const nextMode = normalizeChessMovePreviewMode(elChessMovePreviewMode.value);
    const moveHintsEnabled = nextMode !== "off";
    const moveHintStyle = nextMode === "chesscom" ? "chesscom" : "classic";
    const highlightSquaresEnabled = nextMode === "stackworks-squares" || nextMode === "chesscom";
    localStorage.setItem(LS_KEYS.optChessMovePreviewMode, nextMode);
    writeBool(LS_KEYS.optMoveHints, moveHintsEnabled);
    localStorage.setItem(LS_KEYS.optMoveHintStyle, moveHintStyle);
    writeBool(LS_KEYS.optChessHighlightSquares, highlightSquaresEnabled);
    syncAvailability();
  });

  elSelectionStyle?.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.optChessSelectionStyle, normalizeSelectionStyle(elSelectionStyle.value));
  });

  elMoveHintStyle?.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.optMoveHintStyle, normalizeMoveHintStyle(elMoveHintStyle.value));
  });

  elAnalysisSquareStyle?.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const key = vId === "chess_classic"
      ? LS_KEYS.optChessAnalysisSquareHighlightStyle
      : LS_KEYS.optColumnsAnalysisSquareHighlightStyle;
    localStorage.setItem(key, normalizeAnalysisSquareHighlightStyle(elAnalysisSquareStyle.value));
  });

  elColumnsChessBoardTheme?.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const isCheckers = getVariantById(vId).rulesetId === "checkers_us";
    const next = normalizeCheckerboardThemeId(elColumnsChessBoardTheme.value);
    localStorage.setItem(LS_KEYS.optCheckerboardTheme, next);
    if (isCheckers) localStorage.setItem(LS_KEYS.checkersCheckerboardTheme, next);
    elColumnsChessBoardTheme.value = next;
    syncAvailability();
  });

  elBoard8x8Checkered.addEventListener("change", () => {
    writeBool(LS_KEYS.optBoard8x8Checkered, elBoard8x8Checkered.checked);
    syncAvailability();
  });

  elToasts.addEventListener("change", () => {
    writeBool(LS_KEYS.optToasts, elToasts.checked);
  });

  elSfx.addEventListener("change", () => {
    writeBool(LS_KEYS.optSfx, elSfx.checked);
    sfx.setEnabled(elSfx.checked);
    sfx.play(elSfx.checked ? "uiOn" : "uiOff");
  });

  elOnlineRoomId.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineRoomId, elOnlineRoomId.value);
    setRoomIdError(false);
    syncAvailability();
  });

  elAiWhite.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    if (vId === "columns_chess") {
      writeColumnsBotSide(LS_KEYS.columnsBotWhite, (elAiWhite.value === "bot" ? "bot" : "human") as ColumnsBotSide);
    } else {
      localStorage.setItem(LS_KEYS.aiWhite, elAiWhite.value);
    }
    if (vId === "chess_classic") {
      localStorage.setItem(CHESSBOT_LS_KEYS.white, difficultyToChessBotSide(elAiWhite.value));
      localStorage.setItem(CHESSBOT_LS_KEYS.paused, "false");
    }

    syncOnlinePlayerSeatInputs();
    syncOnlineIdentityFromBotSection();
    syncOnlineVisibility();
    syncAvailability();
  });

  elAiBlack.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    if (vId === "columns_chess") {
      writeColumnsBotSide(LS_KEYS.columnsBotBlack, (elAiBlack.value === "bot" ? "bot" : "human") as ColumnsBotSide);
    } else {
      localStorage.setItem(LS_KEYS.aiBlack, elAiBlack.value);
    }
    if (vId === "chess_classic") {
      localStorage.setItem(CHESSBOT_LS_KEYS.black, difficultyToChessBotSide(elAiBlack.value));
      localStorage.setItem(CHESSBOT_LS_KEYS.paused, "false");
    }

    syncOnlinePlayerSeatInputs();
    syncOnlineIdentityFromBotSection();
    syncOnlineVisibility();
    syncAvailability();
  });

  function syncOnlineVisibility(): void {
    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;

    const showOnline = playMode === "online";
    // When local/offline, hide the online controls entirely to avoid confusion.
    if (elOnlineOptions) elOnlineOptions.style.display = showOnline ? "" : "none";

    if (elOnlineHint) elOnlineHint.style.display = showOnline ? "" : "none";

    const showPlayerId = false;
    elOnlinePlayerIdLabel.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.disabled = !showPlayerId;

    const showRoomId = false;
    elOnlineRoomIdLabel.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.disabled = !showRoomId;

    const showVisibility = showOnline;
    elOnlineVisibilityLabel.style.display = showVisibility ? "" : "none";
    elOnlineVisibility.style.display = showVisibility ? "" : "none";
    elOnlineVisibility.disabled = !showVisibility;

    if (elLobbySection) {
      elLobbySection.style.display = showOnline ? "" : "none";
      if (!showOnline) {
        setLobbyStatus("—");
        renderLobby([]);
      }
    }
  }

  syncOnlineVisibility();
  syncAvailability();

  elLobbyRefresh?.addEventListener("click", () => {
    void fetchLobby();
  });

  elLobbyMineOnly && (elLobbyMineOnly.checked = readBool(LS_KEYS.lobbyMineOnly, false));
  elLobbyMineOnly?.addEventListener("change", () => {
    writeBool(LS_KEYS.lobbyMineOnly, elLobbyMineOnly.checked);
    const { shown, total } = renderLobby(lobbyLastRooms, lobbyLastServerUrl);
    if (lobbyLastServerUrl) setLobbyStatus(`Lobby: ${shown}/${total} room${total === 1 ? "" : "s"}.`);
  });

  elLaunch.addEventListener("click", async () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);
    if (!v.available || !v.entryUrl) return;

    persistStartPageLaunchPrefs();

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    if (playMode !== "online") {
      window.location.assign(v.entryUrl);
      return;
    }

    const serverUrl = resolveConfiguredServerUrl();
    const { guestName, prefColor } = readOnlineLaunchIdentity();
    setGuestDisplayName(guestName);
    const visibility = (elOnlineVisibility.value === "private" ? "private" : "public") as RoomVisibility;

    await launchOnline({
      action: "create",
      serverUrl,
      prefColor,
      visibility,
      fallbackVariantId: v.variantId,
    });
  });

  // Dismiss the splash screen now that startup is complete. If startup took
  // longer than START_SPLASH_MS (e.g. slow initial load over CDN), the page
  // is revealed immediately. If startup was fast, we wait only the remaining
  // portion of the branding delay.
  finalizeSplash?.();
});
