import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { Player } from "../types.ts";
import type { BotTier } from "./presets.ts";
import { applyMove } from "../game/applyMove.ts";
import { checkCurrentPlayerLost } from "../game/gameOver.ts";
import { createPrng } from "../shared/prng.ts";
import { isKingInCheckColumnsChess } from "../game/movegenColumnsChess.ts";
import { generateLegalMovesColumnsChess } from "../game/movegenColumnsChess.ts";

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function sameMove(a: Move | null | undefined, b: Move | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.from !== b.from) return false;
  if ((a as any).to !== (b as any).to) return false;
  if (a.kind === "capture") return (a as any).over === (b as any).over;
  return true;
}

function nowMs(): number {
  // `performance.now()` is monotonic; prefer it when available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perf = (globalThis as any).performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}

function pieceValue(rank: string | undefined): number {
  switch (rank) {
    case "Q":
      return 900;
    case "R":
      return 500;
    case "B":
    case "N":
      return 320;
    case "P":
      return 100;
    case "K":
      return 0;
    default:
      return 0;
  }
}

function stackWeightFromTop(depthFromTop: number): number {
  // Columns Chess stacking rule: only the top piece is active.
  // Buried pieces still matter, but far less (they can re-emerge later).
  if (depthFromTop <= 0) return 1.0;
  if (depthFromTop === 1) return 0.42;
  if (depthFromTop === 2) return 0.22;
  return 0.12;
}

function evalForSideToMove(state: GameState): number {
  // Simple eval from the perspective of `state.toMove`.
  // - Top pieces are weighted most.
  // - Buried pieces are discounted (stacking rule).
  const me = state.toMove;
  let score = 0;

  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;

    for (let i = 0; i < stack.length; i++) {
      const piece: any = stack[i];
      const depthFromTop = stack.length - 1 - i;
      const w = stackWeightFromTop(depthFromTop);
      const v = pieceValue(piece?.rank) * w;
      score += piece?.owner === me ? v : -v;
    }
  }

  // Check pressure: avoid being in check, prefer giving check.
  try {
    if (isKingInCheckColumnsChess(state, me)) score -= 40;
    if (isKingInCheckColumnsChess(state, other(me))) score += 28;
  } catch {
    // skip
  }

  return score;
}

const MATE_SCORE = 1_000_000;

function terminalScoreForSideToMove(state: GameState): number | null {
  const end = checkCurrentPlayerLost(state);
  if (!end.reason) return null;
  if (end.winner === null) return 0;
  return end.winner === state.toMove ? MATE_SCORE : -MATE_SCORE;
}

function moveOrderingKey(state: GameState, move: Move): number {
  // Higher is better.
  if (move.kind === "capture") {
    const over = String((move as any).over);
    const stack = state.board.get(over);
    const top = stack && stack.length ? (stack[stack.length - 1] as any) : null;
    // Captures in Columns Chess typically *bury* the captured top piece.
    // Still prioritize capturing higher-value pieces.
    return 10_000 + pieceValue(top?.rank);
  }

  // Encourage pawn promotion a bit (Columns Chess auto-queens too).
  try {
    const from = String((move as any).from);
    const moving = state.board.get(from);
    const top = moving && moving.length ? (moving[moving.length - 1] as any) : null;
    if (top?.rank === "P") {
      const to = String((move as any).to);
      const m = /^r(\d+)c(\d+)$/.exec(to);
      const r = m ? Number(m[1]) : NaN;
      if (Number.isFinite(r)) {
        const promoRow = state.toMove === "W" ? 0 : 7;
        if (r === promoRow) return 9_500;
      }
    }
  } catch {
    // ignore
  }

  return 0;
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  deadlineMs: number,
  nodeBudget: { remaining: number }
): number {
  if (nodeBudget.remaining-- <= 0) return evalForSideToMove(state);
  if (nowMs() >= deadlineMs) return evalForSideToMove(state);

  const terminal = terminalScoreForSideToMove(state);
  if (terminal !== null) return terminal;

  if (depth <= 0) return evalForSideToMove(state);

  const moves = generateLegalMovesColumnsChess(state);
  if (moves.length === 0) return terminalScoreForSideToMove(state) ?? 0;

  moves.sort((a, b) => moveOrderingKey(state, b) - moveOrderingKey(state, a));

  let best = -Infinity;
  for (const m of moves) {
    if (nowMs() >= deadlineMs) break;

    let next: GameState;
    try {
      next = applyMove(state, m);
    } catch {
      continue;
    }

    const v = -negamax(next, depth - 1, -beta, -alpha, deadlineMs, nodeBudget);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }

  if (!Number.isFinite(best)) return evalForSideToMove(state);
  return best;
}

export function pickFallbackMoveColumnsChess(
  state: GameState,
  opts: {
    tier: BotTier;
    seed: string;
    legalMoves?: Move[];
    timeBudgetMs?: number;
    preferredMove?: Move | null;
  }
): Move | null {
  if (state.meta?.rulesetId !== "columns_chess") return null;

  const rootMoves = (opts.legalMoves && opts.legalMoves.length ? opts.legalMoves : generateLegalMovesColumnsChess(state)).slice();
  if (rootMoves.length === 0) return null;

  rootMoves.sort((a, b) => moveOrderingKey(state, b) - moveOrderingKey(state, a));

  const rng = createPrng(opts.seed);
  const preferredMove = rootMoves.find((move) => sameMove(move, opts.preferredMove)) ?? null;

  const start = nowMs();
  const defaultBudget =
    opts.tier === "master" ? 220 : opts.tier === "advanced" ? 140 : opts.tier === "intermediate" ? 80 : 35;
  const budget = Math.max(8, Math.min(260, Math.round(opts.timeBudgetMs ?? defaultBudget)));
  const deadline = start + budget;

  const maxDepth = opts.tier === "master" ? 4 : opts.tier === "advanced" ? 3 : opts.tier === "intermediate" ? 2 : 1;
  const nodeBudgetBase = opts.tier === "master" ? 160_000 : opts.tier === "advanced" ? 85_000 : opts.tier === "intermediate" ? 40_000 : 14_000;

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  let preferredScore = -Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (nowMs() >= deadline) break;

    const nodeBudget = { remaining: nodeBudgetBase };
    let depthBestMove: Move | null = null;
    let depthBestScore = -Infinity;
    let depthPreferredScore = -Infinity;

    for (const m of rootMoves) {
      if (nowMs() >= deadline) break;

      let next: GameState;
      try {
        next = applyMove(state, m);
      } catch {
        continue;
      }

      const v = -negamax(next, depth - 1, -Infinity, Infinity, deadline, nodeBudget);
      if (preferredMove && sameMove(m, preferredMove)) {
        depthPreferredScore = v;
      }
      if (v > depthBestScore) {
        depthBestScore = v;
        depthBestMove = m;
      } else if (v === depthBestScore && depthBestMove) {
        // Tiny deterministic tie-break randomness.
        if (rng.nextFloat() < 0.25) depthBestMove = m;
      }
    }

    if (depthBestMove) {
      bestMove = depthBestMove;
      bestScore = depthBestScore;
      if (Number.isFinite(depthPreferredScore)) preferredScore = depthPreferredScore;
    }
  }

  if (!bestMove) {
    const captures = rootMoves.filter((m) => m.kind === "capture");
    return captures.length ? rng.pick(captures) : rng.pick(rootMoves);
  }

  if (preferredMove && Number.isFinite(preferredScore)) {
    const overrideMargin =
      opts.tier === "master" ? 45 : opts.tier === "advanced" ? 70 : opts.tier === "intermediate" ? 100 : 140;
    if (bestScore <= preferredScore + overrideMargin) {
      return preferredMove;
    }
  }

  void bestScore;
  return bestMove;
}
