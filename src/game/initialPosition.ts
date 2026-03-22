export const BLACK_START_NODE_IDS_7X7_11: readonly string[] = [
  "r0c0", "r0c2", "r0c4", "r0c6",
  "r1c1", "r1c3", "r1c5",
  "r2c0", "r2c2", "r2c4", "r2c6",
];

export const WHITE_START_NODE_IDS_7X7_11: readonly string[] = [
  "r4c0", "r4c2", "r4c4", "r4c6",
  "r5c1", "r5c3", "r5c5",
  "r6c0", "r6c2", "r6c4", "r6c6",
];

import { isPlayable } from "./coords.ts";

function computePlayableNodeIdsForRow(boardSize: 7 | 8 | 10, r: number): string[] {
  const res: string[] = [];
  for (let c = 0; c < boardSize; c++) {
    if (isPlayable(r, c, boardSize)) res.push(`r${r}c${c}`);
  }
  return res;
}

function computeStartNodesFromTop(boardSize: 7 | 8 | 10, piecesPerSide: 11 | 12 | 16 | 20): string[] {
  const out: string[] = [];
  for (let r = 0; r < boardSize; r++) {
    for (const id of computePlayableNodeIdsForRow(boardSize, r)) {
      out.push(id);
      if (out.length >= piecesPerSide) return out;
    }
  }
  return out;
}

function computeStartNodesFromBottom(boardSize: 7 | 8 | 10, piecesPerSide: 11 | 12 | 16 | 20): string[] {
  const out: string[] = [];
  for (let r = boardSize - 1; r >= 0; r--) {
    for (const id of computePlayableNodeIdsForRow(boardSize, r)) {
      out.push(id);
      if (out.length >= piecesPerSide) return out;
    }
  }
  return out;
}

/**
 * Computes starting node ids for each side for a given board size and piece count.
 *
 * Note: For Lasca Classic (7×7, 11/side) this preserves the historical placement.
 */
export function computeStartNodeIds(params: {
  boardSize: 7 | 8 | 10;
  piecesPerSide: 11 | 12 | 16 | 20;
}): { blackStartNodeIds: readonly string[]; whiteStartNodeIds: readonly string[] } {
  const { boardSize, piecesPerSide } = params;

  if (boardSize === 7 && piecesPerSide === 11) {
    return {
      blackStartNodeIds: BLACK_START_NODE_IDS_7X7_11,
      whiteStartNodeIds: WHITE_START_NODE_IDS_7X7_11,
    };
  }

  return {
    blackStartNodeIds: computeStartNodesFromTop(boardSize, piecesPerSide),
    whiteStartNodeIds: computeStartNodesFromBottom(boardSize, piecesPerSide),
  };
}

export const DEMO_STACK_NODE_ID = "r3c3";

import type { Stack } from "../types";
export const DEMO_STACK: Stack = [
  { owner: "B", rank: "O" },
  { owner: "W", rank: "S" },
  { owner: "B", rank: "S" },
  { owner: "W", rank: "O" },
  { owner: "B", rank: "S" },
  { owner: "W", rank: "S" },
  { owner: "B", rank: "O" },
  { owner: "W", rank: "S" },
];
