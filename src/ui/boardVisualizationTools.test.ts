import { describe, expect, it } from "vitest";
import { installBoardVisualizationTools } from "./boardVisualizationTools";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg8x8(): { svg: SVGSVGElement; node: SVGCircleElement } {
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

  const node = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  node.id = "r0c0";
  node.setAttribute("cx", "150");
  node.setAttribute("cy", "150");
  node.setAttribute("r", "40");
  nodes.appendChild(node);

  svg.appendChild(nodes);
  document.body.appendChild(svg);

  return { svg, node };
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function rightClick(node: Element): void {
  node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 }));
  node.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 }));
}

describe("installBoardVisualizationTools", () => {
  it("removes number annotations before other marks when X is active", () => {
    const { svg, node } = makeSvg8x8();
    installBoardVisualizationTools(svg);

    pressKey("5");
    rightClick(node);
    expect(svg.querySelector("text.board-annotation-number")?.textContent).toBe("5");

    pressKey("n");
    rightClick(node);
    expect(svg.querySelector(".board-annotation-pin")).not.toBeNull();
    expect(svg.querySelector("text.board-annotation-number")?.textContent).toBe("5");

    pressKey("x");
    rightClick(node);
    expect(svg.querySelector("text.board-annotation-number")).toBeNull();
    expect(svg.querySelector(".board-annotation-pin")).not.toBeNull();

    rightClick(node);
    expect(svg.querySelector(".board-annotation-pin")).toBeNull();
  });
});
