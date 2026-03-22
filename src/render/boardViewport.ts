const SVG_NS = "http://www.w3.org/2000/svg";

export type BoardViewportMode = "framed" | "playable";

export type BoardSquaresBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  step: number;
  boardSize: 7 | 8 | 10;
};

export type BoardViewportMetrics = {
  mode: BoardViewportMode;
  squares: BoardSquaresBounds | null;
  extraLeft: number;
  extraRight: number;
  extraTop: number;
  extraBottom: number;
  viewBox: { x: number; y: number; w: number; h: number } | null;
};

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
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

function inferBoardSizeFromSquares(svg: SVGSVGElement): 7 | 8 | 10 | null {
  const squares = svg.querySelector("#squares") as SVGGElement | null;
  if (!squares) return null;
  const rects = squares.querySelectorAll("rect");
  const n = rects.length;
  if (n === 64) return 8;
  if (n === 49) return 7;
  if (n === 100) return 10;
  const root = Math.round(Math.sqrt(n));
  if (root * root === n && (root === 7 || root === 8 || root === 10)) return root as 7 | 8 | 10;
  return null;
}

function computeSquaresBounds(svg: SVGSVGElement, boardSize: 7 | 8 | 10): BoardSquaresBounds | null {
  const squares = svg.querySelector("#squares") as SVGGElement | null;
  if (!squares) return null;
  const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
  if (rects.length === 0) return null;

  const first = rects[0];
  const w = Number.parseFloat(first.getAttribute("width") ?? "NaN");
  const h = Number.parseFloat(first.getAttribute("height") ?? "NaN");
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  for (const r of rects) {
    const x = Number.parseFloat(r.getAttribute("x") ?? "NaN");
    const y = Number.parseFloat(r.getAttribute("y") ?? "NaN");
    if (Number.isFinite(x)) minX = Math.min(minX, x);
    if (Number.isFinite(y)) minY = Math.min(minY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const step = Math.min(w, h);
  return { x: minX, y: minY, w: step * boardSize, h: step * boardSize, step, boardSize };
}

function stashAttr(el: Element, key: string, attr: string): void {
  try {
    const anyEl = el as any;
    if (!anyEl.dataset) anyEl.dataset = {};
    const dataKey = key;
    if (anyEl.dataset[dataKey] != null) return;
    const prev = el.getAttribute(attr);
    anyEl.dataset[dataKey] = prev == null ? "__null__" : String(prev);
  } catch {
    // ignore
  }
}

function restoreAttr(el: Element, key: string, attr: string): void {
  try {
    const anyEl = el as any;
    const raw = anyEl.dataset?.[key];
    if (raw == null) return;
    if (raw === "__null__") el.removeAttribute(attr);
    else el.setAttribute(attr, raw);
    delete anyEl.dataset[key];
  } catch {
    // ignore
  }
}

function stashSvgViewBox(svg: SVGSVGElement): void {
  const anySvg = svg as any;
  if (!anySvg.dataset) anySvg.dataset = {};
  if (anySvg.dataset.boardViewportOrigViewBox != null) return;
  anySvg.dataset.boardViewportOrigViewBox = svg.getAttribute("viewBox") ?? "";
}

function restoreSvgViewBox(svg: SVGSVGElement): void {
  const anySvg = svg as any;
  const prev = anySvg.dataset?.boardViewportOrigViewBox;
  if (prev == null) return;
  if (String(prev).trim().length === 0) svg.removeAttribute("viewBox");
  else svg.setAttribute("viewBox", String(prev));
  delete anySvg.dataset.boardViewportOrigViewBox;
}

function hideOuterChrome(svg: SVGSVGElement, hide: boolean): void {
  const frame = svg.querySelector("#frame") as SVGGElement | null;
  const ids: Array<[Element | null, string]> = [
    [frame, "boardViewportOrigDisplayFrame"],
  ];

  for (const [el, dataKey] of ids) {
    if (!el) continue;
    if (hide) {
      stashAttr(el, dataKey, "display");
      el.setAttribute("display", "none");
    } else {
      restoreAttr(el, dataKey, "display");
    }
  }
}

export function applyBoardViewportModeToSvg(
  svg: SVGSVGElement,
  mode: BoardViewportMode,
  opts?: { boardSize?: 7 | 8 | 10; reservedLeft?: number; reservedRight?: number; reservedTop?: number; reservedBottom?: number }
): BoardViewportMetrics {
  if (!svg) {
    return { mode, squares: null, extraLeft: 0, extraRight: 0, extraTop: 0, extraBottom: 0, viewBox: null };
  }

  const boardSize = opts?.boardSize ?? inferBoardSizeFromSquares(svg);

  if (mode !== "playable" || boardSize == null) {
    // Restore original viewBox + chrome.
    restoreSvgViewBox(svg);
    hideOuterChrome(svg, false);
    try {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } catch {
      // ignore
    }
    const vb = parseViewBox(svg);
    const metrics: BoardViewportMetrics = {
      mode: "framed",
      squares: boardSize ? computeSquaresBounds(svg, boardSize) : null,
      extraLeft: 0,
      extraRight: 0,
      extraTop: 0,
      extraBottom: 0,
      viewBox: vb,
    };
    (svg as any).__boardViewportMetrics = metrics;
    return metrics;
  }

  const squares = computeSquaresBounds(svg, boardSize);
  if (!squares) {
    // If we can't infer squares, don't attempt to crop.
    const vb = parseViewBox(svg);
    const metrics: BoardViewportMetrics = {
      mode: "framed",
      squares: null,
      extraLeft: 0,
      extraRight: 0,
      extraTop: 0,
      extraBottom: 0,
      viewBox: vb,
    };
    (svg as any).__boardViewportMetrics = metrics;
    return metrics;
  }

  stashSvgViewBox(svg);

  // Reserve blank strips above/below for names + indicators.
  // IMPORTANT: the UI can render up to two stacked badges at the top-left
  // (turn indicator + opponent presence). To avoid overlapping the top row
  // of squares, reserve enough for two 33px icons + padding.
  // Keep this tight to minimize whitespace.
  // With the playable-area HUD (turn + presence) positioned near the board edge
  // and laid out side-by-side, we can keep these strips small.
  const minTop = 48;
  const minBottom = 12;

  const defaultTop = Math.round(squares.step * 0.65);
  const defaultBottom = Math.round(squares.step * 0.45);

  const requestedTop = Number.isFinite(opts?.reservedTop as number) ? (opts!.reservedTop as number) : null;
  const requestedBottom = Number.isFinite(opts?.reservedBottom as number) ? (opts!.reservedBottom as number) : null;
  const extraTop = Math.max(minTop, Math.round(requestedTop ?? defaultTop));
  const extraBottom = Math.max(minBottom, Math.round(requestedBottom ?? defaultBottom));
  const extraLeft = 0;
  const extraRight = 0;

  const x = squares.x - extraLeft;
  const y = squares.y - extraTop;
  const w = squares.w + extraLeft + extraRight;
  const h = squares.h + extraTop + extraBottom;

  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  hideOuterChrome(svg, true);

  const metrics: BoardViewportMetrics = {
    mode: "playable",
    squares,
    extraLeft,
    extraRight,
    extraTop,
    extraBottom,
    viewBox: { x, y, w, h },
  };
  (svg as any).__boardViewportMetrics = metrics;

  // Ensure the SVG itself remains a clean viewport.
  try {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  } catch {
    // ignore
  }

  return metrics;
}

export function getBoardViewportMetrics(svg: SVGSVGElement): BoardViewportMetrics | null {
  return ((svg as any)?.__boardViewportMetrics as BoardViewportMetrics | null | undefined) ?? null;
}

// Utility (kept here to avoid duplicating SVG DOM assumptions elsewhere).
export function ensureViewportDebugRect(svg: SVGSVGElement): void {
  // Not used by production UI; helpful during dev.
  if (!svg) return;
  const gId = "__boardViewportDebug";
  if (svg.querySelector(`#${gId}`)) return;

  const vb = parseViewBox(svg);
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = gId;

  const r = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  r.setAttribute("x", String(vb.x));
  r.setAttribute("y", String(vb.y));
  r.setAttribute("width", String(vb.w));
  r.setAttribute("height", String(vb.h));
  r.setAttribute("fill", "none");
  r.setAttribute("stroke", "rgba(255,0,0,0.35)");
  r.setAttribute("stroke-width", "2");
  r.setAttribute("vector-effect", "non-scaling-stroke");

  g.appendChild(r);
  svg.appendChild(g);
}
