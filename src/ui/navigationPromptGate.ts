let allowNextBeforeUnloadPrompt = false;
let resetTimer: number | null = null;

function clearResetTimer(): void {
  if (resetTimer == null || typeof window === "undefined") return;
  window.clearTimeout(resetTimer);
  resetTimer = null;
}

export function allowConfirmedNavigation(): void {
  if (typeof window === "undefined") return;
  allowNextBeforeUnloadPrompt = true;
  clearResetTimer();
  resetTimer = window.setTimeout(() => {
    allowNextBeforeUnloadPrompt = false;
    resetTimer = null;
  }, 1000);
}

export function consumeConfirmedNavigationAllowance(): boolean {
  const allowed = allowNextBeforeUnloadPrompt;
  if (!allowed) return false;
  allowNextBeforeUnloadPrompt = false;
  clearResetTimer();
  return true;
}

export function resetConfirmedNavigationAllowanceForTests(): void {
  allowNextBeforeUnloadPrompt = false;
  clearResetTimer();
}