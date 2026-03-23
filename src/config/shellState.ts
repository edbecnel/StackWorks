import { isVariantId } from "../variants/variantRegistry";
import type { VariantId } from "../variants/variantTypes";

export enum GlobalSection {
  Home = "home",
  Games = "games",
  Community = "community",
  Account = "account",
  Settings = "settings",
}

export enum GameSection {
  Play = "play",
  Learn = "learn",
  Watch = "watch",
  History = "history",
  Rules = "rules",
  Customize = "customize",
  Online = "online",
}

export enum PlaySubSection {
  Online = "online",
  Bots = "bots",
  Coach = "coach",
  Local = "local",
  Resume = "resume",
}

export interface ShellState {
  activeGame: VariantId | null;
  activeSection: GlobalSection;
  gameSection: GameSection | null;
  playSubSection: PlaySubSection | null;
}

const SHELL_STATE_LS_KEY = "stackworks.shell.state";

const DEFAULT_SHELL_STATE: ShellState = {
  activeGame: null,
  activeSection: GlobalSection.Home,
  gameSection: null,
  playSubSection: null,
};

function isEnumValue<T extends string>(enumObject: Record<string, T>, value: unknown): value is T {
  return typeof value === "string" && Object.values(enumObject).includes(value as T);
}

export function normalizeGlobalSection(value: unknown): GlobalSection {
  return isEnumValue(GlobalSection, value) ? value : GlobalSection.Home;
}

export function normalizeGameSection(value: unknown): GameSection | null {
  return isEnumValue(GameSection, value) ? value : null;
}

export function normalizePlaySubSection(value: unknown): PlaySubSection | null {
  if (value === "friend" || value === "tournaments") return PlaySubSection.Online;
  if (value === "variants") return PlaySubSection.Local;
  return isEnumValue(PlaySubSection, value) ? value : null;
}

export function readShellState(): ShellState {
  try {
    const raw = localStorage.getItem(SHELL_STATE_LS_KEY);
    if (!raw) return { ...DEFAULT_SHELL_STATE };
    const parsed = JSON.parse(raw) as Partial<Record<keyof ShellState, unknown>> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SHELL_STATE };

    return {
      activeGame: isVariantId(parsed.activeGame) ? parsed.activeGame : null,
      activeSection: normalizeGlobalSection(parsed.activeSection),
      gameSection: normalizeGameSection(parsed.gameSection),
      playSubSection: normalizePlaySubSection(parsed.playSubSection),
    };
  } catch {
    return { ...DEFAULT_SHELL_STATE };
  }
}

export function writeShellState(nextState: ShellState): ShellState {
  try {
    localStorage.setItem(SHELL_STATE_LS_KEY, JSON.stringify(nextState));
  } catch {
    // ignore storage failures
  }
  return nextState;
}

export function updateShellState(patch: Partial<ShellState>): ShellState {
  return writeShellState({
    ...readShellState(),
    ...patch,
  });
}
