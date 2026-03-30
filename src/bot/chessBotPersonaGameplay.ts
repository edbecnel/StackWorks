import type { Player } from "../types.ts";

/**
 * Persona IDs match Play Hub / `stackworks.bot.*Persona` storage and
 * `localPlayerNames` display titles. Each persona adjusts Stockfish search
 * (Skill Level + movetime) on top of the tier preset for **classic chess**
 * and **Columns Chess** — similar in spirit to named bots using extra engine
 * configuration beyond a single rating number.
 */
export const CHESS_BOT_PERSONA_IDS = ["teacher", "balanced", "trickster", "endgame"] as const;
export type ChessBotPersonaId = (typeof CHESS_BOT_PERSONA_IDS)[number];

const LS_PERSONA_W = "stackworks.bot.whitePersona";
const LS_PERSONA_B = "stackworks.bot.blackPersona";

/** Count chessmen (both colors) from the board field of a FEN string. */
export function countChessPiecesFromFen(fen: string): number {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  let n = 0;
  for (const ch of board) {
    if ("pnbrqkPNBRQK".includes(ch)) n++;
  }
  return n;
}

/** Rough endgame detector for persona behavior (not chess rules). */
export function isLikelyEndgameRichPosition(fen: string): boolean {
  return countChessPiecesFromFen(fen) <= 12;
}

export function readChessBotPersonaForSide(side: Player): ChessBotPersonaId | null {
  try {
    const key = side === "W" ? LS_PERSONA_W : LS_PERSONA_B;
    const raw = localStorage.getItem(key)?.trim() ?? "";
    return (CHESS_BOT_PERSONA_IDS as readonly string[]).includes(raw) ? (raw as ChessBotPersonaId) : null;
  } catch {
    return null;
  }
}

function clampSkill(n: number): number {
  return Math.max(0, Math.min(20, Math.round(n)));
}

function clampMovetime(ms: number): number {
  return Math.max(10, Math.round(ms));
}

/**
 * Applies persona on top of tier-based `BOT_PRESETS` skill and movetime.
 * Unknown / missing persona → balanced (no change).
 */
export function applyChessBotPersonaToMoveSearch(args: {
  persona: ChessBotPersonaId | null;
  baseSkill: number;
  baseMovetimeMs: number;
  fen: string;
}): { skill: number; movetimeMs: number } {
  const p = args.persona ?? "balanced";
  let skill = args.baseSkill;
  let movetime = args.baseMovetimeMs;

  switch (p) {
    case "teacher":
      skill -= 2;
      movetime *= 0.9;
      break;
    case "balanced":
      break;
    case "trickster":
      movetime *= 1.14;
      break;
    case "endgame":
      if (isLikelyEndgameRichPosition(args.fen)) {
        skill += 1;
        movetime *= 1.1;
      } else {
        skill -= 1;
        movetime *= 0.93;
      }
      break;
    default:
      break;
  }

  return {
    skill: clampSkill(skill),
    movetimeMs: clampMovetime(movetime),
  };
}
