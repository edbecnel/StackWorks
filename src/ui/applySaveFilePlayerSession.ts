import type { GameController } from "../controller/gameController";
import type { SaveFilePlayerNames } from "../game/saveLoad";
import { writeStoredLocalPlayerName } from "../shared/localPlayerNames";

export type GameShellCommit = {
  commitExplicitLocalPlayMode?: () => void;
};

/**
 * Unlocks the game shell (URL + pointer + startup lock) like the Play Hub, then applies saved names.
 * Call this before `controller.loadGame` when loading from a file so shell and board show real names.
 */
export function commitShellThenApplySavePlayerNames(
  shell: GameShellCommit | null | undefined,
  controller: GameController,
  names: SaveFilePlayerNames | undefined,
): void {
  shell?.commitExplicitLocalPlayMode?.();
  if (names) {
    applySaveFilePlayerNamesToSession(controller, names);
  } else {
    controller.clearSeatDisplayNamesSavePin();
  }
}

/** Writes saved names to localStorage and the controller (shell snapshot + board overlay source). */
export function applySaveFilePlayerNamesToSession(
  controller: GameController,
  names: SaveFilePlayerNames | undefined,
): void {
  if (!names) return;
  writeStoredLocalPlayerName("W", names.W);
  writeStoredLocalPlayerName("B", names.B);
  controller.establishLoadedGameSeatLabels(names.W, names.B);
}
