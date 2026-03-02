import { hashGameState } from "../game/hashState";
import { createInitialGameStateForVariant } from "../game/state";
import type { GameController, HistoryChangeReason } from "../controller/gameController";
import type { VariantId } from "../variants/variantTypes";

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function bindStartPageConfirm(controller: GameController, variantId: VariantId): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="./index.html"]'));
  if (links.length === 0) return;

  const initialHash = hashGameState(createInitialGameStateForVariant(variantId));
  let hasBegun = hashGameState(controller.getState()) !== initialHash;

  controller.addHistoryChangeCallback((reason: HistoryChangeReason) => {
    if (reason === "newGame") {
      hasBegun = hashGameState(controller.getState()) !== initialHash;
      return;
    }
    if (reason === "move" || reason === "loadGame" || reason === "undo" || reason === "redo" || reason === "jump" || reason === "gameOver") {
      hasBegun = true;
    }
  });

  for (const a of links) {
    a.addEventListener("click", (e) => {
      if (!hasBegun) return;
      if (!(e instanceof MouseEvent) || !isPlainLeftClick(e)) return;
      const ok = window.confirm("Leaving this page will lose the current game. Continue to the Start Page?");
      if (ok) return;
      e.preventDefault();
      e.stopPropagation();
    });
  }
}
