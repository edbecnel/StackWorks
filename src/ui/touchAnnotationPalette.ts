import type { GameController } from "../controller/gameController";
import type { AnnotationColor } from "../render/boardAnnotations";
import type { BoardVisualizationToolsController } from "./boardVisualizationTools";

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

export function bindTouchAnnotationPalette(controller: GameController, tools: BoardVisualizationToolsController): void {
  const root = document.getElementById("touchAnnotationPalette") as HTMLElement | null;
  if (!root) return;

  const btns = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-color]"));
  if (btns.length === 0) return;

  const clampColor = (raw: string | null): AnnotationColor => {
    if (raw === "orange" || raw === "green" || raw === "red" || raw === "blue") return raw;
    return "orange";
  };

  const syncPressed = (selected: AnnotationColor) => {
    for (const b of btns) {
      const c = clampColor(b.getAttribute("data-color"));
      b.setAttribute("aria-pressed", c === selected ? "true" : "false");
    }
  };

  const setSelected = (color: AnnotationColor) => {
    tools.setActiveColor(color);
    syncPressed(color);
  };

  for (const b of btns) {
    b.addEventListener(
      "click",
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setSelected(clampColor(b.getAttribute("data-color")));
      },
      { capture: true }
    );
  }

  const syncVisibility = () => {
    const show = isTouchLikeEnvironment() && controller.isAnalysisMode();
    root.style.display = show ? "flex" : "none";
  };

  setSelected(tools.getActiveColor());
  syncVisibility();

  controller.addAnalysisModeChangeCallback(() => syncVisibility());
  window.addEventListener("panelLayoutModeChanged", () => syncVisibility());
  window.addEventListener("resize", () => syncVisibility());
}
