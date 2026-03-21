import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initGameShell } from "./gameShell";
import { GameSection } from "../../config/shellState";
import type { PlayerShellSnapshot } from "../../types";

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
    const metaChips = Array.from(document.querySelectorAll(".gameShellPlayerMetaChip")).map((el) => el.textContent?.trim());

    expect(fetchMock).toHaveBeenCalled();
    expect(roles.at(-1)).toBe("Bot · White");
    expect(metaChips).toContain("Bot");
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

    snapshot.players.W = { ...snapshot.players.W, isActiveTurn: false, detailText: "Waiting for the opponent move." };
    snapshot.players.B = { ...snapshot.players.B, isActiveTurn: true, detailText: "Opponent to move." };
    onHistoryChange?.();

    expect(getActiveChip(whitePanel).hidden).toBe(true);
    expect(getActiveChip(blackPanel).hidden).toBe(false);
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
});
