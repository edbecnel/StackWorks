import type { NodeId } from "./state.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";

export function getAllNodes(boardSize: 7 | 8 | 10): NodeId[] {
  const nodes: NodeId[] = [];
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (isPlayable(r, c, boardSize)) nodes.push(makeNodeId(r, c));
    }
  }
  return nodes;
}

// Backward-compatible default (Lasca classic 7×7)
export const ALL_NODES: NodeId[] = getAllNodes(7);

export function diagNeighbors(id: NodeId, boardSize: 7 | 8 | 10 = 7): NodeId[] {
  const { r, c } = parseNodeId(id);
  const res: NodeId[] = [];
  const deltas = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];
  for (const { dr, dc } of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (isPlayable(nr, nc, boardSize)) res.push(makeNodeId(nr, nc));
  }
  return res;
}

export function jumpTargets(id: NodeId, boardSize: 7 | 8 | 10 = 7): Array<{ over: NodeId; land: NodeId }> {
  const { r, c } = parseNodeId(id);
  const res: Array<{ over: NodeId; land: NodeId }> = [];
  const deltas = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];
  for (const { dr, dc } of deltas) {
    const or = r + dr;
    const oc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (inBounds(or, oc, boardSize) && inBounds(lr, lc, boardSize) && isPlayable(lr, lc, boardSize)) {
      res.push({ over: makeNodeId(or, oc), land: makeNodeId(lr, lc) });
    }
  }
  return res;
}
