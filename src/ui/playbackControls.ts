import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";

const DEFAULT_DELAY_MS = 500;
const MAX_DELAY_MS = 3000;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseDelayMs(raw: string, fallback: number): number {
  const cleaned = String(raw).trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return fallback;
  return clampInt(n, 0, MAX_DELAY_MS);
}

function findCurrentIndex(controller: GameController): number {
  const history = controller.getHistory();
  const current = history.find((h) => h.isCurrent);
  if (!current) return -1;
  return current.index;
}

export function bindPlaybackControls(controller: GameController): void {
  const elBtn = document.getElementById("playbackBtn") as HTMLButtonElement | null;
  const elDelay = document.getElementById("playbackDelay") as HTMLInputElement | null;
  const elDelayReset = document.getElementById("playbackDelayReset") as HTMLButtonElement | null;
  const elDelayLabel = document.getElementById("playbackDelayLabel") as HTMLElement | null;
  const elHint = document.getElementById("playbackHint") as HTMLElement | null;

  if (!elBtn || !elDelay || !elDelayReset || !elDelayLabel) return;

  const rangeMin = parseDelayMs(elDelay.min || "0", 0);
  const rangeMax = parseDelayMs(elDelay.max || "3000", 3000);

  let delayMs = DEFAULT_DELAY_MS;
  let playing = false;
  let boardPaused = false; // true when paused by tapping the board during playback
  let lastBoardTapAtMs = 0;
  let timer: number | null = null;

  const isAtEnd = () => !controller.canRedo() && controller.canUndo();

  const renderButton = () => {
    if (playing) {
      elBtn.textContent = "■";
      elBtn.title = "Stop playback";
      elBtn.setAttribute("aria-pressed", "true");
      elBtn.disabled = false;
    } else if (isAtEnd()) {
      elBtn.textContent = "|◀";
      elBtn.title = "Go back to Start";
      elBtn.setAttribute("aria-pressed", "false");
      elBtn.disabled = false;
      if (elHint) elHint.textContent = "At end — go back to Start";
    } else {
      elBtn.textContent = "▶";
      elBtn.title = "Play move history";
      elBtn.setAttribute("aria-pressed", "false");
      elBtn.disabled = !controller.canRedo();
      if (elHint) elHint.textContent = "Plays forward from the current position";
    }

    elBtn.setAttribute("aria-label", elBtn.title);
  };

  const updateSpeedUI = () => {
    const clamped = clampInt(delayMs, 0, MAX_DELAY_MS);
    delayMs = clamped;

    // Keep slider within its configured range.
    const sliderValue = clampInt(clamped, rangeMin, rangeMax);
    elDelay.value = String(sliderValue);

    elDelayLabel.textContent = `${clamped} ms`;
  };

  const stop = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    playing = false;
    boardPaused = false;
    renderButton();
  };

  const pauseByBoard = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    playing = false;
    boardPaused = true;
    renderButton();
    controller.toast("Playback paused - Tap on the board to continue", 3000, { force: true });
  };

  const stepOnce = async () => {
    const history = controller.getHistory();
    const currentIndex = findCurrentIndex(controller);
    if (currentIndex < 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= history.length) return;

    // Make the slide clearly visible during playback.
    // Use (nearly) the full delay budget for animation.
    const animMs = clampInt(Math.round(delayMs * 0.98), 400, 20_000);
    await controller.jumpToHistoryAnimated(nextIndex, animMs);
  };

  const tick = async () => {
    if (!playing) return;

    if (!controller.canRedo()) {
      stop();
      return;
    }

    const startedAt = performance.now();
    await stepOnce();

    // Stop if we hit the end.
    if (!controller.canRedo()) {
      stop();
      return;
    }

    // Keep overall tempo: delayMs represents the total time per move.
    const elapsed = performance.now() - startedAt;
    const wait = Math.max(0, delayMs - elapsed);
    timer = window.setTimeout(() => void tick(), wait);
  };

  const start = () => {
    if (playing) return;
    if (!controller.canRedo()) return;

    boardPaused = false;
    playing = true;
    renderButton();

    timer = window.setTimeout(() => void tick(), delayMs);
  };

  const syncEnabled = () => {
    renderButton();
  };

  // Bind board tap to pause/resume playback.
  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  const boardSvg = boardWrap?.querySelector("svg") as SVGSVGElement | null;
  if (boardSvg) {
    const onBoardTap = (ev: Event) => {
      const now = Date.now();
      // A single physical tap fires both pointerdown and click; ignore the follow-up.
      if (ev.type === "click" && now - lastBoardTapAtMs < 350) return;

      if (playing) {
        ev.preventDefault();
        ev.stopPropagation();
        lastBoardTapAtMs = now;
        pauseByBoard();
        return;
      }

      if (boardPaused) {
        ev.preventDefault();
        ev.stopPropagation();
        lastBoardTapAtMs = now;
        start();
        return;
      }
    };

    boardSvg.addEventListener("pointerdown", onBoardTap, { capture: true });
    boardSvg.addEventListener("click", onBoardTap, { capture: true });
  }

  // Initial state
  delayMs = parseDelayMs(elDelay.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
  updateSpeedUI();
  playing = false;
  renderButton();

  elBtn.addEventListener("click", () => {
    if (boardPaused) {
      start();
      return;
    }

    if (playing) {
      stop();
      return;
    }

    if (isAtEnd()) {
      controller.jumpToHistory(0);
      renderButton();
      return;
    }

    start();
  });

  elDelay.addEventListener("input", () => {
    delayMs = parseDelayMs(elDelay.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
    updateSpeedUI();
  });

  elDelayReset.addEventListener("click", () => {
    delayMs = DEFAULT_DELAY_MS;
    updateSpeedUI();
  });

  controller.addHistoryChangeCallback((reason: HistoryChangeReason) => {
    // If the actual game history changes, stop playback to avoid fighting the user.
    if (playing && reason !== "jump") {
      stop();
      return;
    }
    renderButton();
  });
}
