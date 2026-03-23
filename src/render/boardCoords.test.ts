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

function makeSvg10x10(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  (svg as any).__checkerboardThemeId = "checkers";

  const squares = document.createElementNS(SVG_NS, "g") as SVGGElement;
  squares.id = "squares";
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      rect.setAttribute("x", String(100 + c * 80));
      rect.setAttribute("y", String(100 + r * 80));
      rect.setAttribute("width", "80");
      rect.setAttribute("height", "80");
      squares.appendChild(rect);
    }
  }
  svg.appendChild(squares);

  const nodes = document.createElementNS(SVG_NS, "g") as SVGGElement;
  nodes.id = "nodes";
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 !== 1) continue;
      const circle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      circle.setAttribute("id", `r${r}c${c}`);
      circle.setAttribute("cx", String(140 + c * 80));
      circle.setAttribute("cy", String(140 + r * 80));
      circle.setAttribute("r", "30");
      nodes.appendChild(circle);
    }
  }
  svg.appendChild(nodes);

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

  it("re-renders in-square label colors when the checkerboard theme changes", () => {
    const svg = makeSvg8x8();

    renderBoardCoords(svg, true, 8, { style: "inSquare" });
    expect(findText(svg, "a").getAttribute("fill")).toBe("#f0d9b5");

    (svg as any).__checkerboardThemeId = "candy";
    renderBoardCoords(svg, true, 8, { style: "inSquare" });

    expect(findText(svg, "a").getAttribute("fill")).toBe("#f5efff");
    expect(findText(svg, "8").getAttribute("fill")).toBe("#f4b199");
  });

  it("keeps 10x10 edge coordinates outside the board and in-square coordinates inside the board", () => {
    const svg = makeSvg10x10();

    renderBoardCoords(svg, true, 10, { style: "edge" });

    const edgeA = findText(svg, "A");
    const edgeOne = findText(svg, "1");
    expect(Number(edgeA.getAttribute("y"))).toBeGreaterThan(900);
    expect(Number(edgeOne.getAttribute("x"))).toBeLessThan(100);

    renderBoardCoords(svg, true, 10, { style: "inSquare" });

    const inSquareA = findText(svg, "a");
    const inSquareTen = findText(svg, "10");
    expect(Number(inSquareA.getAttribute("x"))).toBeLessThanOrEqual(900);
    expect(Number(inSquareA.getAttribute("y"))).toBeLessThanOrEqual(900);
    expect(Number(inSquareTen.getAttribute("x"))).toBeGreaterThanOrEqual(100);
    expect(Number(inSquareTen.getAttribute("y"))).toBeGreaterThanOrEqual(100);
    expect(inSquareTen.getAttribute("text-anchor")).toBe("end");
    // Right edge is anchored consistently near the right side of the square (same as single-digit ranks).
    expect(Number(inSquareTen.getAttribute("x"))).toBeCloseTo(173.6, 0);
  });

  it("renders the International Draughts perimeter numbering inside dark squares", () => {
    const svg = makeSvg10x10();

    renderBoardCoords(svg, true, 10, { style: "inSquareInternationalDraughts" });

    const texts = Array.from(svg.querySelectorAll("#boardCoords text"));
    expect(texts.length).toBe(18);
    expect(texts.map((node) => node.textContent?.trim())).toEqual([
      "1", "2", "3", "4", "5",
      "15", "25", "35", "45",
      "6", "16", "26", "36",
      "46", "47", "48", "49", "50",
    ]);

    const one = findText(svg, "1");
    expect(one.getAttribute("text-anchor")).toBe("end");
    expect(one.getAttribute("dominant-baseline")).toBe("hanging");
    expect(Number(one.getAttribute("x"))).toBeCloseTo(253.6, 3);
    expect(Number(one.getAttribute("y"))).toBeCloseTo(106.4, 3);

    const fifteen = findText(svg, "15");
    expect(fifteen.getAttribute("text-anchor")).toBe("end");
    expect(fifteen.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(Number(fifteen.getAttribute("x"))).toBeCloseTo(893.6, 3);
    expect(Number(fifteen.getAttribute("y"))).toBeCloseTo(338.4, 3);

    const six = findText(svg, "6");
    expect(six.getAttribute("text-anchor")).toBe("start");
    expect(six.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(Number(six.getAttribute("x"))).toBeCloseTo(106.4, 3);
    expect(Number(six.getAttribute("y"))).toBeCloseTo(258.4, 3);

    const fifty = findText(svg, "50");
    expect(fifty.getAttribute("text-anchor")).toBe("start");
    expect(fifty.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(Number(fifty.getAttribute("x"))).toBeCloseTo(746.4, 3);
    expect(Number(fifty.getAttribute("y"))).toBeCloseTo(898.4, 3);

    expect(svg.querySelector('#boardCoords text:not([transform])')?.textContent).toBeTruthy();
    expect(texts.some((node) => (node.textContent ?? "").trim() === "a")).toBe(false);
  });

  it("reverses displayed International Draughts perimeter numbering when flipped", () => {
    const svg = makeSvg10x10();

    renderBoardCoords(svg, true, 10, { style: "inSquareInternationalDraughts", flipped: true });

    const texts = Array.from(svg.querySelectorAll("#boardCoords text"));
    expect(texts.map((node) => node.textContent?.trim())).toEqual([
      "50", "49", "48", "47", "46",
      "36", "26", "16", "6",
      "45", "35", "25", "15",
      "5", "4", "3", "2", "1",
    ]);

    const topLeft = findText(svg, "50");
    expect(topLeft.getAttribute("text-anchor")).toBe("end");
    expect(topLeft.getAttribute("dominant-baseline")).toBe("hanging");
    expect(topLeft.getAttribute("transform") ?? "").toMatch(/^rotate\(180\s/);

    const bottomLeft = findText(svg, "5");
    expect(bottomLeft.getAttribute("text-anchor")).toBe("start");
    expect(bottomLeft.getAttribute("dominant-baseline")).toBe("alphabetic");
    expect(bottomLeft.getAttribute("transform") ?? "").toMatch(/^rotate\(180\s/);
  });

  it("marks coordinate labels as non-selectable", () => {
    const svg = makeSvg8x8();

    renderBoardCoords(svg, true, 8, { style: "inSquare" });

    const a = findText(svg, "a");
    expect(a.style.userSelect).toBe("none");
    expect((a.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect).toBe("none");
  });
});
