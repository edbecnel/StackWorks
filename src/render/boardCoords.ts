import { CHECKERBOARD_THEMES, normalizeCheckerboardThemeId, type CheckerboardThemeId } from "./checkerboardTheme";

const SVG_NS = "http://www.w3.org/2000/svg";

function ensureBoardCoordsLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#boardCoords") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "boardCoords";
  g.setAttribute("pointer-events", "none");
  g.style.userSelect = "none";
  (g.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";

  const pieces = svg.querySelector("#pieces") as SVGGElement | null;
  if (pieces && pieces.parentNode) {
    pieces.parentNode.insertBefore(g, pieces);
  } else {
    svg.appendChild(g);
  }

  return g;
}

function applyTextSelectionLock(node: SVGTextElement): void {
  node.style.userSelect = "none";
  (node.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";
}

function readCircle(svg: SVGSVGElement, id: string): { cx: number; cy: number } | null {
  // Node IDs are simple (e.g., r0c0), so we can safely query without CSS.escape.
  // Avoid relying on CSS.escape for broader browser compatibility.
  const el = svg.querySelector(`#${id}`) as SVGCircleElement | null;
  if (!el) return null;
  const cx = Number(el.getAttribute("cx"));
  const cy = Number(el.getAttribute("cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy };
}

function findAnyColX(svg: SVGSVGElement, boardSize: number, col: number): number | null {
  for (let row = 0; row < boardSize; row++) {
    const p = readCircle(svg, `r${row}c${col}`);
    if (p) return p.cx;
  }
  return null;
}

function findAnyRowY(svg: SVGSVGElement, boardSize: number, row: number): number | null {
  for (let col = 0; col < boardSize; col++) {
    const p = readCircle(svg, `r${row}c${col}`);
    if (p) return p.cy;
  }
  return null;
}

function clearLayer(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}

export type BoardCoordsStyle = "edge" | "inSquare";

type SquareRect = { x: number; y: number; w: number; h: number };

function computeSquareGridFromRects(svg: SVGSVGElement): { startX: number; startY: number; step: number } | null {
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

  // Boards in this repo use square tiles.
  return { startX: minX, startY: minY, step: Math.min(w, h) };
}

function squareRectFromGrid(grid: { startX: number; startY: number; step: number }, row: number, col: number): SquareRect {
  return { x: grid.startX + col * grid.step, y: grid.startY + row * grid.step, w: grid.step, h: grid.step };
}

function getCheckerboardBaseColors(svg: SVGSVGElement): { light: string; dark: string } {
  const raw = (svg as any).__checkerboardThemeId as CheckerboardThemeId | string | null | undefined;
  const id = normalizeCheckerboardThemeId(typeof raw === "string" ? raw : (raw ?? null));
  const theme = CHECKERBOARD_THEMES.find((t) => t.id === id) ?? CHECKERBOARD_THEMES[0];
  return { light: theme.light, dark: theme.dark };
}

function getCheckerboardThemeId(svg: SVGSVGElement): CheckerboardThemeId {
  const raw = (svg as any).__checkerboardThemeId as CheckerboardThemeId | string | null | undefined;
  return normalizeCheckerboardThemeId(typeof raw === "string" ? raw : (raw ?? null));
}

function renderBoardCoordsInSquares(layer: SVGGElement, svg: SVGSVGElement, boardSize: 7 | 8 | 10, flipped: boolean): void {
  // Prefer exact square geometry.
  const grid = computeSquareGridFromRects(svg);
  if (!grid) {
    // Safe fallback: if we can't infer square bounds, fall back to edge coords.
    // (This keeps non-checkerboard boards working without extra work.)
    renderBoardCoords(svg, true, boardSize, { flipped, style: "edge" });
    return;
  }

  const { light, dark } = getCheckerboardBaseColors(svg);

  const pad = grid.step * 0.08;
  const fontSize = grid.step * 0.22;

  // We compute placement in the unflipped coordinate system.
  // When `flipped` is true, the entire board view is rotated 180°, so:
  // - bottom row (screen) is row 0 (unflipped)
  // - left column (screen) is last column (unflipped)
  const bottomRow = flipped ? 0 : boardSize - 1;
  const leftCol = flipped ? boardSize - 1 : 0;

  const placeText = (
    text: string,
    rect: SquareRect,
    pointCorner: "upperLeft" | "lowerRight",
    screenCorner: "upperLeft" | "lowerRight",
    fill: string,
    opts?: { xOffset?: number; yOffset?: number },
  ) => {
    const xOffset = opts?.xOffset ?? 0;
    const yOffset = opts?.yOffset ?? 0;
    const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    t.textContent = text;
    applyTextSelectionLock(t);
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-weight", "650");
    t.setAttribute("fill", fill);
    t.setAttribute("opacity", "0.72");

    // Alignment should match the desired *screen* corner, not the pre-rotation
    // point corner. When the board is flipped, we intentionally choose the
    // opposite point so it rotates into the correct corner on screen.
    if (screenCorner === "upperLeft") {
      t.setAttribute("text-anchor", "start");
      t.setAttribute("dominant-baseline", "hanging");
    } else {
      t.setAttribute("text-anchor", "end");
      t.setAttribute("dominant-baseline", "alphabetic");
    }

    if (pointCorner === "upperLeft") {
      const x = rect.x + pad + xOffset;
      const y = rect.y + pad + yOffset;
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      if (flipped) t.setAttribute("transform", `rotate(180 ${x} ${y})`);
    } else {
      const x = rect.x + rect.w - pad + xOffset;
      // Baseline quirks: nudge slightly upward so the glyph sits within the tile.
      const y = rect.y + rect.h - pad * 0.25 + yOffset;
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      if (flipped) t.setAttribute("transform", `rotate(180 ${x} ${y})`);
    }

    layer.appendChild(t);
  };

  // Column labels (files): a.. (lowercase), only on the bottom row (screen).
  const fileYOffset = (flipped ? 1 : -1) * (fontSize * 0.5) + (flipped ? -10 : 5);
  const fileXOffset = flipped ? -1 : 0;
  const filePointCorner: "upperLeft" | "lowerRight" = flipped ? "upperLeft" : "lowerRight";
  for (let col = 0; col < boardSize; col++) {
    const rect = squareRectFromGrid(grid, bottomRow, col);
    const isLight = (bottomRow + col) % 2 === 0;
    const fill = isLight ? dark : light;
    const letter = String.fromCharCode("a".charCodeAt(0) + col);
    placeText(letter, rect, filePointCorner, "lowerRight", fill, { xOffset: fileXOffset, yOffset: fileYOffset });
  }

  // Row labels (ranks): boardSize..1, only on the left column (screen).
  const rankPointCorner: "upperLeft" | "lowerRight" = flipped ? "lowerRight" : "upperLeft";
  for (let row = 0; row < boardSize; row++) {
    const rect = squareRectFromGrid(grid, row, leftCol);
    const isLight = (row + leftCol) % 2 === 0;
    const fill = isLight ? dark : light;
    const n = String(boardSize - row);
    placeText(n, rect, rankPointCorner, "upperLeft", fill);
  }
}

export function renderBoardCoords(
  svg: SVGSVGElement,
  enabled: boolean,
  boardSize: 7 | 8 | 10 = 7,
  opts?: { flipped?: boolean; style?: BoardCoordsStyle }
): void {
  const layer = ensureBoardCoordsLayer(svg);
  if (!enabled) {
    clearLayer(layer);
    return;
  }

  const flipped = Boolean(opts?.flipped);
  const style: BoardCoordsStyle = opts?.style ?? "edge";

  if (style === "inSquare") {
    clearLayer(layer);
    renderBoardCoordsInSquares(layer, svg, boardSize, flipped);
    return;
  }

  // Derive a reasonable step from the node grid.
  // Not all boards include a node at r0c0 (e.g. 8×8 playable parity).
  let step = 120;
  const row0Nodes: Array<{ col: number; cx: number; cy: number }> = [];
  for (let col = 0; col < boardSize; col++) {
    const p = readCircle(svg, `r0c${col}`);
    if (p) row0Nodes.push({ col, cx: p.cx, cy: p.cy });
  }
  if (row0Nodes.length >= 2) {
    row0Nodes.sort((a, b) => a.col - b.col);
    const dx = Math.abs(row0Nodes[1].cx - row0Nodes[0].cx);
    const dc = Math.abs(row0Nodes[1].col - row0Nodes[0].col);
    // Some boards include a full node grid (dc=1), while checkers-style boards
    // only include playable parity nodes (often dc=2). Derive spacing from the
    // actual column gap to keep label placement consistent across variants.
    if (dc > 0) step = dx / dc;
  } else {
    // Fall back: try vertical distance between the first two rows that have nodes.
    const p0 = readCircle(svg, "r0c0") ?? readCircle(svg, "r0c1");
    const p2 = readCircle(svg, "r2c0") ?? readCircle(svg, "r2c1");
    if (p0 && p2) step = Math.abs(p2.cy - p0.cy) / 2;
  }

  const minX = findAnyColX(svg, boardSize, 0) ?? 140;
  const maxX = findAnyColX(svg, boardSize, boardSize - 1) ?? (minX + step * (boardSize - 1));
  const minY = findAnyRowY(svg, boardSize, 0) ?? 140;
  const maxY = findAnyRowY(svg, boardSize, boardSize - 1) ?? 860;

  const fontSize = step * 0.42;

  // Label placement is computed in the unflipped coordinate system.
  // When `flipped` is true, the entire board view is rotated 180°; we place
  // coords on the opposite edges so they end up bottom/left in the final view.
  const viewBoxMax = 1000;
  const safeBottomY = viewBoxMax - fontSize * 0.65;
  const safeTopY = fontSize * 0.95;

  const colLabelY = flipped
    ? Math.max(safeTopY, minY - step * 0.75)
    : Math.min(safeBottomY, maxY + step * 0.75);

  const rowLabelX = flipped
    ? maxX + step * 0.65
    : minX - step * 0.65; // left of column A, in the board's margin

  // Default: dark charcoal (not pure black) to match the board's built-in linework.
  // Some board themes override this to match custom outer margins and frame accents.
  const themeId = getCheckerboardThemeId(svg);
  const theme = CHECKERBOARD_THEMES.find((item) => item.id === themeId) ?? CHECKERBOARD_THEMES[0];
  const edgeFill = theme.edgeFill ?? "#404040";
  const edgeOpacity = theme.edgeOpacity ?? "0.75";

  clearLayer(layer);

  // Column labels: A..(A+boardSize-1)
  for (let col = 0; col < boardSize; col++) {
    const x = findAnyColX(svg, boardSize, col);
    if (x == null) continue;

    const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    t.textContent = String.fromCharCode("A".charCodeAt(0) + col);
    applyTextSelectionLock(t);
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(colLabelY));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-weight", "650");
    t.setAttribute("fill", edgeFill);
    t.setAttribute("opacity", edgeOpacity);

    // If the board is flipped (rotated 180°), counter-rotate the text around
    // its anchor point so it stays upright.
    if (flipped) t.setAttribute("transform", `rotate(180 ${x} ${colLabelY})`);
    layer.appendChild(t);
  }

  // Row labels: boardSize..1 (since 1 starts at bottom)
  for (let row = 0; row < boardSize; row++) {
    const y = findAnyRowY(svg, boardSize, row);
    if (y == null) continue;

    const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    t.textContent = String(boardSize - row);
    applyTextSelectionLock(t);
    t.setAttribute("x", String(rowLabelX));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-weight", "650");
    t.setAttribute("fill", edgeFill);
    t.setAttribute("opacity", edgeOpacity);

    if (flipped) t.setAttribute("transform", `rotate(180 ${rowLabelX} ${y})`);
    layer.appendChild(t);
  }
}
