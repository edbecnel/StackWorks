import { ensureOverlayLayer } from "./overlays";

const SVG_NS = "http://www.w3.org/2000/svg";

function isTouchLikeEnvironment(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;
    if (coarse && noHover) return true;
  } catch {
    // ignore
  }

  try {
    const nav = navigator as any;
    return Number(nav?.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

export type AnnotationColor = "orange" | "green" | "red" | "blue";

export type BoardArrowMark = {
  kind: "arrow";
  from: string; // nodeId, e.g. r0c0
  to: string; // nodeId
  color: AnnotationColor;
  /**
   * Controls how a knight-move arrow bends.
   *  "x"       – horizontal axis first (elbow at the target column, source row)
   *  "y"       – vertical axis first (elbow at the source column, target row)
   *  "diagonal" – draw as a straight line (user traced diagonally)
   * Omitting this field falls back to long-axis-first (previous behaviour).
   */
  elbowFirst?: "x" | "y" | "diagonal";
};

export type BoardSquareMark = {
  kind: "square";
  at: string; // nodeId
  color: AnnotationColor;
};

export type BoardCircleMark = {
  kind: "circle";
  at: string; // nodeId
  color: AnnotationColor;
};

export type BoardPinMark = {
  kind: "pin";
  at: string; // nodeId
  color: AnnotationColor;
};

export type BoardProtectMark = {
  kind: "protect";
  at: string; // nodeId
  color: AnnotationColor;
};

export type BoardAnnotationsState = {
  arrows: BoardArrowMark[];
  squares: BoardSquareMark[];
  circles?: BoardCircleMark[];
  pins?: BoardPinMark[];
  protects?: BoardProtectMark[];
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

function drawCircleMark(svg: SVGSVGElement, layer: SVGGElement, mark: BoardCircleMark): void {
  const rect = computeSquareRect(svg, mark.at);
  if (!rect) return;

  const { stroke, fill } = colorToStrokeFill(mark.color);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2 - 6;
  if (r <= 0) return;

  const el = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  el.setAttribute("class", `board-annotation-circle board-annotation-circle--${mark.color}`);
  el.setAttribute("cx", String(cx));
  el.setAttribute("cy", String(cy));
  el.setAttribute("r", String(r));
  el.setAttribute("fill", fill);
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", "3");
  applyStrokeDefaults(el);
  layer.appendChild(el);
}

function drawPinMark(svg: SVGSVGElement, layer: SVGGElement, mark: BoardPinMark): void {
  const rect = computeSquareRect(svg, mark.at);
  if (!rect) return;

  const { stroke, arrowFill } = colorToStrokeFill(mark.color);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // Push-pin: same height envelope as protect (-18*sc to +22*sc = 40 units).
  const sc = rect.w / 100 * 0.75;  // 25% smaller than full tile scale
  const ox = cx;
  const oy = cy - 1 * sc;
  const sw = Math.max(1.5, 2 * sc);

  const capHw  = 14 * sc;  // cap half-width
  const capTop = oy - 18 * sc;  // top of cap  (matches protect top)
  const cr     =  4 * sc;  // corner radius
  const capBot = oy -  4 * sc;  // bottom of cap body
  const shldrY = oy +  2 * sc;  // where bezier shoulders end / neck begins
  const neckHw =  5 * sc;  // neck half-width
  const neckBot= oy + 12 * sc;  // base of neck
  const tipY   = oy + 22 * sc;  // needle tip  (matches protect bottom)

  const pinD = [
    `M ${ox - capHw + cr} ${capTop}`,
    `Q ${ox - capHw} ${capTop}  ${ox - capHw} ${capTop + cr}`,
    `L ${ox - capHw} ${capBot}`,
    `Q ${ox - capHw} ${shldrY}  ${ox - neckHw} ${shldrY}`,
    `L ${ox - neckHw} ${neckBot}`,
    `L ${ox}           ${tipY}`,
    `L ${ox + neckHw} ${neckBot}`,
    `L ${ox + neckHw} ${shldrY}`,
    `Q ${ox + capHw} ${shldrY}  ${ox + capHw} ${capBot}`,
    `L ${ox + capHw} ${capTop + cr}`,
    `Q ${ox + capHw} ${capTop}  ${ox + capHw - cr} ${capTop}`,
    `Z`,
  ].join(" ");

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `board-annotation-pin board-annotation-pin--${mark.color}`);
  g.setAttribute("opacity", "0.93");

  const pinPath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  pinPath.setAttribute("d", pinD);
  pinPath.setAttribute("fill", arrowFill);
  pinPath.setAttribute("stroke", stroke);
  pinPath.setAttribute("stroke-width", String(sw));
  pinPath.setAttribute("stroke-linejoin", "round");
  g.appendChild(pinPath);

  layer.appendChild(g);
}

function drawProtectMark(svg: SVGSVGElement, layer: SVGGElement, mark: BoardProtectMark): void {
  const rect = computeSquareRect(svg, mark.at);
  if (!rect) return;

  const { stroke, arrowFill } = colorToStrokeFill(mark.color);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // Heraldic shield with checkmark. Design coords (100-unit space).
  const sc = rect.w / 100 * 0.75;  // 25% smaller than full tile scale
  const ox = cx;
  const oy = cy - 1 * sc;

  const hw  = 16 * sc;  // half-width
  const top = -18 * sc; // top edge y
  const mid =   4 * sc; // y where straight sides end
  const bot =  22 * sc; // y of bottom tip

  const shieldD = [
    `M ${ox - hw} ${oy + top}`,
    `L ${ox + hw} ${oy + top}`,
    `L ${ox + hw} ${oy + mid}`,
    `Q ${ox + hw} ${oy + bot} ${ox} ${oy + bot}`,
    `Q ${ox - hw} ${oy + bot} ${ox - hw} ${oy + mid}`,
    `Z`,
  ].join(" ");

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `board-annotation-protect board-annotation-protect--${mark.color}`);
  g.setAttribute("opacity", "0.93");

  const shield = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  shield.setAttribute("d", shieldD);
  shield.setAttribute("fill", arrowFill);
  shield.setAttribute("stroke", stroke);
  shield.setAttribute("stroke-width", String(Math.max(1.5, 2 * sc)));
  applyStrokeDefaults(shield);
  g.appendChild(shield);

  // Checkmark (✓) centred inside the shield body.
  // Body vertical centre is halfway between top and mid.
  const xcy = oy + (top + mid) / 2;
  const ck = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  const ck1x = ox - 9 * sc,  ck1y = xcy + 2 * sc;   // left foot
  const ck2x = ox - 1 * sc,  ck2y = xcy + 9 * sc;   // valley
  const ck3x = ox + 11 * sc, ck3y = xcy - 9 * sc;   // upper-right tip
  ck.setAttribute("d", `M ${ck1x} ${ck1y} L ${ck2x} ${ck2y} L ${ck3x} ${ck3y}`);
  ck.setAttribute("fill", "none");
  ck.setAttribute("stroke", "rgba(255,255,255,0.92)");
  ck.setAttribute("stroke-width", String(Math.max(2, 3 * sc)));
  ck.setAttribute("stroke-linecap", "round");
  ck.setAttribute("stroke-linejoin", "round");
  g.appendChild(ck);

  layer.appendChild(g);
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

  // Sizing: keep arrows readable on coarse pointers (mobile/tablet).
  // On touch, overly thick strokes can obscure the arrow head.
  const touchLike = isTouchLikeEnvironment();
  const arrowStrokeW = touchLike ? 6 : 10;

  let headUx = 0;
  let headUy = 0;

  if (isKnightMove && mark.elbowFirst !== "diagonal") {
    // Draw a 90° L-shaped path.
    // Elbow orientation is driven by the stored hint (from drag direction);
    // falls back to long-axis-first when no hint is present.
    const ef = mark.elbowFirst;
    const useXFirst =
      ef === "x" ? true
      : ef === "y" ? false
      : (dc !== null && Math.abs(dc) === 2); // long-axis-first fallback
    const elbow = useXFirst ? { x: b.cx, y: a.cy } : { x: a.cx, y: b.cy };

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
  const headLen = touchLike ? 14 : 18;
  const headW = touchLike ? 20 : 28;
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

  // Draw background highlights first (squares and circles), then arrows,
  // then pin/protect symbols on top so they are never obscured by arrow lines.
  for (const s of state.squares)            drawSquareMark(svg, layer, s);
  for (const c of state.circles  ?? [])     drawCircleMark(svg, layer, c);
  for (const a of state.arrows)             drawArrowMark(layer, a);
  for (const p of state.pins     ?? [])     drawPinMark(svg, layer, p);
  for (const t of state.protects ?? [])     drawProtectMark(svg, layer, t);
}

export function clearBoardAnnotations(svg: SVGSVGElement): void {
  const overlays = ensureOverlayLayer(svg);
  const layer = overlays.querySelector("#overlaysAnnotations") as SVGGElement | null;
  if (!layer) return;
  clearLayer(layer);
}
