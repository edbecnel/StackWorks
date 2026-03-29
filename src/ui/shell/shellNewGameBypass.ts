const SHELL_NEW_GAME_CONFIRM_SUPPRESS_KEY = "__stackworksShellNewGameConfirmSuppress";

let shellTrackedNewGameClick = false;
let shellNewGameConfirmCancelled = false;

/** Wraps a normal New game click so Play Hub can tell if the user cancelled the discard dialog. */
export function beginShellTrackedNewGameClick(): void {
  shellTrackedNewGameClick = true;
  shellNewGameConfirmCancelled = false;
}

export function endShellTrackedNewGameClick(): void {
  shellTrackedNewGameClick = false;
}

export function markShellNewGameConfirmCancelled(): void {
  if (shellTrackedNewGameClick) shellNewGameConfirmCancelled = true;
}

export function takeShellNewGameConfirmCancelled(): boolean {
  const v = shellNewGameConfirmCancelled;
  shellNewGameConfirmCancelled = false;
  return v;
}

export function isShellNewGameConfirmSuppressed(): boolean {
  return Boolean(
    (globalThis as unknown as Record<string, boolean | undefined>)[SHELL_NEW_GAME_CONFIRM_SUPPRESS_KEY],
  );
}

/** Programmatic new game from the shell; skips the user confirm dialog on the New game control. */
export function clickNewGameBtnSuppressingConfirm(): boolean {
  const newGameButton = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (!newGameButton || newGameButton.disabled) return false;
  const w = globalThis as unknown as Record<string, boolean | undefined>;
  w[SHELL_NEW_GAME_CONFIRM_SUPPRESS_KEY] = true;
  try {
    newGameButton.click();
  } finally {
    delete w[SHELL_NEW_GAME_CONFIRM_SUPPRESS_KEY];
  }
  return true;
}
