import type { GameState } from "./state.ts";
import type { HistoryManager } from "./historyManager.ts";
import type { GameMeta } from "../variants/variantTypes";
import { deserializeSaveData, serializeSaveData, type SerializedSaveFile } from "./saveLoad.ts";

type PendingReloadSave = {
  version: 1;
  saveData: SerializedSaveFile;
};

export function stashReloadSaveState(storageKey: string, state: GameState, history?: HistoryManager): void {
  try {
    const payload: PendingReloadSave = {
      version: 1,
      saveData: serializeSaveData(state, history),
    };
    sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and fall back to a normal reload.
  }
}

export function consumeReloadSaveState(
  storageKey: string,
  expectedMeta: GameMeta,
): {
  state: GameState;
  history?: {
    states: GameState[];
    notation: string[];
    currentIndex: number;
    emtMs?: Array<number | null>;
    evals?: Array<import("../bot/uciEngine.ts").EvalScore | null>;
  };
} | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingReloadSave> | null;
    if (!parsed || parsed.version !== 1 || !parsed.saveData) return null;
    return deserializeSaveData(parsed.saveData, expectedMeta);
  } catch {
    return null;
  }
}