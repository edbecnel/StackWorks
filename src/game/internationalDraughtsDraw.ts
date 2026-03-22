import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import type { Player, Rank } from "../types.ts";
import { generateLegalMoves } from "./movegen.ts";

const KING_ONLY_LIMIT_PLIES = 50;

type ReducedMaterialConfig = {
  key: string;
  label: string;
  limitTurnsEach: number;
};

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function isInternationalDraughtsRuleset(state: GameState): boolean {
  return getRulesetId(state) === "draughts_international";
}

export type InternationalDraughtsDrawState = {
  noProgressKingOnlyPlies: number;
  turnDidCapture: boolean;
  turnDidManMove: boolean;
  turnCount: { W: number; B: number };
  reduced?: {
    key: string;
    label: string;
    limitTurnsEach: number;
    activatedAtTurnCount: { W: number; B: number };
  };
};

export function ensureInternationalDraughtsDraw(
  draw: GameState["internationalDraughtsDraw"] | undefined
): InternationalDraughtsDrawState {
  return {
    noProgressKingOnlyPlies: Math.max(0, Math.floor(draw?.noProgressKingOnlyPlies ?? 0)),
    turnDidCapture: Boolean(draw?.turnDidCapture),
    turnDidManMove: Boolean(draw?.turnDidManMove),
    turnCount: {
      W: Math.max(0, Math.floor(draw?.turnCount?.W ?? 0)),
      B: Math.max(0, Math.floor(draw?.turnCount?.B ?? 0)),
    },
    reduced: draw?.reduced
      ? {
          key: String(draw.reduced.key),
          label: String(draw.reduced.label),
          limitTurnsEach: Math.max(0, Math.floor(draw.reduced.limitTurnsEach ?? 0)),
          activatedAtTurnCount: {
            W: Math.max(0, Math.floor(draw.reduced.activatedAtTurnCount?.W ?? 0)),
            B: Math.max(0, Math.floor(draw.reduced.activatedAtTurnCount?.B ?? 0)),
          },
        }
      : undefined,
  };
}

function countPieces(state: GameState): { W: { total: number; kings: number }; B: { total: number; kings: number } } {
  const out = {
    W: { total: 0, kings: 0 },
    B: { total: 0, kings: 0 },
  };

  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    out[top.owner].total += 1;
    if (top.rank === "O") out[top.owner].kings += 1;
  }

  return out;
}

function allRemainingPiecesAreKings(state: GameState): boolean {
  const counts = countPieces(state);
  if (counts.W.total === 0 || counts.B.total === 0) return false;
  return counts.W.total === counts.W.kings && counts.B.total === counts.B.kings;
}

function withForcedDraw(state: GameState, reasonCode: string, message: string): GameState {
  if ((state as any)?.forcedGameOver?.message) return state;
  return {
    ...(state as any),
    forcedGameOver: {
      winner: null,
      reasonCode,
      message,
    },
  };
}

function detectReducedMaterial(state: GameState): ReducedMaterialConfig | null {
  const counts = countPieces(state);

  const detectFor = (stronger: Player, weaker: Player): ReducedMaterialConfig | null => {
    const strong = counts[stronger];
    const weak = counts[weaker];
    if (weak.total !== 1 || weak.kings !== 1) return null;

    if (strong.total === 3 && strong.kings === 3) {
      return {
        key: `${stronger}:3k_vs_1k`,
        label: `16-move: ${stronger} 3 kings vs ${weaker} 1 king`,
        limitTurnsEach: 16,
      };
    }

    if (strong.total === 3 && strong.kings === 2) {
      return {
        key: `${stronger}:2k1m_vs_1k`,
        label: `16-move: ${stronger} 2 kings + 1 man vs ${weaker} 1 king`,
        limitTurnsEach: 16,
      };
    }

    if (strong.total === 3 && strong.kings === 1) {
      return {
        key: `${stronger}:1k2m_vs_1k`,
        label: `16-move: ${stronger} 1 king + 2 men vs ${weaker} 1 king`,
        limitTurnsEach: 16,
      };
    }

    if (strong.total === 2 && strong.kings === 2) {
      return {
        key: `${stronger}:2k_vs_1k`,
        label: `5-move: ${stronger} 2 kings vs ${weaker} 1 king`,
        limitTurnsEach: 5,
      };
    }

    if (strong.total === 2 && strong.kings === 1) {
      return {
        key: `${stronger}:1k1m_vs_1k`,
        label: `5-move: ${stronger} 1 king + 1 man vs ${weaker} 1 king`,
        limitTurnsEach: 5,
      };
    }

    return null;
  };

  return (
    detectFor("W", "B") ??
    detectFor("B", "W") ??
    (counts.W.total === 1 && counts.W.kings === 1 && counts.B.total === 1 && counts.B.kings === 1
      ? {
          key: "equal:1k_vs_1k",
          label: "5-move: 1 king vs 1 king",
          limitTurnsEach: 5,
        }
      : null)
  );
}

export function applyInternationalDraughtsTurnProgress(state: GameState, move: Move, movingRankBefore: Rank): GameState {
  if (!isInternationalDraughtsRuleset(state)) return state;

  const draw = ensureInternationalDraughtsDraw((state as any).internationalDraughtsDraw);
  if (move.kind === "capture") draw.turnDidCapture = true;
  if (movingRankBefore === "S") draw.turnDidManMove = true;

  return { ...state, internationalDraughtsDraw: draw };
}

export function finalizeInternationalDraughtsTurnAtBoundary(stateAfterTurn: GameState, mover: Player): GameState {
  if (!isInternationalDraughtsRuleset(stateAfterTurn)) return stateAfterTurn;

  const draw = ensureInternationalDraughtsDraw((stateAfterTurn as any).internationalDraughtsDraw);
  draw.turnCount[mover] = Math.max(0, Math.floor(draw.turnCount[mover] ?? 0)) + 1;

  if (draw.turnDidCapture || draw.turnDidManMove || !allRemainingPiecesAreKings(stateAfterTurn)) {
    draw.noProgressKingOnlyPlies = 0;
  } else {
    draw.noProgressKingOnlyPlies = Math.max(0, Math.floor(draw.noProgressKingOnlyPlies ?? 0)) + 1;
  }

  draw.turnDidCapture = false;
  draw.turnDidManMove = false;

  let next: GameState = { ...(stateAfterTurn as any), internationalDraughtsDraw: draw };

  try {
    const counts = countPieces(next);
    if (counts.W.total === 0 || counts.B.total === 0) return next;
  } catch {
    // ignore
  }

  try {
    if (generateLegalMoves(next).length === 0) return next;
  } catch {
    // ignore movegen issues and continue with counter upkeep
  }

  if (draw.noProgressKingOnlyPlies >= KING_ONLY_LIMIT_PLIES) {
    return withForcedDraw(next, "INTERNATIONAL_DRAUGHTS_25_MOVE_RULE", "Draw by 25-move king-only rule");
  }

  const reduced = detectReducedMaterial(next);
  if (!reduced) {
    if (draw.reduced) {
      draw.reduced = undefined;
      next = { ...(next as any), internationalDraughtsDraw: { ...draw } };
    }
    return next;
  }

  if (!draw.reduced || draw.reduced.key !== reduced.key) {
    draw.reduced = {
      ...reduced,
      activatedAtTurnCount: {
        W: draw.turnCount.W,
        B: draw.turnCount.B,
      },
    };
    return { ...(next as any), internationalDraughtsDraw: { ...draw } };
  }

  const elapsedW = Math.max(0, draw.turnCount.W - draw.reduced.activatedAtTurnCount.W);
  const elapsedB = Math.max(0, draw.turnCount.B - draw.reduced.activatedAtTurnCount.B);
  if (elapsedW >= draw.reduced.limitTurnsEach && elapsedB >= draw.reduced.limitTurnsEach) {
    const code = draw.reduced.limitTurnsEach === 16
      ? "INTERNATIONAL_DRAUGHTS_16_MOVE_REDUCED_MATERIAL"
      : "INTERNATIONAL_DRAUGHTS_5_MOVE_REDUCED_MATERIAL";
    const message = draw.reduced.limitTurnsEach === 16
      ? "Draw by 16-move reduced-material rule"
      : "Draw by 5-move reduced-material rule";
    return withForcedDraw(next, code, message);
  }

  return next;
}

export function getInternationalDraughtsDrawStatus(state: GameState):
  | null
  | {
      noProgressKingOnlyPlies: number;
      noProgressKingOnlyPliesRemaining: number;
      reduced: null | {
        label: string;
        remaining: { W: number; B: number };
      };
    } {
  if (!isInternationalDraughtsRuleset(state)) return null;

  const draw = ensureInternationalDraughtsDraw((state as any).internationalDraughtsDraw);
  const noProgressKingOnlyPlies = Math.max(0, Math.floor(draw.noProgressKingOnlyPlies ?? 0));
  const noProgressKingOnlyPliesRemaining = Math.max(0, KING_ONLY_LIMIT_PLIES - noProgressKingOnlyPlies);

  let reduced: null | { label: string; remaining: { W: number; B: number } } = null;
  const cfg = detectReducedMaterial(state);
  if (cfg && draw.reduced && draw.reduced.key === cfg.key) {
    const elapsedW = Math.max(0, draw.turnCount.W - draw.reduced.activatedAtTurnCount.W);
    const elapsedB = Math.max(0, draw.turnCount.B - draw.reduced.activatedAtTurnCount.B);
    reduced = {
      label: draw.reduced.label,
      remaining: {
        W: Math.max(0, draw.reduced.limitTurnsEach - elapsedW),
        B: Math.max(0, draw.reduced.limitTurnsEach - elapsedB),
      },
    };
  }

  return {
    noProgressKingOnlyPlies,
    noProgressKingOnlyPliesRemaining,
    reduced,
  };
}