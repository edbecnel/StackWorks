import { describe, it, expect } from "vitest";
import { renderGameState } from "./renderGameState.ts";
import type { GameState } from "../game/state.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function mkSvg() {
  const svg = document.createElementNS(SVG_NS, "svg") as unknown as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, "defs") as unknown as SVGDefsElement;
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
});
