import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindPlaybackControls } from "./playbackControls";

type MockHistoryEntry = {
  index: number;
  isCurrent: boolean;
  emtMs?: number | null;
};

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

function createMockController(historyEntries: MockHistoryEntry[]) {
  const history = historyEntries.map((entry) => ({ ...entry }));
  const historyCallbacks: Array<(reason: "jump" | "load" | "push" | "replace") => void> = [];
  const setPlaybackToastSuppressed = vi.fn();

  const setCurrentIndex = (nextIndex: number) => {
    history.forEach((entry, index) => {
      entry.isCurrent = index === nextIndex;
    });
  };

  return {
    getHistory: vi.fn(() => history),
    canRedo: vi.fn(() => {
      const currentIndex = history.findIndex((entry) => entry.isCurrent);
      return currentIndex >= 0 && currentIndex < history.length - 1;
    }),
    canUndo: vi.fn(() => history.some((entry) => entry.isCurrent && entry.index > 0)),
    jumpToHistoryAnimated: vi.fn(async (nextIndex: number) => {
      setCurrentIndex(nextIndex);
    }),
    jumpToHistory: vi.fn((nextIndex: number) => {
      setCurrentIndex(nextIndex);
    }),
    toast: vi.fn(),
    setPlaybackToastSuppressed,
    addHistoryChangeCallback: vi.fn((callback: (reason: "jump" | "load" | "push" | "replace") => void) => {
      historyCallbacks.push(callback);
    }),
    emitHistoryChange: (reason: "jump" | "load" | "push" | "replace") => {
      historyCallbacks.forEach((callback) => callback(reason));
    },
  };
}

describe("bindPlaybackControls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="playbackBtn" type="button"></button>
      <input id="playbackDelay" type="range" min="0" max="5000" value="1000" />
      <button id="playbackDelayReset" type="button"></button>
      <span id="playbackDelayLabel"></span>
      <span id="playbackHint"></span>
      <label id="playbackUseRecordedRow">
        <input id="playbackUseRecorded" type="checkbox" checked />
      </label>
      <div id="boardWrap"><svg></svg></div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("continues immediately when recorded timing is turned off mid-wait", async () => {
    const controller = createMockController([
      { index: 0, isCurrent: true, emtMs: null },
      { index: 1, isCurrent: false, emtMs: 5_000 },
      { index: 2, isCurrent: false, emtMs: 5_000 },
    ]);

    bindPlaybackControls(controller as any);

    const playbackBtn = document.getElementById("playbackBtn") as HTMLButtonElement;
    const useRecorded = document.getElementById("playbackUseRecorded") as HTMLInputElement;

    playbackBtn.click();
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();

    expect(controller.jumpToHistoryAnimated).toHaveBeenCalledTimes(1);
    expect(controller.jumpToHistoryAnimated).toHaveBeenLastCalledWith(1, 350);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();
    expect(controller.jumpToHistoryAnimated).toHaveBeenCalledTimes(1);

    useRecorded.checked = false;
    useRecorded.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();

    expect(controller.jumpToHistoryAnimated).toHaveBeenCalledTimes(2);
    expect(controller.jumpToHistoryAnimated).toHaveBeenLastCalledWith(2, 350);
  });

  it("suppresses gameplay toasts during playback but allows the explicit playback-paused toast", async () => {
    const controller = createMockController([
      { index: 0, isCurrent: true, emtMs: null },
      { index: 1, isCurrent: false, emtMs: 1_000 },
      { index: 2, isCurrent: false, emtMs: 1_000 },
    ]);

    bindPlaybackControls(controller as any);

    const playbackBtn = document.getElementById("playbackBtn") as HTMLButtonElement;
    const boardSvg = document.querySelector("#boardWrap svg") as SVGSVGElement;

    playbackBtn.click();

    expect(controller.setPlaybackToastSuppressed).toHaveBeenCalledWith(true);

    boardSvg.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));

    expect(controller.toast).toHaveBeenCalledWith(
      "Playback paused - Press the Play button or spacebar to continue",
      3000,
      { force: true, allowDuringPlayback: true },
    );
  });

  it("clears playback toast suppression after a non-jump history change while playback is paused", async () => {
    const controller = createMockController([
      { index: 0, isCurrent: true, emtMs: null },
      { index: 1, isCurrent: false, emtMs: 1_000 },
      { index: 2, isCurrent: false, emtMs: 1_000 },
    ]);

    bindPlaybackControls(controller as any);

    const playbackBtn = document.getElementById("playbackBtn") as HTMLButtonElement;
    const boardSvg = document.querySelector("#boardWrap svg") as SVGSVGElement;

    playbackBtn.click();
    expect(controller.setPlaybackToastSuppressed).toHaveBeenCalledWith(true);

    boardSvg.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(controller.setPlaybackToastSuppressed).toHaveBeenLastCalledWith(true);

    controller.emitHistoryChange("load");

    expect(controller.setPlaybackToastSuppressed).toHaveBeenLastCalledWith(false);
  });
});