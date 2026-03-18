import { VARIANTS, getVariantById } from "../variants/variantRegistry";
import type { RulesetId, VariantId } from "../variants/variantTypes";
import { GlobalSection } from "./shellState";

export type AppShellSectionId = GlobalSection;

export interface AppShellNavItem {
  id: AppShellSectionId;
  label: string;
  description: string;
}

export interface AppShellGameItem {
  variantId: VariantId;
  displayName: string;
  subtitle: string;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  entryUrl?: string;
}

export const START_PAGE_SHELL_NAV: readonly AppShellNavItem[] = [
  { id: GlobalSection.Home, label: "Home", description: "Start page overview" },
  { id: GlobalSection.Games, label: "Games", description: "Variant selection" },
  { id: GlobalSection.Community, label: "Community", description: "Lobby and online play" },
  { id: GlobalSection.Account, label: "Account", description: "Profile and sign-in" },
  { id: GlobalSection.Settings, label: "Settings", description: "Board and startup options" },
] as const;

export const APP_SHELL_GAMES: readonly AppShellGameItem[] = VARIANTS.map((variant) => ({
  variantId: variant.variantId,
  displayName: variant.displayName,
  subtitle: variant.subtitle,
  rulesetId: variant.rulesetId,
  boardSize: variant.boardSize,
  entryUrl: variant.entryUrl,
}));

export function getAppShellGame(variantId: VariantId): AppShellGameItem {
  const variant = getVariantById(variantId);
  return {
    variantId: variant.variantId,
    displayName: variant.displayName,
    subtitle: variant.subtitle,
    rulesetId: variant.rulesetId,
    boardSize: variant.boardSize,
    entryUrl: variant.entryUrl,
  };
}