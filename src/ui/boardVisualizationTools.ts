import { clearBoardAnnotations, renderBoardAnnotations, type AnnotationColor, type BoardAnnotationsState } from "../render/boardAnnotations";

export type AnnotationType = "square" | "circle" | "pin" | "protect" | "remove";

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

    if (kind === "touch" && eraseMode) {
      eraseArrow(state, from, to);
    } else {
      toggleArrow(state, from, to, color);
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
    if (!isPlainKey(ev)) return;
    if (isEditableEl(ev.target)) return;

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
