import { describe, it, expect } from "vitest";
import { renderGameState } from "./renderGameState.ts";
import type { GameState } from "../game/state.ts";
import { pieceToHref } from "../pieces/pieceToHref.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function appendTestPieceSymbols(defs: SVGDefsElement): void {
  for (const id of ["W_S", "B_S", "W_O", "B_O", "W_K", "B_K"]) {
    const symbol = document.createElementNS(SVG_NS, "symbol") as SVGSymbolElement;
    symbol.setAttribute("id", id);
    symbol.setAttribute("viewBox", "0 0 100 100");

    const circle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "42");
    circle.setAttribute("fill", id.startsWith("W_") ? "url(#marbleVeins)" : "url(#graniteSpeckles)");
    symbol.appendChild(circle);

    defs.appendChild(symbol);
  }
}

function mkSvg() {
  const svg = document.createElementNS(SVG_NS, "svg") as unknown as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, "defs") as unknown as SVGDefsElement;
  appendTestPieceSymbols(defs);
  svg.appendChild(defs);

  // Provide a board node the renderer looks up by id
  const circle = document.createElementNS(SVG_NS, "circle") as unknown as SVGCircleElement;
  circle.setAttribute("id", "r3c3");
  circle.setAttribute("cx", "100");
  circle.setAttribute("cy", "100");
  circle.setAttribute("r", "40");
  svg.appendChild(circle);

  // Pieces layer
  const g = document.createElementNS(SVG_NS, "g") as unknown as SVGGElement;
  g.setAttribute("id", "pieces");
  svg.appendChild(g);
  return { svg, pieces: g };
}

function mkSvg10x10(radius = 30) {
  const svg = document.createElementNS(SVG_NS, "svg") as unknown as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, "defs") as unknown as SVGDefsElement;
  appendTestPieceSymbols(defs);
  svg.appendChild(defs);

  for (const [id, cx, cy] of [
    ["r6c1", 180, 660],
    ["r5c2", 260, 580],
  ] as const) {
    const circle = document.createElementNS(SVG_NS, "circle") as unknown as SVGCircleElement;
    circle.setAttribute("id", id);
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(radius));
    svg.appendChild(circle);
  }

  const g = document.createElementNS(SVG_NS, "g") as unknown as SVGGElement;
  g.setAttribute("id", "pieces");
  svg.appendChild(g);
  return { svg, pieces: g };
}

describe("renderGameState", () => {
  it("renders stacks from GameState into pieces layer", () => {
    const { svg, pieces } = mkSvg();
    // Attach to document so getElementById can find nodes
    document.body.appendChild(svg);

    const state: GameState = {
      board: new Map([
        [
          "r3c3",
          [
            { owner: "B", rank: "S" },
            { owner: "W", rank: "O" },
          ],
        ],
      ]),
      toMove: "B",
      phase: "idle",
    };

    renderGameState(svg, pieces, null, state);

    // renderGameState creates internal layers within #pieces
    const pieceStacksLayer = pieces.querySelector('g[data-layer="pieceStacks"]') as
      | SVGGElement
      | null;
    const miniSpinesLayer = pieces.querySelector('g[data-layer="miniSpines"]') as
      | SVGGElement
      | null;

    expect(pieceStacksLayer).toBeTruthy();
    expect(miniSpinesLayer).toBeTruthy();

    // Should only render our single stack into the pieceStacks layer
    expect(pieceStacksLayer!.children.length).toBe(1);
    const stackG = pieceStacksLayer!.children[0] as SVGGElement;
    expect(stackG.getAttribute("class")).toBe("stack");
    expect(stackG.getAttribute("data-node")).toBe("r3c3");

    // Should contain at least one <use> element for the top piece
    const useEl = stackG.querySelector("use");
    expect(useEl).toBeTruthy();
    expect(useEl!.getAttribute("href")).toBeDefined();
    expect(Number(useEl!.getAttribute("width"))).toBeCloseTo(86, 3);
  });

  it("scales piece size down from the node radius on smaller checkerboards", () => {
    const { svg, pieces } = mkSvg();
    document.body.appendChild(svg);

    const node = svg.querySelector("#r3c3") as SVGCircleElement;
    node.setAttribute("r", "30");

    const state: GameState = {
      board: new Map([["r3c3", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "draughts_10_international" as any,
        rulesetId: "draughts_international" as any,
        boardSize: 10 as any,
      },
    };

    renderGameState(svg, pieces, null, state);

    const useEl = pieces.querySelector('g[data-layer="pieceStacks"] use') as SVGUseElement | null;
    expect(useEl).toBeTruthy();
    expect(Number(useEl!.getAttribute("width"))).toBeCloseTo(64.5, 3);
    expect(Number(useEl!.getAttribute("height"))).toBeCloseTo(64.5, 3);
  });

  it("supports non-chess piece themes on the 10x10 board", () => {
    const cases = [
      { themeId: "neo", expectedHref: "#W_S" },
      { themeId: "candy", expectedHref: "#W_S" },
      { themeId: "raster3d", expectedHref: "#W_S" },
      { themeId: "wooden", expectedPattern: /^#W_S_v\d+$/ },
      { themeId: "stone", expectedPattern: /^#W_S__/ },
      { themeId: "semiprecious", expectedPattern: /^#W_S__/ },
    ] as const;

    for (const testCase of cases) {
      const { svg, pieces } = mkSvg10x10();
      document.body.appendChild(svg);
      svg.setAttribute("data-theme-id", testCase.themeId);

      const state: GameState = {
        board: new Map([["r6c1", [{ owner: "W", rank: "S" }]]]),
        toMove: "W",
        phase: "idle",
        meta: {
          variantId: "draughts_10_international" as any,
          rulesetId: "draughts_international" as any,
          boardSize: 10 as any,
        },
      };

      renderGameState(svg, pieces, null, state);

      const useEl = pieces.querySelector('g[data-layer="pieceStacks"] use') as SVGUseElement | null;
      expect(useEl).toBeTruthy();
      const href = String(useEl!.getAttribute("href") ?? "");
      if ("expectedHref" in testCase) {
        expect(href).toBe(testCase.expectedHref);
      } else {
        expect(href).toMatch(testCase.expectedPattern);
      }
      expect(Number(useEl!.getAttribute("width"))).toBeCloseTo(64.5, 3);
      expect(Number(useEl!.getAttribute("height"))).toBeCloseTo(64.5, 3);

      svg.remove();
    }
  });

  it("keeps 10x10 piece stacks within node-sized bounds used by smaller mobile layouts", () => {
    const { svg, pieces } = mkSvg10x10(24);
    document.body.appendChild(svg);

    const state: GameState = {
      board: new Map([
        ["r6c1", [{ owner: "W", rank: "S" }]],
        ["r5c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "draughts_10_international" as any,
        rulesetId: "draughts_international" as any,
        boardSize: 10 as any,
      },
    };

    renderGameState(svg, pieces, null, state);

    const uses = Array.from(pieces.querySelectorAll('g[data-layer="pieceStacks"] use')) as SVGUseElement[];
    expect(uses).toHaveLength(2);
    for (const useEl of uses) {
      expect(Number(useEl.getAttribute("width"))).toBeCloseTo(51.6, 3);
      expect(Number(useEl.getAttribute("height"))).toBeCloseTo(51.6, 3);
    }
  });

  it("uses the Candy dama king symbol for promoted dama pieces", () => {
    expect(pieceToHref({ owner: "W", rank: "O" }, { rulesetId: "dama", themeId: "candy" })).toBe("#W_DK");
    expect(pieceToHref({ owner: "B", rank: "O" }, { rulesetId: "dama", themeId: "candy" })).toBe("#B_DK");
  });
});
