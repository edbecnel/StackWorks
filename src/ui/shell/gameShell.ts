import { renderLogo } from "../branding/logo";
import { createTabs } from "../navigation/tabs";
import { isBoardFlipped } from "../../render/boardFlip";
import { createPlayerIdentityPanel } from "../player/playerIdentityPanel";
import type { GameController } from "../../controller/gameController";
import type { Player, PlayerIdentity, PlayerShellSnapshot } from "../../types";

export interface GameShellNavItem {
  id: string;
  label: string;
  targetSelector?: string;
  onSelect?: () => void;
}

export interface GameShellOptions {
  appRoot: HTMLElement;
  breadcrumb: string;
  title: string;
  subtitle: string;
  meta?: readonly string[];
  backHref?: string;
  helpHref?: string;
  navItems?: readonly GameShellNavItem[];
  activeSectionId?: string;
}

export interface GameShellController {
  setActiveSection(sectionId: string): void;
  bindController(controller: GameController): void;
}

const GAME_SHELL_STYLE_ID = "stackworks-game-shell-style";
const COMPACT_GAME_SHELL_MEDIA = "(max-width: 820px) and (orientation: portrait)";
const DESKTOP_GAME_SHELL_MEDIA = "(min-width: 821px)";
const DESKTOP_PANEL_MODE_LS_KEY = "stackworks.gameShell.desktopPanelMode";

type DesktopPanelMode = "legacy" | "shell";

type AuthMeResponse = {
  ok: true;
  user: {
    displayName: string;
    avatarUrl?: string;
  } | null;
};

function readDesktopPanelMode(): DesktopPanelMode {
  try {
    const raw = localStorage.getItem(DESKTOP_PANEL_MODE_LS_KEY);
    return raw === "shell" ? "shell" : "legacy";
  } catch {
    return "legacy";
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

    .gameShellCompactBar {
      align-items: center;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(44, 61, 129, 0.96), rgba(52, 58, 137, 0.92)),
        rgba(24, 24, 24, 0.94);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(12px);
    }

    .gameShellCompactBarBrand {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      flex: 0 0 auto;
    }

    .gameShellCompactBarBrand img {
      width: 20px;
      height: 20px;
      display: block;
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

    .gameShellDesktopShellBody {
      padding: 10px;
      flex: 1 1 auto;
      overflow: auto;
      flex-direction: column;
      gap: 10px;
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

    :fullscreen .gameShellHeader,
    :fullscreen .gameShellCompactBar,
    :fullscreen .gameShellCompactOverlay,
    :fullscreen .gameShellCompactTrigger,
    :fullscreen .gameShellCompactClose {
      display: none !important;
    }

    @media (max-width: 820px) {
      .gameShellRoot {
        padding: 10px 10px 0;
        gap: 10px;
      }

      .gameShellHeaderTop {
        grid-template-columns: minmax(0, 1fr);
      }

      .gameShellHeaderActions {
        justify-content: flex-start;
      }
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

      .gameShellAppSlot > #appRoot > #centerArea.gameShellCenterArea {
        justify-content: flex-start;
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

      .gameShellDesktopPairTabs {
        display: flex;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellDesktopShellBody {
        display: none !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="legacy"] > .gameShellLegacySidebarBody {
        display: flex !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellDesktopShellBody {
        display: flex !important;
      }

      .sidebar.gameShellSidebarEnhanced[data-game-shell-panel-mode="shell"] > .gameShellLegacySidebarBody {
        display: none !important;
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
        padding-left: max(10px, env(safe-area-inset-left));
        z-index: 71;
      }

      .gameShellCompactBarBrand {
        display: inline-flex;
        width: 28px;
        height: 28px;
        border-radius: 9px;
      }

      .gameShellCompactBarBrand img {
        width: 17px;
        height: 17px;
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

      .gameShellHeader {
        position: fixed;
        top: calc(max(10px, env(safe-area-inset-top)) + 58px);
        left: max(10px, env(safe-area-inset-left));
        right: max(10px, env(safe-area-inset-right));
        max-height: calc(var(--app-height, 100dvh) - max(20px, env(safe-area-inset-top)) - max(20px, env(safe-area-inset-bottom)) - 58px);
        overflow: auto;
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

      .gameShellRoot.navOpen .gameShellCompactTrigger {
        background: rgba(28, 28, 28, 0.9);
      }

      .gameShellHeaderTop {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .gameShellPlayerPanel {
        gap: 4px;
        padding: 6px 8px;
        border-radius: 12px;
      }

      .gameShellPlayerIdentityRow {
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

      .gameShellPlayerRole,
      .gameShellPlayerDetail {
        display: none;
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
        gap: 4px;
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

    @media (max-width: 560px) {
      .gameShellBrand {
        width: 40px;
        height: 40px;
      }

      .gameShellPlayerPanel {
        padding: 9px 10px;
      }

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
  `;

  document.head.appendChild(style);
}

export function initGameShell(opts: GameShellOptions): GameShellController {
  ensureGameShellStyles();
  document.body.classList.add("stackworksGameShellEnabled");

  const shell = document.createElement("div");
  shell.className = "gameShellRoot";

  const compactOverlay = document.createElement("div");
  compactOverlay.className = "gameShellCompactOverlay";

  const compactBar = document.createElement("div");
  compactBar.className = "gameShellCompactBar";

  const compactTrigger = document.createElement("button");
  compactTrigger.type = "button";
  compactTrigger.className = "gameShellCompactTrigger";
  compactTrigger.textContent = "Menu";
  compactTrigger.setAttribute("aria-expanded", "false");
  compactTrigger.setAttribute("aria-label", `Open ${opts.title} menu`);

  const compactBarBrand = document.createElement("span");
  compactBarBrand.className = "gameShellCompactBarBrand";
  compactBarBrand.setAttribute("aria-hidden", "true");
  renderLogo(compactBarBrand, { variant: "icon", ariaHidden: true });

  const compactBarTitle = document.createElement("div");
  compactBarTitle.className = "gameShellCompactBarTitle";
  compactBarTitle.textContent = opts.title;

  const desktopMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_GAME_SHELL_MEDIA)
    : null;

  const header = document.createElement("header");
  header.className = "gameShellHeader";

  const headerTop = document.createElement("div");
  headerTop.className = "gameShellHeaderTop";

  const identity = document.createElement("div");
  identity.className = "gameShellIdentity";

  const brand = document.createElement("span");
  brand.className = "gameShellBrand";
  brand.setAttribute("aria-hidden", "true");
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

  const syncCompactState = (): void => {
    const expanded = shell.classList.contains("navOpen");
    compactTrigger.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const closeCompactMenu = (): void => {
    shell.classList.remove("navOpen");
    syncCompactState();
  };

  const openCompactMenu = (): void => {
    if (!isCompactMode()) return;
    shell.classList.add("navOpen");
    syncCompactState();
  };

  const toggleCompactMenu = (): void => {
    if (!isCompactMode()) return;
    shell.classList.toggle("navOpen");
    syncCompactState();
  };

  const handleCompactViewportChange = (): void => {
    if (!isCompactMode()) {
      closeCompactMenu();
    } else {
      syncCompactState();
    }
  };

  compactTrigger.addEventListener("click", toggleCompactMenu);
  compactClose.addEventListener("click", closeCompactMenu);
  compactOverlay.addEventListener("click", closeCompactMenu);

  compactMedia?.addEventListener?.("change", handleCompactViewportChange);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCompactMenu();
  });

  if (opts.backHref) {
    const backLink = document.createElement("a");
    backLink.className = "gameShellAction";
    backLink.href = opts.backHref;
    backLink.textContent = "Start Page";
    backLink.addEventListener("click", closeCompactMenu);
    actions.appendChild(backLink);
  }

  if (opts.helpHref) {
    const helpLink = document.createElement("a");
    helpLink.className = "gameShellAction";
    helpLink.href = opts.helpHref;
    helpLink.target = "_blank";
    helpLink.rel = "noopener noreferrer";
    helpLink.textContent = "Help";
    helpLink.addEventListener("click", closeCompactMenu);
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
  header.appendChild(nav);

  const setActiveSection = (sectionId: string): void => {
    tabs.setActiveTab(sectionId);
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
    const topPanel = createPlayerIdentityPanel({ identity: initialSnapshot.players.B });
    const bottomPanel = createPlayerIdentityPanel({ identity: initialSnapshot.players.W });

    const localIdentityOverrides: Partial<Record<Player, Partial<PlayerIdentity>>> = {};
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

    const buildSnapshotWithOverrides = (snapshot: PlayerShellSnapshot): PlayerShellSnapshot => {
      const nextPlayers = { ...snapshot.players };
      for (const color of ["W", "B"] as const) {
        const override = localIdentityOverrides[color];
        if (!override) continue;
        nextPlayers[color] = { ...nextPlayers[color], ...override };
      }
      return { ...snapshot, players: nextPlayers };
    };

    const loadLocalAvatarOverride = async (snapshot: PlayerShellSnapshot): Promise<void> => {
      if (snapshot.mode !== "online" || snapshot.viewerRole !== "player" || !snapshot.viewerColor || !snapshot.serverUrl) return;
      try {
        const res = await fetch(`${snapshot.serverUrl.replace(/\/$/, "")}/api/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const body = await res.json() as AuthMeResponse;
        const rawAvatarUrl = typeof body?.user?.avatarUrl === "string" ? body.user.avatarUrl.trim() : "";
        if (!rawAvatarUrl) return;
        localIdentityOverrides[snapshot.viewerColor] = {
          ...(localIdentityOverrides[snapshot.viewerColor] ?? {}),
          avatarUrl: resolveServerAssetUrl(snapshot.serverUrl, rawAvatarUrl),
        };
        syncPanels();
      } catch {
        // ignore profile lookup failures
      }
    };

    const syncPanels = (): void => {
      const snapshot = buildSnapshotWithOverrides(controller.getPlayerShellSnapshot());
      const boardSvg = opts.appRoot.querySelector("#boardWrap svg") as SVGSVGElement | null;
      const flipped = boardSvg ? isBoardFlipped(boardSvg) : false;
      const topColor = flipped ? "W" : "B";
      const bottomColor = flipped ? "B" : "W";

      topPanel.update(snapshot.players[topColor]);
      bottomPanel.update(snapshot.players[bottomColor]);
      scheduleBoardFit();
    };

    controller.addHistoryChangeCallback(() => syncPanels());
    controller.addAnalysisModeChangeCallback(() => syncPanels());
    window.addEventListener("resize", scheduleBoardFit);
    window.visualViewport?.addEventListener("resize", scheduleBoardFit);
    const fitResizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => scheduleBoardFit());
    fitResizeObserver?.observe(centerArea);
    fitResizeObserver?.observe(boardStage);
    fitResizeObserver?.observe(topPanel.element);
    fitResizeObserver?.observe(bottomPanel.element);
    void loadLocalAvatarOverride(initialSnapshot);
    window.setInterval(syncPanels, 1000);
    syncPanels();
    didBindController = true;
  };

  const enhanceDesktopSidebars = (): void => {
    const leftSidebar = opts.appRoot.querySelector("#leftSidebar") as HTMLElement | null;
    const rightSidebar = opts.appRoot.querySelector("#rightSidebar") as HTMLElement | null;
    if (!leftSidebar || !rightSidebar) return;
    if (leftSidebar.dataset.gameShellEnhanced === "1" && rightSidebar.dataset.gameShellEnhanced === "1") return;

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

    const createShellLeftBody = (): HTMLDivElement => {
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

      for (const item of opts.navItems ?? []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gameShellDesktopNavButton";
        button.innerHTML = `<span class="gameShellDesktopNavLabel">${item.label}</span><span class="gameShellDesktopNavDescription">Open the ${item.label.toLowerCase()} area inside this page.</span>`;
        button.addEventListener("click", () => {
          setActiveSection(item.id);
          if (item.targetSelector) {
            const target = document.querySelector(item.targetSelector) as HTMLElement | null;
            target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
          }
          item.onSelect?.();
        });
        navList.appendChild(button);
      }

      navCard.append(navEyebrow, navTitle, navList);
      shellBody.append(intro, navCard);
      return shellBody;
    };

    const createShellRightBody = (): HTMLDivElement => {
      const shellBody = document.createElement("div");
      shellBody.className = "sidebarBody gameShellDesktopShellBody";

      const actionCard = document.createElement("section");
      actionCard.className = "gameShellDesktopShellCard";
      actionCard.innerHTML = `
        <p class="gameShellDesktopShellEyebrow">Shell actions</p>
        <h2 class="gameShellDesktopShellTitle">Continue play</h2>
        <p class="gameShellDesktopShellText">Use the new shell pair for fast navigation while keeping the legacy controls available as a separate panel mode.</p>
      `;
      const actionList = document.createElement("div");
      actionList.className = "gameShellDesktopActionList";

      if (opts.backHref) {
        const backLink = document.createElement("a");
        backLink.className = "gameShellDesktopActionLink";
        backLink.href = opts.backHref;
        backLink.innerHTML = `<span class="gameShellDesktopActionLabel">Start Page</span><span class="gameShellDesktopActionDescription">Return to the launcher and variant selection.</span>`;
        actionList.appendChild(backLink);
      }

      if (opts.helpHref) {
        const helpLink = document.createElement("a");
        helpLink.className = "gameShellDesktopActionLink";
        helpLink.href = opts.helpHref;
        helpLink.target = "_blank";
        helpLink.rel = "noopener noreferrer";
        helpLink.innerHTML = `<span class="gameShellDesktopActionLabel">Help</span><span class="gameShellDesktopActionDescription">Open the rules and help page for this game.</span>`;
        actionList.appendChild(helpLink);
      }

      for (const item of (opts.navItems ?? []).slice(0, 3)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gameShellDesktopActionButton";
        button.innerHTML = `<span class="gameShellDesktopActionLabel">${item.label}</span><span class="gameShellDesktopActionDescription">Jump directly to the ${item.label.toLowerCase()} panel.</span>`;
        button.addEventListener("click", () => {
          setActiveSection(item.id);
          if (item.targetSelector) {
            const target = document.querySelector(item.targetSelector) as HTMLElement | null;
            target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
          }
          item.onSelect?.();
        });
        actionList.appendChild(button);
      }

      actionCard.appendChild(actionList);
      shellBody.appendChild(actionCard);
      return shellBody;
    };

    const leftLegacyBody = decorateLegacyBody(leftSidebar);
    const rightLegacyBody = decorateLegacyBody(rightSidebar);
    if (!leftLegacyBody || !rightLegacyBody) return;

    const leftTabs = createPairTabs();
    const rightTabs = createPairTabs();
    const leftShellBody = createShellLeftBody();
    const rightShellBody = createShellRightBody();
    const optionsHost = leftLegacyBody.querySelector('.panelSection[data-section="options"] .sectionContent') as HTMLElement | null;
    let desktopModeSelect: HTMLSelectElement | null = null;

    if (optionsHost && !optionsHost.querySelector('[data-ui="desktopShellMode"]')) {
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

    leftLegacyBody.insertAdjacentElement("beforebegin", leftTabs.root);
    rightLegacyBody.insertAdjacentElement("beforebegin", rightTabs.root);
    leftLegacyBody.insertAdjacentElement("afterend", leftShellBody);
    rightLegacyBody.insertAdjacentElement("afterend", rightShellBody);

    const allButtons = [leftTabs.legacyBtn, leftTabs.shellBtn, rightTabs.legacyBtn, rightTabs.shellBtn];

    const applyMode = (mode: DesktopPanelMode): void => {
      writeDesktopPanelMode(mode);
      leftSidebar.dataset.gameShellPanelMode = mode;
      rightSidebar.dataset.gameShellPanelMode = mode;
      if (desktopModeSelect) {
        desktopModeSelect.value = mode;
      }
      for (const button of allButtons) {
        const isShell = button === leftTabs.shellBtn || button === rightTabs.shellBtn;
        const isActive = mode === (isShell ? "shell" : "legacy");
        button.classList.toggle("isActive", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    };

    for (const button of [leftTabs.legacyBtn, rightTabs.legacyBtn]) {
      button.addEventListener("click", () => applyMode("legacy"));
    }
    for (const button of [leftTabs.shellBtn, rightTabs.shellBtn]) {
      button.addEventListener("click", () => applyMode("shell"));
    }
    desktopModeSelect?.addEventListener("change", () => {
      applyMode(desktopModeSelect?.value === "shell" ? "shell" : "legacy");
    });

    const syncDesktopMode = (): void => {
      if (desktopMedia?.matches) {
        if (desktopModeSelect) desktopModeSelect.disabled = false;
        applyMode(readDesktopPanelMode());
      } else {
        if (desktopModeSelect) {
          desktopModeSelect.disabled = true;
          desktopModeSelect.value = "legacy";
        }
        leftSidebar.dataset.gameShellPanelMode = "legacy";
        rightSidebar.dataset.gameShellPanelMode = "legacy";
      }
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
  compactBar.append(compactTrigger, compactBarBrand, compactBarTitle);
  shell.append(compactOverlay, compactBar, header, appSlot);
  appSlot.appendChild(opts.appRoot);
  enhanceDesktopSidebars();

  setActiveSection(opts.activeSectionId ?? (opts.navItems?.[0]?.id ?? ""));
  syncCompactState();

  return {
    setActiveSection,
    bindController,
  };
}