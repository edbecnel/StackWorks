import { ensureOverlayLayer } from "./overlays";

const SVG_NS = "http://www.w3.org/2000/svg";

export type AnnotationColor = "orange" | "green" | "red" | "blue";

export type BoardArrowMark = {
  kind: "arrow";
  from: string; // nodeId, e.g. r0c0
  to: string; // nodeId
  color: AnnotationColor;
};

export type BoardSquareMark = {
  kind: "square";
  at: string; // nodeId
  color: AnnotationColor;
};

export type BoardAnnotationsState = {
  arrows: BoardArrowMark[];
  squares: BoardSquareMark[];
};

function parseNodeIdFast(id: string): { r: number; c: number } | null {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const c = Number.parseInt(m[2], 10);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { r, c };
}

type SquareRect = { x: number; y: number; w: number; h: number };

function computeSquareRect(svg: SVGSVGElement, nodeId: string): SquareRect | null {
  const rc = parseNodeIdFast(nodeId);
  if (!rc) return null;

  const squares = svg.querySelector("#squares") as SVGGElement | null;
  if (squares) {
    const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
    if (rects.length > 0) {
      const first = rects[0];
      const w = Number.parseFloat(first.getAttribute("width") ?? "0");
      const h = Number.parseFloat(first.getAttribute("height") ?? "0");
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        let minX = Infinity;
        let minY = Infinity;
        for (const r of rects) {
          const x = Number.parseFloat(r.getAttribute("x") ?? "NaN");
          const y = Number.parseFloat(r.getAttribute("y") ?? "NaN");
          if (Number.isFinite(x)) minX = Math.min(minX, x);
          if (Number.isFinite(y)) minY = Math.min(minY, y);
        }
        if (Number.isFinite(minX) && Number.isFinite(minY)) {
          return { x: minX + rc.c * w, y: minY + rc.r * h, w, h };
        }
      }
    }
  }

  const node = document.getElementById(nodeId) as SVGCircleElement | null;
  if (!node) return null;
  const cx = Number.parseFloat(node.getAttribute("cx") ?? "NaN");
  const cy = Number.parseFloat(node.getAttribute("cy") ?? "NaN");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { x: cx - 50, y: cy - 50, w: 100, h: 100 };
}

function applyStrokeDefaults(el: SVGElement): void {
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
}

function applyRectDefaults(el: SVGRectElement): void {
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("shape-rendering", "crispEdges");
}

function colorToStrokeFill(color: AnnotationColor): { stroke: string; fill: string; arrowFill: string } {
  switch (color) {
    case "green":
      return { stroke: "rgba(0, 230, 118, 0.92)", fill: "rgba(0, 230, 118, 0.14)", arrowFill: "rgba(0, 230, 118, 0.92)" };
    case "red":
      return { stroke: "rgba(255, 77, 79, 0.92)", fill: "rgba(255, 77, 79, 0.12)", arrowFill: "rgba(255, 77, 79, 0.92)" };
    case "blue":
      return { stroke: "rgba(102, 204, 255, 0.92)", fill: "rgba(102, 204, 255, 0.14)", arrowFill: "rgba(102, 204, 255, 0.92)" };
    case "orange":
    default:
      return { stroke: "rgba(255, 159, 64, 0.92)", fill: "rgba(255, 159, 64, 0.14)", arrowFill: "rgba(255, 159, 64, 0.92)" };
  }
}

function ensureAnnotationsLayer(svg: SVGSVGElement): SVGGElement {
  const overlays = ensureOverlayLayer(svg);
  const existing = overlays.querySelector("#overlaysAnnotations") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "overlaysAnnotations";
  g.setAttribute("pointer-events", "none");

  const fx = overlays.querySelector("#overlaysFx") as SVGGElement | null;
  if (fx && fx.parentNode === overlays) {
    overlays.insertBefore(g, fx);
  } else {
    overlays.appendChild(g);
  }

  return g;
}

function clearLayer(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}

function getCircleCenter(nodeId: string): { cx: number; cy: number } | null {
  const node = document.getElementById(nodeId) as SVGCircleElement | null;
  if (!node) return null;
  const cx = Number.parseFloat(node.getAttribute("cx") ?? "NaN");
  const cy = Number.parseFloat(node.getAttribute("cy") ?? "NaN");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy };
}

function drawSquareMark(svg: SVGSVGElement, layer: SVGGElement, mark: BoardSquareMark): void {
  const rect = computeSquareRect(svg, mark.at);
  if (!rect) return;

  const { stroke, fill } = colorToStrokeFill(mark.color);

  const inset = 4;
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = Math.max(0, rect.w - inset * 2);
  const h = Math.max(0, rect.h - inset * 2);
  if (w <= 0 || h <= 0) return;

  const el = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  el.setAttribute("class", `board-annotation-square board-annotation-square--${mark.color}`);
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  el.setAttribute("fill", fill);
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", "3");
  applyRectDefaults(el);
  layer.appendChild(el);
}

function drawArrowMark(layer: SVGGElement, mark: BoardArrowMark): void {
  const a = getCircleCenter(mark.from);
  const b = getCircleCenter(mark.to);
  if (!a || !b) return;

  const fromRc = parseNodeIdFast(mark.from);
  const toRc = parseNodeIdFast(mark.to);
  const dr = fromRc && toRc ? toRc.r - fromRc.r : null;
  const dc = fromRc && toRc ? toRc.c - fromRc.c : null;
  const isKnightMove =
    dr !== null && dc !== null &&
    ((Math.abs(dr) === 1 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 1));

  const { stroke, arrowFill } = colorToStrokeFill(mark.color);

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `board-annotation-arrow board-annotation-arrow--${mark.color}`);

  // Keep arrow ends slightly away from exact centers.
  // Tail should start near the start-square edge (not under the piece).
  // Board tiles are ~100px; 40px from center is close to the edge.
  const startInset = 32;
  const endInset = 18;

  // Sizing: match common analysis-arrow feel.
  // - Stroke width +50% (10 -> 15)
  // - Arrowhead base width +75% (16 -> 28)
  const arrowStrokeW = 10;

  let headUx = 0;
  let headUy = 0;

  if (isKnightMove) {
    // Draw a 90° path: long axis first (like chess.com).
    const elbow =
      dc !== null && Math.abs(dc) === 2
        ? { x: b.cx, y: a.cy }
        : { x: a.cx, y: b.cy };

    const v1x = elbow.x - a.cx;
    const v1y = elbow.y - a.cy;
    const len1 = Math.hypot(v1x, v1y);
    if (!Number.isFinite(len1) || len1 < 1) return;
    const u1x = v1x / len1;
    const u1y = v1y / len1;

    const v2x = b.cx - elbow.x;
    const v2y = b.cy - elbow.y;
    const len2 = Math.hypot(v2x, v2y);
    if (!Number.isFinite(len2) || len2 < 1) return;
    const u2x = v2x / len2;
    const u2y = v2y / len2;

    const sx = a.cx + u1x * startInset;
    const sy = a.cy + u1y * startInset;
    const ex = b.cx - u2x * endInset;
    const ey = b.cy - u2y * endInset;

    const path = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    path.setAttribute("class", "board-annotation-arrow-path");
    path.setAttribute("d", `M ${sx} ${sy} L ${elbow.x} ${elbow.y} L ${ex} ${ey}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(arrowStrokeW));
    path.setAttribute("opacity", "0.92");
    applyStrokeDefaults(path);
    g.appendChild(path);

    headUx = u2x;
    headUy = u2y;
  } else {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1) return;
    const ux = dx / len;
    const uy = dy / len;

    const x1 = a.cx + ux * startInset;
    const y1 = a.cy + uy * startInset;
    const x2 = b.cx - ux * endInset;
    const y2 = b.cy - uy * endInset;

    const line = document.createElementNS(SVG_NS, "line") as SVGLineElement;
    line.setAttribute("class", "board-annotation-arrow-line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", String(arrowStrokeW));
    line.setAttribute("opacity", "0.92");
    applyStrokeDefaults(line);
    g.appendChild(line);

    headUx = ux;
    headUy = uy;
  }

  // Arrow head triangle (aligned to the final segment).
  const headLen = 18;
  const headW = 28;
  const hx = b.cx - headUx * 5;
  const hy = b.cy - headUy * 5;
  const px = -headUy;
  const py = headUx;

  const p1x = hx;
  const p1y = hy;
  const p2x = hx - headUx * headLen + px * (headW / 2);
  const p2y = hy - headUy * headLen + py * (headW / 2);
  const p3x = hx - headUx * headLen - px * (headW / 2);
  const p3y = hy - headUy * headLen - py * (headW / 2);

  const head = document.createElementNS(SVG_NS, "polygon") as SVGPolygonElement;
  head.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
  head.setAttribute("fill", arrowFill);
  head.setAttribute("opacity", "0.92");
  head.setAttribute("stroke", stroke);
  head.setAttribute("stroke-width", "1");
  applyStrokeDefaults(head);
  g.appendChild(head);

  layer.appendChild(g);
}

export function renderBoardAnnotations(svg: SVGSVGElement, state: BoardAnnotationsState): void {
  const layer = ensureAnnotationsLayer(svg);
  clearLayer(layer);

  // Draw squares first, then arrows on top.
  for (const s of state.squares) drawSquareMark(svg, layer, s);
  for (const a of state.arrows) drawArrowMark(layer, a);
}

export function clearBoardAnnotations(svg: SVGSVGElement): void {
  const overlays = ensureOverlayLayer(svg);
  const layer = overlays.querySelector("#overlaysAnnotations") as SVGGElement | null;
  if (!layer) return;
  clearLayer(layer);
}
