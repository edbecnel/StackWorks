import { START_PAGE_SHELL_NAV, getAppShellGame, type AppShellSectionId } from "../../config/appShellConfig";
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
  onRequestAccountAction?: (action: "signup" | "login" | "manage" | "logout") => void;
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

function ensureShellStyles(): void {
  if (document.getElementById(SHELL_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SHELL_STYLE_ID;
  style.textContent = `
    body.stackworksAppShellEnabled {
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

    .appShellRoot.navOpen .appShellOverlay {
      opacity: 1;
      pointer-events: auto;
    }

    .appShellRail {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: min(82vw, 290px);
      padding: 22px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: rgba(14, 14, 14, 0.96);
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
      transform: translateX(-104%);
      transition: transform 180ms ease;
      z-index: 40;
      backdrop-filter: blur(14px);
    }

    .appShellRoot.navOpen .appShellRail {
      transform: translateX(0);
    }

    .appShellRailClose {
      align-self: flex-end;
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.9);
      border-radius: 999px;
      min-width: 34px;
      min-height: 34px;
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

    .appShellNavDescription {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.62);
    }

    .appShellRailMeta {
      margin-top: auto;
      font-size: 11px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.58);
      padding: 12px 13px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .appShellMain {
      position: relative;
      z-index: 1;
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
    }

    .appShellHeader {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
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
    }

    .appShellMenuToggle:hover,
    .appShellHeaderAction:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .appShellTitleBlock {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .appShellBreadcrumb {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.52);
    }

    .appShellTitle {
      margin: 0;
      font-size: clamp(20px, 2.6vw, 28px);
      line-height: 1.1;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.97);
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
    }

    .appShellContentSlot {
      min-width: 0;
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
      display: grid;
      gap: 12px;
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

    .appShellLaunchLink {
      margin-top: 12px;
      width: 100%;
      justify-content: center;
    }

    @media (min-width: 1040px) {
      .appShellRoot {
        grid-template-columns: 260px minmax(0, 1fr);
      }

      .appShellOverlay,
      .appShellRailClose,
      .appShellMenuToggle {
        display: none;
      }

      .appShellRail {
        position: sticky;
        top: 0;
        width: auto;
        min-height: 100vh;
        transform: none;
        box-shadow: none;
        z-index: 1;
      }

      .appShellMain {
        padding: 20px 20px 24px 0;
      }

      .appShellBody {
        grid-template-columns: minmax(0, 1fr) 300px;
      }
    }

    @media (max-width: 699px) {
      .appShellHeader {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .appShellHeaderAction {
        grid-column: 1 / -1;
        justify-self: start;
      }

      .appShellContentSlot > .wrap > header {
        padding: 14px 15px;
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

export function initStartPageAppShell(opts: StartPageAppShellOptions): StartPageAppShellController {
  ensureShellStyles();
  document.body.classList.add("stackworksAppShellEnabled");
  const initialShellState = readShellState();
  const desktopMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(APP_SHELL_DESKTOP_MEDIA)
    : null;

  const shell = document.createElement("div");
  shell.className = "appShellRoot";

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
  const accountCard = createAccountRailCard(
    {
      status: "loading",
      message: "Contacting the configured multiplayer server.",
    },
    {
      onSignUp: () => opts.onRequestAccountAction?.("signup"),
      onLogIn: () => opts.onRequestAccountAction?.("login"),
      onManageAccount: () => opts.onRequestAccountAction?.("manage"),
      onLogOut: () => opts.onRequestAccountAction?.("logout"),
    },
  );
  rail.append(railMeta, accountCard.element);

  const main = document.createElement("div");
  main.className = "appShellMain";

  const header = document.createElement("header");
  header.className = "appShellHeader";

  const menuToggle = document.createElement("button");
  menuToggle.type = "button";
  menuToggle.className = "appShellMenuToggle";
  menuToggle.textContent = "Menu";
  menuToggle.setAttribute("aria-controls", rail.id);
  menuToggle.setAttribute("aria-expanded", "false");

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

  header.append(menuToggle, titleBlock, helpLink);
  main.appendChild(header);

  const body = document.createElement("div");
  body.className = "appShellBody";
  const contentSlot = document.createElement("div");
  contentSlot.className = "appShellContentSlot";
  const sidePanel = document.createElement("aside");
  sidePanel.className = "appShellSidePanel";

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
  const quickLinks = quickCard.querySelector(".appShellQuickLinks") as HTMLElement;
  const variantsGrid = variantsCard.querySelector("[data-shell-variants]") as HTMLElement;
  const playModeGrid = playCard.querySelector("[data-shell-play-modes]") as HTMLElement;

  body.append(contentSlot, sidePanel);
  sidePanel.append(summaryCard, playCard, variantsCard, quickCard);
  main.appendChild(body);
  shell.append(overlay, rail, main);

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

  const syncNavState = (): void => {
    const expanded = shell.classList.contains("navOpen");
    menuToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    rail.setAttribute("aria-hidden", expanded ? "false" : "true");
    overlay.setAttribute("aria-hidden", expanded ? "false" : "true");
    document.body.classList.toggle("stackworksAppShellNavLocked", expanded && !(desktopMedia?.matches ?? false));
  };

  const closeNav = (restoreFocus = false): void => {
    shell.classList.remove("navOpen");
    syncNavState();
    if (restoreFocus) menuToggle.focus();
  };

  const openNav = (): void => {
    if (desktopMedia?.matches) return;
    shell.classList.add("navOpen");
    syncNavState();
    closeButton.focus();
  };

  const toggleNav = (): void => {
    if (shell.classList.contains("navOpen")) {
      closeNav(true);
    } else {
      openNav();
    }
  };

  const handleViewportChange = (): void => {
    if (desktopMedia?.matches) {
      closeNav(false);
    } else {
      syncNavState();
    }
  };

  overlay.addEventListener("click", () => closeNav(true));
  closeButton.addEventListener("click", () => closeNav(true));
  menuToggle.addEventListener("click", toggleNav);
  desktopMedia?.addEventListener?.("change", handleViewportChange);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNav(true);
  });

  const setActiveSection = (sectionId: AppShellSectionId): void => {
    updateShellState({ activeSection: sectionId });
    for (const [id, button] of navButtons) {
      const isActive = id === sectionId;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  };

  const focusSection = (sectionId: AppShellSectionId): void => {
    setActiveSection(sectionId);
    closeNav(false);
    const target = resolveSectionTarget(sectionId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  for (const item of START_PAGE_SHELL_NAV) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellNavButton";
    button.innerHTML = `<span class="appShellNavLabel">${item.label}</span><span class="appShellNavDescription">${item.description}</span>`;
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

        if (item.id === "games" && selectedGame.entryUrl) {
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

  const quickTargets: Array<{ label: string; sectionId: AppShellSectionId }> = [
    { label: "Variant selection", sectionId: "games" },
    { label: "Startup settings", sectionId: "settings" },
    { label: "Online lobby", sectionId: "community" },
    { label: "Account tools", sectionId: "account" },
  ];

  for (const target of quickTargets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellQuickLink";
    button.textContent = target.label;
    button.addEventListener("click", () => focusSection(target.sectionId));
    quickLinks.appendChild(button);
  }

  const launcherGames = [
    ...new Map(
      [
        getAppShellGame("chess_classic"),
        getAppShellGame("columns_chess"),
        getAppShellGame("dama_8_classic_standard"),
        getAppShellGame("lasca_7_classic"),
        getAppShellGame("damasca_8"),
      ].map((game) => [game.variantId, game]),
    ).values(),
  ];

  for (const game of launcherGames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appShellChoiceButton";
    button.innerHTML = `
      <span class="appShellChoiceLabel">${game.displayName}</span>
      <span class="appShellChoiceDescription">${game.subtitle}</span>
      <span class="appShellChoiceMeta">${game.boardSize}x${game.boardSize} · ${game.rulesetId.replace(/_/g, " ")}</span>
    `;
    button.addEventListener("click", () => {
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
      focusSection(mode.sectionId);
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
    entryValue.textContent = game.entryUrl ?? "Unavailable";
    rulesetValue.textContent = game.rulesetId.replace(/_/g, " ");

    for (const [id, button] of variantButtons) {
      const isActive = id === variantId;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    setPlayMode(playMode);

    if (game.entryUrl) {
      launchLink.href = game.entryUrl;
      launchLink.style.pointerEvents = "auto";
      launchLink.style.opacity = "1";
    } else {
      launchLink.removeAttribute("href");
      launchLink.style.pointerEvents = "none";
      launchLink.style.opacity = "0.55";
    }
  };

  setActiveSection(initialShellState.activeSection ?? GlobalSection.Home);
  setSelectedGame(opts.initialVariantId, { playMode: opts.initialPlayMode });
  syncNavState();

  return {
    setActiveSection,
    setSelectedGame,
    setPlayMode,
    setAccountState: accountCard.update,
  };
}