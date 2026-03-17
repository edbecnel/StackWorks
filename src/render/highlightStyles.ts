export type AnalysisSquareHighlightStyle = "classic" | "chesscom";
export type LastMoveHighlightStyle = "classic" | "chesscom";
export type MoveHintStyle = "classic" | "chesscom";
export type SelectionStyle = "classic" | "classic-squares" | "chesscom";

export const DEFAULT_ANALYSIS_SQUARE_HIGHLIGHT_STYLE: AnalysisSquareHighlightStyle = "classic";
export const DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE: LastMoveHighlightStyle = "classic";
export const DEFAULT_MOVE_HINT_STYLE: MoveHintStyle = "classic";
export const DEFAULT_SELECTION_STYLE: SelectionStyle = "classic";

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

export function normalizeSelectionStyle(value: string | null | undefined): SelectionStyle {
  switch (value) {
    case "classic-squares":
    case "chesscom":
      return value;
    default:
      return DEFAULT_SELECTION_STYLE;
  }
}
