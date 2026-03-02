import type { GameState } from "./state.ts";
import type { Player } from "../types.ts";
import { generateLegalMoves } from "./movegen.ts";
import { isKingInCheckChess } from "./movegenChess.ts";
import { sideLabelForRuleset } from "../shared/sideTerminology.ts";

/**
 * Check if the current player (state.toMove) has lost the game.
 * Useful when loading a saved game to check if the player whose turn it is can actually play.
 * @param state - The current game state
 * @returns Object with winner and reason, or nulls if current player can still play
 */
export function checkCurrentPlayerLost(state: GameState): { winner: Player | null; reason: string | null } {
  if ((state as any).forcedGameOver?.message) {
    return { winner: (state as any).forcedGameOver.winner ?? null, reason: (state as any).forcedGameOver.message };
  }

  const rulesetId = state.meta?.rulesetId ?? "lasca";
  const boardSize = (state.meta as any)?.boardSize as number | undefined;
  if (rulesetId === "columns_chess" || rulesetId === "chess") {
    const currentPlayer = state.toMove;
    const opponent: Player = currentPlayer === "B" ? "W" : "B";

    const moves = generateLegalMoves(state);
    if (moves.length === 0) {
      const inCheck = isKingInCheckChess(state, currentPlayer);
      if (inCheck) {
        return { winner: opponent, reason: `Checkmate! ${sideLabelForRuleset(rulesetId, opponent, { boardSize })} Wins` };
      }
      return { winner: null, reason: "Stalemate — draw" };
    }

    return { winner: null, reason: null };
  }

  const currentPlayer = state.toMove;
  const opponent: Player = currentPlayer === "B" ? "W" : "B";

  // Check if current player has no controlled stacks
  let currentPlayerHasStacks = false;
  for (const stack of state.board.values()) {
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.owner === currentPlayer) {
        currentPlayerHasStacks = true;
        break;
      }
    }
  }

  if (!currentPlayerHasStacks) {
    const winnerName = sideLabelForRuleset(rulesetId, opponent, { boardSize });
    const loserName = sideLabelForRuleset(rulesetId, currentPlayer, { boardSize });
    return {
      winner: opponent,
      reason: `${winnerName} wins — ${loserName} has no pieces`,
    };
  }

  // Check if current player has no legal moves
  const currentPlayerMoves = generateLegalMoves(state);
  if (currentPlayerMoves.length === 0) {
    const winnerName = sideLabelForRuleset(rulesetId, opponent, { boardSize });
    const loserName = sideLabelForRuleset(rulesetId, currentPlayer, { boardSize });
    return {
      winner: opponent,
      reason: `${winnerName} wins — ${loserName} has no moves`,
    };
  }

  // Current player can still play
  return { winner: null, reason: null };
}

/**
 * Check if the game is over and determine the winner.
 * @param state - The current game state (after a turn has been taken)
 * @returns Object with winner and reason, or nulls if game continues
 */
export function getWinner(state: GameState): { winner: Player | null; reason: string | null } {
  if ((state as any).forcedGameOver?.message) {
    return { winner: (state as any).forcedGameOver.winner ?? null, reason: (state as any).forcedGameOver.message };
  }

  const rulesetId = state.meta?.rulesetId ?? "lasca";
  const boardSize = (state.meta as any)?.boardSize as number | undefined;
  if (rulesetId === "columns_chess" || rulesetId === "chess") {
    const currentPlayer = state.toMove;
    const opponent: Player = currentPlayer === "B" ? "W" : "B";

    const opponentState: GameState = { ...state, toMove: opponent };
    const oppMoves = generateLegalMoves(opponentState);
    if (oppMoves.length === 0) {
      const inCheck = isKingInCheckChess(opponentState, opponent);
      if (inCheck) {
        return { winner: currentPlayer, reason: `Checkmate! ${sideLabelForRuleset(rulesetId, currentPlayer, { boardSize })} Wins` };
      }
      return { winner: null, reason: "Stalemate — draw" };
    }
    return { winner: null, reason: null };
  }

  const currentPlayer = state.toMove;
  const opponent: Player = currentPlayer === "B" ? "W" : "B";

  // Rule 1: Check if opponent has no controlled stacks
  // (no stacks whose TOP piece belongs to opponent)
  let opponentHasStacks = false;
  for (const stack of state.board.values()) {
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.owner === opponent) {
        opponentHasStacks = true;
        break;
      }
    }
  }

  if (!opponentHasStacks) {
    const winnerName = sideLabelForRuleset(rulesetId, currentPlayer, { boardSize });
    const opponentName = sideLabelForRuleset(rulesetId, opponent, { boardSize });
    return {
      winner: currentPlayer,
      reason: `${winnerName} wins — ${opponentName} has no pieces`,
    };
  }

  // Rule 2: Check if opponent has no legal moves
  // Create a temporary state with opponent as the player to move
  const opponentState: GameState = {
    ...state,
    toMove: opponent,
  };
  const opponentLegalMoves = generateLegalMoves(opponentState);
  if (opponentLegalMoves.length === 0) {
    const winnerName = sideLabelForRuleset(rulesetId, currentPlayer, { boardSize });
    const opponentName = sideLabelForRuleset(rulesetId, opponent, { boardSize });
    return {
      winner: currentPlayer,
      reason: `${winnerName} wins — ${opponentName} has no moves`,
    };
  }

  // Game continues
  return { winner: null, reason: null };
}
