import type { Player } from "../types";

export type SideLabelPair = Record<Player, string>;

export interface ThemeSideLabelDefinition {
  /**
   * Theme-level default labels for this piece style.
   * These values should mirror current sideTerminology defaults unless explicitly customized.
   */
  default: SideLabelPair;
  /**
   * Optional per-variant/palette overrides under this theme.
   * Example keys for Glass: "yellow_blue", "cyan_violet", etc.
   */
  variants?: Record<string, SideLabelPair>;
}

/**
 * Metadata-only map for side labels by theme and optional theme variant.
 *
 * IMPORTANT:
 * - This file is intentionally not wired into UI behavior yet.
 * - Initial values mirror the existing defaults from `src/shared/sideTerminology.ts`.
 * - You can expand/override these labels later with more specific names.
 */
export const THEME_SIDE_LABEL_METADATA: Record<string, ThemeSideLabelDefinition> = {
  // white-black nomenclature
  classic: { default: { W: "White", B: "Black" } },
  neo: { default: { W: "White", B: "Black" } },
  staunton_glyphs: { default: { W: "White", B: "Black" } },
  raster2d: { default: { W: "White", B: "Black" } },
  columns_classic: { default: { W: "White", B: "Black" } },
  raster3d: { default: { W: "White", B: "Black" } },
  stone: { default: { W: "White", B: "Black" } },
  porcelain: { default: { W: "White", B: "Black" } },
  luminous: { default: { W: "White", B: "Black" } },

  // red-black nomenclature
  checkers: { default: { W: "Red", B: "Black" } },

  // light-dark nomenclature
  candy: { default: { W: "Pink", B: "Violet" } },
  wooden: { default: { W: "Light", B: "Dark" } },
  metal: { default: { W: "Steel", B: "Copper" } },
  semiprecious: { default: { W: "Light", B: "Dark" } },
  turtle: { default: { W: "Khaki", B: "Green" } },

  // Glass includes palette variants; defaults intentionally mirror current Light/Dark behavior.
  glass: {
    default: { W: "Light", B: "Dark" },
    variants: {
      yellow_blue: { W: "Yellow", B: "Blue" },
      cyan_violet: { W: "Cyan", B: "Violet" },
      mint_magenta: { W: "Mint", B: "Magenta" },
      pearl_smoke: { W: "Pearl", B: "Smoke" },
      lavender_sapphire: { W: "Lavender", B: "Sapphire" },
      aqua_amber: { W: "Aqua", B: "Amber" },
    },
  },
};

/**
 * Helper you can use once this metadata is wired in:
 * - resolves theme default labels
 * - optionally uses a variant/palette override when present
 */
export function resolveThemeSideLabels(themeId: string | null | undefined, variantId?: string | null | undefined): SideLabelPair | null {
  const normalizedThemeId = String(themeId ?? "").trim().toLowerCase();
  if (!normalizedThemeId) return null;
  const def = THEME_SIDE_LABEL_METADATA[normalizedThemeId];
  if (!def) return null;

  const normalizedVariantId = String(variantId ?? "").trim().toLowerCase();
  if (normalizedVariantId && def.variants?.[normalizedVariantId]) {
    return def.variants[normalizedVariantId];
  }
  return def.default;
}

/**
 * Ruleset-specific side-label overrides layered on top of theme metadata.
 *
 * Intended precedence (when wired in later):
 * 1) ruleset + theme + variant override
 * 2) ruleset + theme default
 * 3) global theme + variant override
 * 4) global theme default
 */
export const THEME_SIDE_LABEL_RULESET_OVERRIDES: Record<string, Record<string, ThemeSideLabelDefinition>> = {
  chess: {
    candy: {
      default: { W: "White", B: "Black" },
    },
  },
  chess_classic: {
    candy: {
      default: { W: "White", B: "Black" },
    },
  },
  columns_chess: {
    candy: {
      default: { W: "White", B: "Black" },
    },
  },
};
