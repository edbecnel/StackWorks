import { readShellState, updateShellState } from "../config/shellState";
import { applyBotPlayStateToCurrentPage } from "../ui/shell/playHub";

/**
 * Reads the bot play state written by the Shell launcher, applies it to the
 * current page, then clears it so it does not re-apply on subsequent reloads.
 * Call this once after the bot manager is initialised on every game page.
 */
export function consumeShellBotPlayState(): void {
  setTimeout(() => {
    try {
      const shellState = readShellState();
      if (shellState?.botPlayState) {
        applyBotPlayStateToCurrentPage(shellState.botPlayState);
        updateShellState({ botPlayState: null });
        const w = window as typeof window & { syncConfiguredPlayerNames?: () => void };
        if (typeof w.syncConfiguredPlayerNames === "function") {
          w.syncConfiguredPlayerNames();
        }
      }
    } catch {}
  }, 0);
}
