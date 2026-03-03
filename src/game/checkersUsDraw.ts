import type { GameState } from "./state.ts";
import type { Player, Rank } from "../types.ts";
import type { Move } from "./moveTypes.ts";
import { parseNodeId } from "./coords.ts";

const FORTY_MOVE_LIMIT_PLIES = 80;
const THIRTEEN_MOVE_LIMIT = 13;

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function isCheckersUsRuleset(state: GameState): boolean {
  return getRulesetId(state) === "checkers_us";
}

export type CheckersUsDrawState = {
  noProgressPlies: number;
  turnDidCapture: boolean;
  turnDidManAdvance: boolean;
  turnCount: { W: number; B: number };
  lastOfferTurn: { W: number; B: number };
  pendingOffer?: { offeredBy: Player; nonce: number };
  thirteen?: { stronger: Player; activatedAtStrongTurnCount: number };
};

export function ensureCheckersUsDraw(draw: GameState["checkersUsDraw"] | undefined): CheckersUsDrawState {
  return {
    noProgressPlies: Math.max(0, Math.floor(draw?.noProgressPlies ?? 0)),
    turnDidCapture: Boolean(draw?.turnDidCapture),
    turnDidManAdvance: Boolean(draw?.turnDidManAdvance),
    turnCount: {
      W: Math.max(0, Math.floor(draw?.turnCount?.W ?? 0)),
      B: Math.max(0, Math.floor(draw?.turnCount?.B ?? 0)),
    },
    lastOfferTurn: {
      W: Number.isFinite(draw?.lastOfferTurn?.W) ? Math.floor(draw!.lastOfferTurn!.W) : -999,
      B: Number.isFinite(draw?.lastOfferTurn?.B) ? Math.floor(draw!.lastOfferTurn!.B) : -999,
    },
    pendingOffer: draw?.pendingOffer ? { offeredBy: draw.pendingOffer.offeredBy, nonce: Math.floor(draw.pendingOffer.nonce) } : undefined,
    thirteen: draw?.thirteen
      ? {
          stronger: draw.thirteen.stronger,
          activatedAtStrongTurnCount: Math.max(0, Math.floor(draw.thirteen.activatedAtStrongTurnCount ?? 0)),
        }
      : undefined,
  };
}

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function countPieces(state: GameState): { W: { total: number; kings: number }; B: { total: number; kings: number } } {
  const out = {
    W: { total: 0, kings: 0 },
    B: { total: 0, kings: 0 },
  };

  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    // US checkers has no stacks, but be defensive.
    for (const piece of stack) {
      if (piece.owner !== "W" && piece.owner !== "B") continue;
      out[piece.owner].total += 1;
      if (piece.rank === "O") out[piece.owner].kings += 1;
    }
  }

  return out;
}

function isManAdvanceForMove(args: { mover: Player; movingRankBefore: Rank; from: string; to: string }): boolean {
  if (args.movingRankBefore !== "S") return false;
  const a = parseNodeId(args.from);
  const b = parseNodeId(args.to);
  if (!a || !b) return false;

  // Assumption consistent with existing coordinate system:
  // - Black starts at low rows and advances by increasing row.
  // - White starts at high rows and advances by decreasing row.
  const dir = args.mover === "B" ? 1 : -1;
  return (b.r - a.r) * dir > 0;
}

export function applyCheckersUsTurnProgress(state: GameState, move: Move, movingRankBefore: Rank): GameState {
  if (!isCheckersUsRuleset(state)) return state;

  const draw = ensureCheckersUsDraw((state as any).checkersUsDraw);

  if (move.kind === "capture") draw.turnDidCapture = true;

  if (isManAdvanceForMove({ mover: state.toMove, movingRankBefore, from: (move as any).from, to: (move as any).to })) {
    draw.turnDidManAdvance = true;
  }

  return { ...state, checkersUsDraw: draw };
}

function detectThreeKingsVsOne(state: GameState): { stronger: Player } | null {
  const counts = countPieces(state);

  const wIs3v1 = counts.W.total === 3 && counts.W.kings === 3 && counts.B.total === 1 && counts.B.kings === 1;
  if (wIs3v1) return { stronger: "W" };

  const bIs3v1 = counts.B.total === 3 && counts.B.kings === 3 && counts.W.total === 1 && counts.W.kings === 1;
  if (bIs3v1) return { stronger: "B" };

  return null;
}

function isInsufficientMaterial(state: GameState): boolean {
  const counts = countPieces(state);
  if (counts.W.total > 2) return false;
  if (counts.B.total > 2) return false;

  // Conservative interpretation: only treat as insufficient when only kings remain.
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

/**
 * Call when a player's turn ends (i.e. when `toMove` has just flipped to the opponent).
 *
 * `mover` is the player who just completed the turn.
 */
export function finalizeCheckersUsTurnAtBoundary(stateAfterTurn: GameState, mover: Player): GameState {
  if (!isCheckersUsRuleset(stateAfterTurn)) return stateAfterTurn;

  const draw = ensureCheckersUsDraw((stateAfterTurn as any).checkersUsDraw);

  // Turn accounting.
  draw.turnCount[mover] = Math.max(0, Math.floor(draw.turnCount[mover] ?? 0)) + 1;

  // 40-move rule (80 plies) bookkeeping.
  if (draw.turnDidCapture || draw.turnDidManAdvance) {
    draw.noProgressPlies = 0;
  } else {
    draw.noProgressPlies = Math.max(0, Math.floor(draw.noProgressPlies ?? 0)) + 1;
  }

  // Reset per-turn flags for the next player's turn.
  draw.turnDidCapture = false;
  draw.turnDidManAdvance = false;

  let next: GameState = { ...(stateAfterTurn as any), checkersUsDraw: draw };

  // Automatic draw: 40-move rule.
  if (draw.noProgressPlies >= FORTY_MOVE_LIMIT_PLIES) {
    next = withForcedDraw(next, "CHECKERS_US_40_MOVE_RULE", "Draw by 40-move rule");
    return next;
  }

  // Automatic draw: insufficient material.
  if (isInsufficientMaterial(next)) {
    next = withForcedDraw(next, "INSUFFICIENT_MATERIAL", "Draw by insufficient material");
    return next;
  }

  // Automatic draw: 13-move rule (3 kings vs 1 king).
  const cfg = detectThreeKingsVsOne(next);
  if (!cfg) {
    if (draw.thirteen) {
      draw.thirteen = undefined;
      next = { ...(next as any), checkersUsDraw: { ...draw } };
    }
    return next;
  }

  const stronger = cfg.stronger;

  // Activate/restart if needed.
  if (!draw.thirteen || draw.thirteen.stronger !== stronger) {
    draw.thirteen = {
      stronger,
      // Activation should not count the move that *reached* the configuration.
      // Start counting from the next move by the stronger side.
      activatedAtStrongTurnCount: draw.turnCount[stronger] ?? 0,
    };
    next = { ...(next as any), checkersUsDraw: { ...draw } };
  }

  const activatedAt = draw.thirteen.activatedAtStrongTurnCount;
  const strongTurns = draw.turnCount[stronger] ?? 0;
  const elapsed = Math.max(0, strongTurns - activatedAt);
  const remaining = Math.max(0, THIRTEEN_MOVE_LIMIT - elapsed);

  if (remaining <= 0) {
    next = withForcedDraw(next, "CHECKERS_US_13_MOVE_RULE", "Draw by 13-move rule");
  }

  return next;
}

export function getCheckersUsDrawStatus(state: GameState):
  | null
  | {
      noProgressPlies: number;
      noProgressPliesRemaining: number;
      thirteen: null | { stronger: Player; remaining: number };
    } {
  if (!isCheckersUsRuleset(state)) return null;
  const draw = ensureCheckersUsDraw((state as any).checkersUsDraw);

  const noProgressPlies = Math.max(0, Math.floor(draw.noProgressPlies ?? 0));
  const noProgressPliesRemaining = Math.max(0, FORTY_MOVE_LIMIT_PLIES - noProgressPlies);

  let thirteen: null | { stronger: Player; remaining: number } = null;
  const cfg = detectThreeKingsVsOne(state);
  if (cfg && draw.thirteen && draw.thirteen.stronger === cfg.stronger) {
    const stronger = cfg.stronger;
    const strongTurns = draw.turnCount[stronger] ?? 0;
    const elapsed = Math.max(0, strongTurns - draw.thirteen.activatedAtStrongTurnCount);
    const remaining = Math.max(0, THIRTEEN_MOVE_LIMIT - elapsed);
    thirteen = { stronger, remaining };
  }

  return {
    noProgressPlies,
    noProgressPliesRemaining,
    thirteen,
  };
}
