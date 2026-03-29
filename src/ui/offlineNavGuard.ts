import { checkCurrentPlayerLost } from "../game/gameOver";
import type { GameController } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";
import { shouldConfirmDiscardCurrentGame } from "./newGameDiscardConfirm";
import { allowConfirmedNavigation, consumeConfirmedNavigationAllowance } from "./navigationPromptGate";

/** Shown before Play Hub forces a full reload to apply offline bot setup (avoids the generic browser reload prompt). */
export const OFFLINE_BOT_START_RELOAD_CONFIRM_MESSAGE =
  "The page will reload to apply your bot setup. Any in-progress local game will be lost unless you saved it. Continue?";

function isTerminalLocalGameState(controller: GameController): boolean {
  try {
    const state = controller.getState();
    const forcedMsg = (state as any)?.forcedGameOver?.message;
    if (typeof forcedMsg === "string" && forcedMsg.trim()) return true;
    const r = checkCurrentPlayerLost(state);
    return Boolean(r.winner) || Boolean(r.reason);
  } catch {
    return false;
  }
}

/**
 * True when leaving/reloading could lose local progress (matches offline `beforeunload` / back-button guard).
 * Always false for online drivers.
 */
export function shouldWarnOfflineNavigationLoss(controller: GameController, variantId: VariantId): boolean {
  if (controller.getDriverMode() === "online") return false;
  if (typeof (controller as any).isShellStartupPlayLockEnabled === "function" && (controller as any).isShellStartupPlayLockEnabled()) {
    return false;
  }
  if (controller.isOver()) return false;
  if (isTerminalLocalGameState(controller)) return false;
  return shouldConfirmDiscardCurrentGame(controller, variantId);
}

export function bindOfflineNavGuard(controller: GameController, variantId: VariantId): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Online games should be resumable; do not block refresh/back.
  if (controller.getDriverMode() === "online") return;

  const BIND_KEY = "__lascaOfflineNavGuardBound";
  const anyWin = window as unknown as Record<string, unknown>;
  if (anyWin[BIND_KEY]) return;
  anyWin[BIND_KEY] = true;

  const shouldWarnLoss = (): boolean => shouldWarnOfflineNavigationLoss(controller, variantId);

  const TOAST_KEY = "offline_nav_guard";
  const toastText = "Refreshing or going back will lose the current game.";
  const confirmText = "The current game will be lost. Continue?";

  const showWarnToast = () => {
    try {
      controller.setStickyToastAction(TOAST_KEY, null);
      controller.showStickyToast(TOAST_KEY, toastText, { force: true });
    } catch {
      // ignore
    }
  };

  // Refresh / close-tab / navigation-away: browsers only allow a native prompt.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (consumeConfirmedNavigationAllowance()) return;
    if (!shouldWarnLoss()) return;
    e.preventDefault();
    // Most browsers ignore custom strings, but setting returnValue triggers the confirm.
    e.returnValue = "";
    return "";
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  // Back button: insert a synthetic history entry so we can show a custom warning
  // (and actually cancel the back navigation).
  let allowRealBack = false;
  const pushGuardState = () => {
    try {
      window.history.pushState({ __lascaOfflineNavGuard: 1 }, "", window.location.href);
    } catch {
      // ignore
    }
  };

  // Only push once (per page load).
  pushGuardState();

  window.addEventListener("popstate", () => {
    if (allowRealBack) return;

    // If there's nothing to lose, immediately perform the real back.
    if (!shouldWarnLoss()) {
      allowRealBack = true;
      window.setTimeout(() => window.history.back(), 0);
      return;
    }

    showWarnToast();
    const ok = window.confirm(confirmText);
    if (ok) {
      allowConfirmedNavigation();
      allowRealBack = true;
      window.setTimeout(() => window.history.back(), 0);
      return;
    }

    // Cancel: re-insert the guard state so Back remains on this page.
    pushGuardState();
  });
}
