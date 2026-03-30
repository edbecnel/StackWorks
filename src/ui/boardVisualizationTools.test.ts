import { describe, expect, it, vi } from "vitest";
import { installBoardVisualizationTools } from "./boardVisualizationTools";

const SVG_NS = "http://www.w3.org/2000/svg";

if (typeof globalThis.PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
      this.pointerType = init?.pointerType ?? "";
    }
  } as typeof PointerEvent;
}

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

function pressAltKeyWithCode(key: string, code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, code, altKey: true, bubbles: true }));
}

function rightClick(node: Element): void {
  node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 }));
  node.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 }));
}

function leftClick(node: Element): void {
  node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 150, clientY: 150 }));
  node.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0, clientX: 150, clientY: 150 }));
}

describe("installBoardVisualizationTools", () => {
  it("removes number annotations before other marks when X is active", () => {
    const { svg, node } = makeSvg8x8();
    installBoardVisualizationTools(svg);

    pressKey("5");
    rightClick(node);
    expect(svg.querySelector("text.board-annotation-number")?.textContent).toBe("5");

    pressKey("n");
    expect(svg.querySelector(".board-annotation-pin")).not.toBeNull();
    expect(svg.querySelector("text.board-annotation-number")?.textContent).toBe("5");

    pressKey("x");
    rightClick(node);
    expect(svg.querySelector("text.board-annotation-number")).toBeNull();
    expect(svg.querySelector(".board-annotation-pin")).not.toBeNull();

    rightClick(node);
    expect(svg.querySelector(".board-annotation-pin")).toBeNull();
  });

  it("clears all annotations on Alt+X even when Alt changes the emitted key value", () => {
    const { svg, node } = makeSvg8x8();
    installBoardVisualizationTools(svg);

    rightClick(node);
    expect(svg.querySelector(".board-annotation-square")).not.toBeNull();

    pressAltKeyWithCode("≈", "KeyX");

    expect(svg.querySelector(".board-annotation-square")).toBeNull();
    expect(svg.querySelector(".board-annotation-circle")).toBeNull();
    expect(svg.querySelector(".board-annotation-pin")).toBeNull();
    expect(svg.querySelector("text.board-annotation-number")).toBeNull();
  });

  it("does not clear annotations on left click", () => {
    const { svg, node } = makeSvg8x8();
    installBoardVisualizationTools(svg);

    rightClick(node);
    expect(svg.querySelector(".board-annotation-square")).not.toBeNull();

    leftClick(node);

    expect(svg.querySelector(".board-annotation-square")).not.toBeNull();
  });

  it("places pin when touch drag crosses threshold but pointerup is on the same square", () => {
    const { svg, node } = makeSvg8x8();
    (svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
    (svg as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn();

    // JSDOM may omit elementFromPoint; a null hit still exercises the same-square / off-board fallback.
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(null),
    });

    installBoardVisualizationTools(svg, { isTouchInputEnabled: () => true });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));

    const ptr = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 42,
        pointerType: "touch",
      });

    try {
      node.dispatchEvent(ptr("pointerdown", 150, 150));
      node.dispatchEvent(ptr("pointermove", 165, 150));
      node.dispatchEvent(ptr("pointerup", 150, 150));

      expect(svg.querySelector("g.board-annotation-pin")).not.toBeNull();
    } finally {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  });
});
