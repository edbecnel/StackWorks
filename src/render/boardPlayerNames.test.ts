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
});