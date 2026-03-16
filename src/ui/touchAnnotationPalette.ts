import type { GameController } from "../controller/gameController";
import type { AnnotationColor } from "../render/boardAnnotations";
import type { AnnotationType, BoardVisualizationToolsController } from "./boardVisualizationTools";

function isNumberAnnotationType(raw: string | null): boolean {
  return raw !== null && /^digit-[0-9]$/.test(raw);
}

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
    if (raw === "play" || raw === "square" || raw === "circle" || raw === "pin" || raw === "protect" || raw === "remove" || isNumberAnnotationType(raw)) return raw;
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

  // "Play" acts as a toggle on touch: when enabled, taps should play moves.
  // When disabled, return to the previously-selected annotation type.
  let lastNonPlayType: AnnotationType = "square";

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

        const clicked = clampType(b.getAttribute("data-annotation-type"));
        const current = tools.getAnnotationType();

        if (clicked === "play") {
          if (current === "play") setType(lastNonPlayType);
          else {
            if (current !== "play") lastNonPlayType = current;
            // Entering Play mode should ensure we don't accidentally leave the
            // UI in Erase mode when returning to annotations.
            tools.setEraseMode(false);
            syncErasePressed(false);
            setType("play");
          }
          return;
        }

        lastNonPlayType = clicked;
        setType(clicked);
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
  {
    const initial = tools.getAnnotationType();
    if (initial !== "play") lastNonPlayType = initial;
    setType(initial);
  }
  syncErasePressed(tools.getEraseMode());
  syncVisibility();

  controller.addAnalysisModeChangeCallback(() => syncVisibility());
  window.addEventListener("panelLayoutModeChanged", () => syncVisibility());
  window.addEventListener("resize", () => syncVisibility());
}
