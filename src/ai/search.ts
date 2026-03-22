import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { Player } from "../types.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { applyMove } from "../game/applyMove.ts";
import { RULES } from "../game/ruleset.ts";
import { evaluateState } from "./evaluate.ts";
import { finalizeDamaCaptureChain, getDamaCaptureRemovalMode } from "../game/damaCaptureChain.ts";
import { finalizeDamascaCaptureChain } from "../game/damascaCaptureChain.ts";
import { endTurn } from "../game/endTurn.ts";
import { parseNodeId } from "../game/coords.ts";
import { hashGameState } from "../game/hashState.ts";
import { createPrng } from "../shared/prng.ts";

type CaptureDir = { dr: number; dc: number };

function captureDir(fromId: string, toId: string): CaptureDir {
  const a = parseNodeId(fromId);
  const b = parseNodeId(toId);
  return { dr: Math.sign(b.r - a.r), dc: Math.sign(b.c - a.c) };
}

export type SearchContext = {
  state: GameState;
  lockedFrom: string | null;
  lockedDir: CaptureDir | null;
  excludedJumpSquares: Set<string>;
};

type SearchResult = {
  score: number;
  bestMove: Move | null;
  nodes: number;
  depthReached: number;
};

const INF = 1_000_000_000;

function cloneStateForSearch(state: GameState): GameState {
  const board = new Map<string, any>();
  for (const [nodeId, stack] of state.board.entries()) {
    // Deep clone: applyMove/promoteIfNeeded mutate stack arrays and piece objects.
    board.set(
      nodeId,
      stack.map((p) => ({ owner: p.owner, rank: p.rank }))
    );
  }
  // Preserve meta so movegen/applyMove/eval follow the correct ruleset.
  // Without this, Dama positions get treated like Lasca during search.
  return {
    board,
    toMove: state.toMove,
    phase: state.phase,
    meta: state.meta ? { ...state.meta } : undefined,
    captureChain: state.captureChain ? { ...state.captureChain } : undefined,
  };
}

function hasControlledStacks(state: GameState, p: Player): boolean {
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top.owner === p) return true;
  }
  return false;
}

function legalMovesForContext(ctx: SearchContext): Move[] {
  const rulesetId = ctx.state.meta?.rulesetId ?? "lasca";
  const isDamaStyle = rulesetId === "dama" || rulesetId === "draughts_international";
  const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic";
  const chainRules = rulesetId === "lasca" || isDamaStyle || isDamasca;
  const chainHasDir = rulesetId === "dama" || isDamasca;
  const constraints = ctx.lockedFrom
    ? {
        forcedFrom: ctx.lockedFrom,
        ...(chainRules
          ? {
              excludedJumpSquares: ctx.excludedJumpSquares,
              ...(chainHasDir ? { lastCaptureDir: ctx.lockedDir ?? undefined } : {}),
            }
          : {}),
      }
    : undefined;
  const all = generateLegalMoves(ctx.state, constraints);

  if (ctx.lockedFrom) {
    // During a capture chain, only the capturing stack may continue, and only via captures.
    return all.filter((m) => m.kind === "capture");
  }

  return all;
}

function terminalScore(state: GameState, perspective: Player): number | null {
  const opp: Player = perspective === "B" ? "W" : "B";

  const perspectiveHas = hasControlledStacks(state, perspective);
  const oppHas = hasControlledStacks(state, opp);

  if (!oppHas) return +INF;
  if (!perspectiveHas) return -INF;

  // No legal moves for either side is terminal.
  const s1: GameState = { ...state, toMove: perspective };
  const s2: GameState = { ...state, toMove: opp };
  if (generateLegalMoves(s1).length === 0) return -INF;
  if (generateLegalMoves(s2).length === 0) return +INF;

  return null;
}

function cloneCtx(ctx: SearchContext): SearchContext {
  return {
    state: ctx.state,
    lockedFrom: ctx.lockedFrom,
    lockedDir: ctx.lockedDir,
    excludedJumpSquares: new Set(ctx.excludedJumpSquares),
  };
}

function applySearchMove(ctx: SearchContext, move: Move): SearchContext {
  const nextCtx = cloneCtx(ctx);

  if (move.kind === "move") {
    const nextState = applyMove(cloneStateForSearch(nextCtx.state), move);
    nextCtx.state = nextState;
    nextCtx.lockedFrom = null;
    nextCtx.lockedDir = null;
    nextCtx.excludedJumpSquares.clear();
    return nextCtx;
  }

  // Capture
  const nextState = applyMove(cloneStateForSearch(nextCtx.state), move);
  nextCtx.state = nextState;
  nextCtx.excludedJumpSquares.add(move.over);

  const rulesetId = nextCtx.state.meta?.rulesetId ?? "lasca";
  const isDama = rulesetId === "dama" || rulesetId === "draughts_international";
  const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic";
  const damaRemoval = isDama ? getDamaCaptureRemovalMode(nextCtx.state) : null;
  const isLasca = rulesetId === "lasca";

  const didPromote = Boolean((nextState as any).didPromote);

  // Promotion can optionally end the capture chain.
  if (didPromote && RULES.stopCaptureOnPromotion) {
    if (isDama) {
      nextCtx.state = finalizeDamaCaptureChain(nextCtx.state, move.to, nextCtx.excludedJumpSquares);
    } else if (isDamasca) {
      nextCtx.state = finalizeDamascaCaptureChain(nextCtx.state, move.to);
    }
    nextCtx.state = endTurn(nextCtx.state);
    nextCtx.lockedFrom = null;
    nextCtx.lockedDir = null;
    nextCtx.excludedJumpSquares.clear();
    return nextCtx;
  }

  // Check for more captures from the landing square.
  const allNext = generateLegalMoves(nextCtx.state, {
    forcedFrom: move.to,
    ...((isLasca || isDama || isDamasca)
      ? {
          excludedJumpSquares: nextCtx.excludedJumpSquares,
          ...(isDama || isDamasca ? { lastCaptureDir: captureDir(move.from, move.to) } : {}),
        }
      : {}),
  });
  const moreFromDest = allNext.filter((m) => m.kind === "capture");

  if (moreFromDest.length > 0) {
    nextCtx.lockedFrom = move.to;
    nextCtx.lockedDir = captureDir(move.from, move.to);
    return nextCtx;
  }

  // Chain ends: switch turn.
  if (isDama) {
    nextCtx.state = finalizeDamaCaptureChain(nextCtx.state, move.to, nextCtx.excludedJumpSquares);
  } else if (isDamasca) {
    nextCtx.state = finalizeDamascaCaptureChain(nextCtx.state, move.to);
  }
  nextCtx.state = endTurn(nextCtx.state);
  nextCtx.lockedFrom = null;
  nextCtx.lockedDir = null;
  nextCtx.excludedJumpSquares.clear();
  return nextCtx;
}

function moveHeuristic(ctx: SearchContext, move: Move, perspective: Player): number {
  // Lightweight ordering: prefer captures, prefer capturing officers, prefer promotions.
  let s = 0;
  if (move.kind === "capture") {
    s += 500;
    const jumped = ctx.state.board.get(move.over);
    if (jumped && jumped.length > 0) {
      const top = jumped[jumped.length - 1];
      if (top.rank === "O") s += 80;
      if (top.owner !== perspective) s += 10;
    }
    // Promotion check: simulate just enough.
    const next = applyMove(cloneStateForSearch(ctx.state), move);
    if (Boolean((next as any).didPromote)) s += 60;
  } else {
    // Quiet move: prefer promoting moves.
    const next = applyMove(cloneStateForSearch(ctx.state), move);
    if (Boolean((next as any).didPromote)) s += 50;
  }
  return s;
}

function orderMoves(ctx: SearchContext, moves: Move[], perspective: Player): Move[] {
  return moves
    .slice()
    .sort((a, b) => moveHeuristic(ctx, b, perspective) - moveHeuristic(ctx, a, perspective));
}

// Maximum nodes to explore in quiescence to prevent explosion
const MAX_QUIESCENCE_NODES = 500;

// Quiescence search: continue searching captures to avoid horizon effect
function quiescence(
  ctx: SearchContext,
  alpha: number,
  beta: number,
  perspective: Player,
  deadlineMs: number | null,
  stats: { nodes: number },
  qDepth: number
): number {
  stats.nodes++;

  // Hard limit on quiescence nodes to prevent explosion
  if (stats.nodes > MAX_QUIESCENCE_NODES) {
    return evaluateState(ctx.state, perspective);
  }

  if (deadlineMs !== null && performance.now() >= deadlineMs) {
    return evaluateState(ctx.state, perspective);
  }

  const term = terminalScore(ctx.state, perspective);
  if (term !== null) return term;

  // Stand-pat score: can we just not capture and be happy?
  const standPat = evaluateState(ctx.state, perspective);
  const isMax = ctx.state.toMove === perspective;

  if (isMax) {
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat;
    if (standPat < beta) beta = standPat;
  }

  // Limit quiescence depth to avoid explosion
  if (qDepth <= 0) return standPat;

  const moves = legalMovesForContext(ctx);
  // Only search captures in quiescence
  const captures = moves.filter(m => m.kind === "capture");
  
  if (captures.length === 0) return standPat;

  // Only search the best few captures to limit branching
  const ordered = orderMoves(ctx, captures, perspective).slice(0, 3);
  let best = standPat;

  for (const m of ordered) {
    const child = applySearchMove(ctx, m);
    const val = quiescence(child, alpha, beta, perspective, deadlineMs, stats, qDepth - 1);

    if (isMax) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }

  return best;
}

function alphabeta(
  ctx: SearchContext,
  depth: number,
  alpha: number,
  beta: number,
  perspective: Player,
  deadlineMs: number | null,
  stats: { nodes: number }
): number {
  stats.nodes++;

  if (deadlineMs !== null && performance.now() >= deadlineMs) {
    // Time cutoff: return a static eval.
    return evaluateState(ctx.state, perspective);
  }

  const term = terminalScore(ctx.state, perspective);
  if (term !== null) return term;

  // At depth 0, use quiescence search instead of static eval
  if (depth <= 0) {
    // Use separate node counter for quiescence to enforce the limit properly
    const qStats = { nodes: 0 };
    const result = quiescence(ctx, alpha, beta, perspective, deadlineMs, qStats, 3);
    stats.nodes += qStats.nodes;
    return result;
  }

  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) {
    // No moves for side-to-move. If it's perspective's turn, that's bad; otherwise good.
    return ctx.state.toMove === perspective ? -INF : +INF;
  }

  const isMax = ctx.state.toMove === perspective;
  let best = isMax ? -INF : +INF;

  const ordered = orderMoves(ctx, moves, perspective);

  for (const m of ordered) {
    const child = applySearchMove(ctx, m);
    const val = alphabeta(child, depth - 1, alpha, beta, perspective, deadlineMs, stats);

    if (isMax) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }

  return best;
}

export function chooseGreedyMove(ctx: SearchContext, perspective: Player): Move | null {
  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) return null;

  // Evaluate 1-ply and choose best; add small randomness among near-ties.
  let bestScore = -INF;
  let best: Move[] = [];

  for (const m of moves) {
    const child = applySearchMove(ctx, m);
    const s = evaluateState(child.state, perspective);
    if (s > bestScore) {
      bestScore = s;
      best = [m];
    } else if (Math.abs(s - bestScore) <= 5) {
      best.push(m);
    }
  }

  const rng = createPrng(`ai.greedy:${perspective}:${hashGameState(ctx.state)}`);
  const pick = best[rng.int(0, best.length)];
  return pick ?? moves[0];
}

function greedyScore(ctx: SearchContext, move: Move, perspective: Player): number {
  const child = applySearchMove(ctx, move);
  return evaluateState(child.state, perspective);
}

export function chooseSearchMove(
  ctx: SearchContext,
  perspective: Player,
  maxDepth: number,
  timeBudgetMs: number | null
): SearchResult {
  const start = performance.now();
  const deadline = timeBudgetMs !== null ? start + timeBudgetMs : null;

  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) {
    return { score: 0, bestMove: null, nodes: 0, depthReached: 0 };
  }

  const rootOrdered = orderMoves(ctx, moves, perspective);

  let bestMove: Move | null = null;
  let bestScore = -INF;
  let depthReached = 0;
  let nodes = 0;

  // Iterative deepening if we have a time budget, otherwise single depth.
  const depths = timeBudgetMs !== null ? Array.from({ length: maxDepth }, (_, i) => i + 1) : [maxDepth];

  for (const depth of depths) {
    const stats = { nodes: 0 };
    let localBestMove: Move | null = null;
    let localBestScore = -INF;

    const ordered = rootOrdered;

    for (const m of ordered) {
      const child = applySearchMove(ctx, m);
      const s = alphabeta(child, depth - 1, -INF, +INF, perspective, deadline, stats);

      if (timeBudgetMs !== null && deadline !== null && performance.now() >= deadline) {
        break;
      }

      if (s > localBestScore) {
        localBestScore = s;
        localBestMove = m;
      }
    }

    nodes += stats.nodes;
    if (localBestMove) {
      bestMove = localBestMove;
      bestScore = localBestScore;
      depthReached = depth;
    }

    if (timeBudgetMs !== null && deadline !== null && performance.now() >= deadline) {
      break;
    }
  }

  // Safety: if search didn't find a move but moves exist, pick first one
  if (bestMove === null && moves.length > 0) {
    bestMove = rootOrdered[0] ?? moves[0];
  }

  return { score: bestScore, bestMove, nodes, depthReached };
}

export function chooseMoveByDifficulty(
  ctx: SearchContext,
  difficulty: "easy" | "medium" | "advanced"
): { move: Move | null; info?: { depth?: number; nodes?: number; ms?: number } } {
  const perspective: Player = ctx.state.toMove;

  // Deterministic RNG for AI variety without Math.random().
  // Seed is derived from position + difficulty so replays/tests are stable.
  const rng = createPrng(`ai:${difficulty}:${perspective}:${hashGameState(ctx.state)}:${ctx.lockedFrom ?? ""}:${ctx.lockedDir ? `${ctx.lockedDir.dr},${ctx.lockedDir.dc}` : ""}`);
  
  // Get legal moves upfront for fallback
  const legalMoves = legalMovesForContext(ctx);
  if (legalMoves.length === 0) {
    return { move: null, info: { depth: 0, nodes: 0, ms: 0 } };
  }

  // Helper to ensure we never return null if moves exist
  const ensureMove = (result: { move: Move | null; info?: any }) => {
    if (result.move === null && legalMoves.length > 0) {
      // Fallback: pick any legal move
      result.move = legalMoves[0];
    }
    return result;
  };

  if (difficulty === "easy") {
    // Easy: shallow search (depth 2-3) with some randomness for variety
    const start = performance.now();
    const res = chooseSearchMove(ctx, perspective, 3, 150);
    const ms = Math.round(performance.now() - start);
    
    // Add some randomness: occasionally pick a suboptimal move,
    // but keep it among the better candidates (avoid obvious blunders).
    if (rng.nextFloat() < 0.15 && legalMoves.length > 1) {
      const scored = legalMoves
        .map((m) => ({ m, s: greedyScore(ctx, m, perspective) }))
        .sort((a, b) => b.s - a.s);
      const pool = scored.slice(0, Math.min(3, scored.length)).map((x) => x.m);
      const randomMove = pool[rng.int(0, pool.length)];
      return { move: randomMove ?? scored[0]!.m, info: { score: res.score, depth: res.depthReached, nodes: res.nodes, ms } as any };
    }
    
    return ensureMove({ move: res.bestMove, info: { score: res.score, depth: res.depthReached, nodes: res.nodes, ms } as any });
  }

  if (difficulty === "medium") {
    const start = performance.now();
    // Medium: solid search depth with reasonable time budget
    const res = chooseSearchMove(ctx, perspective, 5, 800);
    const ms = Math.round(performance.now() - start);
    return ensureMove({ move: res.bestMove, info: { score: res.score, depth: res.depthReached, nodes: res.nodes, ms } as any });
  }

  // advanced: deep search with very generous time budget
  const start = performance.now();
  const res = chooseSearchMove(ctx, perspective, 10, 3000);
  const ms = Math.round(performance.now() - start);
  return ensureMove({ move: res.bestMove, info: { score: res.score, depth: res.depthReached, nodes: res.nodes, ms } as any });
}
