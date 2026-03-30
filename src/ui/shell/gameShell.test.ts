import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initGameShell } from "./gameShell";
import { GameSection } from "../../config/shellState";
import type { PlayerShellSnapshot } from "../../types";
import { saveOpenVariantPageIntent } from "../../shared/openVariantPageIntent";

/** Shell name tests use a mock controller; keep “startup lock” off so panels show snapshot names (real pages sync lock with URL via bind). */
function shellControllerLockStubs() {
  return {
    setShellStartupPlayLockEnabled: vi.fn(),
    isShellStartupPlayLockEnabled: vi.fn(() => false),
    pinSeatDisplayNamesFromSavedGame: vi.fn(),
    clearSeatDisplayNamesSavePin: vi.fn(),
    getSavePinnedSeatDisplayName: vi.fn(() => undefined),
    isLoadedGameSeatLabelsActive: vi.fn(() => false),
  };
}

function installDesktopMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("min-width: 821px"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function installCompactNarrowMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => {
      const base = {
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      if (query.includes("min-width: 821px")) {
        return { ...base, matches: false };
      }
      if (query.includes("max-width: 820px")) {
        return { ...base, matches: true };
      }
      return { ...base, matches: false };
    }),
  });
}

describe("initGameShell desktop shell navigation", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar">
            <div class="sidebarBody">
              <section class="panelSection" data-section="options"><div class="sectionContent"></div></section>
              <section class="panelSection" data-section="status"><div class="sectionContent">Status panel</div></section>
              <section class="panelSection" data-section="bot"><div class="sectionContent">Bot panel</div></section>
            </div>
          </div>
          <div id="rightSidebar" class="sidebar">
            <div class="sidebarBody">
              <section class="panelSection" data-section="moveHistory"><div class="sectionContent">History panel</div></section>
              <section class="panelSection" data-section="rules"><div class="sectionContent">Rules panel</div></section>
            </div>
          </div>
        </div>
      </div>
    `;

    installDesktopMatchMedia();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    localStorage.clear();
    scrollIntoView.mockReset();
    document.body.removeAttribute("data-panel-layout");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("uses left shell buttons as right-panel selectors instead of direct scroll shortcuts", () => {
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop shell test",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
        { id: "rules", label: "Rules", targetSelector: '#rightSidebar .panelSection[data-section="rules"]' },
      ],
    });

    const statusNavButton = Array.from(document.querySelectorAll(".gameShellDesktopNavButton")).find((button) =>
      button.textContent?.includes("Status"),
    ) as HTMLButtonElement | undefined;
    expect(statusNavButton).toBeDefined();

    statusNavButton?.click();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(statusNavButton?.classList.contains("isActive")).toBe(true);
    expect(document.querySelector('.gameShellDesktopSectionPanel.isActive[data-section-id="status"]')).not.toBeNull();

    const openStatusButton = Array.from(document.querySelectorAll(".gameShellDesktopActionButton")).find((button) =>
      button.textContent?.includes("Open status panel"),
    ) as HTMLButtonElement | undefined;
    expect(openStatusButton).toBeDefined();

    openStatusButton?.click();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("shows signed-in display name and avatar at the bottom of the left shell panel", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    localStorage.setItem("stackworks.gameShell.desktopPanelMode", "shell");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          displayName: "EdwardBecnel",
          avatarUrl: "/api/auth/avatar/me.png",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Left shell user footer test",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      ],
    });

    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }

    const footer = document.querySelector(".gameShellDesktopUserFooter") as HTMLElement | null;
    expect(footer).toBeTruthy();
    expect(footer?.hidden).toBe(false);
    expect(footer?.querySelector(".gameShellDesktopUserName")?.textContent).toBe("EdwardBecnel");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8788/api/auth/me", expect.objectContaining({ credentials: "include" }));
    const img = footer?.querySelector(".gameShellDesktopUserAvatarImg") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("http://localhost:8788/api/auth/avatar/me.png");
  });

  it("reveals legacy target panels from shell action cards and offers a path back to Play Hub", () => {
    localStorage.setItem("stackworks.gameShell.desktopPanelMode", "shell");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop shell test",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      ],
    });

    const statusNavButton = Array.from(document.querySelectorAll(".gameShellDesktopNavButton")).find((button) =>
      button.textContent?.includes("Status"),
    ) as HTMLButtonElement | undefined;
    statusNavButton?.click();

    const backButton = Array.from(document.querySelectorAll(".gameShellDesktopActionButton")).find((button) =>
      button.textContent?.includes("Back to Play Hub"),
    ) as HTMLButtonElement | undefined;
    expect(backButton).toBeDefined();

    const openStatusButton = Array.from(document.querySelectorAll(".gameShellDesktopActionButton")).find((button) =>
      button.textContent?.includes("Open status panel"),
    ) as HTMLButtonElement | undefined;
    openStatusButton?.click();

    expect((document.getElementById("leftSidebar") as HTMLElement).dataset.gameShellPanelMode).toBe("legacy");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    backButton?.click();

    expect(document.querySelector('.gameShellDesktopSectionPanel.isActive[data-section-id="play"]')).not.toBeNull();
  });

  it("uses the brand icon as a Start Page link in both shell header treatments", () => {
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop shell test",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [],
    });

    const compactBrand = document.querySelector(".gameShellCompactBarBrand") as HTMLAnchorElement | null;
    const headerBrand = document.querySelector(".gameShellBrand") as HTMLAnchorElement | null;

    expect(compactBrand?.getAttribute("href")).toBe("./");
    expect(compactBrand?.getAttribute("aria-label")).toBe("Start Page");
    expect(compactBrand?.querySelector('.gameShellCompactBarBrandMark img')?.getAttribute("src")).toContain("stackworks-logo-icon.svg");
    expect(compactBrand?.querySelector('.gameShellCompactBarWordmark img')?.getAttribute("src")).toContain("stackworks-logo-horizontal");

    expect(headerBrand?.getAttribute("href")).toBe("./");
    expect(headerBrand?.getAttribute("aria-label")).toBe("Start Page");
    expect(headerBrand?.querySelector("img")?.getAttribute("src")).toContain("stackworks-logo-icon.svg");

    const columnBrandImg = document.querySelector(".gameShellSidebarColumnBrandLink img") as HTMLImageElement | null;
    expect(columnBrandImg?.getAttribute("src")).toContain("stackworks-logo-horizontal");
  });

  it("hides duplicate horizontal logo in sidebar title when column brand is present (panels layout)", () => {
    const left = document.getElementById("leftSidebar") as HTMLElement;
    const header = document.createElement("div");
    header.className = "sidebarHeader";
    const titleRoot = document.createElement("div");
    titleRoot.id = "gameTitle";
    titleRoot.className = "stackworksGameTitleRoot";
    const brandLink = document.createElement("a");
    brandLink.className = "stackworksGameTitleBrandLink";
    brandLink.appendChild(document.createElement("img"));
    const textBrand = document.createElement("div");
    textBrand.className = "stackworksGameTitleTextBrand";
    textBrand.textContent = "StackWorks";
    titleRoot.append(brandLink, textBrand);
    header.appendChild(titleRoot);
    left.insertBefore(header, left.firstChild);

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Duplicate logo guard",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [],
    });

    expect(getComputedStyle(brandLink).display).toBe("none");
    expect(getComputedStyle(textBrand).display).toBe("block");
  });

  it("applies persisted shell panel mode on compact viewports (not forced to legacy)", () => {
    installCompactNarrowMatchMedia();
    document.body.dataset.panelLayout = "panels";
    localStorage.setItem("stackworks.gameShell.desktopPanelMode", "shell");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Narrow panels shell mode",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const left = document.getElementById("leftSidebar") as HTMLElement;
    expect(left.dataset.gameShellPanelMode).toBe("shell");
  });

  it("shows Game/Shell <select> in compact bar for panels layout (narrow width)", () => {
    installCompactNarrowMatchMedia();
    document.body.dataset.panelLayout = "panels";
    localStorage.setItem("stackworks.gameShell.desktopPanelMode", "shell");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Narrow panels compact switcher",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const left = document.getElementById("leftSidebar") as HTMLElement;
    const sel = document.querySelector(".gameShellCompactPanelMode") as HTMLSelectElement | null;
    const menuBtn = document.querySelector(".gameShellCompactTrigger") as HTMLButtonElement | null;
    expect(sel).not.toBeNull();
    expect(menuBtn).not.toBeNull();
    expect(sel!.hidden).toBe(false);
    expect(menuBtn!.hidden).toBe(true);
    expect(document.querySelector(".gameShellRoot")?.getAttribute("data-game-shell-compact-leading")).toBe("panelSelect");
    expect(left.querySelector(":scope > .gameShellDesktopPairTabs")).not.toBeNull();
    expect(getComputedStyle(left.querySelector(".gameShellDesktopPairTabs") as HTMLElement).display).toBe("none");

    expect(left.dataset.gameShellPanelMode).toBe("shell");
    sel!.value = "legacy";
    sel!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(left.dataset.gameShellPanelMode).toBe("legacy");
    sel!.value = "shell";
    sel!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(left.dataset.gameShellPanelMode).toBe("shell");
  });

  it("shows Game/Shell <select> in compact bar for panels layout at desktop width", () => {
    installDesktopMatchMedia();
    document.body.dataset.panelLayout = "panels";
    localStorage.setItem("stackworks.gameShell.desktopPanelMode", "legacy");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop panels compact switcher",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const sel = document.querySelector(".gameShellCompactPanelMode") as HTMLSelectElement | null;
    const menuBtn = document.querySelector(".gameShellCompactTrigger") as HTMLButtonElement | null;
    expect(sel!.hidden).toBe(false);
    expect(menuBtn!.hidden).toBe(true);
    expect(sel!.value).toBe("legacy");
    expect(document.querySelector(".gameShellRoot")?.getAttribute("data-game-shell-compact-leading")).toBe("panelSelect");
  });

  it("shows Menu button (not panel select) for menu layout at desktop width", () => {
    installDesktopMatchMedia();
    document.body.dataset.panelLayout = "menu";
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop menu layout",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const sel = document.querySelector(".gameShellCompactPanelMode") as HTMLSelectElement | null;
    const menuBtn = document.querySelector(".gameShellCompactTrigger") as HTMLButtonElement | null;
    expect(sel!.hidden).toBe(true);
    expect(menuBtn!.hidden).toBe(false);
    expect(document.querySelector(".gameShellRoot")?.getAttribute("data-game-shell-compact-leading")).toBe("menu");
  });

  it("treats menu layout from localStorage when data-panel-layout is not applied yet (chessMain init order)", () => {
    installDesktopMatchMedia();
    localStorage.setItem("lasca.ui.panelLayout", "menu");
    document.body.removeAttribute("data-panel-layout");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Before installPanelLayoutOptionUI",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const sel = document.querySelector(".gameShellCompactPanelMode") as HTMLSelectElement | null;
    const menuBtn = document.querySelector(".gameShellCompactTrigger") as HTMLButtonElement | null;
    expect(sel!.hidden).toBe(true);
    expect(menuBtn!.hidden).toBe(false);
    expect(document.querySelector(".gameShellRoot")?.getAttribute("data-game-shell-compact-leading")).toBe("menu");
  });

  it("treats panels layout from localStorage when data-panel-layout is not applied yet", () => {
    installDesktopMatchMedia();
    localStorage.setItem("lasca.ui.panelLayout", "panels");
    document.body.removeAttribute("data-panel-layout");
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Before body dataset",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [{ id: "play", label: "Play", targetSelector: "#appRoot" }],
    });

    const sel = document.querySelector(".gameShellCompactPanelMode") as HTMLSelectElement | null;
    const menuBtn = document.querySelector(".gameShellCompactTrigger") as HTMLButtonElement | null;
    expect(sel!.hidden).toBe(false);
    expect(menuBtn!.hidden).toBe(true);
    expect(document.querySelector(".gameShellRoot")?.getAttribute("data-game-shell-compact-leading")).toBe("panelSelect");
  });

  it("keeps shell bodies in sidebar slots on compact portrait when panel layout is panels (not menu)", () => {
    installCompactNarrowMatchMedia();
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Panels layout compact portrait",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      ],
    });

    const menuMount = document.querySelector(".gameShellMobileShellPanels") as HTMLElement | null;
    expect(menuMount?.querySelectorAll(".gameShellDesktopShellBody").length).toBe(0);
    expect(document.querySelectorAll(".gameShellSidebarShellSlot .gameShellDesktopShellBody").length).toBe(2);
    expect(document.querySelector(".gameShellRoot.gameShellRoot--compactShellMenu")).toBeNull();
  });

  it("mounts shell bodies into the Menu panel region on compact portrait when panel layout is menu", () => {
    installCompactNarrowMatchMedia();
    document.body.dataset.panelLayout = "menu";
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Compact shell test",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      ],
    });

    const menuMount = document.querySelector(".gameShellMobileShellPanels") as HTMLElement | null;
    const shellBodies = menuMount?.querySelectorAll(".gameShellDesktopShellBody") ?? [];
    expect(shellBodies.length).toBe(2);
    expect(document.querySelector(".gameShellRoot.gameShellRoot--compactShellMenu")).not.toBeNull();
  });

  it("mounts shell bodies into the Menu region when panel layout is menu on desktop widths", () => {
    installDesktopMatchMedia();
    document.body.dataset.panelLayout = "menu";

    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Menu layout shell test",
      backHref: "./",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      ],
    });

    const menuMount = document.querySelector(".gameShellMobileShellPanels") as HTMLElement | null;
    expect(menuMount?.querySelectorAll(".gameShellDesktopShellBody").length).toBe(2);
    expect(document.querySelector(".gameShellRoot.gameShellRoot--compactShellMenu")).not.toBeNull();
  });

  it("mounts the richer play hub content into the right shell panel", () => {
    const appRoot = document.getElementById("appRoot") as HTMLElement;

    initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Desktop shell test",
      backHref: "./",
      helpHref: "./start-help",
      gameSection: GameSection.Play,
      navItems: [
        { id: "play", label: "Play", targetSelector: "#appRoot" },
        { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
        { id: "bot", label: "Bot", targetSelector: '#leftSidebar .panelSection[data-section="bot"]' },
      ],
    });

    expect(document.querySelector(".playHubOnlineModeTabs")).not.toBeNull();
    expect(document.querySelector('[data-bot-field="controller"]')).not.toBeNull();
    expect(Array.from(document.querySelectorAll(".playHubAction")).some((element) => element.textContent?.includes("Create custom challenge"))).toBe(true);
    expect(document.querySelector('[data-coach-level="beginner"]')).not.toBeNull();
  });

  it("preserves configured local player names and applies the signed-in avatar only to the matching side", async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          displayName: "EdB",
          avatarUrl: "/api/auth/avatar/edb.png",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "Senet",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "EdB",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Local auth shell test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const panels = Array.from(document.querySelectorAll(".gameShellPlayerPanel"));
    const whitePanel = panels.find((panel) => (panel.querySelector(".gameShellPlayerName")?.textContent ?? "").trim() === "Senet") as HTMLElement | undefined;
    const blackPanel = panels.find((panel) => (panel.querySelector(".gameShellPlayerName")?.textContent ?? "").trim() === "EdB") as HTMLElement | undefined;
    const whiteImage = whitePanel?.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;
    const blackImage = blackPanel?.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;
    const roles = panels.map((panel) => panel.querySelector(".gameShellPlayerRole")?.textContent?.trim());

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/auth/me", { credentials: "include" });
    expect(whitePanel).toBeDefined();
    expect(blackPanel).toBeDefined();
    expect(whiteImage).toBeNull();
    expect(blackImage?.getAttribute("src")).toBe("http://localhost:3000/api/auth/avatar/edb.png");
    expect(roles.at(-1)).toBe("You · White");
  });

  it("uses the configured multiplayer server for local auth/avatar lookups", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          displayName: "EdB",
          avatarUrl: "/api/auth/avatar/edb.png",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "EdB",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Local auth server test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const matchingPanel = Array.from(document.querySelectorAll(".gameShellPlayerPanel")).find((panel) =>
      (panel.querySelector(".gameShellPlayerName")?.textContent ?? "").trim() === "EdB",
    ) as HTMLElement | undefined;
    const image = matchingPanel?.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8788/api/auth/me", { credentials: "include" });
    expect(matchingPanel).toBeDefined();
    expect(image?.getAttribute("src")).toBe("http://localhost:8788/api/auth/avatar/edb.png");
  });

  it("labels a local bot-controlled side as Bot instead of You", async () => {
    localStorage.setItem("stackworks.bot.whitePersona", "teacher");

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
            <select id="aiWhiteSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>
            <select id="aiBlackSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "Local Account" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "checkers_8_us",
      breadcrumb: "Play / Checkers",
      title: "Checkers",
      subtitle: "Local bot shell test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const roles = Array.from(document.querySelectorAll(".gameShellPlayerRole")).map((el) => el.textContent?.trim());
    const names = Array.from(document.querySelectorAll(".gameShellPlayerName")).map((el) => el.textContent?.trim());
    const metaChips = Array.from(document.querySelectorAll(".gameShellPlayerMetaChip")).map((el) => el.textContent?.trim());

    expect(fetchMock).toHaveBeenCalled();
    expect(names).toContain("Teacher bot");
    expect(names).toContain("Local Account");
    expect(roles.at(-1)).toBe("Bot · White");
    expect(metaChips).toContain("Bot");
  });

  it("falls back to the human side label in the shell bars when a bot game has no signed-in user", async () => {
    localStorage.setItem("stackworks.bot.whitePersona", "teacher");

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
            <select id="aiWhiteSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>
            <select id="aiBlackSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, user: null }) })));

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "checkers_8_us",
      breadcrumb: "Play / Checkers",
      title: "Checkers",
      subtitle: "Local bot fallback shell test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const names = Array.from(document.querySelectorAll(".gameShellPlayerName")).map((el) => el.textContent?.trim());

    expect(names).toContain("Teacher bot");
    expect(names).toContain("Black");
  });

  it("updates the active-turn chip when the shell snapshot flips turns", async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const snapshot: PlayerShellSnapshot = {
      mode: "online",
      transportStatus: "connected",
      serverUrl: "http://localhost:8788",
      viewerColor: "W",
      viewerRole: "player",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "You · White",
          detailText: "Your turn.",
          status: "connected",
          statusText: "Connected",
          isLocal: true,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Opponent · Black",
          detailText: "Watching for the next move.",
          status: "connected",
          statusText: "Connected",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    let onHistoryChange: (() => void) | null = null;
    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn((cb: () => void) => {
        onHistoryChange = cb;
      }),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Turn chip sync test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const getPanelByName = (displayName: string): HTMLElement => {
      const panel = Array.from(document.querySelectorAll(".gameShellPlayerPanel")).find((el) =>
        (el.querySelector(".gameShellPlayerName")?.textContent ?? "").trim() === displayName,
      ) as HTMLElement | undefined;
      expect(panel).toBeDefined();
      return panel as HTMLElement;
    };

    const whitePanel = getPanelByName("White");
    const blackPanel = getPanelByName("Black");
    const getActiveChip = (panel: HTMLElement): HTMLElement => panel.querySelectorAll(".gameShellPlayerMetaChip")[2] as HTMLElement;

    expect(getActiveChip(whitePanel).hidden).toBe(false);
    expect(getActiveChip(blackPanel).hidden).toBe(true);
    expect(getActiveChip(whitePanel).textContent?.trim()).toBe("Your turn");

    snapshot.players.W = { ...snapshot.players.W, isActiveTurn: false, detailText: "Waiting for the opponent move." };
    snapshot.players.B = { ...snapshot.players.B, isActiveTurn: true, detailText: "Opponent to move." };
    onHistoryChange?.();

    expect(getActiveChip(whitePanel).hidden).toBe(true);
    expect(getActiveChip(blackPanel).hidden).toBe(false);
    expect(getActiveChip(blackPanel).textContent?.trim()).toBe("Opponent to move");
  });

  it("keeps the local human side tagged as You even without a signed-in profile", async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
            <select id="aiWhiteSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
            <select id="aiBlackSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "checkers_8_us",
      breadcrumb: "Play / Checkers",
      title: "Checkers",
      subtitle: "Local human shell test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const roles = Array.from(document.querySelectorAll(".gameShellPlayerRole")).map((el) => el.textContent?.trim());
    const metaChips = Array.from(document.querySelectorAll(".gameShellPlayerMetaChip")).map((el) => el.textContent?.trim());

    expect(fetchMock).toHaveBeenCalled();
    expect(roles.at(-1)).toBe("You · White");
    expect(metaChips).toContain("You");
  });

  it("labels a human side as You immediately after switching away from Bot", async () => {
    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
            <select id="aiWhiteSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>
            <select id="aiBlackSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, user: null }) })));

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "checkers_8_us",
      breadcrumb: "Play / Checkers",
      title: "Checkers",
      subtitle: "Local switch shell test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    (document.getElementById("aiWhiteSelect") as HTMLSelectElement).value = "human";
  document.getElementById("aiWhiteSelect")?.dispatchEvent(new Event("change"));

    const roles = Array.from(document.querySelectorAll(".gameShellPlayerRole")).map((el) => el.textContent?.trim());
    const metaChips = Array.from(document.querySelectorAll(".gameShellPlayerMetaChip")).map((el) => el.textContent?.trim());

    expect(roles.at(-1)).toBe("You · White");
    expect(metaChips).toContain("You");
  });

  it("uses the signed-in avatar for a matching local player name even when that side is not the bottom viewer panel", async () => {
    localStorage.setItem("lasca.local.nameDark", "Local Account");

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
            <select id="aiWhiteSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>
            <select id="aiBlackSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          displayName: "Local Account",
          avatarUrl: "/api/auth/avatar/local-account.png",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "checkers_8_us",
      breadcrumb: "Play / Checkers",
      title: "Checkers",
      subtitle: "Local auth avatar match test",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const matchingPanel = Array.from(document.querySelectorAll(".gameShellPlayerPanel")).find((panel) =>
      (panel.querySelector(".gameShellPlayerName")?.textContent ?? "").trim() === "Local Account",
    ) as HTMLElement | undefined;
    const image = matchingPanel?.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;

    expect(fetchMock).toHaveBeenCalled();
    expect(matchingPanel).toBeDefined();
    expect(image?.getAttribute("src")).toBe("http://localhost:3000/api/auth/avatar/local-account.png");
  });

  it("does not let stored local names override online player identities", async () => {
    localStorage.setItem("lasca.local.nameLight", "Delaila");
    localStorage.setItem("lasca.local.nameDark", "Delaila");

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea">
            <div id="boardWrap">
              <svg viewBox="0 0 1000 1000"></svg>
            </div>
          </div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot: PlayerShellSnapshot = {
      mode: "online",
      transportStatus: "connected",
      serverUrl: "http://localhost:9999",
      viewerColor: "W",
      viewerRole: "player",
      players: {
        W: {
          color: "W",
          displayName: "WhiteHost",
          sideLabel: "White",
          roleLabel: "You · White",
          detailText: "Your turn.",
          status: "online",
          statusText: "Connected",
          isLocal: true,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Senet",
          sideLabel: "Black",
          roleLabel: "Opponent · Black",
          detailText: "Watching for the next move.",
          status: "online",
          statusText: "Connected",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Online identity regression",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const names = Array.from(document.querySelectorAll(".gameShellPlayerName")).map((el) => el.textContent?.trim());

    expect(names).toContain("WhiteHost");
    expect(names).toContain("Senet");
    expect(names).not.toContain("Delaila");
  });

  it("uses online preview bot identities for a plain variant page opened from online mode", async () => {
    localStorage.setItem("lasca.local.nameLight", "EdB");
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "easy");
    localStorage.setItem("stackworks.bot.blackPersona", "teacher");
    localStorage.setItem("lasca.online.seatOwnerLight", "local");
    localStorage.setItem("lasca.online.seatOwnerDark", "remote");
    saveOpenVariantPageIntent({ variantId: "chess_classic", playMode: "online" });

    document.body.innerHTML = `
      <div id="host">
        <div id="appRoot">
          <div id="leftSidebar" class="sidebar"><div class="sidebarBody"></div></div>
          <div id="centerArea"><div id="boardWrap"><svg viewBox="0 0 1000 1000"></svg></div></div>
          <div id="rightSidebar" class="sidebar"><div class="sidebarBody"></div></div>
        </div>
      </div>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    const snapshot: PlayerShellSnapshot = {
      mode: "local",
      transportStatus: "connected",
      serverUrl: null,
      viewerColor: null,
      viewerRole: "offline",
      players: {
        W: {
          color: "W",
          displayName: "White",
          sideLabel: "White",
          roleLabel: "Local match",
          detailText: "To move.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: true,
        },
        B: {
          color: "B",
          displayName: "Black",
          sideLabel: "Black",
          roleLabel: "Local match",
          detailText: "Waiting for the next turn.",
          status: "offline",
          statusText: "Local play",
          isLocal: false,
          isActiveTurn: false,
        },
      },
    };

    const controller = {
      ...shellControllerLockStubs(),
      getPlayerShellSnapshot: () => snapshot,
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const appRoot = document.getElementById("appRoot") as HTMLElement;
    const shell = initGameShell({
      appRoot,
      variantId: "chess_classic",
      breadcrumb: "Play / Chess",
      title: "Classic Chess",
      subtitle: "Open Variant Page online preview",
      gameSection: GameSection.Play,
      navItems: [],
    });

    shell.bindController(controller as any);
    await Promise.resolve();
    await Promise.resolve();

    const names = Array.from(document.querySelectorAll(".gameShellPlayerName")).map((el) => el.textContent?.trim());
    const roles = Array.from(document.querySelectorAll(".gameShellPlayerRole")).map((el) => el.textContent?.trim());
    expect(names).toContain("EdB");
    expect(names).toContain("Teacher bot");
    expect(names).not.toContain("Online player");
    expect(roles).toContain("Bot · Black");
  });
});
