import { describe, it, expect } from "vitest";
import { applyBoardViewportModeToSvg, getBoardViewportMetrics } from "./boardViewport";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg8x8(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  const bgFill = document.createElementNS(SVG_NS, "g") as SVGGElement;
  bgFill.id = "bgFill";
  svg.appendChild(bgFill);

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

  const frame = document.createElementNS(SVG_NS, "g") as SVGGElement;
  frame.id = "frame";
  const frameRect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  frameRect.setAttribute("x", "60");
  frameRect.setAttribute("y", "60");
  frameRect.setAttribute("width", "880");
  frameRect.setAttribute("height", "880");
  frameRect.setAttribute("stroke-width", "10");
  frame.appendChild(frameRect);
  svg.appendChild(frame);

  document.body.appendChild(svg);
  return svg;
}

function makeSvg10x10(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");

  const bgFill = document.createElementNS(SVG_NS, "g") as SVGGElement;
  bgFill.id = "bgFill";
  svg.appendChild(bgFill);

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

  const frame = document.createElementNS(SVG_NS, "g") as SVGGElement;
  frame.id = "frame";
  const frameRect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  frameRect.setAttribute("x", "60");
  frameRect.setAttribute("y", "60");
  frameRect.setAttribute("width", "880");
  frameRect.setAttribute("height", "880");
  frameRect.setAttribute("stroke-width", "10");
  frame.appendChild(frameRect);
  svg.appendChild(frame);

  document.body.appendChild(svg);
  return svg;
}

describe("applyBoardViewportModeToSvg", () => {
  it("crops to squares + top/bottom strips and hides chrome", () => {
    const svg = makeSvg8x8();

    applyBoardViewportModeToSvg(svg, "playable", { boardSize: 8 });

    const metrics = getBoardViewportMetrics(svg);
    expect(metrics?.mode).toBe("playable");
    expect(metrics?.squares?.x).toBe(100);
    expect(metrics?.squares?.y).toBe(100);
    expect(metrics?.squares?.w).toBe(800);
    expect(metrics?.squares?.h).toBe(800);
    expect(metrics?.extraTop).toBeGreaterThanOrEqual(52);
    expect(metrics?.extraBottom).toBeGreaterThanOrEqual(12);

    // ViewBox should begin at the squares' left edge and extend above and below.
    const vb = svg.getAttribute("viewBox") ?? "";
    expect(vb.startsWith("100 ")).toBe(true);

    const frame = svg.querySelector("#frame") as SVGGElement | null;
    expect(frame?.getAttribute("display")).toBe("none");
  });

  it("restores original viewBox + chrome when switching back", () => {
    const svg = makeSvg8x8();

    applyBoardViewportModeToSvg(svg, "playable", { boardSize: 8 });
    applyBoardViewportModeToSvg(svg, "framed", { boardSize: 8 });

    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 1000");

    const frame = svg.querySelector("#frame") as SVGGElement | null;
    expect(frame?.getAttribute("display")).toBe(null);
  });

  it("infers and crops a 10x10 checkerboard correctly", () => {
    const svg = makeSvg10x10();

    applyBoardViewportModeToSvg(svg, "playable", { boardSize: 10 });

    const metrics = getBoardViewportMetrics(svg);
    expect(metrics?.mode).toBe("playable");
    expect(metrics?.squares?.boardSize).toBe(10);
    expect(metrics?.squares?.x).toBe(100);
    expect(metrics?.squares?.w).toBe(800);
    expect(metrics?.squares?.h).toBe(800);
    expect((svg.getAttribute("viewBox") ?? "").startsWith("100 ")).toBe(true);
  });

  it("preserves top and bottom breathing room for 10x10 boards in playable mode", () => {
    const svg = makeSvg10x10();

    applyBoardViewportModeToSvg(svg, "playable", { boardSize: 10 });

    const metrics = getBoardViewportMetrics(svg);
    expect(metrics?.mode).toBe("playable");
    expect(metrics?.extraTop).toBeGreaterThanOrEqual(52);
    expect(metrics?.extraBottom).toBeGreaterThanOrEqual(12);
  });
});
