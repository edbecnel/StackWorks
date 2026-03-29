import { hashGameState } from "../game/hashState";
import { createInitialGameStateForVariant } from "../game/state";
import { checkCurrentPlayerLost } from "../game/gameOver";
import type { GameController, HistoryChangeReason } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";
import { allowConfirmedNavigation } from "./navigationPromptGate";

/** Leaving an in-progress online game (start page, play hub local/bot, etc.). */
export const ONLINE_SUSPEND_CONTINUE_CONFIRM_MESSAGE =
  "The current game will be suspended. You may return to this game to continue before the game pause/wait period expires. Continue?";

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function bindStartPageConfirm(controller: GameController, variantId: VariantId): void {
  // Use event delegation so it also covers dynamically injected links (e.g. menu-mode flyouts).
  const BIND_KEY = "__lascaStartPageConfirmBound";
  const anyDoc = document as unknown as Record<string, unknown>;
  if (anyDoc[BIND_KEY]) return;
  anyDoc[BIND_KEY] = true;

  const initialHash = hashGameState(createInitialGameStateForVariant(variantId));
  let hasBegun = hashGameState(controller.getState()) !== initialHash;

  const isTerminalNow = (): boolean => {
    try {
      const state = controller.getState();
      const forcedMsg = (state as any)?.forcedGameOver?.message;
      if (typeof forcedMsg === "string" && forcedMsg.trim()) return true;
      const r = checkCurrentPlayerLost(state);
      return Boolean(r.winner) || Boolean(r.reason);
    } catch {
      return false;
    }
  };

  const shouldConfirmLeave = (): boolean => {
    // Startup-locked shells have not begun a playable game; avoid loss prompts
    // when the user is taking an intentional start action.
    if (typeof (controller as any).isShellStartupPlayLockEnabled === "function" && (controller as any).isShellStartupPlayLockEnabled()) {
      return false;
    }
    // After a terminal result, leaving is expected; avoid extra warnings.
    return hasBegun && !controller.isOver() && !isTerminalNow();
  };

  controller.addHistoryChangeCallback((reason: HistoryChangeReason) => {
    if (reason === "newGame") {
      // A new game counts as "begun" even if the position matches the initial hash
      // (e.g. starting setup leads to the same initial board state).
      hasBegun = true;
      return;
    }
    if (reason === "move" || reason === "loadGame" || reason === "undo" || reason === "redo" || reason === "jump" || reason === "gameOver") {
      hasBegun = true;
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const a = (target?.closest?.('a[href="./"]') as HTMLAnchorElement | null) ?? null;
      if (!a) return;
      if (!shouldConfirmLeave()) return;
      if (!(e instanceof MouseEvent) || !isPlainLeftClick(e)) return;
      const msg =
        controller.getDriverMode() === "online"
          ? ONLINE_SUSPEND_CONTINUE_CONFIRM_MESSAGE
          : "Leaving this page will lose the current game. Continue to the Start Page?";
      const ok = window.confirm(msg);
      if (ok) {
        allowConfirmedNavigation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
