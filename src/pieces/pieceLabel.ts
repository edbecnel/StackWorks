import type { Piece } from "../types";
import { sideLabelForRuleset } from "../shared/sideTerminology";

type RulesetIdLike = string | null | undefined;

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
    case "S": return rulesetId === "checkers_us" ? "Man" : "Soldier";
    case "O": {
      if (rulesetId === "checkers_us") return "King";
      return (rulesetId === "dama") ? "King" : "Officer";
    }
    default: return "Piece";
  }
}

export function pieceTooltip(p: Piece, opts: { rulesetId?: RulesetIdLike } = {}): string {
  const side = ownerLabel(p.owner, opts.rulesetId);
  const name = rankLabel(p.rank, opts.rulesetId);
  return `${side} ${name}`;
}
