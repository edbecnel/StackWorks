import type { Piece } from "../types";

export type PieceToHrefOptions = {
  rulesetId?: string;
  themeId?: string | null;
};

export function pieceToHref(p: Piece, opts: PieceToHrefOptions = {}): string {
  const isDama = opts.rulesetId === "dama";
  const themeId = String(opts.themeId ?? "").trim().toLowerCase();

  // Chess ranks (Columns Chess preview)
  if (p.rank === "P") return p.owner === "W" ? "#W_P" : "#B_P";
  if (p.rank === "N") return p.owner === "W" ? "#W_N" : "#B_N";
  if (p.rank === "B") return p.owner === "W" ? "#W_B" : "#B_B";
  if (p.rank === "R") return p.owner === "W" ? "#W_R" : "#B_R";
  if (p.rank === "Q") return p.owner === "W" ? "#W_Q" : "#B_Q";
  if (p.rank === "K") return p.owner === "W" ? "#W_K" : "#B_K";

  if (p.owner === "W" && p.rank === "S") return "#W_S";
  if (p.owner === "W" && p.rank === "O") return isDama ? (themeId === "candy" ? "#W_DK" : "#W_K") : "#W_O";
  if (p.owner === "B" && p.rank === "S") return "#B_S";
  return isDama ? (themeId === "candy" ? "#B_DK" : "#B_K") : "#B_O";
}
