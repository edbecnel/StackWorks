import type { Stack, Player } from "../types";
import type { GameMeta } from "../variants/variantTypes";
import { ACTIVE_VARIANT_ID } from "../variants/activeVariant";
import { getVariantById } from "../variants/variantRegistry";
import { computeStartNodeIds } from "./initialPosition.ts";
import type { VariantId } from "../variants/variantTypes";

export type NodeId = string;
export type BoardState = Map<NodeId, Stack>;

export interface GameState {
  board: BoardState;
  toMove: Player;
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;

  /**
   * Ephemeral UI state (not serialized over the wire).
   * Used for client-only visual hints like last-move highlights.
   */
  ui?: {
    lastMove?: { from: NodeId; to: NodeId };
  };

  /** Columns Chess / chess-like ruleset state (serialized). */
  chess?: {
    castling: {
      W: { kingSide: boolean; queenSide: boolean };
      B: { kingSide: boolean; queenSide: boolean };
    };
    /** En passant target square (the landing square for the capturing pawn), if any. */
    enPassantTarget?: NodeId;
    /** For en passant, the pawn square to be captured if a pawn moves to enPassantTarget. */
    enPassantPawn?: NodeId;

    /**
     * Columns Chess ko rule (immediate recapture ban).
     * When set, the next player may not make a move that recreates the position whose
     * (ko-normalized) hash equals this value.
     */
    koProhibitHash?: string;
  };

  /**
   * Server-enforced game over (e.g., disconnect timeout).
   * When present, the game should be treated as finished.
   */
  forcedGameOver?: {
    winner: Player | null;
    reasonCode: string;
    message: string;
  };

  /**
   * Damasca-specific dead-play counters.
   *
   * Plies (half-moves) are counted and reset based on captures, promotions,
   * and soldier-advance to prevent endless non-progress play.
   */
  damascaDeadPlay?: {
    noProgressPlies: number;
    officerOnlyPlies: number;
  };

  /**
   * Ephemeral (not serialized): used by some rulesets to track multi-capture chain state.
   * Currently used by Damasca to remember if a soldier has reached the promotion row
   * at any point during a capture chain (promotion is applied at chain end).
   */
  captureChain?: {
    promotionEarned?: boolean;
  };
}

export function createInitialGameStateForVariant(variantId: VariantId): GameState {
  const board: BoardState = new Map();
  const variant = getVariantById(variantId);

  // Chess-like rulesets: standard chess starting position on a full 8×8 grid.
  if (variant.rulesetId === "columns_chess" || variant.rulesetId === "chess") {
    const backRank: Array<"R" | "N" | "B" | "Q" | "K" | "B" | "N" | "R"> = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const set = (r: number, c: number, owner: Player, rank: "P" | "N" | "B" | "R" | "Q" | "K"): void => {
      board.set(`r${r}c${c}`, [{ owner, rank }]);
    };

    // Black pieces
    for (let c = 0; c < 8; c++) {
      set(0, c, "B", backRank[c]);
      set(1, c, "B", "P");
    }
    // White pieces
    for (let c = 0; c < 8; c++) {
      set(6, c, "W", "P");
      set(7, c, "W", backRank[c]);
    }

    return {
      board,
      toMove: "W",
      phase: "select",
      meta: {
        variantId,
        rulesetId: variant.rulesetId,
        boardSize: variant.boardSize,
      },
      chess: {
        castling: {
          W: { kingSide: true, queenSide: true },
          B: { kingSide: true, queenSide: true },
        },
      },
    };
  }

  const { blackStartNodeIds, whiteStartNodeIds } = computeStartNodeIds({
    boardSize: variant.boardSize,
    piecesPerSide: variant.piecesPerSide,
  });

  // Place Black soldiers on their starting nodes
  for (const id of blackStartNodeIds) {
    board.set(id, [{ owner: "B", rank: "S" }]);
  }

  // Place White soldiers on their starting nodes
  for (const id of whiteStartNodeIds) {
    board.set(id, [{ owner: "W", rank: "S" }]);
  }

  return {
    board,
    toMove: variant.startingPlayer ?? "W",
    phase: "select",
    meta: {
      variantId,
      rulesetId: variant.rulesetId,
      boardSize: variant.boardSize,
      ...(variant.rulesetId === "dama"
        ? { damaCaptureRemoval: variant.damaCaptureRemoval ?? "immediate" }
        : {}),
    },
  };
}

export function createInitialGameState(): GameState {
  return createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
}
