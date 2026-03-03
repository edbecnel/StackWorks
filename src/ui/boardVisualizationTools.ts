import { clearBoardAnnotations, renderBoardAnnotations, type AnnotationColor, type BoardAnnotationsState } from "../render/boardAnnotations";

export type BoardVisualizationToolsController = {
  clear: () => void;
  /** Active color used for touch annotations (drag arrows / double-tap highlights). */
  setActiveColor: (color: AnnotationColor) => void;
  getActiveColor: () => AnnotationColor;
};

export type BoardVisualizationToolsOptions = {
  /** When true, touch gestures (drag/double-tap) are enabled for annotations. */
  isTouchInputEnabled?: () => boolean;
};

function colorFromModifiers(ev: Pick<PointerEvent, "shiftKey" | "ctrlKey" | "altKey">): AnnotationColor {
  if (ev.shiftKey) return "green";
  if (ev.ctrlKey) return "red";
  if (ev.altKey) return "blue";
  return "orange";
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
  const idx = state.squares.findIndex((s) => s.at === at);
  if (idx >= 0) {
    const existing = state.squares[idx];
    if (existing.color === color) state.squares.splice(idx, 1);
    else state.squares[idx] = { kind: "square", at, color };
    return;
  }
  state.squares.push({ kind: "square", at, color });
}

function toggleArrow(state: BoardAnnotationsState, from: string, to: string, color: AnnotationColor): void {
  const idx = state.arrows.findIndex((a) => a.from === from && a.to === to);
  if (idx >= 0) {
    const existing = state.arrows[idx];
    if (existing.color === color) state.arrows.splice(idx, 1);
    else state.arrows[idx] = { kind: "arrow", from, to, color };
    return;
  }
  state.arrows.push({ kind: "arrow", from, to, color });
}

export function installBoardVisualizationTools(
  svg: SVGSVGElement,
  opts?: BoardVisualizationToolsOptions
): BoardVisualizationToolsController {
  const state: BoardAnnotationsState = { arrows: [], squares: [] };

  const rerender = () => renderBoardAnnotations(svg, state);
  const clear = () => {
    state.arrows = [];
    state.squares = [];
    clearBoardAnnotations(svg);
  };

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
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_RADIUS_PX = 24;

  let lastTouchTapAtMs = 0;
  let lastTouchTapNode: string | null = null;
  let lastTouchTapX = 0;
  let lastTouchTapY = 0;

  let gestureActive = false;
  let gestureKind: "right" | "touch" = "right";
  let startNode: string | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let dragged = false;
  let gestureColor: AnnotationColor = "orange";
  let activeColor: AnnotationColor = "orange";
  let activePointerId: number | null = null;

  const isTouchInputEnabled = typeof opts?.isTouchInputEnabled === "function" ? opts.isTouchInputEnabled : null;

  const startGesture = (ev: PointerEvent, node: string, kind: "right" | "touch", color: AnnotationColor): void => {
    // Start a gesture. For right-click, arrow vs highlight is decided on pointerup.
    // For touch, we only draw arrows on drag; highlights are toggled on double-tap.
    gestureActive = true;
    gestureKind = kind;
    startNode = node;
    startClientX = ev.clientX;
    startClientY = ev.clientY;
    dragged = false;
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

      const node = resolveNodeIdFromTarget(ev.target);
      if (!node) return;

      // Touch in analysis mode: drag draws arrows; double-tap toggles square highlight.
      startGesture(ev, node, "touch", activeColor);
    },
    { capture: true }
  );

  svg.addEventListener(
    "pointermove",
    (ev: PointerEvent) => {
      if (!gestureActive) return;
      if (activePointerId !== null && ev.pointerId !== activePointerId) return;

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) dragged = true;

      // Only prevent default after the user has actually started dragging.
      // This avoids breaking normal tap-to-move gameplay.
      if (dragged) ev.preventDefault();
    },
    { capture: true }
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
        toggleSquare(state, from, color);
        rerender();
        suppressClickUntilMs = Date.now() + 600;
      } else {
        // Touch: single taps do nothing; double-tap toggles square highlight.
        const now = Date.now();
        const dt = now - lastTouchTapAtMs;
        const dx = ev.clientX - lastTouchTapX;
        const dy = ev.clientY - lastTouchTapY;
        const closeEnough = Math.hypot(dx, dy) <= DOUBLE_TAP_RADIUS_PX;

        if (lastTouchTapNode === from && dt > 0 && dt <= DOUBLE_TAP_MS && closeEnough) {
          toggleSquare(state, from, color);
          rerender();
          suppressClickUntilMs = now + 600;

          // Consume the second tap so it doesn't act as game input.
          ev.preventDefault();
          ev.stopPropagation();

          lastTouchTapAtMs = 0;
          lastTouchTapNode = null;
        } else {
          lastTouchTapAtMs = now;
          lastTouchTapNode = from;
          lastTouchTapX = ev.clientX;
          lastTouchTapY = ev.clientY;
        }
      }
      return;
    }

    const to = resolveNodeIdAtClientPoint(svg, ev.clientX, ev.clientY);
    if (!to) return;
    if (to === from) return;

    toggleArrow(state, from, to, color);
    rerender();
    suppressClickUntilMs = Date.now() + 600;

    // Prevent a drag-gesture arrow from becoming a click.
    ev.preventDefault();
    ev.stopPropagation();
  };

  svg.addEventListener("pointerup", finish, { capture: true });
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
  };
}
