export type RulesetId =
  | "lasca"
  | "dama"
  | "draughts_international"
  | "damasca"
  | "damasca_classic"
  | "checkers_us"
  | "columns_chess"
  | "chess";

export type DamaCaptureRemoval = "immediate" | "end_of_sequence";

export type VariantId =
  | "lasca_7_classic"
  | "lasca_8_dama_board"
  | "columns_chess"
  | "chess_classic"
  | "checkers_8_us"
  | "draughts_10_international"
  | "dama_8_classic"
  | "dama_8_classic_standard"
  | "dama_8_classic_international"
  | "damasca_8"
  | "damasca_8_classic";

export type BoardSize = 7 | 8 | 10;

export type PiecesPerSide = 11 | 12 | 16 | 20;

export interface GameMeta {
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: BoardSize;
  /** Dama-only. Defaults to "immediate" when missing. */
  damaCaptureRemoval?: DamaCaptureRemoval;
}

export interface VariantSpec {
  variantId: VariantId;
  displayName: string;
  subtitle: string;
  rulesetId: RulesetId;
  boardSize: BoardSize;
  piecesPerSide: PiecesPerSide;
  /** Which side starts the game. Defaults to "W" when omitted. */
  startingPlayer?: "W" | "B";
  svgAsset?: string;
  entryUrl?: string;
  defaultSaveName: string;
  available: boolean;
  /** Dama-only default; copied into GameMeta on new game. */
  damaCaptureRemoval?: DamaCaptureRemoval;
}
