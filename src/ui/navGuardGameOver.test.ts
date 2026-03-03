import { describe, expect, it, vi } from "vitest";

import { bindOfflineNavGuard } from "./offlineNavGuard";
import { bindStartPageConfirm } from "./startPageConfirm";
import { createInitialGameStateForVariant } from "../game/state";
import type { GameController, HistoryChangeReason } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";

describe("navigation guards", () => {
  it("does not warn after game over (offline back/refresh + Start Page)", () => {
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

    // ---- Start Page confirm
    document.body.innerHTML = `<a id="start" href="./index.html">Start Page</a>`;
    // Ensure repeated runs don't no-op due to the "bound" flag.
    delete (document as unknown as Record<string, unknown>)["__lascaStartPageConfirmBound"];

    bindStartPageConfirm(controller, variantId);

    // Mark the game as begun.
    for (const cb of historyListeners) cb("move");

    const startLink = document.getElementById("start") as HTMLAnchorElement;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    // In-progress: should prompt and cancel when user declines.
    isOver = false;
    const inProgressClickOk = startLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(inProgressClickOk).toBe(false);

    // ---- Offline back/refresh guard
    delete (window as unknown as Record<string, unknown>)["__lascaOfflineNavGuardBound"];

    const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

    bindOfflineNavGuard(controller, variantId);

    // Mark the game as begun for the offline guard too.
    for (const cb of historyListeners) cb("move");

    // In-progress: beforeunload should be blocked.
    isOver = false;
    const beforeUnload1 = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    // Ensure returnValue is writable in jsdom.
    Object.defineProperty(beforeUnload1, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnload1);
    expect(beforeUnload1.defaultPrevented).toBe(true);
    expect((beforeUnload1 as unknown as { returnValue?: unknown }).returnValue).toBe("");

    // Game over: beforeunload should NOT be blocked.
    isOver = true;
    const beforeUnload2 = new Event("beforeunload", { cancelable: true }) as unknown as BeforeUnloadEvent;
    Object.defineProperty(beforeUnload2, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(beforeUnload2);
    expect(beforeUnload2.defaultPrevented).toBe(false);

    // Game over: back (popstate) should not prompt.
    confirmSpy.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.runAllTimers();

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
  });
});
