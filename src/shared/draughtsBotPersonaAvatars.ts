import type { ChessBotPersonaId } from "../bot/chessBotPersonaGameplay.ts";

/** Served from `public/icons/bots/` (filenames include spaces; path is URL-encoded). */
const DRAUGHTS_BOT_PERSONA_AVATAR_SRC: Record<ChessBotPersonaId, string> = {
  teacher: "/icons/bots/Teacher%20Draughts%20bot%20avatar.png",
  balanced: "/icons/bots/Balanced%20Draughts%20bot%20avatar.png",
  trickster: "/icons/bots/Trickster%20Draughts%20bot%20avatar.png",
  endgame: "/icons/bots/Endgame%20Draughts%20bot%20avatar.png",
};

export function draughtsBotPersonaAvatarUrl(persona: ChessBotPersonaId): string {
  return DRAUGHTS_BOT_PERSONA_AVATAR_SRC[persona] ?? DRAUGHTS_BOT_PERSONA_AVATAR_SRC.balanced;
}
