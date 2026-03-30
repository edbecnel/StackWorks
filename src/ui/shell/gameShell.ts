import { renderLogo } from "../branding/logo";
import { createTabs } from "../navigation/tabs";
import { allowConfirmedNavigation } from "../navigationPromptGate";
import {
  OFFLINE_BOT_START_RELOAD_CONFIRM_MESSAGE,
  shouldWarnOfflineNavigationLoss,
} from "../offlineNavGuard";
import { createPlayHub, type PlayHubAction } from "./playHub";
import { isBoardFlipped } from "../../render/boardFlip";
import { createPlayerIdentityPanel } from "../player/playerIdentityPanel";
import { GameSection, GlobalSection, normalizeGameSection, readShellState, updateShellState } from "../../config/shellState";
import type { GameController } from "../../controller/gameController";
import type { Player, PlayerIdentity, PlayerShellSnapshot } from "../../types";
import type { VariantId } from "../../variants/variantTypes";
import { buildSessionAuthFetchInit } from "../../shared/authSessionClient";
import { hasAnyLocalBotSide, isLocalBotSide, resolveActiveLocalSeatDisplayNames } from "../../shared/localPlayerNames";
import { readOpenVariantPageOnlinePreview } from "../../shared/openVariantPageIntent";
import { replaceHistoryWithExplicitLocalMode, urlHasExplicitPlayMode } from "./explicitLocalModeNavigation";
import { readPanelLayoutMode } from "../panelLayoutMode";

export interface GameShellNavItem {
  id: string;
  label: string;
  targetSelector?: string;
  onSelect?: () => void;
}

export interface GameShellOptions {
  appRoot: HTMLElement;
  variantId: VariantId;
  breadcrumb: string;
  title: string;
  subtitle: string;
  meta?: readonly string[];
  backHref?: string;
  helpHref?: string;
  navItems?: readonly GameShellNavItem[];
  activeSectionId?: string;
  gameSection?: GameSection;
}

export interface GameShellController {
  setActiveSection(sectionId: string): void;
  bindController(controller: GameController): void;
  /**
   * Same-document unlock after the URL is set to explicit local play (?mode=local) without reloading.
   * Applies to any local seating (human vs human, human vs bot, bot watch). Online entry still uses a
   * full navigation unless the play hub’s `tryCompleteSameDocumentOnlineNavigation` is implemented.
   */
  commitExplicitLocalPlayMode(): void;
}

const GAME_SHELL_STYLE_ID = "stackworks-game-shell-style";
/** Narrow viewports: shallow compact bar + overlay menu — same treatment for portrait and landscape (avoids tall in-flow header on rotated phones / small landscape windows). */
const COMPACT_GAME_SHELL_MEDIA = "(max-width: 820px)";
const DESKTOP_GAME_SHELL_MEDIA = "(min-width: 821px)";
const DESKTOP_PANEL_MODE_LS_KEY = "stackworks.gameShell.desktopPanelMode";

/**
 * Game/Shell pair tabs + Options “UI Old/New” stay available in production until shell parity is confirmed.
 * Set `VITE_HIDE_LEGACY_PANEL_TOGGLE=true` in the build env to hide them and use the compact “Play hub” bar
 * when the layout is stuck in legacy mode without visible tabs.
 */
function shouldHideLegacyDesktopPanelToggle(): boolean {
  return import.meta.env.VITE_HIDE_LEGACY_PANEL_TOGGLE === "true";
}

type DesktopPanelMode = "legacy" | "shell";

type AuthMeResponse = {
  ok: true;
  user: {
    displayName: string;
    avatarUrl?: string;
  } | null;
};

type LocalViewerIdentityOverride = {
  displayName?: string;
  avatarUrl?: string;
};

const ONLINE_SERVER_URL_LS_KEY = "lasca.online.serverUrl";

function normalizeDisplayName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function readDesktopPanelMode(): DesktopPanelMode {
  try {
    const raw = localStorage.getItem(DESKTOP_PANEL_MODE_LS_KEY);
    if (raw === "shell" || raw === "legacy") return raw;
    // Production defaults to shell when unset; dev keeps legacy for migration testing parity.
    return import.meta.env.PROD ? "shell" : "legacy";
  } catch {
    return import.meta.env.PROD ? "shell" : "legacy";
  }
}

function writeDesktopPanelMode(mode: DesktopPanelMode): void {
  try {
    localStorage.setItem(DESKTOP_PANEL_MODE_LS_KEY, mode);
  } catch {
    // ignore
  }
}

function resolveServerAssetUrl(serverUrl: string, assetUrl: string): string {
  try {
    return new URL(assetUrl, serverUrl).toString();
  } catch {
    return assetUrl;
  }
}

function resolveLocalAuthServerBaseUrl(): string | null {
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL;
  if (typeof envServerUrl === "string" && envServerUrl.trim()) {
    return envServerUrl.trim().replace(/\/$/, "");
  }
  try {
    const storedServerUrl = localStorage.getItem(ONLINE_SERVER_URL_LS_KEY)?.trim() ?? "";
    if (storedServerUrl) return storedServerUrl.replace(/\/$/, "");
  } catch {
    // ignore storage lookup failures
  }
  if (typeof window === "undefined") return null;
  if (!/^https?:$/i.test(window.location.protocol)) return null;
  return window.location.origin.replace(/\/$/, "");
}

async function fetchSignedInUserProfileForShell(): Promise<{ displayName: string; avatarUrl: string | null } | null> {
  const authBaseUrl = resolveLocalAuthServerBaseUrl();
  if (!authBaseUrl || typeof fetch !== "function") return null;
  try {
    const res = await fetch(`${authBaseUrl}/api/auth/me`, buildSessionAuthFetchInit(authBaseUrl));
    if (!res.ok) return null;
    const body = (await res.json()) as AuthMeResponse;
    if (!body?.ok || !body.user) return null;
    const displayName = typeof body.user.displayName === "string" ? body.user.displayName.trim() : "";
    if (!displayName) return null;
    const rawAvatar = typeof body.user.avatarUrl === "string" ? body.user.avatarUrl.trim() : "";
    const avatarUrl = rawAvatar ? resolveServerAssetUrl(authBaseUrl, rawAvatar) : null;
    return { displayName, avatarUrl };
  } catch {
    return null;
  }
}

/**
 * Panel layout is applied to `body[data-panel-layout]` after `installPanelLayoutOptionUI()` runs,
 * but `initGameShell()` runs first on game pages — fall back to persisted mode so Menu vs Panels
 * compact chrome matches before the attribute exists.
 */
function isLegacyMenuLayoutActive(): boolean {
  if (typeof document === "undefined") return false;
  const fromDom = document.body.dataset.panelLayout;
  if (fromDom === "menu") return true;
  if (fromDom === "panels") return false;
  return readPanelLayoutMode() === "menu";
}

function buildDesktopNavDescription(item: GameShellNavItem): string {
  switch (item.id) {
    case "play":
      return "Reveal play options in the right panel.";
    case "status":
      return "Reveal room, turn, and match-status options in the right panel.";
    case "tools":
      return "Reveal analysis, export, and utility actions in the right panel.";
    case "bot":
      return "Reveal bot and engine actions in the right panel.";
    case "history":
      return "Reveal playback and history actions in the right panel.";
    case "rules":
      return "Reveal rules and help actions in the right panel.";
    default:
      return `Reveal ${item.label.toLowerCase()} options in the right panel.`;
  }
}

function buildDesktopSectionCopy(item: GameShellNavItem): { title: string; description: string; actionLabel: string; actionDescription: string } {
  switch (item.id) {
    case "status":
      return {
        title: "Game status",
        description: "Keep the board visible while using the right panel for room state, turn flow, and current match details.",
        actionLabel: "Open status panel",
        actionDescription: "Jump to the existing in-page status controls for this game.",
      };
    case "tools":
      return {
        title: "Game tools",
        description: "Use the right panel as the shell-level launcher for analysis, export, options, and board utilities.",
        actionLabel: "Open tools panel",
        actionDescription: "Jump to the existing tools and options controls for this game.",
      };
    case "bot":
      return {
        title: "Bot controls",
        description: "Keep bot and engine controls grouped as a shell context instead of treating them as raw page anchors.",
        actionLabel: "Open bot controls",
        actionDescription: "Jump to the existing bot or engine panel for this game.",
      };
    case "history":
      return {
        title: "Move history",
        description: "Use the right panel to focus playback, notation, and review flows without losing the board context.",
        actionLabel: "Open move history",
        actionDescription: "Jump to the existing move history and playback controls.",
      };
    case "rules":
      return {
        title: "Rules and help",
        description: "Keep rules, reference, and guidance available as shell context while the game board stays in view.",
        actionLabel: "Open rules panel",
        actionDescription: "Jump to the existing rules section on this page.",
      };
    default:
      return {
        title: item.label,
        description: `Use the right panel for ${item.label.toLowerCase()} context while keeping the board visible.`,
        actionLabel: `Open ${item.label}`,
        actionDescription: `Jump to the existing ${item.label.toLowerCase()} section on this page.`,
      };
  }
}

function ensureGameShellStyles(): void {
  if (document.getElementById(GAME_SHELL_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = GAME_SHELL_STYLE_ID;
  style.textContent = `
    body.stackworksGameShellEnabled {
      background:
        radial-gradient(circle at top left, rgba(206, 162, 80, 0.12), transparent 24%),
        radial-gradient(circle at bottom right, rgba(92, 128, 186, 0.14), transparent 22%),
        linear-gradient(180deg, #111111 0%, #181818 100%);
    }

    body.stackworksGameShellNavLocked {
      overflow: hidden;
      touch-action: none;
    }

    .gameShellRoot {
      height: var(--app-height, 100vh);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      padding: 12px 12px 0;
    }

    .gameShellHeader {
      display: grid;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 22px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
        rgba(0, 0, 0, 0.2);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);
      backdrop-filter: blur(12px);
    }

    .gameShellCompactOverlay,
    .gameShellCompactBar,
    .gameShellCompactBarBrand,
    .gameShellCompactTrigger,
    .gameShellCompactClose {
      display: none;
    }

    .gameShellCompactOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.54);
      opacity: 0;
      pointer-events: none;
      transition: opacity 140ms ease;
      z-index: 69;
    }

    .gameShellCompactTrigger,
    .gameShellCompactClose {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(8, 8, 8, 0.72);
      color: rgba(255, 255, 255, 0.94);
      border-radius: 999px;
      min-height: 38px;
      padding: 9px 14px;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
    }

    /* Match in-panel <select.panelSelect> (game HTML): native chrome, theme vars when present. */
    .gameShellCompactPanelMode {
      display: none;
      width: auto;
      min-width: min(200px, 46vw);
      max-width: min(280px, 70vw);
      min-height: 34px;
      color-scheme: dark;
      border: 1px solid var(--themeMenuBorder, rgba(255, 255, 255, 0.18));
      background: rgba(0, 0, 0, 0.18);
      color: var(--themeMenuText, rgba(255, 255, 255, 0.9));
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 13px;
      line-height: 1.2;
      cursor: pointer;
      outline: none;
      box-shadow: none;
    }

    .gameShellCompactPanelMode:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .gameShellCompactPanelMode.panelSelect {
      width: auto;
      min-width: min(200px, 46vw);
    }

    .gameShellCompactPanelMode option,
    .gameShellCompactPanelMode optgroup {
      background: var(--themeMenuBg, #1e1e1e);
      color: var(--themeMenuText, rgba(255, 255, 255, 0.9));
      white-space: normal;
    }

    .gameShellCompactPanelMode:focus-visible {
      outline: 2px solid rgba(232, 191, 112, 0.45);
      outline-offset: 2px;
    }

    /* [hidden] loses to responsive rules that set display on .gameShellCompactTrigger — drive visibility from data attr. */
    .gameShellRoot[data-game-shell-compact-leading="panelSelect"] .gameShellCompactTrigger {
      display: none !important;
    }

    .gameShellRoot[data-game-shell-compact-leading="menu"] .gameShellCompactPanelMode {
      display: none !important;
    }

    .gameShellRoot[data-game-shell-compact-leading="panelSelect"] .gameShellCompactPanelMode {
      display: inline-block !important;
    }

    .gameShellCompactBar {
      align-items: center;
      grid-template-columns: auto auto auto minmax(0, 1fr);
      gap: 10px;
      --game-shell-compact-left-offset: 0px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(44, 61, 129, 0.96), rgba(52, 58, 137, 0.92)),
        rgba(24, 24, 24, 0.94);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(12px);
    }

    .gameShellCompactBarBrand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      min-width: 0;
      text-decoration: none;
    }

    .gameShellCompactBarBrandMark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      flex: 0 0 auto;
    }

    .gameShellCompactBarBrandMark img {
      width: 20px;
      height: 20px;
      display: block;
    }

    .gameShellCompactBarWordmark {
      display: inline-flex;
      align-items: center;
      width: auto;
      min-width: 0;
      max-width: 132px;
      flex: 0 1 auto;
    }

    .gameShellCompactBarWordmark img {
      display: block;
      width: auto;
      max-width: 100%;
      height: 14px;
    }

    .gameShellCompactBarTitle {
      min-width: 0;
      font-size: 16px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.96);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gameShellCompactBarTrail {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .gameShellCompactBarTrail .gameShellCompactBarTitle {
      flex: 1 1 auto;
    }

    /* Panels: icon-only start link in the compact bar; wordmark stays menu-layout only. */
    body[data-panel-layout="panels"] .gameShellCompactBarBrand .gameShellCompactBarWordmark {
      display: none !important;
    }

    .gameShellCompactBarHelp {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      margin-left: auto;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.92);
      text-decoration: none;
    }

    .gameShellCompactBarHelp:hover,
    .gameShellCompactBarHelp:focus-visible {
      background: rgba(255, 255, 255, 0.12);
      outline: none;
    }

    .gameShellCompactBarHelp svg {
      width: 18px;
      height: 18px;
      display: block;
    }

    .gameShellCompactTrigger:hover,
    .gameShellCompactTrigger:focus-visible,
    .gameShellCompactClose:hover,
    .gameShellCompactClose:focus-visible {
      background: rgba(20, 20, 20, 0.84);
      outline: none;
    }

    .gameShellHeaderTop {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }

    .gameShellIdentity {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .gameShellBrand {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      flex: 0 0 auto;
      text-decoration: none;
    }

    .gameShellBrand img {
      width: 24px;
      height: 24px;
      display: block;
    }

    .gameShellTitleBlock {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .gameShellBreadcrumb {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .gameShellTitle {
      margin: 0;
      font-size: clamp(20px, 2.6vw, 28px);
      line-height: 1.08;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.97);
    }

    .gameShellSubtitle {
      margin: 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.68);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gameShellHeaderActions {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .gameShellAction {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.92);
      text-decoration: none;
      font-size: 12px;
      line-height: 1;
    }

    .gameShellAction:hover,
    .gameShellAction:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .gameShellMetaRow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .gameShellMetaBadge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.86);
    }

    .gameShellNav {
      min-width: 0;
    }

    .gameShellAppSlot {
      min-height: 0;
    }

    .gameShellAppSlot > #appRoot {
      height: 100%;
      min-height: 0;
    }

    .gameShellDesktopPairTabs,
    .gameShellDesktopShellBody {
      display: none;
    }

    .gameShellDesktopPairTabs {
      gap: 8px;
      padding: 10px 10px 0;
    }

    /* Game/Shell switching uses the compact bar <select> in panels layout (all widths). */
    body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced > .gameShellDesktopPairTabs {
      display: none !important;
    }

    .gameShellDesktopPairTab {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.88);
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 11px;
      cursor: pointer;
    }

    .gameShellDesktopPairTab:hover,
    .gameShellDesktopPairTab:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .gameShellDesktopPairTab.isActive {
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.2), rgba(202, 157, 78, 0.08));
      border-color: rgba(232, 191, 112, 0.34);
      color: rgba(255, 255, 255, 0.98);
    }

    .gameShellDesktopPlayHubReturn {
      display: none;
      flex: 0 0 auto;
      padding: 8px 10px 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .gameShellDesktopPlayHubReturnBtn {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(202, 157, 78, 0.12);
      color: rgba(255, 255, 255, 0.94);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
    }

    .gameShellDesktopPlayHubReturnBtn:hover,
    .gameShellDesktopPlayHubReturnBtn:focus-visible {
      background: rgba(202, 157, 78, 0.2);
      outline: none;
    }

    .gameShellDesktopShellBody {
      padding: 10px;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      flex-direction: column;
      gap: 10px;
    }

    .gameShellSidebarShellSlot {
      min-height: 0;
      min-width: 0;
    }

    /* One horizontal logo above Game/Shell tabs on wide + sidebars visible; hidden ≤820px (compact bar logo). */
    .gameShellSidebarColumnBrand {
      display: none;
    }

    @media (min-width: 821px) {
      .sidebar.gameShellSidebarEnhanced > .gameShellSidebarColumnBrand {
        display: block;
        flex: 0 0 auto;
        padding: 6px 10px 8px;
      }

      .gameShellSidebarColumnBrandLink {
        display: inline-block;
        max-width: 100%;
        line-height: 0;
        text-decoration: none;
      }

      .gameShellSidebarColumnBrandLink img {
        display: block;
        max-width: 100%;
        width: auto;
        height: auto;
        max-height: 46px;
      }
    }

    /* Column brand is the canonical horizontal mark; #gameTitle also renders it via setStackWorksGameTitle. */
    .sidebar.gameShellSidebarEnhanced:has(> .gameShellSidebarColumnBrand) .sidebarHeader .stackworksGameTitleBrandLink {
      display: none !important;
    }

    .sidebar.gameShellSidebarEnhanced:has(> .gameShellSidebarColumnBrand) .sidebarHeader .stackworksGameTitleTextBrand {
      display: block !important;
    }

    .gameShellMobileShellPanels {
      display: none;
      flex-direction: column;
      gap: 14px;
      margin-top: 10px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      max-height: min(72dvh, 580px);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
      touch-action: pan-y;
    }

    .gameShellRoot.gameShellRoot--compactShellMenu .gameShellMobileShellPanels {
      display: flex;
    }

    /* Bodies here are not under .sidebar, so they still need to beat the global display:none
       on .gameShellDesktopShellBody (see block with .gameShellDesktopPairTabs). */
    .gameShellRoot.gameShellRoot--compactShellMenu .gameShellMobileShellPanels .gameShellDesktopShellBody {
      display: flex !important;
    }

    .gameShellRoot.gameShellRoot--compactShellMenu .gameShellDesktopPairTabs {
      display: none !important;
    }

    .gameShellDesktopShellBody--leftNav {
      overflow: hidden;
    }

    .gameShellDesktopShellBody--leftNav .gameShellDesktopShellMainScroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .gameShellDesktopUserFooter {
      flex: 0 0 auto;
      padding-top: 12px;
      margin-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .gameShellDesktopUserRow {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .gameShellDesktopUserAvatar {
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.08);
      display: grid;
      place-items: center;
      position: relative;
    }

    .gameShellDesktopUserAvatarImg {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .gameShellDesktopUserAvatarImg[hidden] {
      display: none !important;
    }

    .gameShellDesktopUserAvatarFallback {
      font-size: 14px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.88);
      line-height: 1;
    }

    .gameShellDesktopUserAvatarFallback[hidden] {
      display: none;
    }

    .gameShellDesktopUserName {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.94);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gameShellBoardStage {
      width: min(100%, 1080px);
      max-width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      justify-items: stretch;
      flex: 0 1 auto;
    }

    .gameShellBoardStage > #boardWithEvalBar,
    .gameShellBoardStage > #boardWrap {
      width: 100%;
      max-width: 100%;
    }

    .gameShellPlayerPanel {
      display: grid;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03)),
        rgba(0, 0, 0, 0.22);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
    }

    .gameShellPlayerPanel[data-active-turn="1"] {
      border-color: rgba(231, 191, 110, 0.42);
      box-shadow: 0 14px 32px rgba(168, 126, 49, 0.22);
    }

    .gameShellPlayerIdentityRow {
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
    }

    .gameShellPlayerAvatar {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 12px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.96);
      background: linear-gradient(135deg, rgba(111, 136, 199, 0.68), rgba(57, 73, 145, 0.76));
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }

    .gameShellPlayerAvatar[data-player-color="B"] {
      background: linear-gradient(135deg, rgba(57, 57, 63, 0.84), rgba(18, 18, 22, 0.9));
    }

    .gameShellPlayerAvatar[data-is-local="1"] {
      outline: 2px solid rgba(231, 191, 110, 0.32);
      outline-offset: 2px;
    }

    .gameShellPlayerAvatarFallback {
      position: relative;
      z-index: 1;
    }

    .gameShellPlayerAvatarImage {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 2;
    }

    .gameShellPlayerText {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .gameShellPlayerRole {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.46);
    }

    .gameShellPlayerName {
      font-size: 15px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.97);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gameShellPlayerDetail {
      font-size: 11px;
      line-height: 1.35;
      color: rgba(255, 255, 255, 0.68);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gameShellPlayerNameRow {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .gameShellPlayerFlag {
      flex: 0 0 auto;
      font-size: 14px;
      line-height: 1;
      filter: saturate(0.95);
    }

    .gameShellPlayerStatusBadge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.94);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      white-space: nowrap;
    }

    .gameShellPlayerStatusBadge[data-status="connected"] {
      background: rgba(44, 128, 78, 0.28);
      border-color: rgba(84, 184, 123, 0.32);
    }

    .gameShellPlayerStatusBadge[data-status="offline"],
    .gameShellPlayerStatusBadge[data-status="spectating"] {
      background: rgba(88, 100, 122, 0.28);
      border-color: rgba(124, 141, 171, 0.26);
    }

    .gameShellPlayerStatusBadge[data-status="waiting"],
    .gameShellPlayerStatusBadge[data-status="reconnecting"],
    .gameShellPlayerStatusBadge[data-status="in_grace"] {
      background: rgba(171, 123, 42, 0.24);
      border-color: rgba(231, 191, 110, 0.3);
    }

    .gameShellPlayerStatusBadge[data-status="disconnected"] {
      background: rgba(146, 62, 62, 0.26);
      border-color: rgba(205, 103, 103, 0.28);
    }

    .gameShellPlayerMeta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-self: center;
    }

    .gameShellPlayerMetaChip {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.76);
      letter-spacing: 0.02em;
    }

    .gameShellDesktopShellCard {
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.18);
      padding: 12px;
    }

    .gameShellDesktopShellEyebrow {
      margin: 0 0 8px;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .gameShellDesktopShellTitle {
      margin: 0;
      font-size: 18px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.96);
    }

    .gameShellDesktopShellText {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.68);
    }

    .gameShellDesktopShellMeta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .gameShellDesktopShellMetaBadge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.86);
    }

    .gameShellDesktopNavList,
    .gameShellDesktopActionList {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .gameShellDesktopNavButton,
    .gameShellDesktopActionButton,
    .gameShellDesktopActionLink {
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

    .gameShellDesktopNavButton:hover,
    .gameShellDesktopNavButton:focus-visible,
    .gameShellDesktopActionButton:hover,
    .gameShellDesktopActionButton:focus-visible,
    .gameShellDesktopActionLink:hover,
    .gameShellDesktopActionLink:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .gameShellDesktopNavButton.isActive {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }

    .gameShellDesktopNavLabel,
    .gameShellDesktopActionLabel {
      display: block;
      font-size: 12px;
      font-weight: 700;
    }

    .gameShellDesktopNavDescription,
    .gameShellDesktopActionDescription {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.62);
    }

    .gameShellDesktopSectionPanel {
      display: none;
      gap: 12px;
      min-height: 0;
    }

    .gameShellDesktopSectionPanel.isActive {
      display: grid;
    }

    .gameShellDesktopSectionPanel[data-section-id="play"] > .gameShellDesktopShellCard {
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    :fullscreen .gameShellHeader,
    :fullscreen .gameShellCompactBar,
    :fullscreen .gameShellCompactOverlay,
    :fullscreen .gameShellCompactTrigger,
    :fullscreen .gameShellCompactClose,
    :fullscreen .gameShellCompactPanelMode {
      display: none !important;
    }

    @media (min-width: 821px) {
      .gameShellRoot {
        grid-template-rows: minmax(0, 1fr);
        gap: 0;
        padding: 0;
      }

      .gameShellHeader {
        display: none !important;
      }

      body[data-panel-layout="menu"] .gameShellRoot {
        grid-template-rows: auto minmax(0, 1fr);
      }

      body[data-panel-layout="menu"] .gameShellCompactBar {
        display: grid !important;
        gap: 8px;
        padding-top: 10px;
        padding-right: 12px;
        padding-bottom: 10px;
        padding-left: calc(12px + var(--game-shell-compact-left-offset, 0px));
        z-index: 71;
      }

      body[data-panel-layout="menu"] .gameShellCompactBarBrand {
        display: inline-flex;
      }

      body[data-panel-layout="menu"] .gameShellCompactTrigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: static;
        min-width: 64px;
        min-height: 34px;
        padding: 7px 12px;
        box-shadow: none;
      }

      body[data-panel-layout="menu"] .gameShellCompactOverlay {
        display: block !important;
      }

      body[data-panel-layout="menu"] .gameShellHeader {
        position: fixed;
        top: 58px;
        left: 10px;
        right: 10px;
        max-width: min(720px, calc(100vw - 20px));
        max-height: calc(var(--app-height, 100dvh) - 78px);
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        z-index: 72;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-6px) scale(0.985);
        transition:
          opacity 140ms ease,
          transform 140ms ease;
        display: grid !important;
      }

      body[data-panel-layout="menu"] .gameShellRoot.navOpen .gameShellCompactOverlay {
        opacity: 1;
        pointer-events: auto;
      }

      body[data-panel-layout="menu"] .gameShellRoot.navOpen .gameShellHeader {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      body[data-panel-layout="menu"] .gameShellRoot.navOpen .gameShellCompactTrigger {
        background: rgba(28, 28, 28, 0.9);
      }

      body[data-panel-layout="menu"] .gameShellBoardStage > .gameShellPlayerPanel {
        padding-left: 62px;
      }

      .gameShellAppSlot > #appRoot > #centerArea.gameShellCenterArea {
        justify-content: center;
        align-items: stretch;
        align-content: stretch;
        flex-wrap: nowrap;
        overflow: hidden;
      }

      .gameShellBoardStage {
        height: 100%;
        max-height: 100%;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 6px;
        align-items: stretch;
        margin-inline: auto;
      }

      .gameShellBoardStage > #boardWithEvalBar,
      .gameShellBoardStage > #boardWrap {
        min-height: 0;
        max-width: 100%;
        justify-self: center;
      }

      .gameShellBoardStage > .gameShellPlayerPanel {
        gap: 4px;
        padding: 6px 10px;
        border-radius: 12px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerIdentityRow {
        gap: 8px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerAvatar {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        font-size: 11px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerText {
        gap: 1px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerRole {
        font-size: 9px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerName {
        font-size: 13px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerDetail {
        font-size: 10px;
        line-height: 1.2;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerStatusBadge {
        min-height: 22px;
        padding: 4px 8px;
        font-size: 10px;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerMeta {
        gap: 4px;
        justify-self: center;
        align-self: center;
        flex-wrap: nowrap;
      }

      .gameShellBoardStage > .gameShellPlayerPanel .gameShellPlayerMetaChip {
        min-height: 18px;
        padding: 2px 7px;
        font-size: 9px;
      }

      .gameShellCompactBar,
      .gameShellCompactOverlay {
        display: none !important;
      }

      /* Panels at any width: top strip with Game/Shell selector (Menu slide-over is menu-layout only). */
      body[data-panel-layout="panels"] .gameShellRoot {
        grid-template-rows: auto minmax(0, 1fr);
      }

      body[data-panel-layout="panels"] .gameShellCompactBar {
        display: grid !important;
        gap: 8px;
        padding-top: 10px;
        padding-right: 12px;
        padding-bottom: 10px;
        padding-left: calc(12px + var(--game-shell-compact-left-offset, 0px));
        z-index: 71;
      }

      body[data-panel-layout="panels"] .gameShellCompactBarBrand {
        display: inline-flex;
      }

      body[data-panel-layout="panels"] .gameShellCompactOverlay {
        display: none !important;
      }

      .gameShellDesktopPairTabs {
        display: flex;
      }

      /* Shell bodies may live in .gameShellSidebarShellSlot (Menu reparenting) — use descendant
         selectors, not direct child, so shell mode still overrides the default display:none above. */
      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellSidebarShellSlot {
        display: none !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] .gameShellDesktopShellBody {
        display: none !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellLegacySidebarBody {
        display: flex !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellSidebarShellSlot {
        display: flex !important;
        flex: 1 1 auto;
        min-height: 0;
        flex-direction: column;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] .gameShellDesktopShellBody {
        display: flex !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellLegacySidebarBody {
        display: none !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellDesktopPlayHubReturn {
        display: flex;
      }
    }

    @media (max-width: 820px) and (orientation: portrait) {
      .gameShellRoot {
        grid-template-rows: auto minmax(0, 1fr);
        gap: 0;
        padding: 0;
      }

      .gameShellCompactBar {
        display: grid;
        gap: 8px;
        padding-top: max(6px, env(safe-area-inset-top));
        padding-right: max(10px, env(safe-area-inset-right));
        padding-bottom: 6px;
        padding-left: calc(max(10px, env(safe-area-inset-left)) + var(--game-shell-compact-left-offset, 0px));
        z-index: 71;
      }

      .gameShellCompactBarBrand {
        display: inline-flex;
        gap: 6px;
      }

      .gameShellCompactBarBrandMark {
        width: 28px;
        height: 28px;
        border-radius: 9px;
      }

      .gameShellCompactBarBrandMark img {
        width: 17px;
        height: 17px;
      }

      .gameShellCompactBarWordmark {
        width: auto;
        max-width: 128px;
      }

      .gameShellCompactBarTitle {
        font-size: 14px;
      }

      .gameShellCompactTrigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: static;
        min-width: 64px;
        min-height: 34px;
        padding: 7px 12px;
        box-shadow: none;
      }

      .gameShellCompactOverlay {
        display: block;
      }

      body[data-panel-layout="panels"] .gameShellCompactOverlay {
        display: none !important;
      }

      .gameShellHeader {
        position: fixed;
        top: calc(max(10px, env(safe-area-inset-top)) + 58px);
        left: max(10px, env(safe-area-inset-left));
        right: max(10px, env(safe-area-inset-right));
        max-height: calc(var(--app-height, 100dvh) - max(20px, env(safe-area-inset-top)) - max(20px, env(safe-area-inset-bottom)) - 58px);
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        z-index: 72;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-6px) scale(0.985);
        transition:
          opacity 140ms ease,
          transform 140ms ease;
      }

      .gameShellCompactClose {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .gameShellRoot.navOpen .gameShellCompactOverlay {
        opacity: 1;
        pointer-events: auto;
      }

      .gameShellRoot.navOpen .gameShellHeader {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      @media (max-width: 520px) {
        .gameShellCompactBarWordmark {
          display: none;
        }

        .gameShellCompactBarBrand {
          gap: 0;
        }
      }

      .gameShellRoot.navOpen .gameShellCompactTrigger {
        background: rgba(28, 28, 28, 0.9);
      }

      .gameShellHeaderTop {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      /* Shallow slide-over menu: avoid tall “desktop title” feel on portrait gameplay. */
      .gameShellHeader {
        gap: 8px;
        padding: 10px 12px;
        border-radius: 16px;
      }

      .gameShellHeader .gameShellTitle {
        font-size: clamp(16px, 4.4vw, 20px);
        line-height: 1.12;
      }

      .gameShellHeader .gameShellBreadcrumb {
        font-size: 10px;
      }

      .gameShellHeader .gameShellSubtitle {
        font-size: 11px;
      }

      .gameShellHeader .gameShellBrand {
        width: 38px;
        height: 38px;
        border-radius: 12px;
      }

      .gameShellHeader .gameShellBrand img {
        width: 21px;
        height: 21px;
      }

      .gameShellPlayerPanel {
        gap: 4px;
        padding: 6px 8px;
        border-radius: 12px;
      }

      .gameShellPlayerIdentityRow {
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        gap: 8px;
      }

      .gameShellPlayerAvatar {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        font-size: 11px;
      }

      .gameShellPlayerText {
        gap: 1px;
      }

      .gameShellPlayerName {
        font-size: 13px;
      }

      .gameShellPlayerStatusBadge {
        min-height: 22px;
        padding: 4px 8px;
        font-size: 10px;
      }

      .gameShellPlayerPanel[data-redundant-status="1"] .gameShellPlayerStatusBadge {
        display: none;
      }

      .gameShellPlayerMeta {
        flex-wrap: nowrap;
        gap: 4px;
        justify-self: end;
        align-self: center;
      }

      .gameShellPlayerMetaChip {
        min-height: 18px;
        padding: 2px 7px;
        font-size: 9px;
      }

      .gameShellAppSlot,
      .gameShellAppSlot > #appRoot {
        height: 100%;
      }
    }

    @media (max-width: 820px) and (orientation: portrait) {
      .gameShellPlayerRole,
      .gameShellPlayerDetail {
        display: none;
      }
    }

    /* Narrow + Panels layout: shell vs legacy visibility is defined under @media (min-width: 821px) for
       desktop sidebars. Below 821px those rules do not apply, while .gameShellDesktopShellBody defaults to
       display:none — so Shell UI never appeared in stacked mobile sidebars and play/setup was legacy-only. */
    @media (max-width: 820px) {
      /* Narrow landscape + panels: same top strip as portrait (portrait-only block above does not run). */
      @media (orientation: landscape) {
        body[data-panel-layout="panels"] .gameShellRoot {
          grid-template-rows: auto minmax(0, 1fr);
          gap: 0;
          padding: 0;
        }

        body[data-panel-layout="panels"] .gameShellCompactBar {
          display: grid !important;
          gap: 8px;
          padding-top: max(6px, env(safe-area-inset-top));
          padding-right: max(10px, env(safe-area-inset-right));
          padding-bottom: 6px;
          padding-left: calc(max(10px, env(safe-area-inset-left)) + var(--game-shell-compact-left-offset, 0px));
          z-index: 71;
        }

        body[data-panel-layout="panels"] .gameShellCompactBarBrand {
          display: inline-flex;
          gap: 6px;
        }

        body[data-panel-layout="panels"] .gameShellCompactOverlay {
          display: none !important;
        }

        .gameShellAppSlot,
        .gameShellAppSlot > #appRoot {
          height: 100%;
        }
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellLegacySidebarBody {
        display: none !important;
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellSidebarShellSlot {
        display: flex !important;
        flex: 1 1 auto;
        min-height: 0;
        flex-direction: column;
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] .gameShellDesktopShellBody {
        display: flex !important;
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellSidebarShellSlot {
        display: none !important;
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] .gameShellDesktopShellBody {
        display: none !important;
      }

      body[data-panel-layout="panels"] .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellLegacySidebarBody {
        display: flex !important;
      }
    }

    @media (max-width: 560px) {
      .gameShellBrand {
        width: 40px;
        height: 40px;
      }

      .gameShellPlayerPanel {
        padding: 9px 10px;
      }

      @media (orientation: portrait) {
        .gameShellPlayerIdentityRow {
          grid-template-columns: auto minmax(0, 1fr) auto auto;
        }

        .gameShellPlayerMeta {
          grid-column: auto;
          justify-self: end;
          align-self: center;
          flex-wrap: nowrap;
        }

        .gameShellPlayerStatusBadge {
          grid-column: auto;
          justify-self: end;
        }
      }

      @media not all and (orientation: portrait) {
        .gameShellPlayerIdentityRow {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .gameShellPlayerMeta {
          grid-column: 1 / -1;
          justify-self: flex-start;
        }

        .gameShellPlayerStatusBadge {
          grid-column: 1 / -1;
          justify-self: flex-start;
        }
      }
    }
  `;

  document.head.appendChild(style);
}

export function initGameShell(opts: GameShellOptions): GameShellController {
  ensureGameShellStyles();
  document.body.classList.add("stackworksGameShellEnabled");
  const initialShellState = readShellState();
  let forwardCommitExplicitLocalPlayMode: (() => void) | null = null;
  let playHubOfflineBotReloadControllerRef: GameController | null = null;

  const shell = document.createElement("div");
  shell.className = "gameShellRoot";
  shell.dataset.gameShellCompactLeading = "menu";

  const compactOverlay = document.createElement("div");
  compactOverlay.className = "gameShellCompactOverlay";
  compactOverlay.setAttribute("aria-hidden", "true");

  const compactBar = document.createElement("div");
  compactBar.className = "gameShellCompactBar";

  const compactTrigger = document.createElement("button");
  compactTrigger.type = "button";
  compactTrigger.className = "gameShellCompactTrigger";
  compactTrigger.textContent = "Menu";
  compactTrigger.setAttribute("aria-expanded", "false");
  compactTrigger.setAttribute("aria-label", `Open ${opts.title} menu`);

  const compactPanelModeSelect = document.createElement("select");
  compactPanelModeSelect.className = "gameShellCompactPanelMode panelSelect";
  compactPanelModeSelect.setAttribute("aria-label", `Game or Shell panels for ${opts.title}`);
  compactPanelModeSelect.hidden = true;
  const compactPanelOptLegacy = document.createElement("option");
  compactPanelOptLegacy.value = "legacy";
  compactPanelOptLegacy.textContent = "Game panels";
  const compactPanelOptShell = document.createElement("option");
  compactPanelOptShell.value = "shell";
  compactPanelOptShell.textContent = "Shell panels";
  compactPanelModeSelect.append(compactPanelOptLegacy, compactPanelOptShell);

  const compactBarBrand = document.createElement(opts.backHref ? "a" : "span");
  compactBarBrand.className = "gameShellCompactBarBrand";
  if (opts.backHref && compactBarBrand instanceof HTMLAnchorElement) {
    compactBarBrand.href = opts.backHref;
    compactBarBrand.title = "Start Page";
    compactBarBrand.setAttribute("aria-label", "Start Page");
  } else {
    compactBarBrand.setAttribute("aria-hidden", "true");
  }
  const compactBarBrandMark = document.createElement("span");
  compactBarBrandMark.className = "gameShellCompactBarBrandMark";
  compactBarBrandMark.setAttribute("aria-hidden", "true");
  renderLogo(compactBarBrandMark, { placement: "mobile-header", ariaHidden: true });

  const compactBarWordmark = document.createElement("span");
  compactBarWordmark.className = "gameShellCompactBarWordmark";
  renderLogo(compactBarWordmark, {
    variant: "wordmark",
    alt: "StackWorks",
  });
  compactBarBrand.append(compactBarBrandMark, compactBarWordmark);

  const compactBarTrail = document.createElement("div");
  compactBarTrail.className = "gameShellCompactBarTrail";

  const compactBarTitle = document.createElement("div");
  compactBarTitle.className = "gameShellCompactBarTitle";
  compactBarTitle.textContent = opts.title;

  compactBarTrail.appendChild(compactBarTitle);

  if (opts.helpHref) {
    const compactBarHelp = document.createElement("a");
    compactBarHelp.className = "gameShellCompactBarHelp";
    compactBarHelp.href = opts.helpHref;
    compactBarHelp.target = "_blank";
    compactBarHelp.rel = "noopener noreferrer";
    compactBarHelp.setAttribute("aria-label", "Help and rules");
    compactBarHelp.title = "Help and rules";
    compactBarHelp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
    compactBarTrail.appendChild(compactBarHelp);
  }

  const desktopMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_GAME_SHELL_MEDIA)
    : null;

  const header = document.createElement("header");
  header.className = "gameShellHeader";
  header.id = `stackworksGameShellHeader-${opts.variantId}`;
  header.setAttribute("aria-hidden", "true");
  compactTrigger.setAttribute("aria-controls", header.id);

  const headerTop = document.createElement("div");
  headerTop.className = "gameShellHeaderTop";

  const identity = document.createElement("div");
  identity.className = "gameShellIdentity";

  const brand = document.createElement(opts.backHref ? "a" : "span");
  brand.className = "gameShellBrand";
  if (opts.backHref && brand instanceof HTMLAnchorElement) {
    brand.href = opts.backHref;
    brand.title = "Start Page";
    brand.setAttribute("aria-label", "Start Page");
  } else {
    brand.setAttribute("aria-hidden", "true");
  }
  renderLogo(brand, { variant: "icon", ariaHidden: true });

  const titleBlock = document.createElement("div");
  titleBlock.className = "gameShellTitleBlock";

  const breadcrumb = document.createElement("p");
  breadcrumb.className = "gameShellBreadcrumb";
  breadcrumb.textContent = opts.breadcrumb;

  const title = document.createElement("h1");
  title.className = "gameShellTitle";
  title.textContent = opts.title;

  const subtitle = document.createElement("p");
  subtitle.className = "gameShellSubtitle";
  subtitle.textContent = opts.subtitle;

  titleBlock.append(breadcrumb, title, subtitle);
  identity.append(brand, titleBlock);

  const actions = document.createElement("div");
  actions.className = "gameShellHeaderActions";

  const compactClose = document.createElement("button");
  compactClose.type = "button";
  compactClose.className = "gameShellCompactClose";
  compactClose.textContent = "Close";
  compactClose.setAttribute("aria-label", `Close ${opts.title} menu`);
  actions.appendChild(compactClose);

  const compactMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COMPACT_GAME_SHELL_MEDIA)
    : null;

  const isCompactMode = (): boolean => Boolean(compactMedia?.matches);

  const usesCompactShellControls = (): boolean => isCompactMode() || isLegacyMenuLayoutActive();

  const slideOverMenuLayoutActive = (): boolean => isLegacyMenuLayoutActive();

  let syncCompactPanelSwitcher: (() => void) | null = null;

  const syncCompactState = (): void => {
    const expanded = shell.classList.contains("navOpen");
    compactTrigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    header.setAttribute("aria-hidden", expanded ? "false" : "true");
    compactOverlay.setAttribute("aria-hidden", expanded ? "false" : "true");
    document.body.classList.toggle("stackworksGameShellNavLocked", expanded && slideOverMenuLayoutActive());
  };

  const closeCompactMenu = (restoreFocus = false): void => {
    shell.classList.remove("navOpen");
    syncCompactState();
    if (restoreFocus) compactTrigger.focus();
  };

  const openCompactMenu = (): void => {
    if (!slideOverMenuLayoutActive()) return;
    shell.classList.add("navOpen");
    syncCompactState();
    compactClose.focus();
  };

  const toggleCompactMenu = (): void => {
    if (!slideOverMenuLayoutActive()) return;
    if (shell.classList.contains("navOpen")) {
      closeCompactMenu(true);
    } else {
      openCompactMenu();
    }
  };

  const handleCompactViewportChange = (): void => {
    if (!slideOverMenuLayoutActive()) {
      closeCompactMenu(false);
    } else {
      syncCompactState();
    }
    syncCompactPanelSwitcher?.();
    scheduleLegacyHamburgerOffsetSync();
    syncGameShellBodiesHost?.();
  };

  let legacyHamburgerOffsetFrame: number | null = null;

  const syncLegacyHamburgerOffset = (): void => {
    let offsetPx = 0;

    if (usesCompactShellControls() && document.body.dataset.panelLayout === "menu") {
      const legacyHamburger = document.getElementById("panelLayoutHamburger") as HTMLElement | null;
      if (legacyHamburger) {
        const computed = window.getComputedStyle(legacyHamburger);
        const visible = computed.display !== "none" && computed.visibility !== "hidden";
        if (visible) {
          const legacyRect = legacyHamburger.getBoundingClientRect();
          const compactRect = compactBar.getBoundingClientRect();
          const overlapsVertically = legacyRect.bottom > compactRect.top && legacyRect.top < compactRect.bottom;
          if (legacyRect.width > 0 && legacyRect.height > 0 && overlapsVertically) {
            offsetPx = Math.max(0, Math.ceil(legacyRect.right - compactRect.left + 8));
          }
        }
      }
    }

    compactBar.style.setProperty("--game-shell-compact-left-offset", `${offsetPx}px`);
  };

  const scheduleLegacyHamburgerOffsetSync = (): void => {
    if (legacyHamburgerOffsetFrame !== null) return;
    legacyHamburgerOffsetFrame = window.requestAnimationFrame(() => {
      legacyHamburgerOffsetFrame = null;
      syncLegacyHamburgerOffset();
    });
  };

  compactTrigger.addEventListener("click", toggleCompactMenu);
  compactClose.addEventListener("click", () => closeCompactMenu(true));
  compactOverlay.addEventListener("click", () => closeCompactMenu(true));

  compactMedia?.addEventListener?.("change", handleCompactViewportChange);
  window.addEventListener("resize", scheduleLegacyHamburgerOffsetSync);
  window.visualViewport?.addEventListener("resize", scheduleLegacyHamburgerOffsetSync);
  window.addEventListener("panelLayoutModeChanged", () => {
    syncCompactPanelSwitcher?.();
    scheduleLegacyHamburgerOffsetSync();
    syncGameShellBodiesHost?.();
  });
  document.addEventListener("fullscreenchange", () => {
    preferShellBodiesInSidebarForFullscreen = Boolean(document.fullscreenElement);
    syncGameShellBodiesHost?.();
  });
  document.addEventListener("click", () => scheduleLegacyHamburgerOffsetSync());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCompactMenu(true);
  });

  if (opts.backHref) {
    const backLink = document.createElement("a");
    backLink.className = "gameShellAction";
    backLink.href = opts.backHref;
    backLink.textContent = "Start Page";
    backLink.addEventListener("click", () => closeCompactMenu());
    actions.appendChild(backLink);
  }

  if (opts.helpHref) {
    const helpLink = document.createElement("a");
    helpLink.className = "gameShellAction";
    helpLink.href = opts.helpHref;
    helpLink.target = "_blank";
    helpLink.rel = "noopener noreferrer";
    helpLink.textContent = "Help";
    helpLink.addEventListener("click", () => closeCompactMenu());
    actions.appendChild(helpLink);
  }

  headerTop.append(identity, actions);
  header.appendChild(headerTop);

  if (opts.meta?.length) {
    const metaRow = document.createElement("div");
    metaRow.className = "gameShellMetaRow";
    for (const item of opts.meta) {
      const badge = document.createElement("span");
      badge.className = "gameShellMetaBadge";
      badge.textContent = item;
      metaRow.appendChild(badge);
    }
    header.appendChild(metaRow);
  }

  const nav = document.createElement("nav");
  nav.className = "gameShellNav";

  let syncDesktopShellSection: ((sectionId: string) => void) | null = null;
  let syncGameShellBodiesHost: (() => void) | null = null;
  let preferShellBodiesInSidebarForFullscreen = false;

  const mobileShellPanels = document.createElement("div");
  mobileShellPanels.className = "gameShellMobileShellPanels";
  mobileShellPanels.setAttribute("aria-label", "Shell navigation and play hub");

  const tabs = createTabs({
    className: "gameShellNavTabs",
    activeId: opts.activeSectionId,
    items: (opts.navItems ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      onSelect: () => {
        if (item.targetSelector) {
          const target = document.querySelector(item.targetSelector) as HTMLElement | null;
          target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        }
        closeCompactMenu();
        item.onSelect?.();
      },
    })),
  });
  nav.appendChild(tabs.element);
  header.append(nav, mobileShellPanels);

  const setActiveSection = (sectionId: string): void => {
    tabs.setActiveTab(sectionId);
    syncDesktopShellSection?.(sectionId);
    updateShellState({
      activeGame: opts.variantId,
      activeSection: GlobalSection.Games,
      gameSection: normalizeGameSection(sectionId) ?? opts.gameSection ?? GameSection.Play,
    });
  };

  let didBindController = false;

  const bindController = (controller: GameController): void => {
    if (didBindController) return;

    const centerArea = opts.appRoot.querySelector("#centerArea") as HTMLElement | null;
    const boardAnchor = (opts.appRoot.querySelector("#boardWithEvalBar") ?? opts.appRoot.querySelector("#boardWrap")) as HTMLElement | null;
    if (!centerArea || !boardAnchor) return;

    centerArea.classList.add("gameShellCenterArea");

    let boardStage = boardAnchor.parentElement;
    if (!boardStage || !boardStage.classList.contains("gameShellBoardStage")) {
      boardStage = document.createElement("div");
      boardStage.className = "gameShellBoardStage";
      boardAnchor.insertAdjacentElement("beforebegin", boardStage);
      boardStage.appendChild(boardAnchor);
    }

    const initialSnapshot = controller.getPlayerShellSnapshot();
    const queryMode = new URLSearchParams(window.location.search).get("mode");
    const hasExplicitPlayMode = queryMode === "local" || queryMode === "online";
    let startupPlayLockUiActive = !hasExplicitPlayMode;
    const nestedBoardWrapEl = opts.appRoot.querySelector("#boardWrap") as HTMLElement | null;
    if (startupPlayLockUiActive) {
      controller.setShellStartupPlayLockEnabled(true);
      boardAnchor.style.pointerEvents = "none";
      boardAnchor.style.cursor = "not-allowed";
      if (nestedBoardWrapEl) {
        nestedBoardWrapEl.style.pointerEvents = "none";
        nestedBoardWrapEl.style.cursor = "not-allowed";
      }
    }
    const topPanel = createPlayerIdentityPanel({ identity: initialSnapshot.players.B });
    const bottomPanel = createPlayerIdentityPanel({ identity: initialSnapshot.players.W });
    const openVariantPageOnlinePreview = initialSnapshot.mode === "local"
      ? readOpenVariantPageOnlinePreview(opts.variantId)
      : null;

    const localIdentityOverrides: Partial<Record<Player, Partial<PlayerIdentity>>> = {};

    // Local start-page names should only seed offline/local shells.
    if (initialSnapshot.mode === "local" && !openVariantPageOnlinePreview && !hasAnyLocalBotSide(opts.appRoot)) {
      try {
        const nameLight = localStorage.getItem("lasca.local.nameLight")?.trim() ?? "";
        const nameDark = localStorage.getItem("lasca.local.nameDark")?.trim() ?? "";
        if (nameLight) localIdentityOverrides["W"] = { displayName: nameLight };
        if (nameDark) localIdentityOverrides["B"] = { displayName: nameDark };
      } catch { /* ignore */ }
    }
    let boardFitFrame: number | null = null;

    const fitBoardStage = (): void => {
      const isDesktop = desktopMedia?.matches ?? (typeof window !== "undefined" ? window.innerWidth >= 821 : false);
      if (!isDesktop) {
        boardAnchor.style.width = "";
        boardAnchor.style.margin = "";
        return;
      }

      const boardSvg = opts.appRoot.querySelector("#boardWrap svg") as SVGSVGElement | null;
      if (!boardSvg) return;

      const viewBoxParts = (boardSvg.getAttribute("viewBox") ?? "")
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number(value));
      const viewBoxW = Number.isFinite(viewBoxParts[2]) && viewBoxParts[2] > 0 ? viewBoxParts[2] : 1;
      const viewBoxH = Number.isFinite(viewBoxParts[3]) && viewBoxParts[3] > 0 ? viewBoxParts[3] : 1;
      const aspectRatio = viewBoxW / viewBoxH;

      const stageHeight = boardStage.clientHeight;
      const stageWidth = boardStage.clientWidth;
      if (stageHeight <= 0 || stageWidth <= 0) return;

      const computedStage = window.getComputedStyle(boardStage);
      const rowGap = parseFloat(computedStage.rowGap || computedStage.gap || "0") || 0;
      const topHeight = topPanel.element.offsetHeight;
      const bottomHeight = bottomPanel.element.offsetHeight;
      const availableBoardHeight = Math.max(120, stageHeight - topHeight - bottomHeight - rowGap * 2);
      const fittedWidth = Math.max(120, Math.min(stageWidth, availableBoardHeight * aspectRatio));

      boardAnchor.style.width = `${Math.floor(fittedWidth)}px`;
      boardAnchor.style.margin = "0 auto";
    };

    const scheduleBoardFit = (): void => {
      if (boardFitFrame !== null) return;
      boardFitFrame = window.requestAnimationFrame(() => {
        boardFitFrame = null;
        fitBoardStage();
      });
    };

    boardAnchor.insertAdjacentElement("beforebegin", topPanel.element);
    boardAnchor.insertAdjacentElement("afterend", bottomPanel.element);

    let localViewerIdentityOverride: LocalViewerIdentityOverride | null = null;

    const buildSnapshotWithOverrides = (snapshot: PlayerShellSnapshot, bottomColor: Player): PlayerShellSnapshot => {
      const nextPlayers = { ...snapshot.players };
      if (
        snapshot.mode === "local" &&
        !urlHasExplicitPlayMode() &&
        controller.isShellStartupPlayLockEnabled()
      ) {
        for (const color of ["W", "B"] as const) {
          const identity = nextPlayers[color];
          nextPlayers[color] = {
            ...identity,
            displayName: identity.sideLabel,
            roleLabel: identity.sideLabel,
            isLocal: false,
            viewerTag: undefined,
          };
        }
        return { ...snapshot, players: nextPlayers };
      }
      if (snapshot.mode === "local" && openVariantPageOnlinePreview) {
        for (const color of ["W", "B"] as const) {
          const previewName = openVariantPageOnlinePreview.names[color]?.trim() ?? "";
          if (!previewName) continue;
          nextPlayers[color] = { ...nextPlayers[color], displayName: previewName };
        }
      }
      for (const color of ["W", "B"] as const) {
        const override = localIdentityOverrides[color];
        if (!override) continue;
        nextPlayers[color] = { ...nextPlayers[color], ...override };
      }
      if (snapshot.mode === "local") {
        if (hasAnyLocalBotSide(opts.appRoot) && !controller.isLoadedGameSeatLabelsActive()) {
          const nextNames = resolveActiveLocalSeatDisplayNames({
            root: opts.appRoot,
            signedInDisplayName: localViewerIdentityOverride?.displayName ?? null,
            sideLabels: {
              W: nextPlayers.W.sideLabel,
              B: nextPlayers.B.sideLabel,
            },
            fallbackDisplayNames: {
              W: nextPlayers.W.displayName,
              B: nextPlayers.B.displayName,
            },
            savePinnedSeatNames: {
              W: controller.getSavePinnedSeatDisplayName("W"),
              B: controller.getSavePinnedSeatDisplayName("B"),
            },
          });
          nextPlayers.W = { ...nextPlayers.W, displayName: nextNames.W };
          nextPlayers.B = { ...nextPlayers.B, displayName: nextNames.B };
        }

        if (openVariantPageOnlinePreview) {
          for (const color of ["W", "B"] as const) {
            const identity = nextPlayers[color];
            const isLocal = color === openVariantPageOnlinePreview.localColor;
            const previewRole = openVariantPageOnlinePreview.roles[color] ?? (isLocal ? "human" : "human");
            nextPlayers[color] = {
              ...identity,
              roleLabel: `${isLocal ? "You" : previewRole === "bot" ? "Bot" : "Opponent"} · ${identity.sideLabel}`,
              ...(isLocal ? { viewerTag: "You" } : previewRole === "bot" ? { viewerTag: "Bot" } : {}),
              isLocal: isLocal && previewRole !== "bot",
            };
          }

          const signedInName = normalizeDisplayName(localViewerIdentityOverride?.displayName);
          const signedInAvatarUrl = localViewerIdentityOverride?.avatarUrl?.trim() ?? "";
          const localIdentity = nextPlayers[openVariantPageOnlinePreview.localColor];
          nextPlayers[openVariantPageOnlinePreview.localColor] = {
            ...localIdentity,
            ...(signedInName ? { displayName: signedInName } : {}),
            ...(signedInAvatarUrl && !localIdentity.avatarUrl?.trim() ? { avatarUrl: signedInAvatarUrl } : {}),
          };

          return { ...snapshot, players: nextPlayers };
        }

        for (const color of ["W", "B"] as const) {
          const identity = nextPlayers[color];
          if (isLocalBotSide(color, opts.appRoot)) {
            nextPlayers[color] = {
              ...identity,
              roleLabel: `Bot · ${identity.sideLabel}`,
              viewerTag: "Bot",
              isLocal: false,
            };
            continue;
          }
          nextPlayers[color] = {
            ...identity,
            roleLabel: `You · ${identity.sideLabel}`,
            viewerTag: "You",
            isLocal: true,
          };
        }
      }
      if (snapshot.mode === "local") {
        if (isLocalBotSide(bottomColor, opts.appRoot)) {
          const signedInName = normalizeDisplayName(localViewerIdentityOverride?.displayName);
          const signedInAvatarUrl = localViewerIdentityOverride?.avatarUrl?.trim() ?? "";
          if (signedInName && signedInAvatarUrl) {
            for (const color of ["W", "B"] as const) {
              const identity = nextPlayers[color];
              if (normalizeDisplayName(identity.displayName) !== signedInName) continue;
              nextPlayers[color] = {
                ...identity,
                avatarUrl: identity.avatarUrl?.trim() ? identity.avatarUrl : signedInAvatarUrl,
              };
            }
          }
          return { ...snapshot, players: nextPlayers };
        }
        const signedInName = normalizeDisplayName(localViewerIdentityOverride?.displayName);
        const signedInAvatarUrl = localViewerIdentityOverride?.avatarUrl?.trim() ?? "";
        if (signedInName && signedInAvatarUrl) {
          for (const color of ["W", "B"] as const) {
            const identity = nextPlayers[color];
            if (normalizeDisplayName(identity.displayName) !== signedInName) continue;
            nextPlayers[color] = {
              ...identity,
              avatarUrl: identity.avatarUrl?.trim() ? identity.avatarUrl : signedInAvatarUrl,
            };
          }
        }
      }
      return { ...snapshot, players: nextPlayers };
    };

    const loadSignedInViewerOverride = async (snapshot: PlayerShellSnapshot): Promise<void> => {
      const authBaseUrl = (() => {
        if (snapshot.mode === "online") {
          if (snapshot.viewerRole !== "player" || !snapshot.viewerColor || !snapshot.serverUrl) return null;
          return snapshot.serverUrl.replace(/\/$/, "");
        }
        return resolveLocalAuthServerBaseUrl();
      })();
      if (!authBaseUrl) return;
      const authUrl = `${authBaseUrl}/api/auth/me`;

      try {
        const res = await fetch(authUrl, buildSessionAuthFetchInit(authBaseUrl));
        if (!res.ok) return;
        const body = await res.json() as AuthMeResponse;
        if (!body?.user) return;
        const rawDisplayName = typeof body.user.displayName === "string" ? body.user.displayName.trim() : "";
        const rawAvatarUrl = typeof body?.user?.avatarUrl === "string" ? body.user.avatarUrl.trim() : "";
        if (snapshot.mode === "online" && snapshot.viewerColor && snapshot.serverUrl) {
          if (!rawAvatarUrl) return;
          localIdentityOverrides[snapshot.viewerColor] = {
            ...(localIdentityOverrides[snapshot.viewerColor] ?? {}),
            avatarUrl: resolveServerAssetUrl(snapshot.serverUrl, rawAvatarUrl),
          };
        } else if (snapshot.mode === "local") {
          if (!rawDisplayName && !rawAvatarUrl) return;
          localViewerIdentityOverride = {
            ...(rawDisplayName ? { displayName: rawDisplayName } : {}),
            ...(rawAvatarUrl ? { avatarUrl: resolveServerAssetUrl(authBaseUrl, rawAvatarUrl) } : {}),
          };
        }
        syncPanels();
      } catch {
        // ignore profile lookup failures
      }
    };

    const syncLocalStorageIntoIdentityOverrides = (): void => {
      if (openVariantPageOnlinePreview) return;
      if (hasAnyLocalBotSide(opts.appRoot)) return;
      if (controller.getPlayerShellSnapshot().mode !== "local") return;
      try {
        const nameLight = localStorage.getItem("lasca.local.nameLight")?.trim() ?? "";
        const nameDark = localStorage.getItem("lasca.local.nameDark")?.trim() ?? "";
        if (nameLight) localIdentityOverrides.W = { displayName: nameLight };
        else delete localIdentityOverrides.W;
        if (nameDark) localIdentityOverrides.B = { displayName: nameDark };
        else delete localIdentityOverrides.B;
      } catch {
        // ignore
      }
    };

    const syncPanels = (): void => {
      syncLocalStorageIntoIdentityOverrides();
      const boardSvg = opts.appRoot.querySelector("#boardWrap svg") as SVGSVGElement | null;
      const flipped = boardSvg ? isBoardFlipped(boardSvg) : false;
      const topColor = flipped ? "W" : "B";
      const bottomColor = flipped ? "B" : "W";
      const snapshot = buildSnapshotWithOverrides(controller.getPlayerShellSnapshot(), bottomColor);

      topPanel.update(snapshot.players[topColor]);
      bottomPanel.update(snapshot.players[bottomColor]);
      scheduleBoardFit();
    };

    controller.addHistoryChangeCallback(() => syncPanels());
    controller.addShellSnapshotChangeCallback(() => syncPanels());
    controller.addAnalysisModeChangeCallback(() => syncPanels());
    for (const selector of ["#aiWhiteSelect", "#aiBlackSelect", "#botWhiteSelect", "#botBlackSelect"]) {
      const control = opts.appRoot.querySelector(selector) as HTMLSelectElement | null;
      control?.addEventListener("change", () => {
        controller.clearSeatDisplayNamesSavePin();
        syncPanels();
      });
    }
    window.addEventListener("resize", scheduleBoardFit);
    window.visualViewport?.addEventListener("resize", scheduleBoardFit);
    const fitResizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => scheduleBoardFit());
    fitResizeObserver?.observe(centerArea);
    fitResizeObserver?.observe(boardStage);
    fitResizeObserver?.observe(topPanel.element);
    fitResizeObserver?.observe(bottomPanel.element);
    void loadSignedInViewerOverride(initialSnapshot);
    window.setInterval(syncPanels, 1000);
    syncPanels();

    const commitExplicitLocalPlayMode = (): void => {
      if (!startupPlayLockUiActive) return;
      replaceHistoryWithExplicitLocalMode();
      startupPlayLockUiActive = false;
      boardAnchor.style.pointerEvents = "";
      boardAnchor.style.cursor = "";
      if (nestedBoardWrapEl) {
        nestedBoardWrapEl.style.pointerEvents = "";
        nestedBoardWrapEl.style.cursor = "";
      }
      controller.setShellStartupPlayLockEnabled(false);
      controller.setInputEnabled(true);
      syncPanels();
      // `syncConfiguredPlayerNames` may have run before ?mode=local (startup lock → generic labels).
      try {
        const w = window as Window & { syncConfiguredPlayerNames?: () => void };
        if (typeof w.syncConfiguredPlayerNames === "function") w.syncConfiguredPlayerNames();
      } catch {
        // ignore
      }
      scheduleBoardFit();
    };
    forwardCommitExplicitLocalPlayMode = commitExplicitLocalPlayMode;
    playHubOfflineBotReloadControllerRef = controller;

    didBindController = true;
  };

  const enhanceDesktopSidebars = (): void => {
    const leftSidebar = opts.appRoot.querySelector("#leftSidebar") as HTMLElement | null;
    const rightSidebar = opts.appRoot.querySelector("#rightSidebar") as HTMLElement | null;
    if (!leftSidebar || !rightSidebar) return;
    if (leftSidebar.dataset.gameShellEnhanced === "1" && rightSidebar.dataset.gameShellEnhanced === "1") return;
    let revealLegacyTargetPanels: (() => void) | null = null;

    const createPairTabs = (): { root: HTMLDivElement; legacyBtn: HTMLButtonElement; shellBtn: HTMLButtonElement } => {
      const root = document.createElement("div");
      root.className = "gameShellDesktopPairTabs";

      const legacyBtn = document.createElement("button");
      legacyBtn.type = "button";
      legacyBtn.className = "gameShellDesktopPairTab";
      legacyBtn.textContent = "Game panels";

      const shellBtn = document.createElement("button");
      shellBtn.type = "button";
      shellBtn.className = "gameShellDesktopPairTab";
      shellBtn.textContent = "Shell panels";

      root.append(legacyBtn, shellBtn);
      return { root, legacyBtn, shellBtn };
    };

    const decorateLegacyBody = (sidebar: HTMLElement): HTMLElement | null => {
      const legacyBody = Array.from(sidebar.children).find((child) => child.classList.contains("sidebarBody")) as HTMLElement | null;
      if (!legacyBody) return null;
      legacyBody.classList.add("gameShellLegacySidebarBody");
      return legacyBody;
    };

    const createShellLeftBody = (): { shellBody: HTMLDivElement; setActiveSection: (sectionId: string) => void } => {
      const shellBody = document.createElement("div");
      shellBody.className = "sidebarBody gameShellDesktopShellBody";

      const intro = document.createElement("section");
      intro.className = "gameShellDesktopShellCard";
      intro.innerHTML = `
        <p class="gameShellDesktopShellEyebrow">Shell navigation</p>
        <h2 class="gameShellDesktopShellTitle"></h2>
        <p class="gameShellDesktopShellText"></p>
        <div class="gameShellDesktopShellMeta"></div>
      `;
      (intro.querySelector(".gameShellDesktopShellTitle") as HTMLElement).textContent = opts.title;
      (intro.querySelector(".gameShellDesktopShellText") as HTMLElement).textContent = opts.subtitle;
      const meta = intro.querySelector(".gameShellDesktopShellMeta") as HTMLElement;
      for (const item of opts.meta ?? []) {
        const badge = document.createElement("span");
        badge.className = "gameShellDesktopShellMetaBadge";
        badge.textContent = item;
        meta.appendChild(badge);
      }

      const navCard = document.createElement("section");
      navCard.className = "gameShellDesktopShellCard";
      const navEyebrow = document.createElement("p");
      navEyebrow.className = "gameShellDesktopShellEyebrow";
      navEyebrow.textContent = opts.breadcrumb;
      const navTitle = document.createElement("h2");
      navTitle.className = "gameShellDesktopShellTitle";
      navTitle.textContent = "Navigate this game";
      const navList = document.createElement("div");
      navList.className = "gameShellDesktopNavList";
      const navButtons = new Map<string, HTMLButtonElement>();

      for (const item of opts.navItems ?? []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gameShellDesktopNavButton";
        button.innerHTML = `<span class="gameShellDesktopNavLabel">${item.label}</span><span class="gameShellDesktopNavDescription">${buildDesktopNavDescription(item)}</span>`;
        button.addEventListener("click", () => {
          setActiveSection(item.id);
          item.onSelect?.();
        });
        navButtons.set(item.id, button);
        navList.appendChild(button);
      }

      navCard.append(navEyebrow, navTitle, navList);

      const mainScroll = document.createElement("div");
      mainScroll.className = "gameShellDesktopShellMainScroll";
      mainScroll.append(intro, navCard);

      const userFooter = document.createElement("div");
      userFooter.className = "gameShellDesktopUserFooter";
      userFooter.hidden = true;

      const userRow = document.createElement("div");
      userRow.className = "gameShellDesktopUserRow";

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "gameShellDesktopUserAvatar";
      const avatarImg = document.createElement("img");
      avatarImg.className = "gameShellDesktopUserAvatarImg";
      avatarImg.alt = "";
      avatarImg.decoding = "async";
      avatarImg.hidden = true;
      const avatarFallback = document.createElement("span");
      avatarFallback.className = "gameShellDesktopUserAvatarFallback";
      avatarWrap.append(avatarImg, avatarFallback);

      const userName = document.createElement("span");
      userName.className = "gameShellDesktopUserName";

      userRow.append(avatarWrap, userName);
      userFooter.appendChild(userRow);

      const applyUserFooter = (profile: { displayName: string; avatarUrl: string | null } | null): void => {
        if (!profile) {
          userFooter.hidden = true;
          return;
        }
        userFooter.hidden = false;
        userName.textContent = profile.displayName;
        const initial = profile.displayName.trim().charAt(0).toUpperCase() || "?";
        avatarFallback.textContent = initial;

        const showImg = (): void => {
          avatarImg.hidden = false;
          avatarFallback.hidden = true;
        };
        const showFallback = (): void => {
          avatarImg.removeAttribute("src");
          avatarImg.hidden = true;
          avatarFallback.hidden = false;
        };

        if (profile.avatarUrl) {
          avatarImg.hidden = true;
          avatarFallback.hidden = false;
          avatarImg.onload = showImg;
          avatarImg.onerror = showFallback;
          avatarImg.src = profile.avatarUrl;
          if (avatarImg.complete && avatarImg.naturalWidth > 0) showImg();
        } else {
          showFallback();
        }
      };

      shellBody.classList.add("gameShellDesktopShellBody--leftNav");
      shellBody.append(mainScroll, userFooter);
      void fetchSignedInUserProfileForShell().then(applyUserFooter);

      return {
        shellBody,
        setActiveSection: (sectionId: string) => {
          for (const [id, button] of navButtons) {
            const isActive = id === sectionId;
            button.classList.toggle("isActive", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
          }
        },
      };
    };

    const createShellRightBody = (): { shellBody: HTMLDivElement; setActiveSection: (sectionId: string) => void } => {
      const shellBody = document.createElement("div");
      shellBody.className = "sidebarBody gameShellDesktopShellBody";

      const openNavItemTarget = (item: GameShellNavItem): void => {
        if (item.targetSelector) {
          revealLegacyTargetPanels?.();
          const target = document.querySelector(item.targetSelector) as HTMLElement | null;
          target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        }
        item.onSelect?.();
      };

      const actionCard = document.createElement("section");
      actionCard.className = "gameShellDesktopShellCard";
      const sectionPanels = new Map<string, HTMLElement>();

      const findNavItem = (preferredIds: readonly string[]): GameShellNavItem | null => {
        for (const id of preferredIds) {
          const found = (opts.navItems ?? []).find((item) => item.id === id);
          if (found) return found;
        }
        return null;
      };

      const createNavAction = (preferredIds: readonly string[], fallbackLabel: string, fallbackDescription: string): PlayHubAction | null => {
        const navItem = findNavItem(preferredIds);
        if (!navItem) return null;
        return {
          label: fallbackLabel,
          description: fallbackDescription,
          onSelect: () => {
            setActiveSection(navItem.id);
            openNavItemTarget(navItem);
          },
        };
      };

      const createSectionActionButton = (item: GameShellNavItem): HTMLButtonElement => {
        const copy = buildDesktopSectionCopy(item);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gameShellDesktopActionButton";
        button.innerHTML = `<span class="gameShellDesktopActionLabel">${copy.actionLabel}</span><span class="gameShellDesktopActionDescription">${copy.actionDescription}</span>`;
        button.addEventListener("click", () => {
          setActiveSection(item.id);
          openNavItemTarget(item);
        });
        return button;
      };

      const createSectionPanel = (item: GameShellNavItem): HTMLElement => {
        const copy = buildDesktopSectionCopy(item);
        const panel = document.createElement("div");
        panel.className = "gameShellDesktopSectionPanel";
        panel.dataset.sectionId = item.id;

        const introCard = document.createElement("section");
        introCard.className = "gameShellDesktopShellCard";
        introCard.innerHTML = `
          <p class="gameShellDesktopShellEyebrow">${opts.breadcrumb}</p>
          <h2 class="gameShellDesktopShellTitle">${copy.title}</h2>
          <p class="gameShellDesktopShellText">${copy.description}</p>
        `;
        panel.appendChild(introCard);

        const itemActionCard = document.createElement("section");
        itemActionCard.className = "gameShellDesktopShellCard";
        const actionList = document.createElement("div");
        actionList.className = "gameShellDesktopActionList";
        actionList.appendChild(createSectionActionButton(item));

        const backToPlayHubButton = document.createElement("button");
        backToPlayHubButton.type = "button";
        backToPlayHubButton.className = "gameShellDesktopActionButton";
        backToPlayHubButton.innerHTML = '<span class="gameShellDesktopActionLabel">Back to Play Hub</span><span class="gameShellDesktopActionDescription">Return to the main Play Hub actions for this game.</span>';
        backToPlayHubButton.addEventListener("click", () => {
          setActiveSection("play");
        });
        actionList.appendChild(backToPlayHubButton);

        if (item.id === "rules" && opts.helpHref) {
          const helpLink = document.createElement("a");
          helpLink.className = "gameShellDesktopActionLink";
          helpLink.href = opts.helpHref;
          helpLink.target = "_blank";
          helpLink.rel = "noopener noreferrer";
          helpLink.innerHTML = `<span class="gameShellDesktopActionLabel">Open help guide</span><span class="gameShellDesktopActionDescription">Open the full reference page for this game in a separate tab.</span>`;
          actionList.appendChild(helpLink);
        }

        itemActionCard.appendChild(actionList);
        panel.appendChild(itemActionCard);
        return panel;
      };

      const playHub = createPlayHub({
        currentVariantId: opts.variantId,
        backHref: opts.backHref,
        helpHref: opts.helpHref,
        commitExplicitLocalPlayMode: () => forwardCommitExplicitLocalPlayMode?.(),
        confirmOfflineBotStartReloadIfNeeded: () => {
          const c = playHubOfflineBotReloadControllerRef;
          if (!c) return true;
          if (!shouldWarnOfflineNavigationLoss(c, opts.variantId)) return true;
          const ok = window.confirm(OFFLINE_BOT_START_RELOAD_CONFIRM_MESSAGE);
          if (ok) allowConfirmedNavigation();
          return ok;
        },
        onlineAction: createNavAction(
          ["online", "status", "play"],
          "Review live game status",
          "Open the current room, connection, and match-status controls already present on this page.",
        ),
        botAction: createNavAction(
          ["bot", "tools"],
          "Open bot controls",
          "Jump straight to the existing bot or AI control surface for this game.",
        ),
        localAction: createNavAction(
          ["status", "play"],
          "Open local setup controls",
          "Open the current page's setup and play controls before returning to the launcher for offline or local-seat actions.",
        ),
      });

      const playPanel = document.createElement("div");
      playPanel.className = "gameShellDesktopSectionPanel";
      playPanel.dataset.sectionId = "play";
      actionCard.appendChild(playHub.element);
      playPanel.appendChild(actionCard);
      sectionPanels.set("play", playPanel);
      shellBody.appendChild(playPanel);

      for (const item of opts.navItems ?? []) {
        if (item.id === "play") continue;
        const panel = createSectionPanel(item);
        sectionPanels.set(item.id, panel);
        shellBody.appendChild(panel);
      }

      return {
        shellBody,
        setActiveSection: (sectionId: string) => {
          const nextSectionId = sectionPanels.has(sectionId) ? sectionId : "play";
          for (const [id, panel] of sectionPanels) {
            panel.classList.toggle("isActive", id === nextSectionId);
          }
        },
      };
    };

    const leftLegacyBody = decorateLegacyBody(leftSidebar);
    const rightLegacyBody = decorateLegacyBody(rightSidebar);
    if (!leftLegacyBody || !rightLegacyBody) return;

    const showLegacyDesktopPanelToggle = !shouldHideLegacyDesktopPanelToggle();
    const leftTabs = showLegacyDesktopPanelToggle ? createPairTabs() : null;
    const rightTabs = showLegacyDesktopPanelToggle ? createPairTabs() : null;
    const leftShellBody = createShellLeftBody();
    const rightShellBody = createShellRightBody();
    const optionsHost = leftLegacyBody.querySelector('.panelSection[data-section="options"] .sectionContent') as HTMLElement | null;
    let desktopModeSelect: HTMLSelectElement | null = null;

    if (optionsHost && !optionsHost.querySelector('[data-ui="desktopShellMode"]') && showLegacyDesktopPanelToggle) {
      const row = document.createElement("div");
      row.dataset.ui = "desktopShellMode";
      row.style.display = "grid";
      row.style.gridTemplateColumns = "52px minmax(0, 1fr)";
      row.style.gap = "8px 2px";
      row.style.alignItems = "center";
      row.style.justifyItems = "start";
      row.style.fontSize = "12px";
      row.style.marginTop = "10px";

      const label = document.createElement("label");
      label.textContent = "UI";

      desktopModeSelect = document.createElement("select");
      desktopModeSelect.className = "panelSelect";
      desktopModeSelect.setAttribute("aria-label", "Desktop panel UI");

      const oldOption = document.createElement("option");
      oldOption.value = "legacy";
      oldOption.textContent = "Old";

      const newOption = document.createElement("option");
      newOption.value = "shell";
      newOption.textContent = "New";

      desktopModeSelect.append(oldOption, newOption);
      row.append(label, desktopModeSelect);
      optionsHost.insertBefore(row, optionsHost.firstChild);
    }

    leftSidebar.classList.add("gameShellSidebarEnhanced");
    rightSidebar.classList.add("gameShellSidebarEnhanced");
    leftSidebar.dataset.gameShellEnhanced = "1";
    rightSidebar.dataset.gameShellEnhanced = "1";

    if (!showLegacyDesktopPanelToggle) {
      const returnBar = document.createElement("div");
      returnBar.className = "gameShellDesktopPlayHubReturn";
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "gameShellDesktopPlayHubReturnBtn";
      backBtn.textContent = "Play hub";
      backBtn.setAttribute("aria-label", "Return to Play hub shell panels");
      returnBar.appendChild(backBtn);
      leftSidebar.insertBefore(returnBar, leftLegacyBody);
    }

    const leftShellSlot = document.createElement("div");
    leftShellSlot.className = "gameShellSidebarShellSlot";
    const rightShellSlot = document.createElement("div");
    rightShellSlot.className = "gameShellSidebarShellSlot";

    if (leftTabs && rightTabs) {
      leftLegacyBody.insertAdjacentElement("beforebegin", leftTabs.root);
      rightLegacyBody.insertAdjacentElement("beforebegin", rightTabs.root);
    }

    if (opts.backHref) {
      const columnBrand = document.createElement("div");
      columnBrand.className = "gameShellSidebarColumnBrand";
      const brandLink = document.createElement("a");
      brandLink.className = "gameShellSidebarColumnBrandLink";
      brandLink.href = opts.backHref;
      brandLink.title = "Start Page";
      brandLink.setAttribute("aria-label", "StackWorks · Start Page");
      renderLogo(brandLink, { placement: "desktop-header", alt: "StackWorks" });
      columnBrand.appendChild(brandLink);
      const brandRef = leftTabs?.root ?? leftLegacyBody;
      leftSidebar.insertBefore(columnBrand, brandRef);
    }

    leftLegacyBody.insertAdjacentElement("afterend", leftShellSlot);
    rightLegacyBody.insertAdjacentElement("afterend", rightShellSlot);
    leftShellSlot.appendChild(leftShellBody.shellBody);
    rightShellSlot.appendChild(rightShellBody.shellBody);

    syncGameShellBodiesHost = (): void => {
      if (!leftShellSlot.isConnected || !rightShellSlot.isConnected) return;
      const inMenu = mobileShellPanels.contains(leftShellBody.shellBody);
      // Only hoist shell bodies into the Menu overlay when the page uses **menu** panel layout,
      // where `.sidebar { display: none }` would hide them. In **panels** layout, portrait sidebars
      // stay visible (stacked strips); keep bodies in the sidebar slots so Shell panels remain on-screen.
      const wantBodiesInMenu = isLegacyMenuLayoutActive() && !preferShellBodiesInSidebarForFullscreen;
      if (wantBodiesInMenu) {
        if (!inMenu) {
          mobileShellPanels.append(leftShellBody.shellBody, rightShellBody.shellBody);
        }
        shell.classList.add("gameShellRoot--compactShellMenu");
      } else {
        if (inMenu) {
          leftShellSlot.appendChild(leftShellBody.shellBody);
          rightShellSlot.appendChild(rightShellBody.shellBody);
        }
        shell.classList.remove("gameShellRoot--compactShellMenu");
      }
    };

    syncDesktopShellSection = (sectionId: string) => {
      leftShellBody.setActiveSection(sectionId);
      rightShellBody.setActiveSection(sectionId);
    };

    const allButtons: HTMLButtonElement[] =
      leftTabs && rightTabs
        ? [leftTabs.legacyBtn, leftTabs.shellBtn, rightTabs.legacyBtn, rightTabs.shellBtn]
        : [];

    const applyMode = (mode: DesktopPanelMode): void => {
      writeDesktopPanelMode(mode);
      leftSidebar.dataset.gameShellPanelMode = mode;
      rightSidebar.dataset.gameShellPanelMode = mode;
      if (desktopModeSelect) {
        desktopModeSelect.value = mode;
      }
      compactPanelModeSelect.value = mode;
      for (const button of allButtons) {
        const isShell =
          (leftTabs && button === leftTabs.shellBtn) || (rightTabs && button === rightTabs.shellBtn);
        const isActive = mode === (isShell ? "shell" : "legacy");
        button.classList.toggle("isActive", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    };
    revealLegacyTargetPanels = () => applyMode("legacy");

    if (!showLegacyDesktopPanelToggle) {
      const back = leftSidebar.querySelector(".gameShellDesktopPlayHubReturnBtn") as HTMLButtonElement | null;
      back?.addEventListener("click", () => applyMode("shell"));
    }

    if (leftTabs && rightTabs) {
      for (const button of [leftTabs.legacyBtn, rightTabs.legacyBtn]) {
        button.addEventListener("click", () => applyMode("legacy"));
      }
      for (const button of [leftTabs.shellBtn, rightTabs.shellBtn]) {
        button.addEventListener("click", () => applyMode("shell"));
      }
    }
    desktopModeSelect?.addEventListener("change", () => {
      applyMode(desktopModeSelect?.value === "shell" ? "shell" : "legacy");
    });

    compactPanelModeSelect.addEventListener("change", () => {
      applyMode(compactPanelModeSelect.value === "shell" ? "shell" : "legacy");
    });

    syncCompactPanelSwitcher = (): void => {
      if (!showLegacyDesktopPanelToggle) {
        shell.dataset.gameShellCompactLeading = "menu";
        compactPanelModeSelect.hidden = true;
        compactTrigger.hidden = false;
        return;
      }
      if (isLegacyMenuLayoutActive()) {
        shell.dataset.gameShellCompactLeading = "menu";
        compactPanelModeSelect.hidden = true;
        compactTrigger.hidden = false;
      } else {
        shell.dataset.gameShellCompactLeading = "panelSelect";
        compactPanelModeSelect.hidden = false;
        compactTrigger.hidden = true;
        closeCompactMenu(false);
        compactPanelModeSelect.value = readDesktopPanelMode();
      }
    };

    const syncDesktopMode = (): void => {
      const mode = readDesktopPanelMode();
      if (desktopModeSelect) {
        desktopModeSelect.disabled = !desktopMedia?.matches;
      }
      applyMode(mode);
      syncGameShellBodiesHost?.();
      syncCompactPanelSwitcher?.();
    };

    desktopMedia?.addEventListener?.("change", syncDesktopMode);
    syncDesktopMode();
  };

  const appSlot = document.createElement("div");
  appSlot.className = "gameShellAppSlot";

  const parent = opts.appRoot.parentElement;
  if (!parent) {
    throw new Error("Game shell root must have a parent element.");
  }

  parent.insertBefore(shell, opts.appRoot);
  compactBar.append(compactPanelModeSelect, compactTrigger, compactBarBrand, compactBarTrail);
  shell.append(compactOverlay, compactBar, header, appSlot);
  appSlot.appendChild(opts.appRoot);
  enhanceDesktopSidebars();

  const initialActiveSectionId = (() => {
    const persistedGameSection = initialShellState.activeGame === opts.variantId ? initialShellState.gameSection : null;
    if (persistedGameSection && (opts.navItems ?? []).some((item) => item.id === persistedGameSection)) {
      return persistedGameSection;
    }
    return opts.activeSectionId ?? (opts.navItems?.[0]?.id ?? "");
  })();

  setActiveSection(initialActiveSectionId);
  syncCompactState();
  scheduleLegacyHamburgerOffsetSync();

  return {
    setActiveSection,
    bindController,
    commitExplicitLocalPlayMode: () => forwardCommitExplicitLocalPlayMode?.(),
  };
}