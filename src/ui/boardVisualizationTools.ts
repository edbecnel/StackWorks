import { clearBoardAnnotations, renderBoardAnnotations, type AnnotationColor, type BoardAnnotationsState } from "../render/boardAnnotations";
import type { GameState } from "../game/state";

export type AnnotationType = "play" | "square" | "circle" | "pin" | "protect" | "remove";

export type BoardVisualizationToolsController = {
  clear: () => void;
  /** Active color used for touch annotations (drag arrows / double-tap highlights). */
  setActiveColor: (color: AnnotationColor) => void;
  getActiveColor: () => AnnotationColor;
  /** Active annotation type used for right-click / touch placements. */
  setAnnotationType: (type: AnnotationType) => void;
  getAnnotationType: () => AnnotationType;
  /** When true, touch gestures erase existing annotations instead of adding/toggling. */
  setEraseMode: (enabled: boolean) => void;
  getEraseMode: () => boolean;
};

export type BoardVisualizationToolsOptions = {
  /** When true, touch gestures (drag/double-tap) are enabled for annotations. */
  isTouchInputEnabled?: () => boolean;
  /**
   * Returns the current game state so that arrow-drag restrictions can be
   * validated against the actual piece on the source square (pawns, knights).
   * When absent, no piece-based restriction is applied.
   */
  getState?: () => GameState | null;
};

function colorFromModifiers(ev: Pick<PointerEvent, "shiftKey" | "ctrlKey" | "altKey">): AnnotationColor {
  if (ev.shiftKey) return "green";
  if (ev.ctrlKey) return "red";
  if (ev.altKey) return "blue";
  return "orange";
}

function parseRc(nodeId: string): { r: number; c: number } | null {
  const m = /^r(\d+)c(\d+)$/.exec(nodeId);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const c = Number.parseInt(m[2], 10);
  return Number.isFinite(r) && Number.isFinite(c) ? { r, c } : null;
}

function isKnightMovePair(from: string, to: string): boolean {
  const a = parseRc(from);
  const b = parseRc(to);
  if (!a || !b) return false;
  const dr = Math.abs(b.r - a.r);
  const dc = Math.abs(b.c - a.c);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

function isValidPawnTarget(
  from: { r: number; c: number },
  to: { r: number; c: number },
  owner: "W" | "B",
): boolean {
  // White moves toward row 0 (dir = -1), Black toward row 7 (dir = +1).
  const dir = owner === "W" ? -1 : 1;
  const startRow = owner === "W" ? 6 : 1;
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  // Forward 1 square (straight)
  if (dr === dir && dc === 0) return true;
  // Forward 2 squares from starting row (straight)
  if (dr === 2 * dir && dc === 0 && from.r === startRow) return true;
  // Diagonal capture squares (1 forward, 1 to either side)
  if (dr === dir && Math.abs(dc) === 1) return true;
  return false;
}

/**
 * Returns true when the drag from → to should be allowed as an arrow annotation.
 * Rules are applied per the piece sitting on the `from` square:
 *  - Knight: only valid knight-move offsets.
 *  - Pawn:   forward 1, forward 2 from start row, diagonal captures.
 *  - All other pieces (or empty square / no game state): unrestricted.
 */
function isValidArrowTarget(from: string, to: string, getState: (() => GameState | null) | undefined): boolean {
  const fromRc = parseRc(from);
  const toRc   = parseRc(to);
  if (!fromRc || !toRc) return true;

  const gameState = getState?.();
  if (!gameState) return true;

  const stack = gameState.board.get(from);
  if (!stack || stack.length === 0) return true; // empty square – no restriction

  const topPiece = stack[stack.length - 1];
  if (topPiece.rank === "N") return isKnightMovePair(from, to);
  if (topPiece.rank === "P") return isValidPawnTarget(fromRc, toRc, topPiece.owner);
  return true; // all other pieces: allow any target
}

function resolveNodeIdFromTarget(target: EventTarget | null): string | null {
  if (!target || !(target instanceof Element)) return null;

  const withData = target.closest("[data-node]") as Element | null;
  if (withData) {
    const id = withData.getAttribute("data-node");
    if (id) return id;
  }

  const stack = target.closest("g.stack") as SVGGElement | null;
  if (stack) {
    const id = stack.getAttribute("data-node");
    if (id) return id;
  }

  if (target instanceof SVGCircleElement) {
    const id = target.getAttribute("id");
    if (id) return id;
  }

  return null;
}

function resolveNodeIdAtClientPoint(svg: SVGSVGElement, clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  // Only treat hits inside the board SVG as valid squares.
  if (el instanceof Node && !svg.contains(el)) return null;
  return resolveNodeIdFromTarget(el);
}

function toggleSquare(state: BoardAnnotationsState, at: string, color: AnnotationColor): void {
  // Squares and circles are mutually exclusive per node.
  const circleIdx = state.circles.findIndex((c) => c.at === at);
  if (circleIdx >= 0) state.circles.splice(circleIdx, 1);

  const idx = state.squares.findIndex((s) => s.at === at);
  if (idx >= 0) {
    const existing = state.squares[idx];
    if (existing.color === color) state.squares.splice(idx, 1);
    else state.squares[idx] = { kind: "square", at, color };
    return;
  }
  state.squares.push({ kind: "square", at, color });
}

function toggleCircle(state: BoardAnnotationsState, at: string, color: AnnotationColor): void {
  // Squares and circles are mutually exclusive per node.
  const squareIdx = state.squares.findIndex((s) => s.at === at);
  if (squareIdx >= 0) state.squares.splice(squareIdx, 1);

  const idx = state.circles.findIndex((c) => c.at === at);
  if (idx >= 0) {
    const existing = state.circles[idx];
    if (existing.color === color) state.circles.splice(idx, 1);
    else state.circles[idx] = { kind: "circle", at, color };
    return;
  }
  state.circles.push({ kind: "circle", at, color });
}

function togglePin(state: BoardAnnotationsState, at: string, color: AnnotationColor): void {
  // Pins and protects are mutually exclusive per node.
  const protectIdx = (state.protects ?? []).findIndex((t) => t.at === at);
  if (protectIdx >= 0) state.protects!.splice(protectIdx, 1);

  const idx = state.pins.findIndex((p) => p.at === at);
  if (idx >= 0) {
    const existing = state.pins[idx];
    if (existing.color === color) state.pins.splice(idx, 1);
    else state.pins[idx] = { kind: "pin", at, color };
    return;
  }
  state.pins.push({ kind: "pin", at, color });
}

function toggleProtect(state: BoardAnnotationsState, at: string, color: AnnotationColor): void {
  // Pins and protects are mutually exclusive per node.
  const pinIdx = (state.pins ?? []).findIndex((p) => p.at === at);
  if (pinIdx >= 0) state.pins!.splice(pinIdx, 1);

  if (!state.protects) state.protects = [];
  const idx = state.protects.findIndex((t) => t.at === at);
  if (idx >= 0) {
    const existing = state.protects[idx];
    if (existing.color === color) state.protects.splice(idx, 1);
    else state.protects[idx] = { kind: "protect", at, color };
    return;
  }
  state.protects.push({ kind: "protect", at, color });
}

/**
 * Analyse the pointer path of a completed drag gesture to determine how a
 * knight-move arrow should bend.  Looks at the position at ~40 % of arc
 * length: if the user covered more of the horizontal displacement first it
 * returns "x" (go horizontal first); more vertical first → "y"; roughly
 * equal (diagonal trace) → "diagonal".
 *
 * @param path     Client-coordinate samples collected during the drag.
 * @param totalDx  Total horizontal displacement (endX − startX).
 * @param totalDy  Total vertical displacement (endY − startY).
 */
function detectKnightElbow(
  path: { x: number; y: number }[],
  totalDx: number,
  totalDy: number,
): "x" | "y" | "diagonal" {
  if (path.length < 3 || Math.abs(totalDx) < 0.5 || Math.abs(totalDy) < 0.5) {
    return "diagonal";
  }

  // Compute cumulative arc lengths between successive samples.
  let totalArc = 0;
  const seg: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const s = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    seg.push(s);
    totalArc += s;
  }
  if (totalArc < 1) return "diagonal";

  // Walk forward until we reach 40 % of the total arc length.
  const target = totalArc * 0.4;
  let accumulated = 0;
  let sampleIdx = path.length - 1;
  for (let i = 0; i < seg.length; i++) {
    accumulated += seg[i];
    if (accumulated >= target) { sampleIdx = i + 1; break; }
  }

  const midPt = path[sampleIdx];
  const xFrac = Math.abs(midPt.x - path[0].x) / Math.abs(totalDx);
  const yFrac = Math.abs(midPt.y - path[0].y) / Math.abs(totalDy);

  // When both fractions are within 0.2 of each other, the user dragged diagonally.
  if (Math.abs(xFrac - yFrac) < 0.2) return "diagonal";
  return xFrac > yFrac ? "x" : "y";
}

function toggleArrow(
  state: BoardAnnotationsState,
  from: string,
  to: string,
  color: AnnotationColor,
  elbowFirst?: "x" | "y" | "diagonal",
): void {
  const idx = state.arrows.findIndex((a) => a.from === from && a.to === to);
  if (idx >= 0) {
    const existing = state.arrows[idx];
    if (existing.color === color) state.arrows.splice(idx, 1);
    else state.arrows[idx] = { kind: "arrow", from, to, color, elbowFirst };
    return;
  }
  state.arrows.push({ kind: "arrow", from, to, color, elbowFirst });
}

function eraseAtNode(state: BoardAnnotationsState, at: string): boolean {
  // Erase all annotation types at this node.
  let erased = false;
  const si = state.squares.findIndex((s) => s.at === at);
  if (si >= 0) { state.squares.splice(si, 1); erased = true; }
  const ci = state.circles.findIndex((c) => c.at === at);
  if (ci >= 0) { state.circles.splice(ci, 1); erased = true; }
  const pi = state.pins.findIndex((p) => p.at === at);
  if (pi >= 0) { state.pins.splice(pi, 1); erased = true; }
  const ti = (state.protects ?? []).findIndex((t) => t.at === at);
  if (ti >= 0) { state.protects!.splice(ti, 1); erased = true; }
  return erased;
}

// Priority erase: removes pin/protect before square/circle.
function eraseAtNodePriority(state: BoardAnnotationsState, at: string): boolean {
  const pi = (state.pins ?? []).findIndex((p) => p.at === at);
  if (pi >= 0) { state.pins!.splice(pi, 1); return true; }
  const ti = (state.protects ?? []).findIndex((t) => t.at === at);
  if (ti >= 0) { state.protects!.splice(ti, 1); return true; }
  const si = state.squares.findIndex((s) => s.at === at);
  if (si >= 0) { state.squares.splice(si, 1); return true; }
  const ci = state.circles.findIndex((c) => c.at === at);
  if (ci >= 0) { state.circles.splice(ci, 1); return true; }
  return false;
}

function eraseArrow(state: BoardAnnotationsState, from: string, to: string): boolean {
  const idx = state.arrows.findIndex((a) => a.from === from && a.to === to);
  if (idx < 0) return false;
  state.arrows.splice(idx, 1);
  return true;
}

export function installBoardVisualizationTools(
  svg: SVGSVGElement,
  opts?: BoardVisualizationToolsOptions
): BoardVisualizationToolsController {
  const state: BoardAnnotationsState = { arrows: [], squares: [], circles: [], pins: [], protects: [] };

  const rerender = () => renderBoardAnnotations(svg, state);
  const clear = () => {
    state.arrows = [];
    state.squares = [];
    state.circles = [];
    state.pins = [];
    state.protects = [];
    clearBoardAnnotations(svg);
  };
  const hasAnyAnnotations = () =>
    state.arrows.length > 0 ||
    state.squares.length > 0 ||
    state.circles.length > 0 ||
    state.pins.length > 0 ||
    state.protects.length > 0;

  const getGameState = opts?.getState ?? null;

  // Prevent the browser context menu on the board so right-drag is usable.
  svg.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Pointer interactions may still generate a click event even if we render annotations.
  // Suppress those clicks so gameplay input is not affected.
  let suppressClickUntilMs = 0;
  svg.addEventListener(
    "click",
    (ev) => {
      if (Date.now() < suppressClickUntilMs) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    { capture: true }
  );

  const DRAG_THRESHOLD_PX = 6;


  let gestureActive = false;
  let gestureKind: "right" | "touch" = "right";
  let startNode: string | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let dragged = false;
  // Client-coordinate positions sampled during the active drag.  Used to infer
  // the elbow direction for knight-move arrows (X-first, Y-first, or diagonal).
  let gesturePath: { x: number; y: number }[] = [];
  let gestureColor: AnnotationColor = "orange";
  let activeColor: AnnotationColor = "orange";
  let activeAnnotationType: AnnotationType = "square";
  let eraseMode = false;
  let activePointerId: number | null = null;

  // Track the last completed right-click node so c/p/t keys can act on it post-gesture.
  let lastRcNode: string | null = null;
  let lastRcColor: AnnotationColor = "orange";
  let lastRcAtMs = 0;
  const RC_KEY_WINDOW_MS = 1500;

  const isTouchInputEnabled = typeof opts?.isTouchInputEnabled === "function" ? opts.isTouchInputEnabled : null;

  const isInteractiveEl = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest("button,a,input,select,textarea,label,[role='button'],[role='link']"));
  };

  const startGesture = (ev: PointerEvent, node: string, kind: "right" | "touch", color: AnnotationColor): void => {
    // Start a gesture. For right-click, arrow vs highlight is decided on pointerup.
    // For touch, we only draw arrows on drag; highlights are toggled on double-tap.
    gestureActive = true;
    gestureKind = kind;
    startNode = node;
    startClientX = ev.clientX;
    startClientY = ev.clientY;
    dragged = false;
    gesturePath = [{ x: ev.clientX, y: ev.clientY }];
    gestureColor = color;
    activePointerId = ev.pointerId;

    try {
      svg.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };

  svg.addEventListener(
    "pointerdown",
    (ev: PointerEvent) => {
      const isTouch = ev.pointerType === "touch";
      const touchEnabled = isTouch && Boolean(isTouchInputEnabled?.());

      // Chess.com behavior: any *mouse* left click clears markings.
      // On touch devices, clearing on tap makes double-tap highlights unusable.
      if (ev.button === 0 && !isTouch) {
        clear();
        return;
      }

      if (ev.button === 2) {
        const node = resolveNodeIdFromTarget(ev.target);
        if (!node) return;

        startGesture(ev, node, "right", colorFromModifiers(ev));

        // Stop other handlers from interpreting this as input.
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (!touchEnabled) return;

      // When the touch palette is in "Play" mode, let taps/drags pass through
      // to the regular gameplay handlers instead of placing annotations.
      if (activeAnnotationType === "play") return;

      const node = resolveNodeIdFromTarget(ev.target);
      if (!node) return;

      // Touch in analysis mode: drag draws arrows; double-tap toggles square highlight.
      startGesture(ev, node, "touch", activeColor);
    },
    { capture: true, passive: false }
  );

  svg.addEventListener(
    "pointermove",
    (ev: PointerEvent) => {
      if (!gestureActive) return;
      if (activePointerId !== null && ev.pointerId !== activePointerId) return;

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) dragged = true;

      // Record position for later elbow-direction analysis (cap at 300 samples).
      if (gesturePath.length < 300) gesturePath.push({ x: ev.clientX, y: ev.clientY });

      // Only prevent default after the user has actually started dragging.
      if (dragged) ev.preventDefault();
    },
    { capture: true, passive: false }
  );

  const finish = (ev: PointerEvent) => {
    if (!gestureActive) return;
    if (activePointerId !== null && ev.pointerId !== activePointerId) return;

    const from = startNode;
    const color = gestureColor;

    const kind = gestureKind;

    gestureActive = false;
    startNode = null;
    activePointerId = null;

    if (!from) return;

    if (!dragged) {
      if (kind === "right") {
        if (activeAnnotationType === "play") return;
        // Dispatch to the appropriate annotation type.
        switch (activeAnnotationType) {
          case "circle":  toggleCircle(state, from, color);  break;
          case "pin":     togglePin(state, from, color);     break;
          case "protect": toggleProtect(state, from, color); break;
          case "remove":  eraseAtNodePriority(state, from);  break;
          default:        toggleSquare(state, from, color);  break;
        }
        // Record for the s/c/n/p/x keyboard shortcut window.
        lastRcNode = from;
        lastRcColor = color;
        lastRcAtMs = Date.now();
        rerender();
        suppressClickUntilMs = Date.now() + 600;
      } else {
        if (activeAnnotationType === "play") return;
        // Touch: single tap places or erases annotation based on active type / erase mode.
        const now = Date.now();
        if (activeAnnotationType === "remove") {
          eraseAtNodePriority(state, from);
        } else if (eraseMode) {
          eraseAtNode(state, from);
        } else {
          switch (activeAnnotationType) {
            case "circle":  toggleCircle(state, from, color);  break;
            case "pin":     togglePin(state, from, color);     break;
            case "protect": toggleProtect(state, from, color); break;
            default:       toggleSquare(state, from, color); break;
          }
        }
        rerender();
        suppressClickUntilMs = now + 600;
        ev.preventDefault();
        ev.stopPropagation();
      }
      return;
    }

    const to = resolveNodeIdAtClientPoint(svg, ev.clientX, ev.clientY);
    if (!to) return;
    if (to === from) return;

    // Arrow drags are gated by piece-specific movement rules on the source square.
    // Knights: only valid knight-move targets.
    // Pawns: only forward/capture squares according to the pawn's colour and position.
    // All other pieces: any target is allowed.
    if (!isValidArrowTarget(from, to, getGameState)) return;

    if (kind === "touch" && eraseMode) {
      eraseArrow(state, from, to);
    } else {
      const totalDx = ev.clientX - startClientX;
      const totalDy = ev.clientY - startClientY;
      const elbowFirst =
        gesturePath.length >= 3
          ? detectKnightElbow(gesturePath, totalDx, totalDy)
          : undefined;
      toggleArrow(state, from, to, color, elbowFirst);
    }
    rerender();
    suppressClickUntilMs = Date.now() + 600;
  };

  // Keyboard shortcuts: s=square, c=circle, n=pin, p=protect, x=remove.
  // During an active right-click gesture: changes active annotation type so the
  // upcoming pointerup uses the new type.
  // Within RC_KEY_WINDOW_MS after a completed right-click: acts on the last node.
  const isPlainKey = (ev: KeyboardEvent): boolean =>
    !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey;

  const isEditableEl = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    const tag = (target as Element).tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" ||
      (target as HTMLElement).isContentEditable;
  };

  window.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (isEditableEl(ev.target)) return;

    const isAltX = ev.key.toLowerCase() === "x" && ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey;
    if (isAltX && hasAnyAnnotations()) {
      ev.preventDefault();
      gestureActive = false;
      startNode = null;
      activePointerId = null;
      lastRcNode = null;
      lastRcAtMs = 0;
      clear();
      return;
    }

    if (!isPlainKey(ev)) return;

    const key = ev.key.toLowerCase();
    if (key !== "s" && key !== "c" && key !== "n" && key !== "p" && key !== "x") return;

    // Always update the active annotation type.
    // s=square, c=circle, n=pin, p=protect, x=remove
    const newType: AnnotationType =
      key === "c" ? "circle" : key === "n" ? "pin" : key === "p" ? "protect" : key === "x" ? "remove" : "square";

    if (gestureActive && gestureKind === "right") {
      // Gesture in progress: update for when pointerup fires.
      activeAnnotationType = newType;
      ev.preventDefault();
      return;
    }

    // Act on the last right-clicked node if within the window.
    const node = lastRcNode;
    if (node && Date.now() - lastRcAtMs <= RC_KEY_WINDOW_MS) {
      ev.preventDefault();
      activeAnnotationType = newType;
      if (key === "s")      toggleSquare(state, node, lastRcColor);
      else if (key === "c") toggleCircle(state, node, lastRcColor);
      else if (key === "n") togglePin(state, node, lastRcColor);
      else if (key === "p") toggleProtect(state, node, lastRcColor);
      else                  eraseAtNodePriority(state, node); // x
      rerender();
      lastRcAtMs = 0; // consume window
    } else {
      // No recent click — just update the active type for future annotations.
      activeAnnotationType = newType;
    }
  });

  svg.addEventListener("pointerup", finish, { capture: true, passive: false });
  svg.addEventListener("pointercancel", () => {
    gestureActive = false;
    startNode = null;
    activePointerId = null;
  });

  // Ensure initial layer exists (no-op if unused).
  rerender();

  return {
    clear,
    setActiveColor: (color: AnnotationColor) => {
      activeColor = color;
    },
    getActiveColor: () => activeColor,
    setAnnotationType: (type: AnnotationType) => {
      activeAnnotationType = type;
    },
    getAnnotationType: () => activeAnnotationType,
    setEraseMode: (enabled: boolean) => {
      eraseMode = Boolean(enabled);
    },
    getEraseMode: () => eraseMode,
  };
}
