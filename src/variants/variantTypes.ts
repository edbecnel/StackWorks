export type RulesetId =
  | "lasca"
  | "dama"
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
  | "dama_8_classic"
  | "dama_8_classic_standard"
  | "dama_8_classic_international"
  | "damasca_8"
  | "damasca_8_classic";

export interface GameMeta {
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  /** Dama-only. Defaults to "immediate" when missing. */
  damaCaptureRemoval?: DamaCaptureRemoval;
}

export interface VariantSpec {
  variantId: VariantId;
  displayName: string;
  subtitle: string;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  piecesPerSide: 11 | 12 | 16;
  /** Which side starts the game. Defaults to "W" when omitted. */
  startingPlayer?: "W" | "B";
  svgAsset?: string;
  entryUrl?: string;
  defaultSaveName: string;
  available: boolean;
  /** Dama-only default; copied into GameMeta on new game. */
  damaCaptureRemoval?: DamaCaptureRemoval;
}
