import { DEFAULT_THEME_ID, getThemeById, THEMES } from "./theme/themes";
import { DEFAULT_VARIANT_ID, VARIANTS, getVariantById, isVariantId } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import type { GetLobbyResponse, GetRoomMetaResponse, LobbyRoomSummary, RoomVisibility } from "./shared/onlineProtocol.ts";
import { getGuestDisplayName, setGuestDisplayName } from "./shared/guestIdentity.ts";
import { createSfxManager } from "./ui/sfx";
import type { AuthMeResponse, AuthOkResponse, AuthErrorResponse } from "./shared/authProtocol.ts";
import { normalizeCheckerboardThemeId } from "./render/checkerboardTheme";
import { getSideLabelsForRuleset } from "./shared/sideTerminology";

const LS_KEYS = {
  theme: "lasca.theme",
  chessTheme: "lasca.chess.theme",
  columnsChessTheme: "lasca.columnsChess.theme",
  checkersTheme: "lasca.checkers.theme",
  checkersCheckerboardTheme: "lasca.checkers.checkerboardTheme",
  glassBg: "lasca.theme.glassBg",
  glassPalette: "lasca.theme.glassPalette",
  startSplashSeen: "lasca.start.splashSeen",
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
  optAnimations: "lasca.opt.animations",
  optShowResizeIcon: "lasca.opt.showResizeIcon",
  optBoardCoords: "lasca.opt.boardCoords",
  optBoard8x8Checkered: "lasca.opt.board8x8Checkered",
  optCheckerboardTheme: "lasca.opt.checkerboardTheme",
  optLastMoveHighlights: "lasca.opt.lastMoveHighlights",
  optThreefold: "lasca.opt.threefold",
  optToasts: "lasca.opt.toasts",
  optSfx: "lasca.opt.sfx",

  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
  onlinePrefColor: "lasca.online.prefColor",
  onlineVisibility: "lasca.online.visibility",

  lobbyMineOnly: "lasca.lobby.mineOnly",
} as const;

const START_SPLASH_MS = 3500;

function initStartSplash(): void {
  const root = document.documentElement;
  if (!root.classList.contains("showStartSplash")) return;

  try {
    localStorage.setItem(LS_KEYS.startSplashSeen, "1");
  } catch {
    // ignore
  }

  window.setTimeout(() => {
    root.classList.remove("showStartSplash");
  }, START_SPLASH_MS);
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
  return clamp(Math.round(n), 0, 3000);
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
  return clamp(Math.round(n), 0, 3000);
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

window.addEventListener("DOMContentLoaded", () => {
  initStartSplash();

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
  const elOnlineServerUrl = byId<HTMLInputElement>("launchOnlineServerUrl");
  const elOnlineServerUrlLabel =
    (document.querySelector('label[for="launchOnlineServerUrl"]') as HTMLElement | null) ?? null;
  const elOnlineActionLabel =
    (document.querySelector('label[for="launchOnlineAction"]') as HTMLElement | null) ?? null;
  const elOnlineAction = byId<HTMLSelectElement>("launchOnlineAction");
  const elOnlineNameLabel = byId<HTMLElement>("launchOnlineNameLabel");
  const elOnlineName = byId<HTMLInputElement>("launchOnlineName");
  const elOnlineVisibilityLabel = byId<HTMLElement>("launchOnlineVisibilityLabel");
  const elOnlineVisibility = byId<HTMLSelectElement>("launchOnlineVisibility");
  const elOnlineHint = (document.getElementById("launchOnlineHint") as HTMLElement | null) ?? null;
  const elOnlinePrefColorLabel = byId<HTMLElement>("launchOnlinePrefColorLabel");
  const elOnlinePrefColor = byId<HTMLSelectElement>("launchOnlinePrefColor");
  const elOnlinePlayerIdLabel = byId<HTMLElement>("launchOnlinePlayerIdLabel");
  const elOnlinePlayerId = byId<HTMLInputElement>("launchOnlinePlayerId");
  const elOnlineRoomIdLabel = byId<HTMLElement>("launchOnlineRoomIdLabel");
  const elOnlineRoomId = byId<HTMLInputElement>("launchOnlineRoomId");

  const elLobbySection = (document.getElementById("launchLobbySection") as HTMLElement | null) ?? null;
  const elLobbyStatus = (document.getElementById("launchLobbyStatus") as HTMLElement | null) ?? null;
  const elLobbyRefresh = (document.getElementById("launchLobbyRefresh") as HTMLButtonElement | null) ?? null;
  const elLobbyList = (document.getElementById("launchLobbyList") as HTMLElement | null) ?? null;
  const elLobbyMineOnly = (document.getElementById("launchLobbyMineOnly") as HTMLInputElement | null) ?? null;

  const elAccountSection = (document.getElementById("launchAccountSection") as HTMLElement | null) ?? null;
  const elAccountStatus = (document.getElementById("launchAccountStatus") as HTMLElement | null) ?? null;
  const elAccountEmail = (document.getElementById("accountEmail") as HTMLInputElement | null) ?? null;
  const elAccountPassword = (document.getElementById("accountPassword") as HTMLInputElement | null) ?? null;
  const elAccountPasswordToggle = (document.getElementById("accountPasswordToggle") as HTMLButtonElement | null) ?? null;
  const elAccountLoginForm = (document.getElementById("accountLoginForm") as HTMLFormElement | null) ?? null;
  const elAccountDisplayName = (document.getElementById("accountDisplayName") as HTMLInputElement | null) ?? null;
  const elAccountAvatarUrl = (document.getElementById("accountAvatarUrl") as HTMLInputElement | null) ?? null;
  const elAccountAvatarFile = (document.getElementById("accountAvatarFile") as HTMLInputElement | null) ?? null;
  const elAccountRefresh = (document.getElementById("accountRefresh") as HTMLButtonElement | null) ?? null;
  const elAccountRegister = (document.getElementById("accountRegister") as HTMLButtonElement | null) ?? null;
  const elAccountLogin = (document.getElementById("accountLogin") as HTMLButtonElement | null) ?? null;
  const elAccountUpdateProfile = (document.getElementById("accountUpdateProfile") as HTMLButtonElement | null) ?? null;
  const elAccountUploadAvatar = (document.getElementById("accountUploadAvatar") as HTMLButtonElement | null) ?? null;
  const elAccountLogout = (document.getElementById("accountLogout") as HTMLButtonElement | null) ?? null;

  const elShowResizeIcon = byId<HTMLInputElement>("launchShowResizeIcon");
  const elBoardCoords = byId<HTMLInputElement>("launchBoardCoords");
  const elLastMoveHighlights = byId<HTMLInputElement>("launchLastMoveHighlights");
  const elMoveHints = byId<HTMLInputElement>("launchMoveHints");
  const elBoard8x8Checkered = byId<HTMLInputElement>("launchBoard8x8Checkered");
  const elBoard8x8CheckeredRow = (elBoard8x8Checkered.closest(".checkRow") as HTMLElement | null) ?? null;
  const elBoard8x8CheckeredHint = (elBoard8x8CheckeredRow?.nextElementSibling as HTMLElement | null) ?? null;
  const elToasts = byId<HTMLInputElement>("launchToasts");
  const elSfx = byId<HTMLInputElement>("launchSfx");

  const elAiWhite = byId<HTMLSelectElement>("launchAiWhite");
  const elAiBlack = byId<HTMLSelectElement>("launchAiBlack");
  const elAiWhiteLabel = (document.querySelector('label[for="launchAiWhite"]') as HTMLElement | null) ?? null;
  const elAiBlackLabel = (document.querySelector('label[for="launchAiBlack"]') as HTMLElement | null) ?? null;
  const elAiDelay = byId<HTMLInputElement>("launchAiDelay");
  const elAiDelayReset = byId<HTMLButtonElement>("launchAiDelayReset");
  const elAiDelayLabel = byId<HTMLElement>("launchAiDelayLabel");

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

  const setAccountStatus = (text: string, opts?: { isError?: boolean }): void => {
    if (!elAccountStatus) return;
    elAccountStatus.textContent = (text || "").trim() || "—";
    elAccountStatus.classList.toggle("isError", Boolean(opts?.isError));
  };

  const resolveServerUrlForAccount = (): string | null => {
    const s = normalizeServerUrl(elOnlineServerUrl.value || "");
    if (!s) return null;
    try {
      // eslint-disable-next-line no-new
      new URL(s);
      return s;
    } catch {
      return null;
    }
  };

  const fetchAuthJson = async <TRes>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: TRes | AuthErrorResponse }> => {
      const serverUrl = resolveServerUrlForAccount();
      if (!serverUrl) return { ok: false, status: 0, json: { error: "Invalid Server URL" } };

      const res = await fetch(`${serverUrl}${path}`,
        {
          credentials: "include",
          ...(init ?? {}),
          headers: {
            ...(init?.headers ?? {}),
          },
        }
      );

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
      return;
    }

    setAccountStatus("Account: checking session…");
    const r = await fetchAuthJson<AuthMeResponse>("/api/auth/me");
    if (!r.ok) {
      setAccountStatus(`Account: ${String((r.json as any)?.error ?? "Request failed")}`, { isError: true });
      return;
    }

    const me = r.json as any;
    if (!me || me.ok !== true) {
      setAccountStatus("Account: unexpected response", { isError: true });
      return;
    }

    const user = me.user;
    if (!user) {
      setAccountStatus("Account: signed out");
      return;
    }

    const name = typeof user.displayName === "string" ? user.displayName : "(no name)";
    const email = typeof user.email === "string" ? user.email : "";
    setAccountStatus(`Account: signed in as ${name}${email ? ` (${email})` : ""}`);

    // Convenience: if the Online Name input is blank or still the default placeholder value,
    // prefill it from the account display name so MP4C can be exercised end-to-end in UI.
    const currentOnlineName = (elOnlineName.value || "").trim();
    if (!currentOnlineName || currentOnlineName.toLowerCase() === "guest") {
      elOnlineName.value = name;
    }
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

        setAccountStatus("Account: registering…");
        const r = await fetchAuthJson<AuthOkResponse>("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, ...(displayName ? { displayName } : {}) }),
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
        setAccountStatus(`Account: registered as ${ok.user.displayName} (${ok.user.email})`);

        // Best-effort: on first registration, offer to save immediately.
        void tryOfferToSavePassword(email, password);

        await refreshAccountUi();
      });
    });

    elAccountLogin?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        await doAccountLogin();
      });
    });

    elAccountUpdateProfile?.addEventListener("click", () => {
      void withAccountBusy(async () => {
        const displayName = (elAccountDisplayName?.value || "").trim();
        const avatarUrl = (elAccountAvatarUrl?.value || "").trim();

        if (!displayName && !avatarUrl) {
          setAccountStatus("Account: nothing to update (set Display and/or Avatar)", { isError: true });
          return;
        }

        setAccountStatus("Account: updating profile…");
        const r = await fetchAuthJson<AuthOkResponse>("/api/auth/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(displayName ? { displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
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
      // Store a Checkers-specific preference so an existing global theme from other games
      // does not prevent Checkers from defaulting to the classic Checkers look.
      const next = elTheme.value || "checkers";
      localStorage.setItem(LS_KEYS.checkersTheme, next);
      localStorage.setItem(LS_KEYS.theme, next);
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
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
    writeBool(LS_KEYS.optBoardCoords, elBoardCoords.checked);
    writeBool(LS_KEYS.optLastMoveHighlights, elLastMoveHighlights.checked);
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
      // Startup should not force paused; let AIManager decide (it auto-pauses when both sides are AI).
      localStorage.setItem(LS_KEYS.aiPaused, "false");
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

      const sub = document.createElement("div");
      sub.className = "lobbyItemSub";
      const open = r.seatsOpen.length ? `Open: ${r.seatsOpen.join("/")}` : "Open: —";
      const taken = r.seatsTaken.length ? `Taken: ${r.seatsTaken.join("/")}` : "Taken: —";

      const status = r.status === "in_game" ? "Status: In game" : r.status === "waiting" ? "Status: Waiting" : "";
      const createdAtMs = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
      const age = Number.isFinite(createdAtMs) ? `Age: ${formatAgeShort(Date.now() - createdAtMs)}` : "";

      const hostDisplayName = typeof (r as any)?.hostDisplayName === "string" ? String((r as any).hostDisplayName).trim() : "";
      const host = hostDisplayName ? `Host: ${hostDisplayName}` : "";

      const byColor = r.displayNameByColor as Partial<Record<"W" | "B", string>> | undefined;
      const lightName = typeof byColor?.W === "string" ? byColor.W.trim() : "";
      const darkName = typeof byColor?.B === "string" ? byColor.B.trim() : "";
      const players = lightName || darkName ? `Players: ${lightName ? `${wLabel}=${lightName}` : `${wLabel}=—`} · ${darkName ? `${bLabel}=${darkName}` : `${bLabel}=—`}` : "";

      sub.textContent = [status, age, host, open, taken, players, r.visibility === "public" ? "Public" : "Private"]
        .filter(Boolean)
        .join(" · ");

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "panelBtn";
      const resume = serverUrl ? readOnlineResumeRecord(serverUrl, r.roomId) : null;
      const canRejoin = Boolean(resume);
      joinBtn.textContent = canRejoin ? "Rejoin" : "Join";
      // Rejoin should be available even if the room is full.
      joinBtn.disabled = canRejoin ? false : r.seatsOpen.length === 0;
      joinBtn.addEventListener("click", () => {
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        if (serverUrl) {
          elOnlineServerUrl.value = serverUrl;
          localStorage.setItem(LS_KEYS.onlineServerUrl, serverUrl);
        }

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

        if (serverUrl) {
          elOnlineServerUrl.value = serverUrl;
          localStorage.setItem(LS_KEYS.onlineServerUrl, serverUrl);
        }

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

  const fetchLobby = async (): Promise<void> => {
    if (!elLobbySection || !elLobbySection.offsetParent) return; // hidden
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    if (!serverUrl) {
      setLobbyStatus("Lobby: enter a server URL.");
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

  const setServerError = (isError: boolean): void => {
    elOnlineServerUrl.classList.toggle("isError", isError);
    elOnlineServerUrlLabel?.classList.toggle("isError", isError);
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
      elColumnsChessBoardTheme.value = normalizeCheckerboardThemeId(localStorage.getItem(LS_KEYS.optCheckerboardTheme));
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
      const savedThemeNow = localStorage.getItem(LS_KEYS.theme);
      const restore = (savedThemeNow && getThemeById(savedThemeNow) && !getThemeById(savedThemeNow)?.hidden)
        ? savedThemeNow
        : (savedThemeBeforeColumnsChess || savedThemeBeforeChess);
      if (restore && getThemeById(restore) && !getThemeById(restore)?.hidden) elTheme.value = restore;
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

  const initialVariantId = readVariantId(LS_KEYS.variantId, DEFAULT_VARIANT_ID);
  elGame.value = initialVariantId;

  elPlayMode.value = readPlayMode(LS_KEYS.playMode, "local");
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
  elOnlineServerUrl.value = localStorage.getItem(LS_KEYS.onlineServerUrl) ?? defaultServerUrl;
  elOnlineAction.value = "create";
  localStorage.setItem(LS_KEYS.onlineAction, "create");
  elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, "public");
  elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
  elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
  elOnlineName.value = getGuestDisplayName() ?? "";

  elShowResizeIcon.checked = readBool(LS_KEYS.optShowResizeIcon, false);
  elBoardCoords.checked = readBool(LS_KEYS.optBoardCoords, false);
  elLastMoveHighlights.checked = readBool(LS_KEYS.optLastMoveHighlights, true);
  elMoveHints.checked = readBool(LS_KEYS.optMoveHints, true);
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

  const delay = readDelayMs(initialVariant === "columns_chess" ? LS_KEYS.columnsBotDelayMs : LS_KEYS.aiDelayMs, 500);
  elAiDelay.value = String(delay);
  elAiDelayLabel.textContent = `${delay} ms`;

  const syncDelayLabel = () => {
    const v = parseDelayMs(elAiDelay.value || "500", 500);
    elAiDelayLabel.textContent = `${v} ms`;
  };

  elAiDelay.addEventListener("input", syncDelayLabel);
  elAiDelayReset.addEventListener("click", () => {
    elAiDelay.value = "500";
    syncDelayLabel();
  });

  const syncAvailability = () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);

    // Defaults: when Checkers is selected, use Checkers-specific prefs (fallback to classic).
    // This avoids a previously-saved global theme (from other games) leaking into Checkers.
    if (v.rulesetId === "checkers_us") {
      try {
        const pieces = localStorage.getItem(LS_KEYS.checkersTheme) || "checkers";
        const board = localStorage.getItem(LS_KEYS.checkersCheckerboardTheme) || "checkers";

        if (!localStorage.getItem(LS_KEYS.checkersTheme)) localStorage.setItem(LS_KEYS.checkersTheme, pieces);
        if (!localStorage.getItem(LS_KEYS.checkersCheckerboardTheme)) {
          localStorage.setItem(LS_KEYS.checkersCheckerboardTheme, board);
        }

        localStorage.setItem(LS_KEYS.theme, pieces);
        localStorage.setItem(LS_KEYS.optCheckerboardTheme, normalizeCheckerboardThemeId(board));
      } catch {
        // ignore
      }
    }

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

      // Keep online preferred color dropdown consistent with variant terminology.
      for (const opt of Array.from(elOnlinePrefColor.options)) {
        if (opt.value === "W") opt.textContent = wLabel;
        if (opt.value === "B") opt.textContent = bLabel;
      }
    }

    syncThemeConstraintsForVariant(vId);

    // If we just applied Checkers defaults above, reflect them in the Start UI too.
    if (v.rulesetId === "checkers_us") {
      const savedTheme = localStorage.getItem(LS_KEYS.theme);
      if (savedTheme) elTheme.value = savedTheme;

      if (elColumnsChessBoardTheme) {
        const savedBoard = localStorage.getItem(LS_KEYS.optCheckerboardTheme);
        if (savedBoard) elColumnsChessBoardTheme.value = normalizeCheckerboardThemeId(savedBoard);
      }
    }

    elGameNote.textContent = v.subtitle;
    localStorage.setItem(LS_KEYS.variantId, v.variantId);

    const baseOk = Boolean(v.available && v.entryUrl);

    const isColumnsChess = vId === "columns_chess";
    const isClassicChess = vId === "chess_classic";
    const isCheckers = v.rulesetId === "checkers_us";
    const usesColumnsChessBoard = isColumnsChess || isClassicChess;

    // "Use checkered board for 8×8 games" does not apply to:
    // - Columns Chess / Classic Chess (they have their own board SVG)
    // - US Checkers (it is always played on a checkerboard)
    {
      const show = !usesColumnsChessBoard && !isCheckers && v.boardSize === 8;
      if (elBoard8x8CheckeredRow) elBoard8x8CheckeredRow.style.display = show ? "" : "none";
      if (elBoard8x8CheckeredHint) elBoard8x8CheckeredHint.style.display = show ? "" : "none";
      elBoard8x8Checkered.disabled = !show;
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

      const columnsBotOptions = '<option value="human">Human</option><option value="bot">Bot</option>';

      if (isColumnsChess) {
        setOptions(elAiWhite, "columns", columnsBotOptions);
        setOptions(elAiBlack, "columns", columnsBotOptions);

        elAiWhite.value = readColumnsBotSide(LS_KEYS.columnsBotWhite, "human");
        elAiBlack.value = readColumnsBotSide(LS_KEYS.columnsBotBlack, "human");

        const delayMs = readDelayMs(LS_KEYS.columnsBotDelayMs, 500);
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

        const delayMs = readDelayMs(LS_KEYS.aiDelayMs, 500);
        elAiDelay.value = String(delayMs);
        syncDelayLabel();
      }
    }

    const isAiGame = elAiWhite.value !== "human" || elAiBlack.value !== "human";

    // Allow bot selection for Columns Chess and Classic Chess.
    elAiWhite.disabled = false;
    elAiBlack.disabled = false;
    // Delay is a built-in AI throttle; Classic Chess bots use Stockfish movetime presets instead.
    // Columns Chess bot uses this delay setting.
    elAiDelay.disabled = isClassicChess;

    // Online (2 players) requires both sides Human.
    const onlineOpt = Array.from(elPlayMode.options).find((o) => o.value === "online") ?? null;
    if (onlineOpt) onlineOpt.disabled = isAiGame;
    if (isAiGame && elPlayMode.value === "online") {
      elPlayMode.value = "local";
    }
    elPlayMode.disabled = isAiGame;

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);

    if (elAccountSection) {
      // Account is only meaningful for online play (MP4C auth testing).
      elAccountSection.style.display = playMode === "online" ? "" : "none";
    }

    let ok = baseOk;
    let warning: string | null = null;

    if (!baseOk) {
      warning = `${v.displayName} is not available yet in this build.`;
    } else if (playMode === "online") {
      if (!serverUrl) {
        ok = false;
        warning = "Online mode needs a server URL.";
      }
    }

    // Player ID field is not used from the Start Page anymore.
    elOnlinePlayerId.value = "";

    elLaunch.disabled = !ok;
    setWarning(warning ?? "—", { isError: false });
    setRoomIdError(false);
    setServerError(false);

    // If we are in online mode and the server URL changed, auto-refresh lobby once.
    if (playMode === "online") {
      const serverUrlNow = normalizeServerUrl(elOnlineServerUrl.value);
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
      elOnlineServerUrl.value = localStorage.getItem(LS_KEYS.onlineServerUrl) ?? elOnlineServerUrl.value;
      elOnlineAction.value = "create";
      localStorage.setItem(LS_KEYS.onlineAction, "create");
      elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, (elOnlineVisibility.value as any) ?? "public");
      elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
      elOnlineName.value = getGuestDisplayName() ?? "";
    } catch {
      // ignore
    }
    syncOnlineVisibility();
    syncAvailability();
  });

  elGame.addEventListener("change", syncAvailability);

  // Persist disc-game piece theme immediately so terminology can update live on the Start Page.
  elTheme.addEventListener("change", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const isColumnsChess = vId === "columns_chess";
    const isClassicChess = vId === "chess_classic";
    if (!isColumnsChess && !isClassicChess) {
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

  elOnlineServerUrl.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineServerUrl, elOnlineServerUrl.value);
    setServerError(false);
    syncAvailability();
  });

  elOnlineAction.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineAction, elOnlineAction.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineName.addEventListener("input", () => {
    setGuestDisplayName(elOnlineName.value);
  });

  elOnlineVisibility.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineVisibility, elOnlineVisibility.value);
    syncAvailability();
  });

  elOnlinePrefColor.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlinePrefColor, elOnlinePrefColor.value);
    syncAvailability();
  });

  elShowResizeIcon.addEventListener("change", () => {
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
  });

  elLastMoveHighlights.addEventListener("change", () => {
    writeBool(LS_KEYS.optLastMoveHighlights, elLastMoveHighlights.checked);
  });

  elMoveHints.addEventListener("change", () => {
    writeBool(LS_KEYS.optMoveHints, elMoveHints.checked);
  });

  elColumnsChessBoardTheme?.addEventListener("change", () => {
    const next = normalizeCheckerboardThemeId(elColumnsChessBoardTheme.value);
    localStorage.setItem(LS_KEYS.optCheckerboardTheme, next);
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

    syncOnlineVisibility();
    syncAvailability();
  });

  function syncOnlineVisibility(): void {
    const isAiGame = elAiWhite.value !== "human" || elAiBlack.value !== "human";

    // Online (2 players) requires both sides Human.
    const onlineOpt = Array.from(elPlayMode.options).find((o) => o.value === "online") ?? null;
    if (onlineOpt) onlineOpt.disabled = isAiGame;
    if (isAiGame && elPlayMode.value === "online") {
      elPlayMode.value = "local";
    }
    elPlayMode.disabled = isAiGame;

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const onlineAction: OnlineAction = "create";

    const showOnline = playMode === "online";
    // When local/offline, hide the online controls entirely to avoid confusion.
    elOnlineServerUrlLabel && (elOnlineServerUrlLabel.style.display = showOnline ? "" : "none");
    elOnlineServerUrl.style.display = showOnline ? "" : "none";
    elOnlineServerUrl.disabled = !showOnline;

    elOnlineActionLabel && (elOnlineActionLabel.style.display = showOnline ? "" : "none");
    elOnlineAction.style.display = showOnline ? "" : "none";
    elOnlineAction.disabled = !showOnline;

    elOnlineNameLabel.style.display = showOnline ? "" : "none";
    elOnlineName.style.display = showOnline ? "" : "none";
    if (!showOnline) {
      elOnlineName.disabled = true;
    } else {
      elOnlineName.disabled = false;
      // Ensure the field reflects the currently saved guest name.
      elOnlineName.value = getGuestDisplayName() ?? "";
    }

    if (elOnlineHint) elOnlineHint.style.display = showOnline ? "" : "none";

    // Online color preference is only meaningful for Create.
    const showPrefColor = showOnline;
    const allowNonAuto = showOnline && onlineAction === "create";

    elOnlinePrefColorLabel.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.disabled = !allowNonAuto;

    // Only allow Light/Dark options for Create.
    for (const opt of Array.from(elOnlinePrefColor.options)) {
      const v = opt.value;
      if (v === "W" || v === "B") opt.disabled = !allowNonAuto;
    }

    if (!allowNonAuto) {
      // Don't persist this to localStorage; it's action-dependent.
      elOnlinePrefColor.value = "auto";
    } else {
      // Restore user's saved preference when returning to Create.
      elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
    }

    const showPlayerId = false;
    elOnlinePlayerIdLabel.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.disabled = !showPlayerId;

    const showRoomId = false;
    elOnlineRoomIdLabel.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.disabled = !showRoomId;

    const showVisibility = showOnline && onlineAction === "create";
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

    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    const prefColor = (elOnlinePrefColor.value === "W" || elOnlinePrefColor.value === "B") ? elOnlinePrefColor.value : "auto";
    const visibility = (elOnlineVisibility.value === "private" ? "private" : "public") as RoomVisibility;

    await launchOnline({
      action: "create",
      serverUrl,
      prefColor,
      visibility,
      fallbackVariantId: v.variantId,
    });
  });
});
