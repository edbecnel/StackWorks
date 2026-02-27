import { clearBoardAnnotations, renderBoardAnnotations, type AnnotationColor, type BoardAnnotationsState } from "../render/boardAnnotations";

export type BoardVisualizationToolsController = {
  clear: () => void;
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

export function installBoardVisualizationTools(svg: SVGSVGElement): BoardVisualizationToolsController {
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

  const DRAG_THRESHOLD_PX = 6;

  let rightActive = false;
  let startNode: string | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let dragged = false;
  let activeColor: AnnotationColor = "orange";
  let activePointerId: number | null = null;

  svg.addEventListener(
    "pointerdown",
    (ev: PointerEvent) => {
      if (ev.button === 0) {
        // Chess.com behavior: any left click clears markings.
        clear();
        return;
      }

      if (ev.button !== 2) return;

      const node = resolveNodeIdFromTarget(ev.target);
      if (!node) return;

      // Start a right-click gesture. We decide arrow vs highlight on pointerup.
      rightActive = true;
      startNode = node;
      startClientX = ev.clientX;
      startClientY = ev.clientY;
      dragged = false;
      activeColor = colorFromModifiers(ev);
      activePointerId = ev.pointerId;

      // Stop other handlers from interpreting this as input.
      ev.preventDefault();
      ev.stopPropagation();

      try {
        svg.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
    },
    { capture: true }
  );

  svg.addEventListener(
    "pointermove",
    (ev: PointerEvent) => {
      if (!rightActive) return;
      if (activePointerId !== null && ev.pointerId !== activePointerId) return;

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) dragged = true;

      ev.preventDefault();
    },
    { capture: true }
  );

  const finish = (ev: PointerEvent) => {
    if (!rightActive) return;
    if (activePointerId !== null && ev.pointerId !== activePointerId) return;

    const from = startNode;
    const color = activeColor;

    rightActive = false;
    startNode = null;
    activePointerId = null;

    if (!from) return;

    if (!dragged) {
      toggleSquare(state, from, color);
      rerender();
      return;
    }

    const to = resolveNodeIdAtClientPoint(svg, ev.clientX, ev.clientY);
    if (!to) return;
    if (to === from) return;

    toggleArrow(state, from, to, color);
    rerender();
  };

  svg.addEventListener("pointerup", finish, { capture: true });
  svg.addEventListener("pointercancel", () => {
    rightActive = false;
    startNode = null;
    activePointerId = null;
  });

  // Ensure initial layer exists (no-op if unused).
  rerender();

  return { clear };
}
