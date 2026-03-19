import type { GameState } from "../core/index.ts";
import type { Move } from "../core/index.ts";
import type { EvalScore } from "../bot/uciEngine.ts";

export type DriverMode = "local" | "online";

export interface HistorySnapshots {
  states: GameState[];
  notation: string[];
  currentIndex: number;
  /** Elapsed move time in ms per entry (null = not recorded). */
  emtMs?: Array<number | null>;
  /** Per-position evaluation score (White perspective) aligned with states[]. */
  evals?: Array<EvalScore | null>;
}

export interface GameDriver {
  readonly mode: DriverMode;

  getState(): GameState;
  setState(state: GameState): void;

  submitMove(move: Move): Promise<GameState & { didPromote?: boolean }>;

  finalizeCaptureChain(args:
    | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
    | { rulesetId: "damasca" | "damasca_classic"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean };

  canUndo(): boolean;
  canRedo(): boolean;
  undo(): GameState | null;
  redo(): GameState | null;
  jumpToHistory(index: number): GameState | null;

  clearHistory(): void;
  pushHistory(state: GameState, notation?: string, emtMs?: number | null): void;
  replaceHistory(snap: HistorySnapshots): void;
  exportHistorySnapshots(): HistorySnapshots;
  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string; emtMs: number | null }>;
  getHistoryCurrent(): GameState | null;
}

/**
 * Runtime-online driver surface area used by the UI/controller.
 *
 * IMPORTANT: UI code should prefer `driver.mode === "online"` over `instanceof`
 * checks, because bundlers/dev-servers can duplicate module instances and break
 * `instanceof` across package boundaries.
 */
export interface OnlineGameDriver extends GameDriver {
  readonly mode: "online";

  getServerUrl(): string | null;
  getRoomId(): string | null;
  getPlayerId(): string | null;
  getPlayerColor(): "W" | "B" | null;
  controlsColor(color: "W" | "B"): boolean;

  /** Latest server-reported presence info (if available). */
  getPresence(): import("../shared/onlineProtocol.ts").PresenceByPlayerId | null;

  /** Latest server-reported player identity info (if available). */
  getIdentity(): import("../shared/onlineProtocol.ts").IdentityByPlayerId | null;
  /** Latest server-reported player identity metadata resolved by seat color. */
  getIdentityByColor(): import("../shared/onlineProtocol.ts").IdentityByColor | null;

  /** Immutable per room; set by the creator at /api/create. */
  getRoomRules(): import("../shared/onlineProtocol.ts").RoomRules | null;

  /**
   * Starts realtime server push (WebSockets preferred, SSE fallback).
   * Returns true if realtime was started, else false.
   */
  startRealtime(onUpdated: () => void): boolean;

  /** Subscribe to realtime events (WS/SSE unified). */
  onSseEvent(eventName: string, cb: (payload: any) => void): () => void;

  /** Polling fallback: fetch the latest snapshot and apply it. */
  fetchLatest(): Promise<boolean>;

  /**
   * Online-only: finalize a capture chain on the server.
   * (Used by Dama/Damasca when finalization happens at end-of-sequence.)
   */
  finalizeCaptureChainRemote(
    args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca" | "damasca_classic"; state: GameState; landing: string }
  ): Promise<GameState & { didPromote?: boolean }>;

  /** Online-only: end the current turn on the server (optionally with notation). */
  endTurnRemote(notation?: string): Promise<GameState>;

  /** Online-only: resign the game on the server. */
  resignRemote(): Promise<GameState>;

  /** Online-only: claim a draw (e.g. threefold repetition). */
  claimDrawRemote(args: { kind: "threefold" }): Promise<GameState>;

  /** Online-only: offer a draw (mutual agreement; US Checkers). */
  offerDrawRemote(): Promise<GameState>;

  /** Online-only: accept/decline a pending draw offer (US Checkers). */
  respondDrawOfferRemote(args: { accept: boolean }): Promise<GameState>;

  /** Online-only: fetch replay/event log for the current room. */
  fetchReplayEvents(args?: { limit?: number }): Promise<import("../shared/onlineProtocol.ts").ReplayEvent[]>;

  /** Online-only: fetch replay response (events + optional metadata). */
  fetchReplay(args?: { limit?: number }): Promise<import("../shared/onlineProtocol.ts").GetReplayResponse>;
}
