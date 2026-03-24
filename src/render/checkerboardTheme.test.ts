import { describe, expect, it } from "vitest";

import { applyCheckerboardTheme, normalizeCheckerboardThemeId } from "./checkerboardTheme";

const SVG_NS = "http://www.w3.org/2000/svg";

function make10x10CheckerboardSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  const squares = document.createElementNS(SVG_NS, "g") as SVGGElement;
  squares.setAttribute("id", "squares");

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      rect.setAttribute("x", String(100 + col * 80));
      rect.setAttribute("y", String(100 + row * 80));
      rect.setAttribute("width", "80");
      rect.setAttribute("height", "80");
      squares.appendChild(rect);
    }
  }

  svg.appendChild(squares);
  document.body.appendChild(svg);
  return svg;
}

function findRect(svg: SVGSVGElement, row: number, col: number): SVGRectElement {
  const x = String(100 + col * 80);
  const y = String(100 + row * 80);
  const rect = Array.from(svg.querySelectorAll("#squares rect")).find(
    (node) => node.getAttribute("x") === x && node.getAttribute("y") === y,
  ) as SVGRectElement | undefined;
  if (!rect) throw new Error(`Missing rect at row ${row}, col ${col}`);
  return rect;
}

describe("applyCheckerboardTheme", () => {
  it("preserves correct alternation on 10x10 checkerboards", () => {
    const svg = make10x10CheckerboardSvg();

    applyCheckerboardTheme(svg, "classic");

    expect(findRect(svg, 1, 2).getAttribute("fill")).toBe("#b58863");
    expect(findRect(svg, 1, 3).getAttribute("fill")).toBe("#f0d9b5");
    expect(findRect(svg, 2, 2).getAttribute("fill")).toBe("#f0d9b5");
    expect(findRect(svg, 2, 3).getAttribute("fill")).toBe("#b58863");

    expect(findRect(svg, 7, 7).getAttribute("fill")).toBe("#f0d9b5");
    expect(findRect(svg, 7, 8).getAttribute("fill")).toBe("#b58863");
    expect(findRect(svg, 8, 7).getAttribute("fill")).toBe("#b58863");
    expect(findRect(svg, 8, 8).getAttribute("fill")).toBe("#f0d9b5");

    svg.remove();
  });

  it("applies the Tournament ivory and walnut palette", () => {
    const svg = make10x10CheckerboardSvg();

    applyCheckerboardTheme(svg, "tournament");

    expect(findRect(svg, 1, 2).getAttribute("fill")).toBe("#6B4A2B");
    expect(findRect(svg, 1, 3).getAttribute("fill")).toBe("#F5F1E6");
    expect(findRect(svg, 2, 2).getAttribute("fill")).toBe("#F5F1E6");
    expect(findRect(svg, 2, 3).getAttribute("fill")).toBe("#6B4A2B");

    svg.remove();
  });
});

describe("normalizeCheckerboardThemeId", () => {
  it("accepts the Tournament board theme id", () => {
    expect(normalizeCheckerboardThemeId("tournament")).toBe("tournament");
  });
});