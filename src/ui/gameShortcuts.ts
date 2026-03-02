import type { GameController } from "../controller/gameController.ts";

function isChessLikeRulesetId(rulesetId: string | null | undefined): boolean {
  return rulesetId === "chess" || rulesetId === "columns_chess";
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as any).isContentEditable) return true;

  // Some UI libraries set role="textbox" on non-input elements.
  const role = el.getAttribute?.("role")?.toLowerCase();
  if (role === "textbox") return true;

  return false;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function adjustRangeInput(id: string, deltaSteps: number): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return false;
  if (el.disabled) return false;
  if (String(el.type).toLowerCase() !== "range") return false;

  const current = Number(el.value);
  if (!Number.isFinite(current)) return false;

  const min = Number(el.min);
  const max = Number(el.max);
  const step = Number(el.step);

  const stepSize = Number.isFinite(step) && step > 0 ? step : 1;
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : lo + stepSize;

  const next = clampInt(Math.round(current + deltaSteps * stepSize), lo, hi);
  if (next === current) return true;

  el.value = String(next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function clickButton(id: string): boolean {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  if (!el) return false;
  if (el.disabled) return false;
  el.click();
  return true;
}

function openKeyboardShortcutsPopup(controller?: GameController): void {
  const popup = window.open("", "lascaKeyboardShortcuts", "popup,width=520,height=640");
  if (!popup) {
    controller?.toast("Popup blocked — allow popups to view shortcuts", 2600, { force: true });
    return;
  }

  const rulesetId = controller?.getState().meta?.rulesetId ?? null;
  const showAnalysis = isChessLikeRulesetId(rulesetId);

  const analysisShortcutRow = showAnalysis
    ? "<li><b>Toggle analysis:</b> <code>Ctrl/Cmd+Shift+A</code></li>"
    : "";

  const analysisSection = showAnalysis
    ? `

    <h2>Analysis mode (private sandbox)</h2>
    <ul>
      <li>In online rooms, analysis moves are local-only and are not submitted to the server.</li>
      <li>Your opponent does not see your Analysis mode or analysis moves.</li>
      <li>AI/bots are paused while analysis is enabled, and restored when you exit.</li>
    </ul>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Keyboard Shortcuts</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        line-height: 1.4;
        background: #121212;
        color: rgba(255,255,255,0.92);
        padding: 18px;
      }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      h2 { font-size: 14px; margin: 16px 0 8px 0; color: rgba(255,255,255,0.86); }
      p { margin: 10px 0; color: rgba(255,255,255,0.84); }
      ul { margin: 8px 0 12px 18px; padding: 0; }
      li { margin: 6px 0; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
        padding: 2px 6px;
        border-radius: 6px;
      }
      .box {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 12px;
      }
    </style>
  </head>
  <body>
    <h1>Keyboard Shortcuts</h1>
    <div class="box">
      <p>Shortcuts use <code>Ctrl</code> (Windows/Linux) or <code>Cmd</code> (macOS).</p>
      <p>Shortcuts are disabled while typing in a text field.</p>
    </div>

    <h2>Game</h2>
    <ul>
      <li><b>Undo:</b> <code>Ctrl/Cmd+Z</code></li>
      <li><b>Redo:</b> <code>Ctrl/Cmd+Y</code> or <code>Ctrl/Cmd+Shift+Z</code></li>
      <li><b>Save:</b> <code>Ctrl/Cmd+S</code></li>
      ${analysisShortcutRow}
      <li><b>Resign:</b> <code>Ctrl/Cmd+Shift+X</code></li>
      <li><b>Full Screen:</b> <code>Ctrl/Cmd+Shift+F</code></li>
    </ul>

    <h2>Speed</h2>
    <ul>
      <li><b>Bot speed:</b> <code>Alt+↑</code>/<code>Alt+↓</code> (when available)</li>
      <li><b>Playback speed:</b> <code>Alt+Shift+↑</code>/<code>Alt+Shift+↓</code></li>
    </ul>

    <h2>Help</h2>
    <ul>
      <li><b>Show this window:</b> <code>Ctrl/Cmd+Shift+?</code> (also works as <code>Ctrl/Cmd+Shift+/</code>)</li>
      <li><b>Right-click menu:</b> Right-click outside the board border for chess or anywhere in the game board for other games → <b>Show Keyboard Shortcuts</b></li>
    </ul>

    ${analysisSection}
  </body>
</html>`;

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  } catch {
    // ignore
  }
}

export function bindKeyboardShortcutsContextMenu(controller: GameController): void {
  const ensureMenu = (): HTMLDivElement => {
    const id = "lascaShortcutsContextMenu";
    const existing = document.getElementById(id) as HTMLDivElement | null;
    if (existing) return existing;

    const menu = document.createElement("div");
    menu.id = id;
    menu.style.position = "fixed";
    menu.style.zIndex = "99999";
    menu.style.minWidth = "200px";
    menu.style.padding = "6px";
    menu.style.borderRadius = "10px";
    menu.style.border = "1px solid rgba(255,255,255,0.18)";
    menu.style.background = "rgba(0,0,0,0.92)";
    menu.style.color = "rgba(255,255,255,0.92)";
    menu.style.boxShadow = "0 12px 38px rgba(0,0,0,0.55)";
    menu.style.display = "none";
    menu.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    menu.style.fontSize = "12px";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Show Keyboard Shortcuts";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "8px";
    btn.style.border = "1px solid rgba(255,255,255,0.12)";
    btn.style.background = "rgba(255,255,255,0.06)";
    btn.style.color = "rgba(255,255,255,0.92)";
    btn.style.cursor = "pointer";
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.10)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(255,255,255,0.06)";
    });

    menu.appendChild(btn);
    document.body.appendChild(menu);

    const hide = () => {
      menu.style.display = "none";
    };

    window.addEventListener("click", () => hide());
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") hide();
    });
    window.addEventListener("scroll", () => hide(), { passive: true });
    window.addEventListener("resize", () => hide(), { passive: true });

    btn.addEventListener("click", () => {
      hide();
      openKeyboardShortcutsPopup(controller);
    });

    (menu as any).__hide = hide;
    return menu;
  };

  const getBoardSvg = (): SVGSVGElement | null => {
    // All game pages use #boardWrap to host the board SVG.
    return (document.querySelector("#boardWrap svg") as SVGSVGElement | null) ?? null;
  };

  const getPlayingArea = (): HTMLElement | null => {
    // "Playing area" is the board canvas region in the center column.
    // This includes the blank margin around the SVG board (which may be outside #boardWrap).
    return (
      (document.getElementById("centerArea") as HTMLElement | null) ??
      (document.getElementById("boardWrap") as HTMLElement | null) ??
      null
    );
  };

  const isInPlayingArea = (target: EventTarget | null): boolean => {
    const area = getPlayingArea();
    if (!area) return false;
    const node = target instanceof Node ? target : null;
    if (!node) return false;
    return area.contains(node);
  };

  const isOverBoardSvg = (target: EventTarget | null): boolean => {
    const svg = getBoardSvg();
    if (!svg) return false;
    const node = target instanceof Node ? target : null;
    if (!node) return false;
    return svg.contains(node);
  };

  const isOverCheckerboardSquares = (ev: MouseEvent): boolean => {
    const svg = getBoardSvg();
    if (!svg) return false;

    // Boards use a #squares group for the checkerboard/grid tiles.
    // For chess, we reserve right-clicks over the checkerboard for analysis graphics,
    // but allow the shortcuts menu in the SVG margin surrounding the grid.
    const squares = svg.querySelector("#squares") as SVGGElement | null;
    if (!squares) {
      // Fallback: if we can't identify the grid, treat the whole SVG as "on-board".
      return isOverBoardSvg(ev.target);
    }

    const r = squares.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  };

  // Capture phase so we can decide before board tools (e.g. chess right-drag annotations)
  // suppress the context menu inside the SVG.
  document.addEventListener(
    "contextmenu",
    (ev) => {
      if (isEditableTarget(ev.target)) return;

      // Do not hijack right-clicks over side panels.
      // Those areas often have their own interactions (scrolling, selection, etc.).
      const el = ev.target instanceof Element ? ev.target : null;
      if (el?.closest?.("#leftSidebar, #rightSidebar")) return;

      const rulesetId = controller.getState().meta?.rulesetId ?? "lasca";
      const chessLike = isChessLikeRulesetId(rulesetId);
      const inPlayingArea = isInPlayingArea(ev.target);

      // Only show within the playing area (#boardWrap).
      if (!inPlayingArea) return;

      // UX:
      // - Chess variants: show only off-checkerboard (inside the playing area, but outside the
      //   checkerboard grid) so right-click on the checkerboard can be reserved for analysis graphics.
      // - Other games: show anywhere within #boardWrap (on-board and off-board).
      if (chessLike) {
        if (isOverCheckerboardSquares(ev)) return;
      }

      const menu = ensureMenu();
      const hide = (menu as any).__hide as (() => void) | undefined;
      hide?.();

      ev.preventDefault();

      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      menu.style.display = "block";

      // Measure after display to keep the menu on-screen.
      const rect = menu.getBoundingClientRect();
      const left = clampInt(ev.clientX, pad, Math.max(pad, vw - rect.width - pad));
      const top = clampInt(ev.clientY, pad, Math.max(pad, vh - rect.height - pad));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    },
    { capture: true }
  );
}

export function bindAnalysisToggleButton(controller: GameController): void {
  const analysisToggleBtn = document.getElementById("analysisToggleBtn") as HTMLButtonElement | null;
  if (!analysisToggleBtn) return;

  const sync = () => {
    const on = controller.isAnalysisMode();
    analysisToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    analysisToggleBtn.textContent = on ? "Analysis Mode: On" : "Analysis Mode: Off";
  };

  sync();

  analysisToggleBtn.addEventListener("click", () => {
    controller.setAnalysisMode(!controller.isAnalysisMode());
    sync();
  });

  controller.addAnalysisModeChangeCallback(() => sync());
}

export function bindFullScreenButton(): void {
  const fullScreenBtn = document.getElementById("fullScreenBtn") as HTMLButtonElement | null;
  if (!fullScreenBtn) return;

  const doc = document as Document & {
    fullscreenElement?: Element | null;
    exitFullscreen?: () => Promise<void>;
  };

  const root = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
  };

  const isSupported = typeof root.requestFullscreen === "function" && typeof doc.exitFullscreen === "function";
  if (!isSupported) {
    fullScreenBtn.disabled = true;
    fullScreenBtn.title = "Fullscreen not supported in this browser";
    return;
  }

  const sync = () => {
    const on = Boolean(doc.fullscreenElement);
    fullScreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    fullScreenBtn.textContent = on ? "Full Screen: On" : "Full Screen: Off";
  };

  sync();

  document.addEventListener("fullscreenchange", () => sync());
  fullScreenBtn.addEventListener("click", () => {
    try {
      if (doc.fullscreenElement) {
        void doc.exitFullscreen?.();
      } else {
        void root.requestFullscreen?.();
      }
    } catch {
      // ignore
    }
  });
}

export function bindGameHotkeys(controller: GameController): void {
  window.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    if (isEditableTarget(ev.target)) return;

    const key = String(ev.key || "").toLowerCase();
    const mod = ev.ctrlKey || ev.metaKey;

    // Undo / Redo
    if (mod && !ev.altKey && key === "z" && !ev.shiftKey) {
      ev.preventDefault();
      controller.undo();
      return;
    }
    if (mod && !ev.altKey && ((key === "y" && !ev.shiftKey) || (key === "z" && ev.shiftKey))) {
      ev.preventDefault();
      controller.redo();
      return;
    }

    // Save game
    if (mod && !ev.altKey && key === "s" && !ev.shiftKey) {
      ev.preventDefault();
      clickButton("saveGameBtn");
      return;
    }

    // Toggle analysis
    if (mod && !ev.altKey && key === "a" && ev.shiftKey) {
      ev.preventDefault();
      controller.setAnalysisMode(!controller.isAnalysisMode());
      return;
    }

    // Keyboard shortcuts popup
    if (mod && !ev.altKey && ev.shiftKey && (key === "?" || key === "/")) {
      ev.preventDefault();
      openKeyboardShortcutsPopup(controller);
      return;
    }

    // Resign
    if (mod && !ev.altKey && key === "x" && ev.shiftKey) {
      ev.preventDefault();
      clickButton("resignBtn");
      return;
    }

    // Fullscreen toggle
    if (mod && !ev.altKey && key === "f" && ev.shiftKey) {
      ev.preventDefault();

      const doc = document as Document & {
        fullscreenElement?: Element | null;
        exitFullscreen?: () => Promise<void>;
      };

      const root = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };

      try {
        if (doc.fullscreenElement) {
          void doc.exitFullscreen?.();
        } else {
          void root.requestFullscreen?.();
        }
      } catch {
        // ignore
      }
      return;
    }

    // Bot speed: Alt+Up/Down (Up = faster => lower delay)
    if (!mod && ev.altKey && !ev.shiftKey && (key === "arrowup" || key === "arrowdown")) {
      ev.preventDefault();
      const delta = key === "arrowup" ? -1 : 1;

      // Non-chess variants use #aiDelay; chess variants use #botDelay.
      if (!adjustRangeInput("aiDelay", delta)) {
        adjustRangeInput("botDelay", delta);
      }
      return;
    }

    // Playback speed: Alt+Shift+Up/Down (Up = faster => lower delay)
    if (!mod && ev.altKey && ev.shiftKey && (key === "arrowup" || key === "arrowdown")) {
      ev.preventDefault();
      const delta = key === "arrowup" ? -1 : 1;
      adjustRangeInput("playbackDelay", delta);
      return;
    }
  });
}
