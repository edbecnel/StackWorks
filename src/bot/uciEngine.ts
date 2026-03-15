export type UciBestMoveArgs = {
  fen: string;
  movetimeMs: number;
  /** Optional difficulty knob (0..20 for Stockfish Skill Level). */
  skill?: number;
  /** Optional overall timeout guard for the request. */
  timeoutMs?: number;
};

/** Engine evaluation score: centipawns (positive = side-to-move advantage) or forced mate. */
export type EvalScore = { cp: number } | { mate: number };

export interface UciEngine {
  init(opts?: { timeoutMs?: number }): Promise<void>;
  /** Optional for engines that support a skill/strength knob. */
  setSkillLevel?(skill: number, opts?: { timeoutMs?: number }): Promise<void>;
  bestMove(args: UciBestMoveArgs): Promise<string>; // returns UCI move like "e2e4" or "e7e8q"
  /** Quick static evaluation of a position. Returns null if not supported or on failure. */
  evaluate?(fen: string, opts?: { movetimeMs?: number; timeoutMs?: number }): Promise<EvalScore | null>;
  terminate?(): void;
}
