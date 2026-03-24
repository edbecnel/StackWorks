import { APP_SHELL_GAMES, START_PAGE_SHELL_NAV, getAppShellGame, type AppShellSectionId } from "../../config/appShellConfig";
import { GlobalSection, readShellState, updateShellState } from "../../config/shellState";
import { renderLogo } from "../branding/logo";
import { attachHoverFlyoutMenu } from "../navigation/flyoutMenu";
import { createAccountRailCard, type AccountRailCardState } from "../account/accountRailCard";
import type { VariantId } from "../../variants/variantTypes";

type StartPagePlayMode = "local" | "online";

type StartPageAppShellOptions = {
  contentRoot: HTMLElement;
  initialVariantId: VariantId;
  initialPlayMode: StartPagePlayMode;
  helpHref?: string;
  onSelectGame?: (variantId: VariantId) => void;
  onSelectPlayMode?: (playMode: StartPagePlayMode) => void;
  onOpenLobby?: () => void;
  onRequestAccountAction?: (action: "signup" | "login" | "manage" | "avatar-upload" | "logout") => void;
};

type UpdateSelectedGameOptions = {
  playMode?: StartPagePlayMode;
};

export type StartPageAppShellController = {
  setActiveSection(sectionId: AppShellSectionId): void;
  setSelectedGame(variantId: VariantId, opts?: UpdateSelectedGameOptions): void;
  setPlayMode(playMode: StartPagePlayMode): void;
  setAccountState(state: AccountRailCardState): void;
};

const SHELL_STYLE_ID = "stackworks-app-shell-style";
const APP_SHELL_DESKTOP_MEDIA = "(min-width: 1040px)";
const APP_SHELL_COMPACT_RAIL_MEDIA = "(max-width: 1279px)";

function ensureShellStyles(): void {
  if (document.getElementById(SHELL_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SHELL_STYLE_ID;
  style.textContent = `
    body.stackworksAppShellEnabled {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      background:
        radial-gradient(circle at top left, rgba(206, 162, 80, 0.18), transparent 26%),
        radial-gradient(circle at bottom right, rgba(92, 128, 186, 0.18), transparent 22%),
        linear-gradient(180deg, #121212 0%, #181818 100%);
    }

    body.stackworksAppShellNavLocked {
      overflow: hidden;
      touch-action: none;
    }

    .appShellRoot {
      position: relative;
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .appShellOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
      z-index: 30;
    }

    .appShellRoot.leftDrawerOpen .appShellOverlay,
    .appShellRoot.rightDrawerOpen .appShellOverlay {
      opacity: 1;
      pointer-events: auto;
    }

    .appShellRail,
    .appShellRightRail {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      position: fixed;
      top: 0;
      bottom: 0;
      width: min(320px, calc(100vw - 28px));
      margin: 0;
      padding: 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background:
        linear-gradient(180deg, rgba(26, 26, 26, 0.98), rgba(18, 18, 18, 0.98)),
        #141414;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0 20px 20px 0;
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.24);
      z-index: 40;
      overflow: auto;
      transition: transform 160ms ease;
    }

    .appShellRail {
      left: 0;
      transform: translateX(calc(-100% - 16px));
    }

    .appShellRightRail {
      right: 0;
      left: auto;
      border-radius: 20px 0 0 20px;
      transform: translateX(calc(100% + 16px));
    }

    .appShellRoot.leftDrawerOpen .appShellRail {
      transform: translateX(0);
    }

    .appShellRoot.rightDrawerOpen .appShellRightRail {
      transform: translateX(0);
    }

    .appShellRailClose {
      display: inline-flex;
      align-self: flex-end;
      justify-self: end;
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 999px;
      min-height: 34px;
      padding: 8px 12px;
      cursor: pointer;
    }

    .appShellBrand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .appShellBrandMark {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      flex: 0 0 auto;
    }

    .appShellBrandMark img {
      width: 22px;
      height: 22px;
      display: block;
    }

    .appShellBrandLockup {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .appShellBrandWordmark {
      display: block;
      max-width: 150px;
      width: 100%;
      height: auto;
    }

    .appShellBrandEyebrow {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.54);
    }

    .appShellNav {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 0 0 auto;
      min-height: 0;
    }

    .appShellNavButton {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 14px;
      padding: 12px 13px;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .appShellNavButton:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(255, 255, 255, 0.14);
    }

    .appShellNavButton.isActive {
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.2), rgba(202, 157, 78, 0.08));
      border-color: rgba(232, 191, 112, 0.36);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .appShellNavLabel {
      font-size: 13px;
      font-weight: 700;
    }

    .appShellNavShortLabel {
      display: none;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .appShellNavDescription {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.62);
    }

    .appShellRailMeta {
      font-size: 11px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.58);
      padding: 12px 13px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .appShellRailFooter {
      margin-top: 0;
      display: grid;
      gap: 12px;
      flex: 0 0 auto;
      min-height: 0;
    }

    .appShellMain {
      position: relative;
      z-index: 1;
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
    }

    .appShellHeader {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      position: sticky;
      top: max(8px, env(safe-area-inset-top));
      z-index: 12;
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
        rgba(0, 0, 0, 0.18);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
    }

    .appShellMenuToggle,
    .appShellGamesToggle,
    .appShellHeaderAction {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 999px;
      padding: 9px 14px;
      text-decoration: none;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 36px;
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
    }

    .appShellMenuToggle,
    .appShellGamesToggle {
      display: inline-flex;
    }

    .appShellMenuToggle:hover,
    .appShellGamesToggle:hover,
    .appShellHeaderAction:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .appShellHeaderBrand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      text-decoration: none;
    }

    .appShellHeaderBrandMark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      flex: 0 0 auto;
    }

    .appShellHeaderBrandMark img {
      width: 20px;
      height: 20px;
      display: block;
    }

    .appShellHeaderBrandWordmark {
      display: block;
      width: min(118px, 100%);
      max-width: 100%;
      height: auto;
    }

    .appShellHeaderBrandWordmark img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
    }

    .appShellTitleBlock {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }

    .appShellBreadcrumb {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.52);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .appShellTitle {
      margin: 0;
      font-size: clamp(20px, 2.6vw, 28px);
      line-height: 1.1;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.97);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .appShellSubtitle {
      margin: 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.68);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .appShellBody {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      min-height: 0;
    }

    .appShellContentSlot {
      min-width: 0;
      min-height: 0;
    }

    .appShellContentSlot > .wrap {
      max-width: none;
      margin: 0;
      padding: 0;
    }

    .appShellContentSlot > .wrap > header {
      margin-bottom: 16px;
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.18);
    }

    .appShellContentSlot > .wrap > header h1 {
      font-size: 16px;
    }

    .appShellSidePanel {
      min-width: 0;
      min-height: 0;
      display: grid;
      gap: 12px;
    }

    .appShellRightRail {
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .appShellCard {
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
        rgba(0, 0, 0, 0.18);
      padding: 15px 16px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
    }

    .appShellCardEyebrow {
      margin: 0 0 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.54);
    }

    .appShellCardTitle {
      margin: 0;
      font-size: 17px;
      font-weight: 720;
      color: rgba(255, 255, 255, 0.97);
    }

    .appShellCardText {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.7);
    }

    .appShellMetaList {
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
    }

    .appShellMetaItem {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
    }

    .appShellMetaLabel {
      color: rgba(255, 255, 255, 0.56);
    }

    .appShellMetaValue {
      color: rgba(255, 255, 255, 0.92);
      text-align: right;
    }

    .appShellBadgeRow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .appShellBadge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.88);
    }

    .appShellQuickLinks {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .appShellChoiceGrid {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .appShellChoiceButton {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 14px;
      padding: 12px 13px;
      text-align: left;
      cursor: pointer;
    }

    .appShellChoiceButton:hover,
    .appShellChoiceButton:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }

    .appShellChoiceButton.isActive {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }

    .appShellChoiceLabel {
      display: block;
      font-size: 12px;
      font-weight: 700;
    }

    .appShellChoiceDescription {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.62);
    }

    .appShellChoiceMeta {
      display: inline-flex;
      align-items: center;
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.76);
      letter-spacing: 0.02em;
    }

    .appShellQuickLink {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.9);
      border-radius: 12px;
      padding: 11px 12px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
    }

    .appShellQuickLink:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .appShellNav,
    .appShellContentSlot,
    .appShellSidePanel {
      scrollbar-width: thin;
      scrollbar-color: rgba(82, 82, 82, 0.68) transparent;
    }

    .appShellNav::-webkit-scrollbar,
    .appShellContentSlot::-webkit-scrollbar,
    .appShellSidePanel::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    .appShellNav::-webkit-scrollbar-track,
    .appShellContentSlot::-webkit-scrollbar-track,
    .appShellSidePanel::-webkit-scrollbar-track {
      background: transparent;
    }

    .appShellNav::-webkit-scrollbar-thumb,
    .appShellContentSlot::-webkit-scrollbar-thumb,
    .appShellSidePanel::-webkit-scrollbar-thumb {
      background: rgba(82, 82, 82, 0.68);
      border-radius: 999px;
      border: 1px solid transparent;
      background-clip: padding-box;
    }

    .appShellNav::-webkit-scrollbar-thumb:hover,
    .appShellContentSlot::-webkit-scrollbar-thumb:hover,
    .appShellSidePanel::-webkit-scrollbar-thumb:hover {
      background: rgba(146, 146, 146, 0.92);
    }

    .appShellLaunchLink {
      margin-top: 12px;
      width: 100%;
      justify-content: center;
    }

    .appShellCardActions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }

    .appShellCardAction {
      min-width: 0;
      text-align: center;
    }

    @media (min-width: 1040px) {
      body.stackworksAppShellEnabled {
        overflow: hidden;
      }

      .appShellRoot {
        grid-template-columns: 260px minmax(0, 1fr) 320px;
        height: 100vh;
        min-height: 100vh;
      }

      .appShellRoot[data-rail-mode="compact"] {
        grid-template-columns: 92px minmax(0, 1fr) 320px;
      }

      .appShellOverlay,
      .appShellMenuToggle,
      .appShellGamesToggle,
      .appShellHeaderBrand {
        display: none;
      }

      .appShellRail,
      .appShellRightRail {
        position: sticky;
        top: 0;
        bottom: auto;
        width: auto;
        margin: 0;
        height: 100vh;
        min-height: 100vh;
        overflow: hidden;
        transform: none;
        padding: 22px 16px 18px;
        border-radius: 0;
        box-shadow: none;
        z-index: 1;
        transition: none;
      }

      .appShellRail {
        left: auto;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
      }

      .appShellRightRail {
        right: auto;
        border-left: 1px solid rgba(255, 255, 255, 0.08);
      }

      .appShellRailClose {
        display: none;
      }

      .appShellNav {
        flex: 1 1 auto;
        overflow: auto;
        padding-right: 2px;
      }

      .appShellRailFooter {
        margin-top: auto;
      }

      .appShellMain {
        height: 100vh;
        padding: 20px;
      }

      .appShellHeader {
        position: relative;
        top: auto;
        z-index: 1;
      }

      .appShellBody {
        grid-template-columns: minmax(0, 1fr);
        min-height: 0;
        align-items: stretch;
      }

      .appShellContentSlot,
      .appShellRightRail {
        overflow: auto;
        padding-right: 4px;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellRail {
        padding: 18px 10px 14px;
        align-items: center;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellBrand {
        justify-content: center;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellBrandLockup,
      .appShellRoot[data-rail-mode="compact"] .appShellRailMeta,
      .appShellRoot[data-rail-mode="compact"] .accountRailCardEyebrow,
      .appShellRoot[data-rail-mode="compact"] .accountRailCardEmail,
      .appShellRoot[data-rail-mode="compact"] .accountRailCardMessage,
      .appShellRoot[data-rail-mode="compact"] .accountRailCardMeta,
      .appShellRoot[data-rail-mode="compact"] .accountRailCardActions {
        display: none;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellNav {
        width: 100%;
        align-items: center;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellNavButton {
        width: 100%;
        min-height: 54px;
        padding: 10px 8px;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellNavLabel,
      .appShellRoot[data-rail-mode="compact"] .appShellNavDescription {
        display: none;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellNavShortLabel {
        display: block;
      }

      .appShellRoot[data-rail-mode="compact"] .appShellRailFooter {
        width: 100%;
        justify-items: center;
      }

      .appShellRoot[data-rail-mode="compact"] .accountRailCard {
        width: 100%;
        padding: 10px 8px;
      }

      .appShellRoot[data-rail-mode="compact"] .accountRailCardBody {
        margin-top: 0;
      }

      .appShellRoot[data-rail-mode="compact"] .accountRailCardIdentity {
        grid-template-columns: 1fr;
        gap: 8px;
        justify-items: center;
        text-align: center;
      }

      .appShellRoot[data-rail-mode="compact"] .accountRailCardName {
        font-size: 11px;
        line-height: 1.3;
      }
    }

    @media (max-width: 699px) {
      .appShellBreadcrumb {
        display: none;
      }

      .appShellTitle {
        font-size: clamp(18px, 4vw, 22px);
      }

      .appShellSubtitle {
        font-size: 11px;
      }

      .appShellHeaderBrandWordmark {
        width: min(104px, 100%);
      }
    }

    @media (max-width: 620px) {
      .appShellSubtitle {
        display: none;
      }

      .appShellTitle {
        font-size: clamp(16px, 3.6vw, 20px);
        display: -webkit-box;
        white-space: normal;
        overflow: hidden;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.15;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .appShellHeader {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          "sections title title"
          "games help .";
        align-items: center;
      }

      .appShellMenuToggle {
        grid-area: sections;
      }

      .appShellHeaderBrand {
        display: none;
      }

      .appShellTitleBlock {
        grid-area: title;
        align-self: center;
        min-height: 36px;
        justify-content: center;
      }

      .appShellGamesToggle {
        grid-area: games;
        justify-self: start;
      }

      .appShellHeaderAction {
        grid-area: help;
        justify-self: end;
      }
    }

    @media (max-width: 540px) {
      .appShellContentSlot > .wrap > header {
        padding: 14px 15px;
      }

      .appShellBody {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 560px) {
      .appShellHeaderBrandWordmark {
        display: none;
      }

      .appShellHeaderBrand {
        gap: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function resolveSectionTarget(sectionId: AppShellSectionId): HTMLElement | null {
  switch (sectionId) {
    case "home":
      return document.querySelector(".wrap > header") as HTMLElement | null;
    case "games":
      return document.querySelector('[data-start-section="game"]') as HTMLElement | null;
    case "community":
      return document.getElementById("launchLobbySection") as HTMLElement | null;
    case "account":
      return document.getElementById("launchAccountSection") as HTMLElement | null;
    case "settings":
      return document.querySelector('[data-start-section="startup"]') as HTMLElement | null;
    default:
      return null;
  }
}

function openDetailsTarget(target: HTMLElement | null): void {
  if (!target) return;
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
    return;
  }
  if (target.tagName === "DETAILS") {
    (target as HTMLDetailsElement).open = true;
  }
}

export function initStartPageAppShell(opts: StartPageAppShellOptions): StartPageAppShellController {
  ensureShellStyles();
  document.body.classList.add("stackworksAppShellEnabled");
  const initialShellState = readShellState();
  const desktopMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(APP_SHELL_DESKTOP_MEDIA)
    : null;
  const compactRailMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(APP_SHELL_COMPACT_RAIL_MEDIA)
    : null;

  const shell = document.createElement("div");
  shell.className = "appShellRoot";
  shell.dataset.railMode = "full";

  const overlay = document.createElement("div");
  overlay.className = "appShellOverlay";
  overlay.setAttribute("aria-hidden", "true");

  const rail = document.createElement("aside");
  rail.className = "appShellRail";
  rail.id = "stackworksAppShellRail";
  rail.setAttribute("aria-hidden", "true");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "appShellRailClose";
  closeButton.textContent = "Close";
  rail.appendChild(closeButton);

  const sidePanel = document.createElement("aside");
  sidePanel.className = "appShellRightRail appShellSidePanel";
  sidePanel.id = "stackworksAppShellGamesRail";
  sidePanel.setAttribute("aria-hidden", "true");

  const sidePanelCloseButton = document.createElement("button");
  sidePanelCloseButton.type = "button";
  sidePanelCloseButton.className = "appShellRailClose";
  sidePanelCloseButton.textContent = "Close";
  sidePanel.appendChild(sidePanelCloseButton);

  const brand = document.createElement("div");
  brand.className = "appShellBrand";
  const brandMark = document.createElement("span");
  brandMark.className = "appShellBrandMark";
  brandMark.setAttribute("aria-hidden", "true");
  renderLogo(brandMark, { variant: "icon", ariaHidden: true });

  const brandLockup = document.createElement("div");
  brandLockup.className = "appShellBrandLockup";

  const brandEyebrow = document.createElement("span");
  brandEyebrow.className = "appShellBrandEyebrow";
  brandEyebrow.textContent = "Competitive board games";

  const brandWordmark = document.createElement("div");
  renderLogo(brandWordmark, { variant: "wordmark", alt: "StackWorks", className: "appShellBrandWordmark" });

  brandLockup.append(brandEyebrow, brandWordmark);
  brand.append(brandMark, brandLockup);
  rail.appendChild(brand);

  const nav = document.createElement("nav");
  nav.className = "appShellNav";
  rail.appendChild(nav);

  const railMeta = document.createElement("div");
  railMeta.className = "appShellRailMeta";
  railMeta.textContent = "Phase 1 shell seam: this wraps the existing start-page controls without changing their launch or online behavior.";
  const railFooter = document.createElement("div");
  railFooter.className = "appShellRailFooter";
  const accountCard = createAccountRailCard(
    {
      status: "loading",
      message: "Contacting the configured multiplayer server.",
    },
    {
      onSignUp: () => opts.onRequestAccountAction?.("signup"),
      onLogIn: () => opts.onRequestAccountAction?.("login"),
      onManageAccount: () => opts.onRequestAccountAction?.("manage"),
      onAvatarUpload: () => opts.onRequestAccountAction?.("avatar-upload"),
      onLogOut: () => opts.onRequestAccountAction?.("logout"),
    },
  );
  railFooter.append(railMeta, accountCard.element);
  rail.appendChild(railFooter);

  const main = document.createElement("div");
  main.className = "appShellMain";

  const header = document.createElement("header");
  header.className = "appShellHeader";

  const sectionsToggle = document.createElement("button");
  sectionsToggle.type = "button";
  sectionsToggle.className = "appShellMenuToggle";
  sectionsToggle.textContent = "Sections";
  sectionsToggle.setAttribute("aria-controls", rail.id);
  sectionsToggle.setAttribute("aria-expanded", "false");

  const headerBrand = document.createElement("a");
  headerBrand.className = "appShellHeaderBrand";
  headerBrand.href = "./";
  headerBrand.title = "Start Page";
  headerBrand.setAttribute("aria-label", "Start Page");

  const headerBrandMark = document.createElement("span");
  headerBrandMark.className = "appShellHeaderBrandMark";
  headerBrandMark.setAttribute("aria-hidden", "true");
  renderLogo(headerBrandMark, { placement: "mobile-header", ariaHidden: true });

  const headerBrandWordmark = document.createElement("span");
  headerBrandWordmark.className = "appShellHeaderBrandWordmark";
  renderLogo(headerBrandWordmark, {
    variant: "wordmark",
    alt: "StackWorks",
  });
  headerBrand.append(headerBrandMark, headerBrandWordmark);

  const titleBlock = document.createElement("div");
  titleBlock.className = "appShellTitleBlock";
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "appShellBreadcrumb";
  breadcrumb.textContent = "Start / Games";
  const title = document.createElement("h1");
  title.className = "appShellTitle";
  const subtitle = document.createElement("p");
  subtitle.className = "appShellSubtitle";
  titleBlock.append(breadcrumb, title, subtitle);

  const helpLink = document.createElement("a");
  helpLink.className = "appShellHeaderAction";
  helpLink.href = opts.helpHref ?? "./start-help";
  helpLink.target = "_blank";
  helpLink.rel = "noopener noreferrer";
  helpLink.textContent = "Start help";

  const gamesToggle = document.createElement("button");
  gamesToggle.type = "button";
  gamesToggle.className = "appShellGamesToggle";
  gamesToggle.textContent = "Games";
  gamesToggle.setAttribute("aria-controls", sidePanel.id);
  gamesToggle.setAttribute("aria-expanded", "false");

  header.append(sectionsToggle, headerBrand, titleBlock, gamesToggle, helpLink);
  main.appendChild(header);

  const body = document.createElement("div");
  body.className = "appShellBody";
  const contentSlot = document.createElement("div");
  contentSlot.className = "appShellContentSlot";

  const summaryCard = document.createElement("section");
  summaryCard.className = "appShellCard";
  summaryCard.innerHTML = `
    <p class="appShellCardEyebrow">Selected game</p>
    <h2 class="appShellCardTitle"></h2>
    <p class="appShellCardText"></p>
    <ul class="appShellMetaList">
      <li class="appShellMetaItem"><span class="appShellMetaLabel">Board</span><span class="appShellMetaValue" data-shell-board></span></li>
      <li class="appShellMetaItem"><span class="appShellMetaLabel">Launch mode</span><span class="appShellMetaValue" data-shell-mode></span></li>
      <li class="appShellMetaItem"><span class="appShellMetaLabel">Entry</span><span class="appShellMetaValue" data-shell-entry></span></li>
    </ul>
    <div class="appShellBadgeRow">
      <span class="appShellBadge" data-shell-ruleset></span>
    </div>
    <div class="appShellCardActions">
      <a class="appShellHeaderAction appShellCardAction" data-shell-open-page target="_self">Open Page</a>
    </div>
  `;

  const quickCard = document.createElement("section");
  quickCard.className = "appShellCard";
  quickCard.innerHTML = `
    <p class="appShellCardEyebrow">Quick access</p>
    <h2 class="appShellCardTitle">Jump to the live controls</h2>
    <p class="appShellCardText">Use the shell to move through the current start page while the existing form and IDs stay untouched underneath.</p>
    <div class="appShellQuickLinks"></div>
  `;

  const launchLink = document.createElement("a");
  launchLink.className = "appShellHeaderAction appShellLaunchLink";
  launchLink.target = "_self";
  launchLink.textContent = "Open selected page";
  quickCard.appendChild(launchLink);

  const variantsCard = document.createElement("section");
  variantsCard.className = "appShellCard";
  variantsCard.innerHTML = `
    <p class="appShellCardEyebrow">Game selection</p>
    <h2 class="appShellCardTitle">Choose a variant</h2>
    <p class="appShellCardText">These cards drive the existing launcher form underneath, so all current startup and online settings stay intact.</p>
    <div class="appShellChoiceGrid" data-shell-variants></div>
  `;

  const playCard = document.createElement("section");
  playCard.className = "appShellCard";
  playCard.innerHTML = `
    <p class="appShellCardEyebrow">Play paths</p>
    <h2 class="appShellCardTitle">Select how you want to play</h2>
    <p class="appShellCardText">Switch between local and online modes here, then continue using the existing launcher controls for detailed options.</p>
    <div class="appShellChoiceGrid" data-shell-play-modes></div>
  `;

  const summaryTitle = summaryCard.querySelector(".appShellCardTitle") as HTMLElement;
  const summaryText = summaryCard.querySelector(".appShellCardText") as HTMLElement;
  const boardValue = summaryCard.querySelector("[data-shell-board]") as HTMLElement;
  const modeValue = summaryCard.querySelector("[data-shell-mode]") as HTMLElement;
  const entryValue = summaryCard.querySelector("[data-shell-entry]") as HTMLElement;
  const rulesetValue = summaryCard.querySelector("[data-shell-ruleset]") as HTMLElement;
  const summaryOpenPageLink = summaryCard.querySelector("[data-shell-open-page]") as HTMLAnchorElement;
  const quickLinks = quickCard.querySelector(".appShellQuickLinks") as HTMLElement;
  const variantsGrid = variantsCard.querySelector("[data-shell-variants]") as HTMLElement;
  const playModeGrid = playCard.querySelector("[data-shell-play-modes]") as HTMLElement;

  body.append(contentSlot);
  sidePanel.append(summaryCard, playCard, variantsCard, quickCard);
  main.appendChild(body);
  shell.append(overlay, rail, main, sidePanel);

  const parent = opts.contentRoot.parentElement;
  if (!parent) {
    throw new Error("Start page content root must have a parent element.");
  }
  parent.insertBefore(shell, opts.contentRoot);
  contentSlot.appendChild(opts.contentRoot);

  const contentHeader = opts.contentRoot.querySelector(":scope > header") as HTMLElement | null;
  const contentTitle = contentHeader?.querySelector("h1") as HTMLElement | null;
  const contentSubtitle = contentHeader?.querySelector(".subtle") as HTMLElement | null;
  if (contentTitle && contentTitle.textContent?.trim() === "StackWorks") {
    contentTitle.textContent = "Launch setup";
  }
  if (contentSubtitle) {
    contentSubtitle.textContent = "Existing launch controls, online lobby, and preferences remain active below.";
  }

  const navButtons = new Map<AppShellSectionId, HTMLButtonElement>();
  const variantButtons = new Map<VariantId, HTMLButtonElement>();
  const playModeButtons = new Map<StartPagePlayMode, HTMLButtonElement>();
  let selectedGame = getAppShellGame(opts.initialVariantId);
  let currentPlayMode = opts.initialPlayMode;

  const isDesktopLayout = (): boolean => Boolean(desktopMedia?.matches);

  const syncRailMode = (): void => {
    const isCompactRail = Boolean(isDesktopLayout() && compactRailMedia?.matches);
    shell.dataset.railMode = isCompactRail ? "compact" : "full";
  };

  const getActiveDrawer = (): "left" | "right" | "none" => {
    if (shell.classList.contains("leftDrawerOpen")) return "left";
    if (shell.classList.contains("rightDrawerOpen")) return "right";
    return "none";
  };

  const syncDrawerState = (): void => {
    const activeDrawer = getActiveDrawer();
    const desktop = isDesktopLayout();
    sectionsToggle.setAttribute("aria-expanded", activeDrawer === "left" ? "true" : "false");
    gamesToggle.setAttribute("aria-expanded", activeDrawer === "right" ? "true" : "false");
    rail.setAttribute("aria-hidden", desktop || activeDrawer === "left" ? "false" : "true");
    sidePanel.setAttribute("aria-hidden", desktop || activeDrawer === "right" ? "false" : "true");
    overlay.setAttribute("aria-hidden", activeDrawer === "none" ? "true" : "false");
    document.body.classList.toggle("stackworksAppShellNavLocked", activeDrawer !== "none" && !desktop);
  };

  const closeDrawers = (restoreFocusTo?: "left" | "right"): void => {
    shell.classList.remove("leftDrawerOpen", "rightDrawerOpen");
    syncDrawerState();
    if (restoreFocusTo === "left") sectionsToggle.focus();
    if (restoreFocusTo === "right") gamesToggle.focus();
  };

  const openLeftDrawer = (): void => {
    if (isDesktopLayout()) return;
    shell.classList.remove("rightDrawerOpen");
    shell.classList.add("leftDrawerOpen");
    syncDrawerState();
    closeButton.focus();
  };

  const openRightDrawer = (): void => {
    if (isDesktopLayout()) return;
    shell.classList.remove("leftDrawerOpen");
    shell.classList.add("rightDrawerOpen");
    syncDrawerState();
    sidePanelCloseButton.focus();
  };

  const toggleLeftDrawer = (): void => {
    if (getActiveDrawer() === "left") {
      closeDrawers("left");
    } else {
      openLeftDrawer();
    }
  };

  const toggleRightDrawer = (): void => {
    if (getActiveDrawer() === "right") {
      closeDrawers("right");
    } else {
      openRightDrawer();
    }
  };

  const handleViewportChange = (): void => {
    if (isDesktopLayout()) {
      closeDrawers();
    } else {
      syncDrawerState();
    }
    syncRailMode();
  };

  overlay.addEventListener("click", () => closeDrawers(getActiveDrawer() === "right" ? "right" : "left"));
  closeButton.addEventListener("click", () => closeDrawers("left"));
  sidePanelCloseButton.addEventListener("click", () => closeDrawers("right"));
  sectionsToggle.addEventListener("click", toggleLeftDrawer);
  gamesToggle.addEventListener("click", toggleRightDrawer);
  desktopMedia?.addEventListener?.("change", handleViewportChange);
  compactRailMedia?.addEventListener?.("change", syncRailMode);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawers(getActiveDrawer() === "right" ? "right" : "left");
  });

  const setActiveSection = (sectionId: AppShellSectionId): void => {
    updateShellState({ activeSection: sectionId });
    for (const [id, button] of navButtons) {
      const isActive = id === sectionId;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  };

  const focusSection = (sectionId: AppShellSectionId, focusOpts?: { playMode?: StartPagePlayMode }): void => {
    if (focusOpts?.playMode) {
      opts.onSelectPlayMode?.(focusOpts.playMode);
    }
    setActiveSection(sectionId);
    closeDrawers();
    const target = resolveSectionTarget(sectionId);
    openDetailsTarget(target);
    if (sectionId === GlobalSection.Community) {
      opts.onOpenLobby?.();
    }
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  for (const item of START_PAGE_SHELL_NAV) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellNavButton";
    button.setAttribute("aria-label", item.label);
    button.innerHTML = `<span class="appShellNavShortLabel">${item.label.slice(0, 2)}</span><span class="appShellNavLabel">${item.label}</span><span class="appShellNavDescription">${item.description}</span>`;
    button.addEventListener("click", () => focusSection(item.id));
    navButtons.set(item.id, button);
    nav.appendChild(button);
  }

  attachHoverFlyoutMenu(
    START_PAGE_SHELL_NAV.map((item) => ({
      anchor: navButtons.get(item.id) as HTMLButtonElement,
      getContent: () => {
        const actions = [
          {
            label: `Jump to ${item.label}`,
            description: `Scroll the start page to the ${item.label.toLowerCase()} section.`,
            onSelect: () => focusSection(item.id),
          },
        ];

        if (item.id === "games" && selectedGame.available && selectedGame.entryUrl) {
          actions.push({
            label: `Open ${selectedGame.displayName}`,
            description: `Load the current ${selectedGame.displayName} page directly.`,
            onSelect: () => {
              window.location.href = selectedGame.entryUrl as string;
            },
          });
        }

        return {
          eyebrow: "Desktop flyout",
          title: item.label,
          description: item.description,
          actions,
        };
      },
    })),
  );

  const quickTargets: Array<{ label: string; sectionId: AppShellSectionId; playMode?: StartPagePlayMode }> = [
    { label: "Variant selection", sectionId: "games" },
    { label: "Startup settings", sectionId: "settings" },
    { label: "Online lobby", sectionId: "community", playMode: "online" },
    { label: "Account tools", sectionId: "account" },
  ];

  for (const target of quickTargets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellQuickLink";
    button.textContent = target.label;
    button.addEventListener("click", () => focusSection(target.sectionId, { playMode: target.playMode }));
    quickLinks.appendChild(button);
  }

  const launcherGames = APP_SHELL_GAMES.filter((game) => game.entryUrl);

  for (const game of launcherGames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellChoiceButton";
    button.innerHTML = `
      <span class="appShellChoiceLabel">${game.displayName}</span>
      <span class="appShellChoiceDescription">${game.subtitle}</span>
      <span class="appShellChoiceMeta">${game.boardSize}x${game.boardSize} · ${game.rulesetId.replace(/_/g, " ")}</span>
    `;
    button.disabled = !game.available;
    button.addEventListener("click", () => {
      if (!game.available) return;
      opts.onSelectGame?.(game.variantId);
      focusSection(GlobalSection.Games);
    });
    variantButtons.set(game.variantId, button);
    variantsGrid.appendChild(button);
  }

  const playModeChoices: Array<{ id: StartPagePlayMode; label: string; description: string; sectionId: AppShellSectionId }> = [
    {
      id: "local",
      label: "Local game",
      description: "Stay on this device for offline games, bot matches, and local setup controls.",
      sectionId: GlobalSection.Games,
    },
    {
      id: "online",
      label: "Online room",
      description: "Switch to the existing online launcher path for rooms, rejoin, spectate, and lobby actions.",
      sectionId: GlobalSection.Community,
    },
  ];

  for (const mode of playModeChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellChoiceButton";
    button.innerHTML = `
      <span class="appShellChoiceLabel">${mode.label}</span>
      <span class="appShellChoiceDescription">${mode.description}</span>
    `;
    button.addEventListener("click", () => {
      opts.onSelectPlayMode?.(mode.id);
      focusSection(mode.sectionId, { playMode: mode.id });
    });
    playModeButtons.set(mode.id, button);
    playModeGrid.appendChild(button);
  }

  const setPlayMode = (playMode: StartPagePlayMode): void => {
    currentPlayMode = playMode;
    for (const [id, button] of playModeButtons) {
      const isActive = id === playMode;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  };

  const setSelectedGame = (variantId: VariantId, updateOpts?: UpdateSelectedGameOptions): void => {
    const game = getAppShellGame(variantId);
    selectedGame = game;
    updateShellState({ activeGame: variantId });
    const playMode = updateOpts?.playMode ?? currentPlayMode;
    title.textContent = game.displayName;
    subtitle.textContent = game.subtitle;
    summaryTitle.textContent = game.displayName;
    summaryText.textContent = game.subtitle;
    boardValue.textContent = `${game.boardSize}x${game.boardSize}`;
    modeValue.textContent = playMode === "online" ? "Online" : "Local";
    entryValue.textContent = game.available ? (game.entryUrl ?? "Unavailable") : "Coming soon";
    rulesetValue.textContent = game.rulesetId.replace(/_/g, " ");

    for (const [id, button] of variantButtons) {
      const isActive = id === variantId;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    setPlayMode(playMode);

    if (game.available && game.entryUrl) {
      summaryOpenPageLink.href = game.entryUrl;
      summaryOpenPageLink.style.pointerEvents = "auto";
      summaryOpenPageLink.style.opacity = "1";
      launchLink.href = game.entryUrl;
      launchLink.style.pointerEvents = "auto";
      launchLink.style.opacity = "1";
    } else {
      summaryOpenPageLink.removeAttribute("href");
      summaryOpenPageLink.style.pointerEvents = "none";
      summaryOpenPageLink.style.opacity = "0.55";
      launchLink.removeAttribute("href");
      launchLink.style.pointerEvents = "none";
      launchLink.style.opacity = "0.55";
    }
  };

  setActiveSection(initialShellState.activeSection ?? GlobalSection.Home);
  setSelectedGame(opts.initialVariantId, { playMode: opts.initialPlayMode });
  if (initialShellState.activeSection === GlobalSection.Community) {
    focusSection(GlobalSection.Community, { playMode: "online" });
  }
  syncRailMode();
  syncDrawerState();

  return {
    setActiveSection,
    setSelectedGame,
    setPlayMode,
    setAccountState: accountCard.update,
  };
}