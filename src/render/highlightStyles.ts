export type AnalysisSquareHighlightStyle = "classic" | "chesscom";
export type LastMoveHighlightStyle = "classic" | "chesscom";
export type MoveHintStyle = "classic" | "chesscom";

export const DEFAULT_ANALYSIS_SQUARE_HIGHLIGHT_STYLE: AnalysisSquareHighlightStyle = "classic";
export const DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE: LastMoveHighlightStyle = "classic";
export const DEFAULT_MOVE_HINT_STYLE: MoveHintStyle = "classic";

export function normalizeAnalysisSquareHighlightStyle(
  value: string | null | undefined,
): AnalysisSquareHighlightStyle {
  return value === "chesscom" ? "chesscom" : DEFAULT_ANALYSIS_SQUARE_HIGHLIGHT_STYLE;
}

export function normalizeLastMoveHighlightStyle(
  value: string | null | undefined,
): LastMoveHighlightStyle {
  return value === "chesscom" ? "chesscom" : DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE;
}

export function normalizeMoveHintStyle(value: string | null | undefined): MoveHintStyle {
  return value === "chesscom" ? "chesscom" : DEFAULT_MOVE_HINT_STYLE;
}
