import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";
import type { MovegenConstraints } from "./movegen.ts";

type StackLike = Array<{ owner: "B" | "W"; rank: "S" | "O" }>;

function isEmptyAt(state: GameState, id: NodeId): boolean {
  const stack = state.board.get(id);
  return !stack || stack.length === 0;
}

function topAt(state: GameState, id: NodeId): StackLike[number] | null {
  const stack = state.board.get(id) as StackLike | undefined;
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function generateRawCaptureMovesFrom(state: GameState, fromId: NodeId): CaptureMove[] {
  const top = topAt(state, fromId);
  if (!top || top.owner !== state.toMove) return [];

  const boardSize = state.meta?.boardSize ?? 8;
  const { r, c } = parseNodeId(fromId);

  const out: CaptureMove[] = [];

  const pushIfLegalJump = (dr: number, dc: number) => {
    const overR = r + dr / 2;
    const overC = c + dc / 2;
    const toR = r + dr;
    const toC = c + dc;

    if (!inBounds(overR, overC, boardSize) || !inBounds(toR, toC, boardSize)) return;
    if (!isPlayable(toR, toC, boardSize)) return;

    const overId = makeNodeId(overR, overC);
    const toId = makeNodeId(toR, toC);

    const overTop = topAt(state, overId);
    if (!overTop || overTop.owner === state.toMove) return;
    if (!isEmptyAt(state, toId)) return;

    out.push({ kind: "capture", from: fromId, over: overId, to: toId });
  };

  if (top.rank === "S") {
    // Men: capture diagonally forward only (US checkers).
    const forward = top.owner === "B" ? +2 : -2;
    pushIfLegalJump(forward, -2);
    pushIfLegalJump(forward, +2);
    return out;
  }

  // Kings: capture one step in any diagonal direction (non-flying).
  pushIfLegalJump(-2, -2);
  pushIfLegalJump(-2, +2);
  pushIfLegalJump(+2, -2);
  pushIfLegalJump(+2, +2);
  return out;
}

function generateSelectableCaptureMoves(state: GameState, constraints?: MovegenConstraints): CaptureMove[] {
  const forcedFrom = constraints?.forcedFrom;

  const candidates: CaptureMove[] = [];
  const origins: NodeId[] = [];

  if (forcedFrom) {
    origins.push(forcedFrom);
  } else {
    for (const [id] of state.board.entries()) origins.push(id);
  }

  for (const fromId of origins) {
    candidates.push(...generateRawCaptureMovesFrom(state, fromId));
  }

  return candidates;
}

export function generateCaptureMovesCheckersUs(state: GameState, constraints?: MovegenConstraints): CaptureMove[] {
  // Mandatory capture is handled by generateLegalMovesCheckersUs; still useful to expose captures directly.
  return generateSelectableCaptureMoves(state, constraints);
}

export function generateLegalMovesCheckersUs(state: GameState, constraints?: MovegenConstraints): Move[] {
  const captures = generateSelectableCaptureMoves(state, constraints);
  if (captures.length > 0) return captures;

  const boardSize = state.meta?.boardSize ?? 8;
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

    const pushQuiet = (dr: number, dc: number) => {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc, boardSize) || !isPlayable(nr, nc, boardSize)) return;
      const toId = makeNodeId(nr, nc);
      if (!isEmptyAt(state, toId)) return;
      out.push({ kind: "move", from: fromId, to: toId });
    };

    if (top.rank === "S") {
      // Men: move forward only.
      const forward = top.owner === "B" ? +1 : -1;
      pushQuiet(forward, -1);
      pushQuiet(forward, +1);
      continue;
    }

    // Kings: step one square in any diagonal direction.
    pushQuiet(-1, -1);
    pushQuiet(-1, +1);
    pushQuiet(+1, -1);
    pushQuiet(+1, +1);
  }

  return out;
}
