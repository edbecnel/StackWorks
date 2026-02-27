import { describe, it, expect } from "vitest";
import { renderBoardAnnotations, clearBoardAnnotations, type BoardAnnotationsState } from "./boardAnnotations";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg8x8(): SVGSVGElement {
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

  const n00 = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  n00.id = "r0c0";
  n00.setAttribute("cx", "150");
  n00.setAttribute("cy", "150");
  n00.setAttribute("r", "40");
  nodes.appendChild(n00);

  const n01 = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  n01.id = "r0c1";
  n01.setAttribute("cx", "250");
  n01.setAttribute("cy", "150");
  n01.setAttribute("r", "40");
  nodes.appendChild(n01);

  const n12 = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  n12.id = "r1c2";
  n12.setAttribute("cx", "350");
  n12.setAttribute("cy", "250");
  n12.setAttribute("r", "40");
  nodes.appendChild(n12);

  svg.appendChild(nodes);

  document.body.appendChild(svg);
  return svg;
}

describe("renderBoardAnnotations", () => {
  it("renders square highlights + arrows into overlaysAnnotations", () => {
    const svg = makeSvg8x8();

    const state: BoardAnnotationsState = {
      squares: [{ kind: "square", at: "r0c0", color: "red" }],
      arrows: [{ kind: "arrow", from: "r0c0", to: "r0c1", color: "green" }],
    };

    renderBoardAnnotations(svg, state);

    const overlays = svg.querySelector("#overlays") as SVGGElement | null;
    expect(overlays).not.toBeNull();

    const ann = overlays?.querySelector("#overlaysAnnotations") as SVGGElement | null;
    expect(ann).not.toBeNull();

    const rect = ann?.querySelector("rect.board-annotation-square") as SVGRectElement | null;
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute("vector-effect")).toBe("non-scaling-stroke");

    const line = ann?.querySelector("line") as SVGLineElement | null;
    const head = ann?.querySelector("polygon") as SVGPolygonElement | null;
    expect(line).not.toBeNull();
    expect(head).not.toBeNull();
    expect(line?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(line?.getAttribute("stroke-width")).toBe("15");

    // Tail should start near the start-square edge.
    expect(Number(line?.getAttribute("x1"))).toBeCloseTo(190, 3);
    expect(Number(line?.getAttribute("y1"))).toBeCloseTo(150, 3);
    // End remains inset near the destination.
    expect(Number(line?.getAttribute("x2"))).toBeCloseTo(228, 3);
    expect(Number(line?.getAttribute("y2"))).toBeCloseTo(150, 3);

    // Ensure overlaysFx is still on top of annotations.
    const fx = overlays?.querySelector("#overlaysFx") as SVGGElement | null;
    expect(fx).not.toBeNull();
    const children = Array.from(overlays?.children ?? []);
    const annIdx = children.findIndex((c) => (c as Element).id === "overlaysAnnotations");
    const fxIdx = children.findIndex((c) => (c as Element).id === "overlaysFx");
    expect(annIdx).toBeGreaterThanOrEqual(0);
    expect(fxIdx).toBeGreaterThanOrEqual(0);
    expect(annIdx).toBeLessThan(fxIdx);

    clearBoardAnnotations(svg);
    expect(ann?.childNodes.length).toBe(0);
  });

  it("renders knight-move arrows as 90-degree paths", () => {
    const svg = makeSvg8x8();

    const state: BoardAnnotationsState = {
      squares: [],
      arrows: [{ kind: "arrow", from: "r0c0", to: "r1c2", color: "orange" }],
    };

    renderBoardAnnotations(svg, state);

    const overlays = svg.querySelector("#overlays") as SVGGElement | null;
    const ann = overlays?.querySelector("#overlaysAnnotations") as SVGGElement | null;
    expect(ann).not.toBeNull();

    const path = ann?.querySelector("path.board-annotation-arrow-path") as SVGPathElement | null;
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d") ?? "").toMatch(/^M\s/);
    expect(path?.getAttribute("stroke-width")).toBe("15");

    // Starts near the start-square edge (from r0c0 at 150,150).
    expect(path?.getAttribute("d") ?? "").toContain("M 190 150");

    // Still ends with a normal arrow head.
    const head = ann?.querySelector("polygon") as SVGPolygonElement | null;
    expect(head).not.toBeNull();
  });
});
