import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { Player } from "../types.ts";
import type { BotTier } from "./presets.ts";
import { applyMove } from "../game/applyMove.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { checkCurrentPlayerLost } from "../game/gameOver.ts";
import { isKingInCheckChess } from "../game/movegenChess.ts";
import { createPrng } from "../shared/prng.ts";
import { pickBookMoveChess } from "./chessOpeningBook.ts";

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
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

function evalForSideToMove(state: GameState): number {
  // Simple chess eval from the perspective of `state.toMove`.
  const me = state.toMove;
  let score = 0;

  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    const v = pieceValue((top as any)?.rank);
    score += top.owner === me ? v : -v;
  }

  // Check is urgent: prefer giving check and avoid being in check.
  try {
    if (isKingInCheckChess(state, me)) score -= 35;
    if (isKingInCheckChess(state, other(me))) score += 25;
  } catch {
    // If the position is malformed (missing kings), just skip check eval.
  }

  return score;
}

const MATE_SCORE = 1_000_000;

function terminalScoreForSideToMove(state: GameState): number | null {
  const end = checkCurrentPlayerLost(state);
  if (!end.reason) return null;

  // From the current side-to-move perspective:
  // - If winner is the opponent => we lost => very bad.
  // - If draw => neutral.
  if (end.winner === null) return 0;
  return end.winner === state.toMove ? MATE_SCORE : -MATE_SCORE;
}

function moveOrderingKey(state: GameState, move: Move): number {
  // Higher is better.
  if (move.kind === "capture") {
    const over = (move as any).over as string;
    const stack = state.board.get(over);
    const top = stack && stack.length ? stack[stack.length - 1] : null;
    return 10_000 + pieceValue((top as any)?.rank);
  }

  // Promotions: in this codebase, chess auto-queens in applyMoveChess.
  // Encourage pawn-to-last-rank moves slightly to make ordering saner.
  try {
    const from = (move as any).from as string;
    const to = String((move as any).to);
    const moving = state.board.get(from);
    const top = moving && moving.length ? moving[moving.length - 1] : null;
    if ((top as any)?.rank === "P") {
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

function moveId(m: Move): string {
  if (m.kind === "capture") return `c:${m.from}:${m.to}:${m.over}`;
  return `m:${m.from}:${m.to}`;
}

function topPieceAt(state: GameState, sq: string): any | null {
  const stack = state.board.get(sq);
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
}

function pieceValueAt(state: GameState, sq: string): number {
  const top = topPieceAt(state, sq);
  return pieceValue((top as any)?.rank);
}

function givesCheck(stateAfterOurMove: GameState, us: Player): boolean {
  try {
    return isKingInCheckChess(stateAfterOurMove, other(us));
  } catch {
    return false;
  }
}

function worstNetLossAfterOpponentCaptureAndOurRecapture(stateAfterOurMove: GameState, us: Player): number {
  // Conservative 2-ply exchange sanity:
  // assume opponent will choose the capture that maximizes our net loss,
  // and we will respond with an immediate recapture of the capturing piece if possible.
  const oppMoves = generateLegalMoves(stateAfterOurMove);
  let worst = 0;

  for (const om of oppMoves) {
    if (om.kind !== "capture") continue;

    // Value of our piece that gets captured.
    const capturedValue = pieceValueAt(stateAfterOurMove, (om as any).over);
    if (capturedValue <= 0) continue;

    let afterOpp: GameState;
    try {
      afterOpp = applyMove(stateAfterOurMove, om);
    } catch {
      continue;
    }

    const captureSquare = String((om as any).to);
    const capturerValue = pieceValueAt(afterOpp, captureSquare);

    // Can we immediately capture the capturing piece back?
    const ourReplies = generateLegalMoves(afterOpp);
    const canRecapture = ourReplies.some((rm) => rm.kind === "capture" && (rm as any).over === captureSquare);
    const recaptureValue = canRecapture ? capturerValue : 0;

    const netLoss = capturedValue - recaptureValue;
    if (netLoss > worst) worst = netLoss;
  }

  return worst;
}

function isUnsoundSacrifice(
  state: GameState,
  move: Move,
  scoreForUs: number | null
): boolean {
  // Avoid giving up material without an immediate recapture or clearly positive eval.
  // This is meant to be a *stability guard* for the fallback engine, especially
  // when it times out before deeper search resolves tactics.

  let afterOur: GameState;
  try {
    afterOur = applyMove(state, move);
  } catch {
    return false;
  }

  const us = state.toMove;
  const worstNetLoss = worstNetLossAfterOpponentCaptureAndOurRecapture(afterOur, us);
  if (worstNetLoss <= 0) return false;

  // Allow sacrifices that appear to have immediate tactical purpose.
  // - Giving check is often a forcing resource.
  // - A high enough search score indicates compensation.
  if (givesCheck(afterOur, us)) return false;
  const okCompensationScore = 160; // ~1.6 pawns; conservative.
  if (scoreForUs !== null && scoreForUs >= okCompensationScore) return false;

  return true;
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

  const moves = generateLegalMoves(state);
  if (moves.length === 0) {
    // Defensive: should have been caught by terminalScore, but keep it safe.
    return terminalScoreForSideToMove(state) ?? 0;
  }

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

function maxDepthForTier(tier: BotTier): number {
  switch (tier) {
    case "beginner":
      // Depth 1 is too blunder-prone (e.g. hanging a queen for a pawn).
      return 2;
    case "intermediate":
      return 3;
    case "strong":
      return 4;
  }
}

function timeBudgetForTierMs(tier: BotTier): number {
  switch (tier) {
    case "beginner":
      return 45;
    case "intermediate":
      return 90;
    case "strong":
      return 160;
  }
}

export function pickFallbackMoveChess(
  state: GameState,
  opts: {
    tier: BotTier;
    seed: string;
    legalMoves?: Move[];
    timeBudgetMs?: number;
  }
): Move | null {
  if (state.meta?.rulesetId !== "chess") return null;

  // Opening book (small, curated) to avoid random-looking first moves.
  // Only triggers on exact/known early positions; otherwise falls through.
  const book = pickBookMoveChess(state, { seed: opts.seed + ":book" });
  if (book) return book;

  const rootMoves = (opts.legalMoves && opts.legalMoves.length ? opts.legalMoves : generateLegalMoves(state)).slice();
  if (rootMoves.length === 0) return null;

  const rng = createPrng(opts.seed);
  rootMoves.sort((a, b) => moveOrderingKey(state, b) - moveOrderingKey(state, a));

  const start = nowMs();
  const budget = Math.max(6, Math.min(250, Math.round(opts.timeBudgetMs ?? timeBudgetForTierMs(opts.tier))));
  const deadline = start + budget;

  const maxDepth = maxDepthForTier(opts.tier);

  // Node budget prevents pathological branching from freezing the UI.
  const nodeBudgetBase = opts.tier === "strong" ? 140_000 : opts.tier === "intermediate" ? 55_000 : 25_000;

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  let bestScoredMoves: Array<{ move: Move; score: number }> | null = null;

  // Iterative deepening: always have a move even if we time out.
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (nowMs() >= deadline) break;

    const nodeBudget = { remaining: nodeBudgetBase };
    let depthBestMove: Move | null = null;
    let depthBestScore = -Infinity;
    const scoredThisDepth: Array<{ move: Move; score: number }> = [];

    for (const m of rootMoves) {
      if (nowMs() >= deadline) break;

      let next: GameState;
      try {
        next = applyMove(state, m);
      } catch {
        continue;
      }

      const v = -negamax(next, depth - 1, -Infinity, Infinity, deadline, nodeBudget);

      scoredThisDepth.push({ move: m, score: v });

      if (v > depthBestScore) {
        depthBestScore = v;
        depthBestMove = m;
      } else if (v === depthBestScore && depthBestMove) {
        // Light randomness for ties, but deterministic via `seed`.
        if (rng.nextFloat() < 0.25) depthBestMove = m;
      }
    }

    if (depthBestMove) {
      bestMove = depthBestMove;
      bestScore = depthBestScore;
      if (scoredThisDepth.length) bestScoredMoves = scoredThisDepth;
    }
  }

  if (!bestMove) {
    // Guaranteed fallback: prefer any capture, else random legal.
    const captures = rootMoves.filter((m) => m.kind === "capture");
    return captures.length ? rng.pick(captures) : rng.pick(rootMoves);
  }

  // Final sanity: avoid unsound sacrifices (hanging pieces / bad trades)
  // that shallow search can miss under tight time budgets.
  if (bestScoredMoves && bestScoredMoves.length) {
    const ordered = bestScoredMoves
      .slice()
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : moveId(a.move).localeCompare(moveId(b.move))));

    const limit = 12;
    let checked = 0;
    for (const cand of ordered) {
      if (checked++ >= limit) break;
      if (!isUnsoundSacrifice(state, cand.move, cand.score)) return cand.move;
    }

    // If the top candidates are all unsound, fall back to the best-scoring move.
  }

  // If we found a move but it looks catastrophically losing, still play it.
  // (This is only a fallback engine; correctness > aesthetics.)
  void bestScore;

  return bestMove;
}
