import type { ChessBotPersonaId } from "../bot/chessBotPersonaGameplay.ts";

/** Served from `public/icons/bots/` (filenames include spaces; path is URL-encoded). */
const CHESS_BOT_PERSONA_AVATAR_SRC: Record<ChessBotPersonaId, string> = {
  teacher: "/icons/bots/Teacher%20Chess%20bot%20avatar.png",
  balanced: "/icons/bots/Balanced%20Chess%20bot%20avatar.png",
  trickster: "/icons/bots/Trickster%20Chess%20bot%20avatar.png",
  endgame: "/icons/bots/Endgame%20Chess%20bot%20avatar.png",
};

export function chessBotPersonaAvatarUrl(persona: ChessBotPersonaId): string {
  return CHESS_BOT_PERSONA_AVATAR_SRC[persona] ?? CHESS_BOT_PERSONA_AVATAR_SRC.balanced;
}
