import { describe, expect, it } from "vitest";
import {
  drawLastMoveSquares,
  drawSelectionChessCom,
  drawSelectionSquare,
  drawTargetsChessCom,
  drawTargetsSquares,
  ensureOverlayLayer,
} from "./overlays";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg8x8(): SVGSVGElement {
  document.body.innerHTML = "";

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  const pieces = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieces.id = "pieces";
  svg.appendChild(pieces);

  const squares = document.createElementNS(SVG_NS, "g") as SVGGElement;
  squares.id = "squares";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      rect.setAttribute("x", String(100 + c * 100));
      rect.setAttribute("y", String(100 + r * 100));
      rect.setAttribute("width", "100");
      rect.setAttribute("height", "100");
      squares.appendChild(rect);
    }
  }
  svg.appendChild(squares);

  const nodes = document.createElementNS(SVG_NS, "g") as SVGGElement;
  nodes.id = "nodes";
  for (const [id, cx, cy] of [
    ["r0c0", "150", "150"],
    ["r0c1", "250", "150"],
  ] as const) {
    const node = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    node.id = id;
    node.setAttribute("cx", cx);
    node.setAttribute("cy", cy);
    node.setAttribute("r", "40");
    nodes.appendChild(node);
  }
  svg.appendChild(nodes);

  document.body.appendChild(svg);
  return svg;
}

describe("drawLastMoveSquares", () => {
  it("renders classic last-move highlights with the existing cyan stroke", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawLastMoveSquares(overlays, "r0c0", "r0c1", "classic");

    const rects = svg.querySelectorAll("rect.last-move-square");
    expect(rects).toHaveLength(2);
    expect(rects[0]?.getAttribute("fill")).toContain("--lastMoveFromFill");
    expect(rects[0]?.getAttribute("stroke")).toContain("--lastMoveStroke");
    expect(rects[0]?.getAttribute("stroke-width")).toContain("6");
  });

  it("renders chess.com-style last-move highlights as full-square contrast fills", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawLastMoveSquares(overlays, "r0c0", "r0c1", "chesscom");

    const from = svg.querySelector(".last-move-square--from") as SVGRectElement | null;
    const to = svg.querySelector(".last-move-square--to") as SVGRectElement | null;
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    expect(from?.getAttribute("x")).toBe("100");
    expect(to?.getAttribute("x")).toBe("200");
    expect(from?.getAttribute("stroke")).toBe("none");
    expect(to?.getAttribute("stroke")).toBe("none");
    expect(from?.getAttribute("fill")).toBe("rgba(246, 246, 105, 0.42)");
    expect(to?.getAttribute("fill")).toBe("rgba(187, 203, 43, 0.68)");
  });
});

describe("drawTargetsChessCom", () => {
  it("renders centered chess.com-style destination dots", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawTargetsChessCom(overlays, ["r0c0", "r0c1"]);

    const dots = svg.querySelectorAll("circle.target-dot--chesscom");
    expect(dots).toHaveLength(2);
    expect(dots[0]?.getAttribute("cx")).toBe("150");
    expect(dots[0]?.getAttribute("cy")).toBe("150");
    expect(dots[0]?.getAttribute("r")).toBe("14");
    expect(dots[0]?.getAttribute("fill")).toBe("rgba(28, 28, 28, 0.26)");
    expect(dots[1]?.getAttribute("fill")).toBe("rgba(20, 20, 20, 0.22)");
    expect(dots[0]?.getAttribute("stroke")).toBe("none");
  });

  it("renders occupied capture targets as rings instead of dots", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawTargetsChessCom(overlays, ["r0c0", "r0c1"], ["r0c1"]);

    const ring = svg.querySelector(".target-ring--chesscom") as SVGCircleElement | null;
    const dots = svg.querySelectorAll(".target-dot--chesscom");
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute("cx")).toBe("250");
    expect(ring?.getAttribute("cy")).toBe("150");
    expect(ring?.getAttribute("stroke-width")).toBe("10");
    expect(ring?.getAttribute("fill")).toBe("rgba(20, 20, 20, 0.06)");
    expect(dots).toHaveLength(1);
    expect(dots[0]?.getAttribute("cx")).toBe("150");
  });
});

describe("drawSelectionChessCom", () => {
  it("renders a full-square modern selection overlay", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawSelectionChessCom(overlays, "r0c0");

    const selection = svg.querySelector(".squareHighlight--selection-chesscom") as SVGRectElement | null;
    expect(selection).not.toBeNull();
    expect(selection?.getAttribute("x")).toBe("100");
    expect(selection?.getAttribute("width")).toBe("100");
    expect(selection?.getAttribute("stroke")).toBe("none");
    expect(selection?.getAttribute("fill")).toBe("rgba(126, 179, 255, 0.30)");
  });
});

describe("classic square overlays", () => {
  it("renders selection and target squares with a thicker Classic border", () => {
    const svg = makeSvg8x8();
    const overlays = ensureOverlayLayer(svg);

    drawSelectionSquare(overlays, "r0c0");
    drawTargetsSquares(overlays, ["r0c1"]);

    const selection = svg.querySelector(".squareHighlight--selection") as SVGRectElement | null;
    const target = svg.querySelector(".squareHighlight--target") as SVGRectElement | null;
    expect(selection).not.toBeNull();
    expect(target).not.toBeNull();
    expect(selection?.getAttribute("stroke-width")).toBe("4");
    expect(target?.getAttribute("stroke-width")).toBe("4");
  });
});
