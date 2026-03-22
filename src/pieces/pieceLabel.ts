import type { Piece } from "../types";
import { sideLabelForRuleset } from "../shared/sideTerminology";

type RulesetIdLike = string | null | undefined;

function usesDraughtsPieceTerminology(rulesetId?: RulesetIdLike): boolean {
  return (
    rulesetId === "checkers_us" ||
    rulesetId === "draughts_international" ||
    rulesetId === "dama" ||
    rulesetId === "damasca" ||
    rulesetId === "damasca_classic"
  );
}

function ownerLabel(owner: Piece["owner"], rulesetId?: RulesetIdLike): string {
  return sideLabelForRuleset(rulesetId, owner);
}

function rankLabel(rank: Piece["rank"], rulesetId?: RulesetIdLike): string {
  switch (rank) {
    case "P": return "Pawn";
    case "N": return "Knight";
    case "B": return "Bishop";
    case "R": return "Rook";
    case "Q": return "Queen";
    case "K": return "King";
    case "S": return usesDraughtsPieceTerminology(rulesetId) ? "Man" : "Soldier";
    case "O": {
      return usesDraughtsPieceTerminology(rulesetId) ? "King" : "Officer";
    }
    default: return "Piece";
  }
}

export function pieceTooltip(p: Piece, opts: { rulesetId?: RulesetIdLike } = {}): string {
  const side = ownerLabel(p.owner, opts.rulesetId);
  const name = rankLabel(p.rank, opts.rulesetId);
  return `${side} ${name}`;
}
