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

export enum OnlineSubSection {
  QuickMatch = "quick-match",
  CustomChallenge = "custom-challenge",
  Friend = "friend",
  HostedRooms = "hosted-rooms",
  Tournaments = "tournaments",
}

export enum BotControllerMode {
  Human = "human",
  Bot = "bot",
}

export type BotDifficulty = "easy" | "medium" | "advanced" | "master" | "beginner" | "intermediate";

export type BotPersona = "teacher" | "balanced" | "trickster" | "endgame";

export interface BotSeatState {
  controller: BotControllerMode;
  level: BotDifficulty | null;
  persona: BotPersona | null;
}

export interface BotPlayState {
  white: BotSeatState;
  black: BotSeatState;
}

export enum HostedRoomVisibilityMode {
  Public = "public",
  Private = "private",
  InviteOnly = "invite-only",
}

export enum HostedRoomOwnerControl {
  HostOnly = "host-only",
  MembersCanInvite = "members-can-invite",
  OrganizerManaged = "organizer-managed",
}

export interface HostedRoomState {
  visibility: HostedRoomVisibilityMode;
  ownerControl: HostedRoomOwnerControl;
}

export type CoachLevel =
  | "new-to-chess"
  | "beginner"
  | "novice"
  | "intermediate"
  | "intermediate-ii"
  | "advanced"
  | "expert";

export interface ShellState {
  activeGame: VariantId | null;
  activeSection: GlobalSection;
  gameSection: GameSection | null;
  playSubSection: PlaySubSection | null;
  onlineSubSection: OnlineSubSection | null;
  botPlayState: BotPlayState | null;
  hostedRoomState: HostedRoomState | null;
  coachLevel: CoachLevel | null;
}

const SHELL_STATE_LS_KEY = "stackworks.shell.state";

const DEFAULT_SHELL_STATE: ShellState = {
  activeGame: null,
  activeSection: GlobalSection.Home,
  gameSection: null,
  playSubSection: null,
  onlineSubSection: null,
  botPlayState: null,
  hostedRoomState: null,
  coachLevel: null,
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

export function normalizeOnlineSubSection(value: unknown): OnlineSubSection | null {
  switch (value) {
    case "quickmatch":
    case "quick_match":
      return OnlineSubSection.QuickMatch;
    case "customchallenge":
    case "custom_challenge":
      return OnlineSubSection.CustomChallenge;
    case "hostedrooms":
    case "hosted_rooms":
      return OnlineSubSection.HostedRooms;
    default:
      return isEnumValue(OnlineSubSection, value) ? value : null;
  }
}

export function normalizeBotDifficulty(value: unknown): BotDifficulty | null {
  switch (value) {
    case "easy":
    case "medium":
    case "advanced":
    case "master":
    case "beginner":
    case "intermediate":
      return value;
    default:
      return null;
  }
}

export function normalizeBotPersona(value: unknown): BotPersona | null {
  switch (value) {
    case "teacher":
    case "balanced":
    case "trickster":
    case "endgame":
      return value;
    default:
      return null;
  }
}

export function normalizeBotSeatState(value: unknown): BotSeatState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { controller?: unknown; level?: unknown; persona?: unknown };
  const controller = parsed.controller === BotControllerMode.Bot ? BotControllerMode.Bot : BotControllerMode.Human;
  const level = normalizeBotDifficulty(parsed.level);
  const persona = normalizeBotPersona(parsed.persona);
  return {
    controller,
    level: controller === BotControllerMode.Bot ? level : null,
    persona: controller === BotControllerMode.Bot ? persona : null,
  };
}

export function normalizeBotPlayState(value: unknown): BotPlayState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { white?: unknown; black?: unknown };
  const white = normalizeBotSeatState(parsed.white);
  const black = normalizeBotSeatState(parsed.black);
  if (!white || !black) return null;
  return { white, black };
}

export function normalizeHostedRoomVisibilityMode(value: unknown): HostedRoomVisibilityMode | null {
  return isEnumValue(HostedRoomVisibilityMode, value) ? value : null;
}

export function normalizeHostedRoomOwnerControl(value: unknown): HostedRoomOwnerControl | null {
  return isEnumValue(HostedRoomOwnerControl, value) ? value : null;
}

export function normalizeHostedRoomState(value: unknown): HostedRoomState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { visibility?: unknown; ownerControl?: unknown };
  const visibility = normalizeHostedRoomVisibilityMode(parsed.visibility);
  const ownerControl = normalizeHostedRoomOwnerControl(parsed.ownerControl);
  if (!visibility || !ownerControl) return null;
  return { visibility, ownerControl };
}

export function normalizeCoachLevel(value: unknown): CoachLevel | null {
  switch (value) {
    case "new-to-chess":
    case "beginner":
    case "novice":
    case "intermediate":
    case "intermediate-ii":
    case "advanced":
    case "expert":
      return value;
    default:
      return null;
  }
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
      onlineSubSection: normalizeOnlineSubSection(parsed.onlineSubSection ?? parsed.playSubSection),
      botPlayState: normalizeBotPlayState(parsed.botPlayState),
      hostedRoomState: normalizeHostedRoomState(parsed.hostedRoomState),
      coachLevel: normalizeCoachLevel(parsed.coachLevel),
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
