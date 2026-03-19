import { describe, expect, it, vi } from "vitest";

import { bindOfflineNavGuard } from "./offlineNavGuard";
import { resetConfirmedNavigationAllowanceForTests } from "./navigationPromptGate";
import { bindStartPageConfirm } from "./startPageConfirm";
import { createInitialGameStateForVariant } from "../game/state";
import type { GameController, HistoryChangeReason } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";

describe("navigation guards", () => {
  it("uses only one prompt for confirmed navigation and stops warning after game over", () => {
    vi.useFakeTimers();

    // Minimal controller stub used by the guards.
    const variantId = "chess_classic" as VariantId;
    const initial = createInitialGameStateForVariant(variantId);

    let isOver = false;
    const historyListeners: Array<(reason: HistoryChangeReason) => void> = [];

    const controller = {
      getDriverMode: () => "offline",
      getState: () => initial,
      addHistoryChangeCallback: (cb: (reason: HistoryChangeReason) => void) => historyListeners.push(cb),
      isOver: () => isOver,
      setStickyToastAction: () => {},
      showStickyToast: () => {},
    } as unknown as GameController;

    document.body.innerHTML = `<a id="start" href="./">Start Page</a>`;
    delete (document as unknown as Record<string, unknown>)["__lascaStartPageConfirmBound"];
    delete (window as unknown as Record<string, unknown>)["__lascaOfflineNavGuardBound"];
    resetConfirmedNavigationAllowanceForTests();

    bindStartPageConfirm(controller, variantId);
    bindOfflineNavGuard(controller, variantId);

    for (const cb of historyListeners) cb("move");

    const startLink = document.getElementById("start") as HTMLAnchorElement;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    // In-progress Start Page click: one custom prompt only, and cancel on decline.
    isOver = false;
    const declinedStartClick = startLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(declinedStartClick).toBe(false);

    // In-progress refresh/close still uses the native beforeunload prompt.
    const beforeUnload1 = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    Object.defineProperty(beforeUnload1, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnload1);
    expect(beforeUnload1.defaultPrevented).toBe(true);
    expect((beforeUnload1 as unknown as { returnValue?: unknown }).returnValue).toBe("");

    // Accepted Start Page click should not trigger a second native prompt.
    confirmSpy.mockReset();
    confirmSpy.mockReturnValue(true);

    const startClickOk = startLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(startClickOk).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    const beforeUnloadAfterStart = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    Object.defineProperty(beforeUnloadAfterStart, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnloadAfterStart);
    expect(beforeUnloadAfterStart.defaultPrevented).toBe(false);

    const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

    confirmSpy.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
  vi.advanceTimersByTime(0);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(historyBackSpy).toHaveBeenCalled();

    const beforeUnloadAfterBack = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    Object.defineProperty(beforeUnloadAfterBack, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnloadAfterBack);
    expect(beforeUnloadAfterBack.defaultPrevented).toBe(false);

    // Game over: beforeunload should NOT be blocked.
    isOver = true;
    const beforeUnload2 = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    Object.defineProperty(beforeUnload2, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnload2);
    expect(beforeUnload2.defaultPrevented).toBe(false);

    // Game over: back (popstate) should not prompt.
    confirmSpy.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.advanceTimersByTime(0);

    expect(confirmSpy).toHaveBeenCalledTimes(0);
    expect(historyBackSpy).toHaveBeenCalled();

    // ---- Start Page confirm (game over)
    // Dispatching a successful click would normally schedule a hyperlink navigation
    // timeout in jsdom; keep it on fake timers and clear pending timeouts.
    confirmSpy.mockClear();
    isOver = true;
    const gameOverClickOk = startLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(0);
    expect(gameOverClickOk).toBe(true);

    vi.clearAllTimers();
    vi.useRealTimers();

    confirmSpy.mockRestore();
    historyBackSpy.mockRestore();
    resetConfirmedNavigationAllowanceForTests();
  });
});
