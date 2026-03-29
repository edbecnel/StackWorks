import { hashGameState } from "../game/hashState";
import { createInitialGameStateForVariant } from "../game/state";
import type { GameController } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";

const PAGE_DISCARD_CONFIRM_QUERY_KEY = "__stackworksNewGameDiscardConfirmQuery";

/** Lets the Play Hub (same document) ask whether a shell-driven New game should show the discard dialog. */
export function registerNewGameDiscardConfirmQuery(query: () => boolean): void {
  (globalThis as unknown as Record<string, () => boolean>)[PAGE_DISCARD_CONFIRM_QUERY_KEY] = query;
}

/** When true, programmatic New game should not suppress the confirm dialog (game in progress). */
export function hostPageRequestsDiscardConfirmForNewGame(): boolean {
  try {
    const q = (globalThis as unknown as Record<string, unknown>)[PAGE_DISCARD_CONFIRM_QUERY_KEY];
    return typeof q === "function" && Boolean((q as () => boolean)());
  } catch {
    return false;
  }
}

/** True when starting a new game could discard in-progress play or non-initial state. */
export function shouldConfirmDiscardCurrentGame(controller: GameController, variantId: VariantId): boolean {
  if (controller.isOver()) return false;
  if (controller.canUndo() || controller.canRedo()) return true;
  try {
    const initial = createInitialGameStateForVariant(variantId);
    return hashGameState(controller.getState()) !== hashGameState(initial);
  } catch {
    return true;
  }
}
