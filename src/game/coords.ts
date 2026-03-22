import type { NodeId } from "./state.ts";

export function parseNodeId(id: string): { r: number; c: number } {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) throw new Error(`Invalid node id: ${id}`);
  const r = Number(m[1]);
  const c = Number(m[2]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) throw new Error(`Invalid node coordinates in id: ${id}`);
  return { r, c };
}

export function makeNodeId(r: number, c: number): NodeId {
  return `r${r}c${c}`;
}

export function inBounds(r: number, c: number, boardSize: 7 | 8 | 10 = 7): boolean {
  return r >= 0 && r < boardSize && c >= 0 && c < boardSize;
}

export function isPlayable(r: number, c: number, boardSize: 7 | 8 | 10 = 7): boolean {
  if (!inBounds(r, c, boardSize)) return false;
  // Odd-sized historical Lasca uses even parity. Even-sized checkerboards in this
  // repo use odd parity so the lower-left corner is dark/playable.
  const playableParity = boardSize % 2 === 0 ? 1 : 0;
  return (r + c) % 2 === playableParity;
}
