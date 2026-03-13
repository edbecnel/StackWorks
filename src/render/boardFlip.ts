const SVG_NS = "http://www.w3.org/2000/svg";

import { getBoardViewportMetrics } from "./boardViewport";

function parseViewBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } {
  const raw = svg.getAttribute("viewBox") ?? "";
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => Number(p));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, w, h] = parts;
    return { x, y, w, h };
  }
  // Default for bundled board assets.
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

function shouldStayOutsideView(child: ChildNode): boolean {
  if (child.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (child as Element).tagName.toLowerCase();
  return tag === "defs" || tag === "style" || tag === "metadata";
}

function ensureBoardView(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#boardView") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "boardView";

  // Move all visual board content under the view group so we can rotate it.
  // Keep <defs>/<style>/<metadata> at the root for compatibility.
  const toMove: ChildNode[] = [];
  for (const child of Array.from(svg.childNodes)) {
    if (shouldStayOutsideView(child)) continue;
    toMove.push(child);
  }
  for (const child of toMove) g.appendChild(child);

  // Insert after <defs> if present, else append.
  const defs = svg.querySelector("defs");
  if (defs && defs.parentNode === svg) {
    if (defs.nextSibling) svg.insertBefore(g, defs.nextSibling);
    else svg.appendChild(g);
  } else {
    svg.appendChild(g);
  }

  return g;
}

export function setBoardFlipped(svg: SVGSVGElement, flipped: boolean): void {
  const view = ensureBoardView(svg);
  const vb = parseViewBox(svg);

  // IMPORTANT:
  // In playable-area viewport mode, the SVG viewBox often includes asymmetric
  // reserved strips above/below the squares. Rotating around the viewBox
  // center would shift the board up/down when flipped, which can cause HUD
  // overlap. Prefer rotating around the center of the actual square grid.
  const metrics = getBoardViewportMetrics(svg);
  const squares = metrics?.squares ?? null;
  const cx = squares ? (squares.x + squares.w / 2) : (vb.x + vb.w / 2);
  const cy = squares ? (squares.y + squares.h / 2) : (vb.y + vb.h / 2);

  if (flipped) {
    view.setAttribute("transform", `rotate(180 ${cx} ${cy})`);
    view.setAttribute("data-flipped", "1");
  } else {
    view.removeAttribute("transform");
    view.setAttribute("data-flipped", "0");
  }
}

export function isBoardFlipped(svg: SVGSVGElement): boolean {
  const view = svg.querySelector("#boardView") as SVGGElement | null;
  return (view?.getAttribute("data-flipped") ?? "0") === "1";
}
