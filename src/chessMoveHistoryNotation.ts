import { Chess } from "chess.js";
import { gameStateToFen, uciSquareToNodeId } from "./bot/fen.ts";
import type { HistorySnapshots } from "./driver/gameDriver.ts";
import type { GameState } from "./game/state.ts";
import { nodeIdToA1 } from "./game/coordFormat.ts";

export type ChessMoveHistoryNotationMode = "coordinate" | "standard";

type PromotionPiece = "q" | "r" | "b" | "n";

type ChessJsMove = {
  from: string;
  to: string;
  promotion?: PromotionPiece;
};

function parseSquaresFromCoordinateNotation(notation: string): Array<string> {
  const raw = String(notation ?? "").match(/[A-H][1-8]/gi);
  if (!raw) return [];
  return raw.map((square) => square.toLowerCase());
}

function nodeToUci(nodeId: string): string {
  return nodeIdToA1(nodeId, 8).toLowerCase();
}

function inferPromotion(prev: GameState, next: GameState, from: string, to: string): PromotionPiece | undefined {
  try {
    const prevPiece = prev.board.get(from)?.[0];
    const nextPiece = next.board.get(to)?.[0];
    if (!prevPiece || !nextPiece) return undefined;
    if (prevPiece.rank !== "P") return undefined;
    if (nextPiece.owner !== prevPiece.owner) return undefined;

    switch (nextPiece.rank) {
      case "Q":
        return "q";
      case "R":
        return "r";
      case "B":
        return "b";
      case "N":
        return "n";
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function deriveChessJsMoveAtIndex(snap: HistorySnapshots, index: number): ChessJsMove | null {
  if (index <= 0 || index >= snap.states.length) return null;

  const prev = snap.states[index - 1];
  const next = snap.states[index];
  if (!prev || !next || (next as any).forcedGameOver) return null;

  let fromNode: string | null = null;
  let toNode: string | null = null;

  const lastMove = next.ui?.lastMove;
  if (lastMove?.from && lastMove?.to) {
    fromNode = lastMove.from;
    toNode = lastMove.to;
  } else {
    const squares = parseSquaresFromCoordinateNotation(snap.notation[index] ?? "");
    if (squares.length >= 2) {
      try {
        fromNode = uciSquareToNodeId(squares[0]!);
        toNode = uciSquareToNodeId(squares[squares.length - 1]!);
      } catch {
        fromNode = null;
        toNode = null;
      }
    }
  }

  if (!fromNode || !toNode) return null;

  const from = nodeToUci(fromNode);
  const to = nodeToUci(toNode);
  const promotion = inferPromotion(prev, next, fromNode, toNode);
  return promotion ? { from, to, promotion } : { from, to };
}

function createChessFromInitialSnapshot(initial: GameState | undefined): Chess | null {
  if (!initial) return null;

  try {
    const chess = new Chess();
    chess.load(gameStateToFen(initial, { halfmove: 0, fullmove: 1 }));
    return chess;
  } catch {
    return null;
  }
}

export function deriveChessJsMovesFromHistory(snap: HistorySnapshots): ChessJsMove[] {
  const out: ChessJsMove[] = [];
  for (let index = 1; index < snap.states.length; index++) {
    const move = deriveChessJsMoveAtIndex(snap, index);
    if (move) out.push(move);
  }
  return out;
}

export function buildStandardAlgebraicHistory(snap: HistorySnapshots): string[] {
  const displayed = snap.states.map((_, index) => String(snap.notation[index] ?? ""));
  if (snap.states.length === 0) return displayed;

  const chess = createChessFromInitialSnapshot(snap.states[0]);
  if (!chess) return displayed;

  for (let index = 1; index < snap.states.length; index++) {
    const move = deriveChessJsMoveAtIndex(snap, index);
    if (!move) continue;

    const result = chess.move(move as any) as { san?: string } | null;
    if (!result?.san) {
      for (let fallbackIndex = index; fallbackIndex < snap.states.length; fallbackIndex++) {
        displayed[fallbackIndex] = String(snap.notation[fallbackIndex] ?? "");
      }
      break;
    }
    displayed[index] = result.san;
  }

  return displayed;
}