import { describe, expect, it, vi } from "vitest";
import type { PlayerShellSnapshot } from "../types";
import { bindBoardPlayerNameOverlay } from "./boardPlayerNames";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(): SVGSVGElement {
  document.body.innerHTML = "";

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  const pieces = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieces.id = "pieces";
  svg.appendChild(pieces);

  const squares = document.createElementNS(SVG_NS, "g") as SVGGElement;
  squares.id = "squares";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      rect.setAttribute("x", String(100 + col * 100));
      rect.setAttribute("y", String(100 + row * 100));
      rect.setAttribute("width", "100");
      rect.setAttribute("height", "100");
      squares.appendChild(rect);
    }
  }
  svg.appendChild(squares);
  document.body.appendChild(svg);
  return svg;
}

function makeLocalSnapshot(): PlayerShellSnapshot {
  return {
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
}

describe("bindBoardPlayerNameOverlay", () => {
  it("seeds local start-page names into the controller and renders them on the board", () => {
    const svg = makeSvg();
    localStorage.setItem("lasca.local.nameLight", "Ada");
    localStorage.setItem("lasca.local.nameDark", "Byron");

    const snapshot = makeLocalSnapshot();
    const setLocalPlayerDisplayNames = vi.fn((names: Partial<Record<"W" | "B", string>>) => {
      if (typeof names.W === "string" && names.W.trim()) snapshot.players.W.displayName = names.W.trim();
      if (typeof names.B === "string" && names.B.trim()) snapshot.players.B.displayName = names.B.trim();
    });
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames,
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const overlay = bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });

    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);

    expect(setLocalPlayerDisplayNames).toHaveBeenCalledWith({ W: "Ada", B: "Byron" });
    expect(labels).toEqual(["Byron", "Ada"]);
    expect(overlay.hasNames()).toBe(true);
  });

  it("swaps top and bottom labels when the board is flipped", () => {
    const svg = makeSvg();
    localStorage.setItem("lasca.local.nameLight", "Ada");
    localStorage.setItem("lasca.local.nameDark", "Byron");

    const snapshot = makeLocalSnapshot();
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames: vi.fn((names: Partial<Record<"W" | "B", string>>) => {
        if (typeof names.W === "string" && names.W.trim()) snapshot.players.W.displayName = names.W.trim();
        if (typeof names.B === "string" && names.B.trim()) snapshot.players.B.displayName = names.B.trim();
      }),
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const overlay = bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => true,
    });
    overlay.sync();

    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);
    expect(labels).toEqual(["Ada", "Byron"]);
  });

  it("does not seed local names into online snapshots", () => {
    const svg = makeSvg();
    localStorage.setItem("lasca.local.nameLight", "Ada");
    localStorage.setItem("lasca.local.nameDark", "Byron");

    const snapshot: PlayerShellSnapshot = {
      mode: "online",
      transportStatus: "connected",
      serverUrl: "http://localhost:9999",
      viewerColor: "W",
      viewerRole: "player",
      players: {
        W: {
          color: "W",
          displayName: "Host",
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
    const setLocalPlayerDisplayNames = vi.fn();
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames,
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const overlay = bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });

    expect(setLocalPlayerDisplayNames).not.toHaveBeenCalled();
    expect(Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent)).toEqual(["Senet", "Host"]);
    expect(overlay.hasNames()).toBe(true);
  });

  it("renders spectator names from an online shell snapshot", () => {
    const svg = makeSvg();

    const snapshot: PlayerShellSnapshot = {
      mode: "online",
      transportStatus: "connected",
      serverUrl: "http://localhost:9999",
      viewerColor: null,
      viewerRole: "spectator",
      players: {
        W: {
          color: "W",
          displayName: "Alice",
          sideLabel: "White",
          roleLabel: "Spectator view",
          detailText: "Watching the live game.",
          status: "spectating",
          statusText: "Spectating",
          isLocal: false,
          isActiveTurn: false,
        },
        B: {
          color: "B",
          displayName: "Bob",
          sideLabel: "Black",
          roleLabel: "Spectator view",
          detailText: "Watching the live game.",
          status: "spectating",
          statusText: "Spectating",
          isLocal: false,
          isActiveTurn: true,
        },
      },
    };
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames: vi.fn(),
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    const overlay = bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });

    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);
    const weights = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.getAttribute("font-weight"));

    expect(labels).toEqual(["Bob", "Alice"]);
    expect(weights).toEqual(["800", "500"]);
    expect(overlay.hasNames()).toBe(true);
  });

  it("renders the bot persona and signed-in human name for a local bot game", async () => {
    const svg = makeSvg();
    localStorage.removeItem("lasca.local.nameLight");
    localStorage.removeItem("lasca.local.nameDark");
    document.body.insertAdjacentHTML("beforeend", [
      '<select id="botWhiteSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>',
      '<select id="botBlackSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>',
    ].join(""));
    localStorage.setItem("stackworks.bot.blackPersona", "teacher");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "Local Account" } }),
    })));

    const snapshot = makeLocalSnapshot();
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames: vi.fn((names: Partial<Record<"W" | "B", string>>) => {
        if (typeof names.W === "string" && names.W.trim()) snapshot.players.W.displayName = names.W.trim();
        if (typeof names.B === "string" && names.B.trim()) snapshot.players.B.displayName = names.B.trim();
      }),
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);
    expect(labels).toEqual(["Teacher bot", "Local Account"]);
  });

  it("falls back to the human side label when no signed-in user is available for a local bot game", async () => {
    const svg = makeSvg();
    localStorage.removeItem("lasca.local.nameLight");
    localStorage.removeItem("lasca.local.nameDark");
    document.body.insertAdjacentHTML("beforeend", [
      '<select id="botWhiteSelect"><option value="human" selected>Human</option><option value="easy">Easy</option></select>',
      '<select id="botBlackSelect"><option value="human">Human</option><option value="easy" selected>Easy</option></select>',
    ].join(""));
    localStorage.setItem("stackworks.bot.blackPersona", "teacher");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: null }),
    })));

    const snapshot = makeLocalSnapshot();
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames: vi.fn((names: Partial<Record<"W" | "B", string>>) => {
        if (typeof names.W === "string" && names.W.trim()) snapshot.players.W.displayName = names.W.trim();
        if (typeof names.B === "string" && names.B.trim()) snapshot.players.B.displayName = names.B.trim();
      }),
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn(),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);
    expect(labels).toEqual(["Teacher bot", "White"]);
  });

  it("re-syncs controller display names from storage on newGame so stale snapshots are not kept", () => {
    const svg = makeSvg();
    localStorage.setItem("lasca.local.nameLight", "Ada");
    localStorage.setItem("lasca.local.nameDark", "Byron");

    const snapshot = makeLocalSnapshot();
    let historyReasonHandler: ((reason: string) => void) | null = null;
    const setLocalPlayerDisplayNames = vi.fn((names: Partial<Record<"W" | "B", string>>) => {
      if (typeof names.W === "string" && names.W.trim()) snapshot.players.W.displayName = names.W.trim();
      else snapshot.players.W.displayName = "White";
      if (typeof names.B === "string" && names.B.trim()) snapshot.players.B.displayName = names.B.trim();
      else snapshot.players.B.displayName = "Black";
    });
    const controller = {
      getPlayerShellSnapshot: () => snapshot,
      setLocalPlayerDisplayNames,
      isShellStartupPlayLockEnabled: vi.fn(() => false),
      clearSeatDisplayNamesSavePin: vi.fn(),
      getSavePinnedSeatDisplayName: vi.fn(() => undefined),
      isLoadedGameSeatLabelsActive: vi.fn(() => false),
      pinSeatDisplayNamesFromSavedGame: vi.fn(),
      addHistoryChangeCallback: vi.fn((cb: (reason: string) => void) => {
        historyReasonHandler = cb;
      }),
      addShellSnapshotChangeCallback: vi.fn(),
      addAnalysisModeChangeCallback: vi.fn(),
    };

    bindBoardPlayerNameOverlay({
      svg,
      controller: controller as any,
      isFlipped: () => false,
    });

    snapshot.players.W.displayName = "StaleFromLoadedGame";
    snapshot.players.B.displayName = "OtherStale";

    expect(historyReasonHandler).not.toBeNull();
    historyReasonHandler!("newGame");

    expect(setLocalPlayerDisplayNames).toHaveBeenLastCalledWith({ W: "Ada", B: "Byron" });
    const labels = Array.from(svg.querySelectorAll("#playerNameLayer text")).map((node) => node.textContent);
    expect(labels).toEqual(["Byron", "Ada"]);
  });
});