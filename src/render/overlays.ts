import {
  DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE,
  type LastMoveHighlightStyle,
} from "./highlightStyles";

const SVG_NS = "http://www.w3.org/2000/svg";
const FX_OVERLAY_ROOT_ID = "overlays";
const LAST_MOVE_BACKGROUND_ROOT_ID = "underPieceLastMove";

const SELECTION_STROKE_W = 5;
const TARGET_STROKE_W = 5;
const MIN_HIGHLIGHT_STROKE_W = 6;

const DEFAULT_LAST_MOVE_FROM_FILL = "rgba(102, 204, 255, 0.22)";
const DEFAULT_LAST_MOVE_TO_FILL = "rgba(102, 204, 255, 0.36)";
const DEFAULT_LAST_MOVE_STROKE = "rgba(102, 204, 255, 0.72)";
const DEFAULT_LAST_MOVE_STROKE_W = 6;
const CLASSIC_SQUARE_STROKE_W = 4;
const CHESSCOM_TARGET_DOT_LIGHT_FILL = "rgba(28, 28, 28, 0.26)";
const CHESSCOM_TARGET_DOT_DARK_FILL = "rgba(20, 20, 20, 0.22)";
const CHESSCOM_TARGET_DOT_MIN_RADIUS = 13;
const CHESSCOM_TARGET_DOT_MAX_RADIUS = 16;
const CHESSCOM_TARGET_DOT_SCALE = 0.34;
const CHESSCOM_TARGET_RING_LIGHT_STROKE = "rgba(28, 28, 28, 0.34)";
const CHESSCOM_TARGET_RING_DARK_STROKE = "rgba(20, 20, 20, 0.30)";
const CHESSCOM_TARGET_RING_LIGHT_FILL = "rgba(28, 28, 28, 0.08)";
const CHESSCOM_TARGET_RING_DARK_FILL = "rgba(20, 20, 20, 0.06)";
const CHESSCOM_TARGET_RING_STROKE_W = 10;

const CHESSCOM_SELECTION_LIGHT_FILL = "rgba(126, 179, 255, 0.30)";
const CHESSCOM_SELECTION_DARK_FILL = "rgba(78, 131, 213, 0.40)";

const CHESSCOM_LAST_MOVE_LIGHT_FROM_FILL = "rgba(246, 246, 105, 0.42)";
const CHESSCOM_LAST_MOVE_LIGHT_TO_FILL = "rgba(246, 246, 105, 0.6)";
const CHESSCOM_LAST_MOVE_DARK_FROM_FILL = "rgba(187, 203, 43, 0.5)";
const CHESSCOM_LAST_MOVE_DARK_TO_FILL = "rgba(187, 203, 43, 0.68)";

type SquareRect = { x: number; y: number; w: number; h: number };
type SquareTone = "light" | "dark";

function resolveOverlayRoot(layer: SVGGElement): SVGGElement {
  if (layer.id === FX_OVERLAY_ROOT_ID) return layer;
  const root = layer.closest?.(`#${FX_OVERLAY_ROOT_ID}`) as SVGGElement | null;
  return root ?? layer;
}

function ensureLastMoveBackgroundRoot(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector(`#${LAST_MOVE_BACKGROUND_ROOT_ID}`) as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = LAST_MOVE_BACKGROUND_ROOT_ID;
  g.setAttribute("pointer-events", "none");

  const pieces = svg.querySelector("#pieces") as SVGGElement | null;
  if (pieces && pieces.parentNode) {
    pieces.parentNode.insertBefore(g, pieces);
  } else {
    svg.appendChild(g);
  }

  return g;
}

function ensureOverlaySubLayer(root: SVGGElement, id: string): SVGGElement {
  const existing = root.querySelector(`#${id}`) as SVGGElement | null;
  if (existing) return existing;
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = id;
  g.setAttribute("pointer-events", "none");
  root.appendChild(g);
  return g;
}

function fxLayerFromAny(layer: SVGGElement): SVGGElement {
  const root = resolveOverlayRoot(layer);
  // Ensure ordering: last-move squares below FX halos.
  ensureOverlaySubLayer(root, "overlaysLastMove");
  const fx = ensureOverlaySubLayer(root, "overlaysFx");
  return fx;
}

function lastMoveLayerFromAny(layer: SVGGElement): SVGGElement {
  const svg = svgFromLayer(layer);
  if (!svg) return ensureOverlaySubLayer(resolveOverlayRoot(layer), "overlaysLastMove");
  const root = ensureLastMoveBackgroundRoot(svg);
  const last = ensureOverlaySubLayer(root, "overlaysLastMove");
  return last;
}

function makeHalo(layer: SVGGElement, args: { cx: number; cy: number; r: number; kind: "selection" | "target" | "highlight" }): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `halo halo--${args.kind}`);
  g.setAttribute("pointer-events", "none");

  const glow = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  glow.setAttribute("class", "halo-glow");
  glow.setAttribute("cx", String(args.cx));
  glow.setAttribute("cy", String(args.cy));
  glow.setAttribute("r", String(args.r));
  glow.setAttribute("fill", "none");
  glow.setAttribute("stroke", args.kind === "target" ? "#00e676" : args.kind === "highlight" ? "#ff9f40" : "#66ccff");
  glow.setAttribute("stroke-width", String(Math.max(SELECTION_STROKE_W, TARGET_STROKE_W) + 4));
  applyStrokeDefaults(glow);
  g.appendChild(glow);

  const core = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  core.setAttribute("class", "halo-core");
  core.setAttribute("cx", String(args.cx));
  core.setAttribute("cy", String(args.cy));
  core.setAttribute("r", String(args.r));
  core.setAttribute("fill", "none");
  core.setAttribute("stroke", args.kind === "target" ? "#00e676" : args.kind === "highlight" ? "#ff9f40" : "#66ccff");
  core.setAttribute("stroke-width", String(args.kind === "highlight" ? Math.max(MIN_HIGHLIGHT_STROKE_W, 6) : SELECTION_STROKE_W));
  applyStrokeDefaults(core);
  g.appendChild(core);

  const sparks = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  sparks.setAttribute("class", "halo-sparks");
  sparks.setAttribute("cx", String(args.cx));
  sparks.setAttribute("cy", String(args.cy));
  sparks.setAttribute("r", String(args.r));
  sparks.setAttribute("fill", "none");
  sparks.setAttribute("stroke", "rgba(255,255,255,0.92)");
  sparks.setAttribute("stroke-width", "2.5");
  applyStrokeDefaults(sparks);
  g.appendChild(sparks);

  layer.appendChild(g);
  return g;
}

function applyStrokeDefaults(el: SVGElement): void {
  // Keep overlay strokes readable even when the board SVG is scaled.
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
}

export function ensureOverlayLayer(svg: SVGSVGElement): SVGGElement {
  ensureLastMoveBackgroundRoot(svg);

  const existing = svg.querySelector(`#${FX_OVERLAY_ROOT_ID}`) as SVGGElement | null;
  if (existing) {
    ensureOverlaySubLayer(existing, "overlaysFx");
    // Keep FX on top.
    const fx = existing.querySelector("#overlaysFx") as SVGGElement | null;
    if (fx) existing.appendChild(fx);
    return existing;
  }
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = FX_OVERLAY_ROOT_ID;
  // Make overlays purely visual; clicks pass through to underlying nodes
  g.setAttribute("pointer-events", "none");
  const pieces = svg.querySelector("#pieces") as SVGGElement | null;
  if (pieces && pieces.parentNode) {
    // Place overlays ABOVE the pieces layer for visibility and clicks
    if (pieces.nextSibling) {
      pieces.parentNode.insertBefore(g, pieces.nextSibling);
    } else {
      pieces.parentNode.appendChild(g);
    }
  } else {
    svg.appendChild(g);
  }

  // Sublayer: transient FX (selection/targets); persistent last-move squares live below pieces.
  ensureOverlaySubLayer(g, "overlaysFx");

  return g;
}

export function clearOverlays(layer: SVGGElement): void {
  // Clear only interactive FX overlays (selection/targets/highlight rings).
  // Keep the last-move squares persistent across clicks.
  const fx = fxLayerFromAny(layer);
  while (fx.firstChild) fx.removeChild(fx.firstChild);
}

function circleForNode(id: string): SVGCircleElement | null {
  return document.getElementById(id) as SVGCircleElement | null;
}

function svgFromLayer(layer: SVGGElement): SVGSVGElement | null {
  const root = resolveOverlayRoot(layer);
  const svg = (root.ownerSVGElement ?? root.closest?.("svg")) as SVGSVGElement | null;
  return svg ?? null;
}

function drawSquareOverlay(
  layer: SVGGElement,
  nodeId: string,
  args: { stroke: string; fill: string; strokeWidth: number; inset?: number; className: string }
): void {
  layer = fxLayerFromAny(layer);
  const svg = svgFromLayer(layer);
  if (!svg) return;

  const rect = computeSquareRect(svg, nodeId);
  if (!rect) return;

  const inset = Math.max(0, args.inset ?? 2);
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = Math.max(0, rect.w - inset * 2);
  const h = Math.max(0, rect.h - inset * 2);
  if (w <= 0 || h <= 0) return;

  const el = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  el.setAttribute("class", args.className);
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  el.setAttribute("fill", args.fill);
  el.setAttribute("stroke", args.stroke);
  el.setAttribute("stroke-width", String(args.strokeWidth));
  applyRectDefaults(el);
  layer.appendChild(el);
}

export function drawSelection(layer: SVGGElement, nodeId: string): void {
  layer = fxLayerFromAny(layer);
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  makeHalo(layer, { cx, cy, r: r + 8, kind: "selection" });
}

export function drawSelectionSquare(layer: SVGGElement, nodeId: string): void {
  drawSquareOverlay(layer, nodeId, {
    className: "squareHighlight squareHighlight--selection",
    stroke: "rgba(102, 204, 255, 0.92)",
    fill: "rgba(102, 204, 255, 0.10)",
    strokeWidth: CLASSIC_SQUARE_STROKE_W,
    inset: 2,
  });
}

export function drawSelectionChessCom(layer: SVGGElement, nodeId: string): void {
  const fill = squareToneFromNodeId(nodeId) === "light" ? CHESSCOM_SELECTION_LIGHT_FILL : CHESSCOM_SELECTION_DARK_FILL;
  drawSquareOverlay(layer, nodeId, {
    className: "squareHighlight squareHighlight--selection-chesscom",
    stroke: "none",
    fill,
    strokeWidth: 0,
    inset: 0,
  });
}

export function drawTargets(layer: SVGGElement, nodeIds: string[]): void {
  layer = fxLayerFromAny(layer);
  for (const id of nodeIds) {
    const node = circleForNode(id);
    if (!node) continue;
    const cx = parseFloat(node.getAttribute("cx") || "0");
    const cy = parseFloat(node.getAttribute("cy") || "0");
    const r = parseFloat(node.getAttribute("r") || "0");

    makeHalo(layer, { cx, cy, r: r + 12, kind: "target" });
  }
}

export function drawTargetsChessCom(layer: SVGGElement, nodeIds: string[], captureNodeIds: Iterable<string> = []): void {
  layer = fxLayerFromAny(layer);
  const svg = svgFromLayer(layer);
  if (!svg) return;
  const captureNodes = new Set(captureNodeIds);

  for (const id of nodeIds) {
    const rect = computeSquareRect(svg, id);
    const node = circleForNode(id);
    if (!rect && !node) continue;

    if (captureNodes.has(id)) {
      const cx = rect ? rect.x + rect.w / 2 : parseFloat(node?.getAttribute("cx") || "0");
      const cy = rect ? rect.y + rect.h / 2 : parseFloat(node?.getAttribute("cy") || "0");
      const diameter = rect ? Math.min(rect.w, rect.h) : parseFloat(node?.getAttribute("r") || "0") * 2.8;
      const radius = Math.max(22, Math.round(diameter * 0.36));
      const tone = squareToneFromNodeId(id);

      const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      ring.setAttribute("class", "target-ring target-ring--chesscom");
      ring.setAttribute("cx", String(cx));
      ring.setAttribute("cy", String(cy));
      ring.setAttribute("r", String(radius));
      ring.setAttribute("fill", tone === "light" ? CHESSCOM_TARGET_RING_LIGHT_FILL : CHESSCOM_TARGET_RING_DARK_FILL);
      ring.setAttribute("stroke", tone === "light" ? CHESSCOM_TARGET_RING_LIGHT_STROKE : CHESSCOM_TARGET_RING_DARK_STROKE);
      ring.setAttribute("stroke-width", String(CHESSCOM_TARGET_RING_STROKE_W));
      ring.setAttribute("pointer-events", "none");
      applyStrokeDefaults(ring);
      layer.appendChild(ring);
      continue;
    }

    const cx = rect ? rect.x + rect.w / 2 : parseFloat(node?.getAttribute("cx") || "0");
    const cy = rect ? rect.y + rect.h / 2 : parseFloat(node?.getAttribute("cy") || "0");
    const baseRadius = node ? parseFloat(node.getAttribute("r") || "0") : 0;
    const radius = Math.max(
      CHESSCOM_TARGET_DOT_MIN_RADIUS,
      Math.min(CHESSCOM_TARGET_DOT_MAX_RADIUS, Math.round(baseRadius * CHESSCOM_TARGET_DOT_SCALE)),
    );
    const fill = squareToneFromNodeId(id) === "light" ? CHESSCOM_TARGET_DOT_LIGHT_FILL : CHESSCOM_TARGET_DOT_DARK_FILL;

    const dot = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    dot.setAttribute("class", "target-dot target-dot--chesscom");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", String(radius));
    dot.setAttribute("fill", fill);
    dot.setAttribute("stroke", "none");
    dot.setAttribute("pointer-events", "none");
    layer.appendChild(dot);
  }
}

export function drawTargetsSquares(layer: SVGGElement, nodeIds: string[]): void {
  for (const id of nodeIds) {
    drawSquareOverlay(layer, id, {
      className: "squareHighlight squareHighlight--target",
      stroke: "rgba(0, 230, 118, 0.92)",
      fill: "rgba(0, 230, 118, 0.10)",
      strokeWidth: CLASSIC_SQUARE_STROKE_W,
      inset: 3,
    });
  }
}

export function drawHighlightRing(layer: SVGGElement, nodeId: string, color = "#ff9f40", width = 4): void {
  layer = fxLayerFromAny(layer);
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  const g = makeHalo(layer, { cx, cy, r: r + 14, kind: "highlight" });
  // Preserve caller-supplied color/width as a fallback; CSS can still override.
  try {
    const glow = g.querySelector(".halo-glow") as SVGCircleElement | null;
    const core = g.querySelector(".halo-core") as SVGCircleElement | null;
    if (glow) glow.setAttribute("stroke", color);
    if (core) core.setAttribute("stroke", color);
    if (core) core.setAttribute("stroke-width", String(Math.max(width, MIN_HIGHLIGHT_STROKE_W)));
  } catch {
    // ignore
  }
}

export function drawHighlightSquare(layer: SVGGElement, nodeId: string, color = "#ff9f40", width = 4): void {
  drawSquareOverlay(layer, nodeId, {
    className: "squareHighlight squareHighlight--highlight",
    stroke: color,
    fill: "rgba(255, 159, 64, 0.08)",
    strokeWidth: Math.max(width, CLASSIC_SQUARE_STROKE_W),
    inset: 2,
  });
}

function parseNodeIdFast(id: string): { r: number; c: number } | null {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const c = Number.parseInt(m[2], 10);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { r, c };
}

function squareToneFromNodeId(id: string): SquareTone {
  const rc = parseNodeIdFast(id);
  if (!rc) return "light";
  return (rc.r + rc.c) % 2 === 0 ? "light" : "dark";
}

function readNodeCenters(svg: SVGSVGElement): Array<{ cx: number; cy: number }> {
  const nodes = Array.from(svg.querySelectorAll("circle[id^='r'][cx][cy]")) as SVGCircleElement[];
  const centers: Array<{ cx: number; cy: number }> = [];
  for (const node of nodes) {
    const cx = Number.parseFloat(node.getAttribute("cx") ?? "NaN");
    const cy = Number.parseFloat(node.getAttribute("cy") ?? "NaN");
    if (Number.isFinite(cx) && Number.isFinite(cy)) centers.push({ cx, cy });
  }
  return centers;
}

function inferGridStep(values: number[]): number | null {
  if (values.length < 2) return null;
  const sorted = Array.from(new Set(values.map((value) => Math.round(value * 1000) / 1000))).sort((a, b) => a - b);
  let minDelta = Infinity;
  for (let index = 1; index < sorted.length; index += 1) {
    const delta = sorted[index] - sorted[index - 1];
    if (delta > 0.5 && delta < minDelta) minDelta = delta;
  }
  return Number.isFinite(minDelta) ? minDelta : null;
}

function lastMoveFillForStyle(
  style: LastMoveHighlightStyle,
  nodeId: string,
  kind: "from" | "to",
): { fill: string; stroke: string; strokeWidth: string } {
  if (style !== "chesscom") {
    return {
      fill: kind === "from" ? `var(--lastMoveFromFill, ${DEFAULT_LAST_MOVE_FROM_FILL})` : `var(--lastMoveToFill, ${DEFAULT_LAST_MOVE_TO_FILL})`,
      stroke: `var(--lastMoveStroke, ${DEFAULT_LAST_MOVE_STROKE})`,
      strokeWidth: `var(--lastMoveStrokeWidth, ${DEFAULT_LAST_MOVE_STROKE_W})`,
    };
  }

  const tone = squareToneFromNodeId(nodeId);
  const fill = tone === "light"
    ? (kind === "from" ? CHESSCOM_LAST_MOVE_LIGHT_FROM_FILL : CHESSCOM_LAST_MOVE_LIGHT_TO_FILL)
    : (kind === "from" ? CHESSCOM_LAST_MOVE_DARK_FROM_FILL : CHESSCOM_LAST_MOVE_DARK_TO_FILL);

  return {
    fill,
    stroke: "none",
    strokeWidth: "0",
  };
}

function computeSquareRect(svg: SVGSVGElement, nodeId: string): SquareRect | null {
  const rc = parseNodeIdFast(nodeId);
  if (!rc) return null;

  // Preferred: derive grid geometry from #squares <rect> tiles.
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

  // Fallback: infer tile size from the node grid when the SVG has no square rects
  // (graph boards such as Lasca/Damasca only expose playable-node circles).
  const node = circleForNode(nodeId);
  if (!node) return null;
  const cx = Number.parseFloat(node.getAttribute("cx") ?? "NaN");
  const cy = Number.parseFloat(node.getAttribute("cy") ?? "NaN");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const centers = readNodeCenters(svg);
  const inferredWidth = inferGridStep(centers.map((center) => center.cx));
  const inferredHeight = inferGridStep(centers.map((center) => center.cy));
  const w = inferredWidth ?? inferredHeight ?? 100;
  const h = inferredHeight ?? inferredWidth ?? 100;

  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function applyRectDefaults(el: SVGRectElement): void {
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("shape-rendering", "crispEdges");
}

export function clearLastMoveSquares(layer: SVGGElement): void {
  const last = lastMoveLayerFromAny(layer);
  while (last.firstChild) last.removeChild(last.firstChild);
}

export function drawLastMoveSquares(
  layer: SVGGElement,
  fromNodeId: string,
  toNodeId: string,
  style: LastMoveHighlightStyle = DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE,
): void {
  const root = resolveOverlayRoot(layer);
  const svg = (root.ownerSVGElement ?? root.closest?.("svg")) as SVGSVGElement | null;
  if (!svg) return;

  const last = lastMoveLayerFromAny(root);
  while (last.firstChild) last.removeChild(last.firstChild);

  const fromRect = computeSquareRect(svg, fromNodeId);
  const toRect = computeSquareRect(svg, toNodeId);
  if (!fromRect || !toRect) return;
  const fromStyle = lastMoveFillForStyle(style, fromNodeId, "from");
  const toStyle = lastMoveFillForStyle(style, toNodeId, "to");

  const fromEl = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  fromEl.setAttribute("class", "last-move-square last-move-square--from");
  fromEl.setAttribute("x", String(fromRect.x));
  fromEl.setAttribute("y", String(fromRect.y));
  fromEl.setAttribute("width", String(fromRect.w));
  fromEl.setAttribute("height", String(fromRect.h));
  fromEl.setAttribute("fill", fromStyle.fill);
  fromEl.setAttribute("stroke", fromStyle.stroke);
  fromEl.setAttribute("stroke-width", fromStyle.strokeWidth);
  applyRectDefaults(fromEl);
  last.appendChild(fromEl);

  const toEl = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  toEl.setAttribute("class", "last-move-square last-move-square--to");
  toEl.setAttribute("x", String(toRect.x));
  toEl.setAttribute("y", String(toRect.y));
  toEl.setAttribute("width", String(toRect.w));
  toEl.setAttribute("height", String(toRect.h));
  toEl.setAttribute("fill", toStyle.fill);
  toEl.setAttribute("stroke", toStyle.stroke);
  toEl.setAttribute("stroke-width", toStyle.strokeWidth);
  applyRectDefaults(toEl);
  last.appendChild(toEl);
}
