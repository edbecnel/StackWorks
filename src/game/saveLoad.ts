import type { GameState } from "./state.ts";
import type { Stack } from "../types.ts";
import type { HistoryManager } from "./historyManager.ts";
import type { DamaCaptureRemoval, GameMeta, RulesetId, VariantId } from "../variants/variantTypes";
import { DEFAULT_VARIANT_ID, getVariantById, isVariantId } from "../variants/variantRegistry";

export interface SerializedGameState {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;
  chess?: GameState["chess"];
  forcedGameOver?: {
    winner: "B" | "W" | null;
    reasonCode: string;
    message: string;
  };
  damascaDeadPlay?: {
    noProgressPlies: number;
    officerOnlyPlies: number;
  };
}

export interface SerializedHistory {
  states: SerializedGameState[];
  notation: string[];
  currentIndex: number;
}

export interface SerializedSaveFileV2 {
  version: 2;
  current: SerializedGameState;
  history: SerializedHistory;
}

export interface SerializedSaveFileV3 {
  saveVersion: 3;
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  damaCaptureRemoval?: DamaCaptureRemoval;
  current: SerializedGameState;
  history?: SerializedHistory;
}

export type SerializedSaveFile = SerializedGameState | SerializedSaveFileV2 | SerializedSaveFileV3;

function isRulesetId(raw: unknown): raw is RulesetId {
  return (
    raw === "lasca" ||
    raw === "dama" ||
    raw === "damasca" ||
    raw === "damasca_classic" ||
    raw === "checkers_us" ||
    raw === "columns_chess" ||
    raw === "chess"
  );
}

function isLegacyHybridRulesetId(raw: unknown): boolean {
  return raw === "hybrid";
}

function isLegacyHybridVariantId(raw: unknown): boolean {
  return raw === "hybrid_8_damasca";
}

function legacyHybridMessage(): string {
  return (
    "This save file uses legacy 'hybrid' IDs. " +
    "Update it to 'rulesetId: damasca' and 'variantId: damasca_8' (including current.meta) and try again."
  );
}

function isBoardSize(raw: unknown): raw is 7 | 8 {
  return raw === 7 || raw === 8;
}

function isDamaCaptureRemoval(raw: unknown): raw is DamaCaptureRemoval {
  return raw === "immediate" || raw === "end_of_sequence";
}

function defaultMeta(): GameMeta {
  const v = getVariantById(DEFAULT_VARIANT_ID);
  return {
    variantId: v.variantId,
    rulesetId: v.rulesetId,
    boardSize: v.boardSize,
    ...(v.rulesetId === "dama" ? { damaCaptureRemoval: v.damaCaptureRemoval ?? "immediate" } : {}),
  };
}

function coerceMeta(raw: unknown): GameMeta | null {
  const m = raw as any;
  const variantId = typeof m?.variantId === "string" && isVariantId(m.variantId) ? (m.variantId as VariantId) : null;
  const rulesetId = isRulesetId(m?.rulesetId) ? (m.rulesetId as RulesetId) : null;
  const boardSize = isBoardSize(m?.boardSize) ? (m.boardSize as 7 | 8) : null;
  if (!variantId || !rulesetId || !boardSize) return null;

  if (rulesetId === "dama") {
    const damaCaptureRemoval: DamaCaptureRemoval = isDamaCaptureRemoval(m?.damaCaptureRemoval)
      ? (m.damaCaptureRemoval as DamaCaptureRemoval)
      : "immediate";
    return { variantId, rulesetId, boardSize, damaCaptureRemoval };
  }

  return { variantId, rulesetId, boardSize };
}

function normalizeMetaFromVariantId(meta: GameMeta): GameMeta {
  const v = getVariantById(meta.variantId);
  if (v.rulesetId === "dama") {
    return {
      variantId: v.variantId,
      rulesetId: v.rulesetId,
      boardSize: v.boardSize,
      damaCaptureRemoval: v.damaCaptureRemoval ?? "immediate",
    };
  }
  return { variantId: v.variantId, rulesetId: v.rulesetId, boardSize: v.boardSize };
}

function isDamaClassicInteroperableVariant(variantId: VariantId): boolean {
  return (
    variantId === "dama_8_classic_standard" ||
    variantId === "dama_8_classic_international" ||
    // Back-compat: old alias that maps to standard.
    variantId === "dama_8_classic"
  );
}

function isCompatibleLoadVariant(saved: GameMeta, expected: GameMeta): boolean {
  if (saved.rulesetId !== expected.rulesetId) return false;
  if (saved.boardSize !== expected.boardSize) return false;

  // Allow Dama Classic/International to load each other.
  if (
    saved.rulesetId === "dama" &&
    isDamaClassicInteroperableVariant(saved.variantId) &&
    isDamaClassicInteroperableVariant(expected.variantId)
  ) {
    return true;
  }

  // Default: strict.
  return saved.variantId === expected.variantId;
}

function getMetaForState(state: GameState): GameMeta {
  const m = coerceMeta(state.meta);
  return m ?? defaultMeta();
}

function formatVariantForMessage(variantId: VariantId): string {
  const v = getVariantById(variantId);
  return `${v.displayName} (${v.rulesetId} rules, ${v.boardSize}×${v.boardSize})`;
}

/**
 * Serialize game state to a JSON-compatible object
 */
export function serializeGameState(state: GameState): SerializedGameState {
  return {
    board: Array.from(state.board.entries()),
    toMove: state.toMove,
    phase: state.phase,
    meta: coerceMeta(state.meta) ?? undefined,
    chess: (state as any).chess,
    forcedGameOver: (state as any).forcedGameOver,
    damascaDeadPlay: (state as any).damascaDeadPlay,
  };
}

/**
 * Deserialize game state from a JSON-compatible object
 */
export function deserializeGameState(data: SerializedGameState): GameState {
  const phase = data.phase === "idle" || data.phase === "select" || data.phase === "anim" ? data.phase : "idle";
  return {
    board: new Map(data.board),
    toMove: data.toMove,
    phase,
    meta: coerceMeta((data as any).meta) ?? undefined,
    chess: (data as any).chess,
    forcedGameOver: (data as any).forcedGameOver,
    damascaDeadPlay: (data as any).damascaDeadPlay,
  };
}

export function serializeSaveData(state: GameState, history?: HistoryManager): SerializedSaveFile {
  const meta = getMetaForState(state);

  const base: SerializedSaveFileV3 = {
    saveVersion: 3,
    variantId: meta.variantId,
    rulesetId: meta.rulesetId,
    boardSize: meta.boardSize,
    ...(meta.rulesetId === "dama" ? { damaCaptureRemoval: meta.damaCaptureRemoval ?? "immediate" } : {}),
    current: serializeGameState({ ...state, meta }),
  };

  if (!history) return base;

  const exported = history.exportSnapshots();
  return {
    ...base,
    history: {
      states: exported.states.map((s) => serializeGameState({ ...s, meta })),
      notation: exported.notation,
      currentIndex: exported.currentIndex,
    },
  };
}

export function deserializeSaveData(
  data: SerializedSaveFile,
  expected?: GameMeta
): {
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
} {
  const stableBoardForCompare = (s: GameState): string => {
    const entries = Array.from(s.board.entries())
      .map(([k, stack]) => [k, stack.map((p) => `${p.owner}${p.rank}`).join(",")] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ toMove: s.toMove, board: entries });
  };

  const clampIndex = (idx: number, len: number): number => {
    if (!Number.isInteger(idx)) return len - 1;
    return Math.max(0, Math.min(idx, len - 1));
  };

  const expectedMeta = expected ? normalizeMetaFromVariantId(coerceMeta(expected) ?? defaultMeta()) : null;

  // v3: metadata wrapper (preferred)
  if ((data as any)?.saveVersion === 3) {
    const v3 = data as any;

    // Explicit legacy detection (we do not support back-compat mapping).
    if (isLegacyHybridRulesetId(v3.rulesetId) || isLegacyHybridVariantId(v3.variantId)) {
      throw new Error(legacyHybridMessage());
    }

    if (!isVariantId(String(v3.variantId)) || !isRulesetId(v3.rulesetId) || !isBoardSize(v3.boardSize)) {
      throw new Error("Invalid save file: missing or invalid variant metadata");
    }

    const variantId = v3.variantId as VariantId;
    const rulesetId = v3.rulesetId as RulesetId;
    const boardSize = v3.boardSize as 7 | 8;

    let meta: GameMeta;
    if (rulesetId === "dama") {
      const embedded = coerceMeta((v3.current as any)?.meta);
      const embeddedRemoval = embedded && embedded.rulesetId === "dama" ? embedded.damaCaptureRemoval : null;
      const damaCaptureRemoval: DamaCaptureRemoval = isDamaCaptureRemoval(v3.damaCaptureRemoval)
        ? (v3.damaCaptureRemoval as DamaCaptureRemoval)
        : (embeddedRemoval ?? "immediate");
      meta = { variantId, rulesetId, boardSize, damaCaptureRemoval };
    } else {
      meta = { variantId, rulesetId, boardSize };
    }

    if (
      expectedMeta &&
      !isCompatibleLoadVariant(meta, expectedMeta)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }

    // If the current page provided an expected meta, prefer it going forward.
    // This lets Dama Standard/International saves be interoperable while ensuring
    // that the game continues (and re-saves) as the currently running variant.
    if (expectedMeta) meta = expectedMeta;

    const current = deserializeGameState(v3.current as SerializedGameState);
    const state: GameState = { ...current, meta };

    if (!v3.history) return { state };

    const states = (v3.history.states || []).map((s: SerializedGameState) => ({ ...deserializeGameState(s), meta }));
    const notation = Array.isArray(v3.history.notation) ? v3.history.notation : [];

    if (states.length === 0) {
      // History is missing/invalid; fall back to the current position.
      return { state };
    }

    // Prefer loading the explicitly saved `current` state, while still restoring history.
    // If the provided `currentIndex` is wrong or the history is partial, locate the
    // matching snapshot; otherwise append `current` as a final history entry.
    const targetSig = stableBoardForCompare(state);

    let currentIndex = clampIndex(
      Number.isInteger(v3.history.currentIndex) ? v3.history.currentIndex : states.length - 1,
      states.length,
    );

    let matchedIndex = -1;
    for (let i = 0; i < states.length; i++) {
      if (stableBoardForCompare(states[i]) === targetSig) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      currentIndex = matchedIndex;
    } else {
      states.push(state);
      notation.push("");
      currentIndex = states.length - 1;
    }

    return {
      state: states[currentIndex],
      history: { states, notation, currentIndex },
    };
  }

  // v2: history wrapper without metadata
  if (typeof (data as any)?.version === "number") {
    const v2 = data as SerializedSaveFileV2;

    // Some older v2 files may contain meta; if it has legacy hybrid IDs, fail clearly.
    const v2Ruleset = (v2.current as any)?.meta?.rulesetId;
    const v2Variant = (v2.current as any)?.meta?.variantId;
    if (isLegacyHybridRulesetId(v2Ruleset) || isLegacyHybridVariantId(v2Variant)) {
      throw new Error(legacyHybridMessage());
    }

    if (v2.version !== 2 || !v2.current || !v2.history) {
      const state = deserializeGameState(v2.current ?? (data as any));
      const meta = defaultMeta();
      const merged: GameState = { ...state, meta };
      if (
        expectedMeta &&
        (meta.variantId !== expectedMeta.variantId ||
          meta.rulesetId !== expectedMeta.rulesetId ||
          meta.boardSize !== expectedMeta.boardSize)
      ) {
        throw new Error(
          `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
        );
      }
      return { state: merged };
    }

    const meta = defaultMeta();
    if (
      expectedMeta &&
      (meta.variantId !== expectedMeta.variantId ||
        meta.rulesetId !== expectedMeta.rulesetId ||
        meta.boardSize !== expectedMeta.boardSize)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }

    const states = (v2.history.states || []).map((s: SerializedGameState) => ({ ...deserializeGameState(s), meta }));
    const notation = Array.isArray(v2.history.notation) ? v2.history.notation : [];
    const currentIndex = Number.isInteger(v2.history.currentIndex) ? v2.history.currentIndex : states.length - 1;

    const historyCurrent = currentIndex >= 0 && currentIndex < states.length ? states[currentIndex] : null;
    const state = historyCurrent ?? { ...deserializeGameState(v2.current), meta };

    return {
      state,
      history: { states, notation, currentIndex },
    };
  }

  // v1: state-only
  {
    const v1Ruleset = (data as any)?.meta?.rulesetId;
    const v1Variant = (data as any)?.meta?.variantId;
    if (isLegacyHybridRulesetId(v1Ruleset) || isLegacyHybridVariantId(v1Variant)) {
      throw new Error(legacyHybridMessage());
    }

    const state = deserializeGameState(data as SerializedGameState);
    const meta = coerceMeta((data as any)?.meta) ?? defaultMeta();
    if (
      expectedMeta &&
      (meta.variantId !== expectedMeta.variantId ||
        meta.rulesetId !== expectedMeta.rulesetId ||
        meta.boardSize !== expectedMeta.boardSize)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }
    return { state: { ...state, meta } };
  }
}

/**
 * Save game state to a JSON file download
 */
export function saveGameToFile(state: GameState, history?: HistoryManager, filename = "lasca-game.json"): void {
  const serialized = serializeSaveData(state, history);
  const json = JSON.stringify(serialized, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Load game state from a file input
 */
export function loadGameFromFile(
  file: File,
  expected?: GameMeta
): Promise<{
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json) as SerializedSaveFile;
        const loaded = deserializeSaveData(data, expected);
        resolve(loaded);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        reject(new Error(msg));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
}
