import type { GameController } from "../controller/gameController";
import type { AnnotationColor } from "../render/boardAnnotations";
import type { AnnotationType, BoardVisualizationToolsController } from "./boardVisualizationTools";

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

  const colorBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-color]"));
  const typeBtns  = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-annotation-type]"));
  const clearBtn  = root.querySelector<HTMLButtonElement>("button[data-action='clear']");
  const eraseBtn  = root.querySelector<HTMLButtonElement>("button[data-action='erase']");
  if (colorBtns.length === 0 && typeBtns.length === 0 && !clearBtn && !eraseBtn) return;

  const clampColor = (raw: string | null): AnnotationColor => {
    if (raw === "orange" || raw === "green" || raw === "red" || raw === "blue") return raw;
    return "orange";
  };

  const clampType = (raw: string | null): AnnotationType => {
    if (raw === "square" || raw === "circle" || raw === "pin" || raw === "protect" || raw === "remove") return raw;
    return "square";
  };

  const syncColorPressed = (selected: AnnotationColor) => {
    for (const b of colorBtns) {
      const c = clampColor(b.getAttribute("data-color"));
      b.setAttribute("aria-pressed", c === selected ? "true" : "false");
    }
  };

  const syncTypePressed = (selected: AnnotationType) => {
    for (const b of typeBtns) {
      const t = clampType(b.getAttribute("data-annotation-type"));
      b.setAttribute("aria-pressed", t === selected ? "true" : "false");
    }
  };

  const syncErasePressed = (enabled: boolean) => {
    if (!eraseBtn) return;
    eraseBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  };

  const setSelected = (color: AnnotationColor) => {
    tools.setActiveColor(color);
    syncColorPressed(color);
  };

  const setType = (type: AnnotationType) => {
    tools.setAnnotationType(type);
    syncTypePressed(type);
  };

  for (const b of colorBtns) {
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

  for (const b of typeBtns) {
    b.addEventListener(
      "click",
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setType(clampType(b.getAttribute("data-annotation-type")));
      },
      { capture: true }
    );
  }

  clearBtn?.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tools.clear();
    },
    { capture: true }
  );

  eraseBtn?.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const next = !tools.getEraseMode();
      tools.setEraseMode(next);
      syncErasePressed(next);
    },
    { capture: true }
  );

  const syncVisibility = () => {
    const show = isTouchLikeEnvironment() && controller.isAnalysisMode();
    root.style.display = show ? "flex" : "none";
  };

  setSelected(tools.getActiveColor());
  setType(tools.getAnnotationType());
  syncErasePressed(tools.getEraseMode());
  syncVisibility();

  controller.addAnalysisModeChangeCallback(() => syncVisibility());
  window.addEventListener("panelLayoutModeChanged", () => syncVisibility());
  window.addEventListener("resize", () => syncVisibility());
}
