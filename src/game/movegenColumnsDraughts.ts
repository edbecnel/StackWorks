import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";
import type { MovegenConstraints } from "./movegen.ts";
import { hashGameState } from "./hashState.ts";

/**
 * Move generation for Columns Draughts.
 *
 * Combines International Draughts rules (10×10, flying kings, max-capture,
 * all-direction captures) with Lasca/Damasca-style stacking captures.
 *
 * Key difference from Damasca International:
 * - Officers (Kings) have NO direction-reversal restriction during capture chains.
 *   In standard Damasca, kings cannot reverse direction (180°) mid-chain.
 *   In Columns Draughts (following International Draughts rules), kings may
 *   capture in any direction at any step.
 */

type StackLike = Array<{ owner: "B" | "W"; rank: "S" | "O" }>;

type CaptureDir = { dr: number; dc: number };

function sign(n: number): number {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function captureDir(fromId: NodeId, toId: NodeId): CaptureDir {
  const a = parseNodeId(fromId);
  const b = parseNodeId(toId);
  return { dr: sign(b.r - a.r), dc: sign(b.c - a.c) };
}

function isEmptyAt(state: GameState, id: NodeId): boolean {
  const stack = state.board.get(id);
  return !stack || stack.length === 0;
}

function topAt(state: GameState, id: NodeId): StackLike[number] | null {
  const stack = state.board.get(id) as StackLike | undefined;
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function cloneBoard(board: GameState["board"]): Map<NodeId, StackLike> {
  const next = new Map<NodeId, StackLike>();
  for (const [id, stack] of board.entries()) {
    next.set(id, (stack as StackLike).slice());
  }
  return next;
}

function applyCaptureForSearch(state: GameState, move: CaptureMove): GameState {
  const nextBoard = cloneBoard(state.board);

  const moving = nextBoard.get(move.from);
  if (!moving || moving.length === 0) throw new Error(`movegenColumnsDraughts: no moving stack at ${move.from}`);

  const jumped = nextBoard.get(move.over);
  if (!jumped || jumped.length === 0) throw new Error(`movegenColumnsDraughts: no jumped stack at ${move.over}`);

  if (!isEmptyAt({ ...state, board: nextBoard }, move.to)) {
    throw new Error(`movegenColumnsDraughts: landing square ${move.to} is not empty`);
  }

  // Stacking capture: remove only the TOP piece of jumped stack and insert at BOTTOM of mover.
  const captured = jumped.pop()!;
  if (jumped.length === 0) nextBoard.delete(move.over);
  else nextBoard.set(move.over, jumped);

  // Move capturing stack.
  nextBoard.set(move.to, moving);
  nextBoard.delete(move.from);

  moving.unshift(captured);

  return { ...state, board: nextBoard, phase: "idle" };
}

function generateRawCaptureMovesFrom(
  state: GameState,
  fromId: NodeId,
  excludedJumpSquares?: Set<NodeId>
): CaptureMove[] {
  const top = topAt(state, fromId);
  if (!top || top.owner !== state.toMove) return [];

  const boardSize = state.meta?.boardSize ?? 10;
  const { r, c } = parseNodeId(fromId);

  const out: CaptureMove[] = [];

  const canJumpOver = (overId: NodeId): boolean => {
    if (excludedJumpSquares && excludedJumpSquares.has(overId)) return false;
    const overTop = topAt(state, overId);
    return Boolean(overTop && overTop.owner !== state.toMove);
  };

  if (top.rank === "S") {
    // Men: capture diagonally in any direction (including backwards).
    const deltas = [
      { dr: -2, dc: -2 },
      { dr: -2, dc: +2 },
      { dr: +2, dc: -2 },
      { dr: +2, dc: +2 },
    ];

    for (const { dr, dc } of deltas) {
      const overR = r + dr / 2;
      const overC = c + dc / 2;
      const toR = r + dr;
      const toC = c + dc;
      if (!inBounds(overR, overC, boardSize) || !inBounds(toR, toC, boardSize)) continue;
      if (!isPlayable(toR, toC, boardSize)) continue;

      const overId = makeNodeId(overR, overC);
      const toId = makeNodeId(toR, toC);

      if (!canJumpOver(overId)) continue;
      if (!isEmptyAt(state, toId)) continue;

      out.push({ kind: "capture", from: fromId, over: overId, to: toId });
    }

    return out;
  }

  // Officers (Kings): flying captures in all 4 diagonal directions.
  // Unlike Damasca, there is NO direction-reversal restriction here —
  // kings may capture in ANY direction at any step of the chain.
  const dirs = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];

  for (const { dr, dc } of dirs) {
    let rr = r + dr;
    let cc = c + dc;
    let seenEnemy: { id: NodeId } | null = null;

    while (inBounds(rr, cc, boardSize)) {
      if (!isPlayable(rr, cc, boardSize)) {
        rr += dr;
        cc += dc;
        continue;
      }

      const id = makeNodeId(rr, cc);
      const occupant = topAt(state, id);

      if (!occupant) {
        // Empty square.
        if (seenEnemy) {
          // After jumping exactly one enemy, may land on any empty square beyond.
          out.push({ kind: "capture", from: fromId, over: seenEnemy.id, to: id });
        }
        rr += dr;
        cc += dc;
        continue;
      }

      // Occupied square.
      if (seenEnemy) {
        // Two occupied squares blocks the capture ray.
        break;
      }

      if (occupant.owner === state.toMove) {
        // Friendly blocks.
        break;
      }

      // First enemy encountered.
      if (excludedJumpSquares && excludedJumpSquares.has(id)) {
        // Cannot jump a square already jumped in this turn.
        break;
      }

      seenEnemy = { id };
      rr += dr;
      cc += dc;
    }
  }

  return out;
}

function bestRemainingCapturesFrom(
  state: GameState,
  fromId: NodeId,
  excludedJumpSquares: Set<NodeId>,
  memo: Map<string, number>
): number {
  const key = `${hashGameState(state)}|from:${fromId}|ex:${Array.from(excludedJumpSquares).sort().join(",")}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const nextCaps = generateRawCaptureMovesFrom(state, fromId, excludedJumpSquares);
  if (nextCaps.length === 0) {
    memo.set(key, 0);
    return 0;
  }

  let best = 0;
  for (const m of nextCaps) {
    const nextExcluded = new Set(excludedJumpSquares);
    nextExcluded.add(m.over);
    const nextState = applyCaptureForSearch(state, m);
    const score = 1 + bestRemainingCapturesFrom(nextState, m.to, nextExcluded, memo);
    if (score > best) best = score;
  }

  memo.set(key, best);
  return best;
}

function generateSelectableCaptureMoves(
  state: GameState,
  constraints: MovegenConstraints | undefined
): CaptureMove[] {
  const forcedFrom = constraints?.forcedFrom;
  const excludedJumpSquares = constraints?.excludedJumpSquares ?? new Set<NodeId>();

  const memo = new Map<string, number>();

  const candidates: CaptureMove[] = [];
  const origins: NodeId[] = [];

  if (forcedFrom) {
    origins.push(forcedFrom);
  } else {
    for (const [id] of state.board.entries()) origins.push(id);
  }

  for (const fromId of origins) {
    const top = topAt(state, fromId);
    if (!top || top.owner !== state.toMove) continue;
    candidates.push(...generateRawCaptureMovesFrom(state, fromId, excludedJumpSquares));
  }

  if (candidates.length === 0) return [];

  // Maximum-capture rule: only allow capture steps that can still achieve
  // a full line with the highest total number of captures.
  let globalBest = -Infinity;
  const scored: Array<{ move: CaptureMove; score: number }> = [];

  for (const m of candidates) {
    const nextExcluded = new Set(excludedJumpSquares);
    nextExcluded.add(m.over);
    const nextState = applyCaptureForSearch(state, m);
    const score = 1 + bestRemainingCapturesFrom(nextState, m.to, nextExcluded, memo);
    scored.push({ move: m, score });
    if (score > globalBest) globalBest = score;
  }

  return scored.filter((x) => x.score === globalBest).map((x) => x.move);
}

export function generateCaptureMovesDraughtsColumns(state: GameState, constraints?: MovegenConstraints): CaptureMove[] {
  return generateSelectableCaptureMoves(state, constraints);
}

export function generateLegalMovesDraughtsColumns(state: GameState, constraints?: MovegenConstraints): Move[] {
  const captures = generateSelectableCaptureMoves(state, constraints);
  if (captures.length > 0) return captures;

  const boardSize = state.meta?.boardSize ?? 10;
  const forcedFrom = constraints?.forcedFrom;

  const out: Move[] = [];
  const origins: NodeId[] = [];
  if (forcedFrom) {
    origins.push(forcedFrom);
  } else {
    for (const [id] of state.board.entries()) origins.push(id);
  }

  for (const fromId of origins) {
    const top = topAt(state, fromId);
    if (!top || top.owner !== state.toMove) continue;

    const { r, c } = parseNodeId(fromId);

    if (top.rank === "S") {
      // Men: quiet move forward only.
      const dr = top.owner === "B" ? +1 : -1;
      for (const dc of [-1, +1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc, boardSize) || !isPlayable(nr, nc, boardSize)) continue;
        const toId = makeNodeId(nr, nc);
        if (!isEmptyAt(state, toId)) continue;
        out.push({ kind: "move", from: fromId, to: toId });
      }
      continue;
    }

    // Officers (Kings): flying quiet moves (slide diagonally any distance until blocked).
    const dirs = [
      { dr: -1, dc: -1 },
      { dr: -1, dc: +1 },
      { dr: +1, dc: -1 },
      { dr: +1, dc: +1 },
    ];

    for (const { dr, dc } of dirs) {
      let rr = r + dr;
      let cc = c + dc;

      while (inBounds(rr, cc, boardSize)) {
        if (!isPlayable(rr, cc, boardSize)) {
          rr += dr;
          cc += dc;
          continue;
        }

        const toId = makeNodeId(rr, cc);
        if (!isEmptyAt(state, toId)) break;

        out.push({ kind: "move", from: fromId, to: toId });
        rr += dr;
        cc += dc;
      }
    }
  }

  return out;
}
