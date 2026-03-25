const NODE_ID_RE = /^r(?<row>\d+)c(?<col>\d+)$/;

export function parseNodeId(nodeId: string): { row: number; col: number } | null {
  const match = NODE_ID_RE.exec(nodeId);
  if (!match || !match.groups) return null;

  const row = Number(match.groups.row);
  const col = Number(match.groups.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;

  return { row, col };
}

export type CoordFormat = "rc" | "a1";

export function nodeIdToA1(nodeId: string, boardSize: number = 7): string {
  const parsed = parseNodeId(nodeId);
  if (!parsed) return nodeId;

  const { row, col } = parsed;
  if (row < 0 || col < 0 || row >= boardSize || col >= boardSize) return nodeId;

  const colLetter = String.fromCharCode("A".charCodeAt(0) + col);
  // Node IDs are addressed top-to-bottom (r0 at the top). Displayed coordinates are bottom-to-top (1 at the bottom).
  const rowNumber = String(boardSize - row);
  return `${colLetter}${rowNumber}`;
}

/**
 * Formats a node id as A1-style.
 *
 * `flipped` is accepted for callers that toggle board orientation, but the
 * coordinate system remains the standard A1 mapping (A-file and 1-rank are
 * defined in the *rules*, not by the viewer's seat).
 */
export function nodeIdToA1View(nodeId: string, boardSize: number = 7, flipped: boolean = false): string {
  void flipped;
  return nodeIdToA1(nodeId, boardSize);
}

export function formatNodeId(nodeId: string, format: CoordFormat, boardSize: number = 7): string {
  if (format === "a1") return nodeIdToA1(nodeId, boardSize);
  return nodeId;
}

/**
 * Converts A1-format move notation for a 10×10 board to International Draughts
 * square numbering (1–50). The separators (" → " and " × ") are preserved.
 *
 * Example: "B10 × D8 × F6" → "1 × 12 × 23"
 *
 * Only valid for boardSize === 10. Returns the original string unchanged for
 * any other board size or when the notation contains no recognisable A1 coords.
 */
export function convertNotationToInternationalDraughts(notation: string, boardSize: number): string {
  if (boardSize !== 10) return notation;
  return notation.replace(/([A-J])(\d{1,2})/g, (_match, colStr: string, rowStr: string) => {
    const col = colStr.charCodeAt(0) - 65; // 'A'.charCodeAt(0)
    const row = boardSize - parseInt(rowStr, 10);
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return _match;
    if ((row + col) % 2 !== 1) return _match; // not a dark square
    const squareNum = row * 5 + Math.floor(col / 2) + 1;
    return String(squareNum);
  });
}
