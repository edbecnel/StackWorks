import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";

const DEFAULT_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;
const PLAYBACK_MOVE_ANIMATION_MS = 350;
/** Cap recorded delays at 1 minute so replays of very long think moves don't freeze. */
const MAX_RECORDED_DELAY_MS = 60_000;

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

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean((el as any).isContentEditable);
}

function toggleLiveBotPauseResume(): boolean {
  const ids = ["botPauseBtn", "aiPauseBtn"];
  for (const id of ids) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (!el || el.disabled) continue;
    el.click();
    return true;
  }
  return false;
}

export function bindPlaybackControls(controller: GameController): void {
  const elBtn = document.getElementById("playbackBtn") as HTMLButtonElement | null;
  const elDelay = document.getElementById("playbackDelay") as HTMLInputElement | null;
  const elDelayReset = document.getElementById("playbackDelayReset") as HTMLButtonElement | null;
  const elDelayLabel = document.getElementById("playbackDelayLabel") as HTMLElement | null;
  const elHint = document.getElementById("playbackHint") as HTMLElement | null;
  // Optional: "Use recorded timing" checkbox and its container row.
  const elUseRecorded = document.getElementById("playbackUseRecorded") as HTMLInputElement | null;
  const elUseRecordedRow = document.getElementById("playbackUseRecordedRow") as HTMLElement | null;

  if (!elBtn || !elDelay || !elDelayReset || !elDelayLabel) return;

  const rangeMin = parseDelayMs(elDelay.min || "0", 0);
  const rangeMax = parseDelayMs(elDelay.max || "5000", 5000);

  let delayMs = DEFAULT_DELAY_MS;
  let playing = false;
  let boardPaused = false; // true when paused by tapping the board during playback
  let lastBoardTapAtMs = 0;
  let timer: number | null = null;
  let playbackSessionActive = false;

  const syncPlaybackToastSuppression = () => {
    const suppress = playbackSessionActive && (playing || boardPaused || controller.canRedo());
    if (typeof (controller as any).setPlaybackToastSuppressed === "function") {
      (controller as any).setPlaybackToastSuppressed(suppress);
    }
    if (!suppress) playbackSessionActive = false;
  };

  const historyHasRecordedTiming = (): boolean =>
    controller.getHistory().some((h) => (h as any).emtMs !== null && (h as any).emtMs !== undefined);

  const getNextMoveEmtMs = (): number | null => {
    const history = controller.getHistory();
    const currentIndex = findCurrentIndex(controller);
    if (currentIndex < 0) return null;
    const nextEntry = history[currentIndex + 1] as any;
    return typeof nextEntry?.emtMs === "number" ? nextEntry.emtMs : null;
  };

  const updateRecordedTimingUI = () => {
    if (!elUseRecorded) return;
    const hasData = historyHasRecordedTiming();
    elUseRecorded.disabled = !hasData;
    if (elUseRecordedRow) elUseRecordedRow.style.opacity = hasData ? "" : "0.45";
    if (!hasData && elUseRecorded.checked) elUseRecorded.checked = false;

    const useRecorded = hasData && elUseRecorded.checked;
    elDelay.disabled = useRecorded;
    elDelayReset.disabled = useRecorded;
  };

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
    playbackSessionActive = false;
    syncPlaybackToastSuppression();
    renderButton();
  };

  const pauseByBoard = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    playing = false;
    boardPaused = true;
    playbackSessionActive = true;
    syncPlaybackToastSuppression();
    renderButton();
    controller.toast("Playback paused - Press the Play button or spacebar to continue", 3000, {
      force: true,
      allowDuringPlayback: true,
    });
  };

  const stepOnce = async () => {
    const history = controller.getHistory();
    const currentIndex = findCurrentIndex(controller);
    if (currentIndex < 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= history.length) return;

    // Playback move animation uses a snappy base duration; the controller adds a
    // small capped extension for longer travel distances.
    // The user-configured delayMs is a post-landing pause applied in tick(), not the anim speed.
    await controller.jumpToHistoryAnimated(nextIndex, PLAYBACK_MOVE_ANIMATION_MS);
  };

  const tick = async () => {
    if (!playing) return;

    if (!controller.canRedo()) {
      stop();
      return;
    }

    await stepOnce();

    // Stop if we hit the end.
    if (!controller.canRedo()) {
      stop();
      return;
    }

    // After the piece lands, wait before advancing to the next ply.
    // When "Use recorded timing" is active, use the [%emt] value for the upcoming move;
    // otherwise use the user-configured fixed delay.
    let waitMs = delayMs;
    if (elUseRecorded?.checked) {
      const emtMs = getNextMoveEmtMs();
      if (emtMs !== null) waitMs = Math.min(emtMs, MAX_RECORDED_DELAY_MS);
    }
    timer = window.setTimeout(() => void tick(), waitMs);
  };

  const resumeCurrentPlaybackWaitImmediately = () => {
    if (!playing || timer === null) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void tick(), 0);
  };

  const start = () => {
    if (playing) return;
    if (!controller.canRedo()) return;

    boardPaused = false;
    playing = true;
    playbackSessionActive = true;
    syncPlaybackToastSuppression();
    renderButton();

    // Start immediately — the post-landing delay is applied in tick() after each move.
    timer = window.setTimeout(() => void tick(), 0);
  };

  const syncEnabled = () => {
    renderButton();
  };

  // Bind board tap to pause playback.
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
    };

    boardSvg.addEventListener("pointerdown", onBoardTap, { capture: true });
    boardSvg.addEventListener("click", onBoardTap, { capture: true });
  }

  // Spacebar: pause with toast when playing, resume when paused.
  window.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    if (ev.key !== " " || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (isEditableTarget(ev.target)) return;

    if (playing) {
      ev.preventDefault();
      pauseByBoard();
      return;
    }

    if (boardPaused || controller.canRedo()) {
      ev.preventDefault();
      start();
      return;
    }

    if (toggleLiveBotPauseResume()) {
      ev.preventDefault();
      return;
    }
  });

  // Initial state
  delayMs = parseDelayMs(elDelay.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
  updateSpeedUI();
  playing = false;
  renderButton();
  updateRecordedTimingUI();

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

  elUseRecorded?.addEventListener("change", () => {
    updateRecordedTimingUI();
    if (!elUseRecorded.checked) resumeCurrentPlaybackWaitImmediately();
  });

  controller.addHistoryChangeCallback((reason: HistoryChangeReason) => {
    // Any non-playback history change means the user/game has left the current
    // playback session. Clear paused/suppressed playback state so normal move
    // toasts resume during live play.
    if ((playing || boardPaused || playbackSessionActive) && reason !== "jump") {
      stop();
      return;
    }
    syncPlaybackToastSuppression();
    renderButton();
    updateRecordedTimingUI();
  });
}
