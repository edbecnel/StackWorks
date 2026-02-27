import { describe, it, expect } from "vitest";
import { renderBoardCoords } from "./boardCoords";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg8x8(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  // Emulate checkerboard theme state set by applyCheckerboardTheme().
  (svg as any).__checkerboardThemeId = "classic";

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

  const pieces = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieces.id = "pieces";
  svg.appendChild(pieces);

  document.body.appendChild(svg);
  return svg;
}

function findText(svg: SVGSVGElement, text: string): SVGTextElement {
  const nodes = Array.from(svg.querySelectorAll("#boardCoords text")) as SVGTextElement[];
  const found = nodes.find((t) => (t.textContent ?? "").trim() === text);
  if (!found) throw new Error(`Missing text node: ${text}`);
  return found;
}

describe("renderBoardCoords (inSquare)", () => {
  it("renders lowercase files + ranks inside squares using opponent-square base color", () => {
    const svg = makeSvg8x8();

    renderBoardCoords(svg, true, 8, { style: "inSquare" });

    const texts = Array.from(svg.querySelectorAll("#boardCoords text"));
    expect(texts.length).toBe(16);

    // Bottom row (rank 1) file labels: 'a' is on a1 (dark square) so it uses light fill.
    const a = findText(svg, "a");
    expect(a.getAttribute("fill")).toBe("#f0d9b5");
    expect(a.getAttribute("text-anchor")).toBe("end");
    expect(a.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(Number(a.getAttribute("x"))).toBeCloseTo(192, 3);
    expect(Number(a.getAttribute("y"))).toBeCloseTo(892, 3);

    // Left column rank labels: '8' is on a8 (light square) so it uses dark fill.
    const eight = findText(svg, "8");
    expect(eight.getAttribute("fill")).toBe("#b58863");
    expect(eight.getAttribute("text-anchor")).toBe("start");
    expect(eight.getAttribute("dominant-baseline")).toBe("hanging");
    expect(Number(eight.getAttribute("x"))).toBeCloseTo(108, 3);
    expect(Number(eight.getAttribute("y"))).toBeCloseTo(108, 3);
  });

  it("keeps labels in the same screen corners when flipped", () => {
    const svg = makeSvg8x8();

    renderBoardCoords(svg, true, 8, { style: "inSquare", flipped: true });

    // With flip, bottom row on screen corresponds to unflipped row 0, and the file
    // label corner swaps so it still lands in the lower-right on screen.
    const a = findText(svg, "a");
    expect(Number(a.getAttribute("x"))).toBeCloseTo(107, 3);
    expect(Number(a.getAttribute("y"))).toBeCloseTo(109, 3);
    expect(a.getAttribute("text-anchor")).toBe("end");
    expect(a.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(a.getAttribute("transform") ?? "").toMatch(/^rotate\(180\s/);

    // With flip, left column on screen corresponds to unflipped last column.
    // Rank '8' is on h8 (dark square), so it uses light fill, and is placed in the
    // opposite corner pre-rotation.
    const eight = findText(svg, "8");
    expect(eight.getAttribute("fill")).toBe("#f0d9b5");
    expect(Number(eight.getAttribute("x"))).toBeCloseTo(892, 3);
    expect(Number(eight.getAttribute("y"))).toBeCloseTo(198, 3);
    expect(eight.getAttribute("text-anchor")).toBe("start");
    expect(eight.getAttribute("dominant-baseline")).toBe("hanging");
    expect(eight.getAttribute("transform") ?? "").toMatch(/^rotate\(180\s/);
  });
});
