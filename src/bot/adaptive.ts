import { clampSublevel, type BotTier } from "./presets.ts";

export type AdaptState = {
  subFloat: number; // continuous 0..9
  applied: number; // integer 0..9
};

export const TARGET_SCORE = 0.45;
export const DEADBAND = 0.35;

export function kForTier(tier: BotTier): number {
  switch (tier) {
    case "beginner":
      return 0.9;
    case "intermediate":
      return 0.8;
    case "advanced":
      return 0.7;
    case "master":
      return 0.6;
  }
}

export function normalizeAdaptState(raw: Partial<AdaptState> | null | undefined): AdaptState {
  const subFloat = Number(raw?.subFloat);
  const applied = Number(raw?.applied);
  const safeSub = Number.isFinite(subFloat) ? clampSublevel(subFloat) : 4;
  const safeApplied = Number.isFinite(applied) ? Math.round(clampSublevel(applied)) : Math.round(safeSub);
  return { subFloat: safeSub, applied: safeApplied };
}

export function updateSubFloat(args: {
  tier: BotTier;
  prev: AdaptState;
  score: 0 | 0.5 | 1;
}): AdaptState {
  const K = kForTier(args.tier);
  const next = clampSublevel(args.prev.subFloat + K * (args.score - TARGET_SCORE));
  return { ...args.prev, subFloat: next };
}

export function applyHysteresisOneStep(prev: AdaptState): AdaptState {
  const threshold = 1 - DEADBAND; // 0.65
  const { subFloat, applied } = prev;

  if (subFloat >= applied + threshold && applied < 9) {
    return { ...prev, applied: applied + 1 };
  }
  if (subFloat <= applied - threshold && applied > 0) {
    return { ...prev, applied: applied - 1 };
  }
  return prev;
}

export function adaptAfterGame(args: {
  tier: BotTier;
  prev: AdaptState;
  score: 0 | 0.5 | 1;
}): AdaptState {
  const updatedFloat = updateSubFloat(args);
  return applyHysteresisOneStep(updatedFloat);
}
