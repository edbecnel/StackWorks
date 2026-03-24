export type BotTier = "beginner" | "intermediate" | "advanced" | "master";

export type BotPreset = {
  skill: number; // Stockfish "Skill Level" (0..20)
  movetimeMs: number; // UCI: go movetime <ms>
};

export const BOT_PRESETS: Record<BotTier, ReadonlyArray<BotPreset>> = {
  beginner: [
    { skill: 2, movetimeMs: 30 },
    { skill: 2, movetimeMs: 40 },
    { skill: 3, movetimeMs: 50 },
    { skill: 3, movetimeMs: 60 },
    { skill: 4, movetimeMs: 70 },
    { skill: 4, movetimeMs: 80 },
    { skill: 5, movetimeMs: 90 },
    { skill: 5, movetimeMs: 100 },
    { skill: 6, movetimeMs: 110 },
    { skill: 6, movetimeMs: 120 },
  ],
  intermediate: [
    { skill: 7, movetimeMs: 80 },
    { skill: 8, movetimeMs: 99 },
    { skill: 8, movetimeMs: 118 },
    { skill: 9, movetimeMs: 137 },
    { skill: 10, movetimeMs: 156 },
    { skill: 10, movetimeMs: 174 },
    { skill: 11, movetimeMs: 193 },
    { skill: 12, movetimeMs: 212 },
    { skill: 12, movetimeMs: 231 },
    { skill: 13, movetimeMs: 250 },
  ],
  advanced: [
    { skill: 14, movetimeMs: 200 },
    { skill: 15, movetimeMs: 256 },
    { skill: 15, movetimeMs: 311 },
    { skill: 16, movetimeMs: 367 },
    { skill: 17, movetimeMs: 422 },
    { skill: 17, movetimeMs: 478 },
    { skill: 18, movetimeMs: 533 },
    { skill: 19, movetimeMs: 589 },
    { skill: 19, movetimeMs: 644 },
    { skill: 20, movetimeMs: 700 },
  ],
  master: [
    { skill: 20, movetimeMs: 800 },
    { skill: 20, movetimeMs: 950 },
    { skill: 20, movetimeMs: 1100 },
    { skill: 20, movetimeMs: 1250 },
    { skill: 20, movetimeMs: 1400 },
    { skill: 20, movetimeMs: 1550 },
    { skill: 20, movetimeMs: 1700 },
    { skill: 20, movetimeMs: 1850 },
    { skill: 20, movetimeMs: 2000 },
    { skill: 20, movetimeMs: 2200 },
  ],
} as const;

export function clampSublevel(n: number): number {
  return Math.max(0, Math.min(9, n));
}
