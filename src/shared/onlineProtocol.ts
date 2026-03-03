import type { Move } from "../game/moveTypes.ts";
import type { VariantId } from "../variants/variantTypes";
import type { WireSnapshot } from "./wireState.ts";

export type RoomId = string;
export type PlayerId = string;
export type PlayerColor = "W" | "B";

export type RoomVisibility = "public" | "private";

export type RoomRules = {
  /** If true, threefold repetition ends the game in a draw (Lasca/Dama). */
  drawByThreefold?: boolean;
};

export type PlayerPresence = {
  connected: boolean;
  lastSeenAt: string; // ISO timestamp
  /** Present when the server has started a disconnect grace window. */
  inGrace?: boolean;
  /** ISO timestamp when grace expires. */
  graceUntil?: string;
};

export type PresenceByPlayerId = Record<PlayerId, PlayerPresence>;

export type PlayerIdentity = {
  /** Stable per-device guest identifier (informational only; not authorization). */
  guestId?: string;
  /** Display name (may be shown to the opponent / spectators depending on room visibility). */
  displayName?: string;
};

export type IdentityByPlayerId = Record<PlayerId, PlayerIdentity>;

export type TimeControl =
  | { mode: "none" }
  | { mode: "clock"; initialMs: number; incrementMs?: number };

export type ClockState = {
  /** Remaining time per player color. */
  remainingMs: Record<PlayerColor, number>;
  /** Whose clock is currently running (if not paused). */
  active: PlayerColor;
  /** True when clocks are paused (e.g., disconnect grace). */
  paused: boolean;
  /** Server timestamp (ms since epoch) when the active clock last started/resumed. */
  lastTickMs: number;
};

export type OnlineError = {
  error: string;
};

export type CreateRoomRequest = {
  variantId: VariantId;
  snapshot: WireSnapshot;
  /** Optional informational identity for guest play (not authorization). */
  guestId?: string;
  /** Optional player-chosen display name. */
  displayName?: string;
  /** Optional seat preference for the creator. If omitted, creator is White (back-compat). */
  preferredColor?: PlayerColor;
  /** Immutable per game; only settable at create. */
  timeControl?: TimeControl;
  /** Controls whether non-players may view the room (stream/snapshot/replay). Default: public (back-compat). */
  visibility?: RoomVisibility;
  /** Immutable per game; only settable at create. */
  rules?: RoomRules;
};

export type CreateRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      /** Informational per-player identity (may be partial). */
      identity?: IdentityByPlayerId;
      rules?: RoomRules;
      timeControl?: TimeControl;
      clock?: ClockState;
      visibility?: RoomVisibility;
      /** Present when the room is private and server generated a spectator token. */
      watchToken?: string;
    }
  | OnlineError;

export type JoinRoomRequest = {
  roomId: RoomId;
  /** Optional informational identity for guest play (not authorization). */
  guestId?: string;
  /** Optional player-chosen display name. */
  displayName?: string;
  /** Optional seat preference for the joiner. If omitted, server assigns the remaining color. */
  preferredColor?: PlayerColor;
};

export type JoinRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      rules?: RoomRules;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type SubmitMoveRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  move: Move;
  /**
   * Optional optimistic concurrency control.
   * When provided, the server rejects the request unless it matches the current room.stateVersion.
   * Back-compat: older clients may omit this.
   */
  expectedStateVersion?: number;
};

export type SubmitMoveResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type FinalizeCaptureChainRequest =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "dama";
      landing: string;
      jumpedSquares: string[];
      expectedStateVersion?: number;
    }
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "damasca" | "damasca_classic";
      landing: string;
      expectedStateVersion?: number;
    };

export type FinalizeCaptureChainResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type EndTurnRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  notation?: string;
  expectedStateVersion?: number;
};

export type EndTurnResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type ResignRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  expectedStateVersion?: number;
};

export type ResignResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type ClaimDrawRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  kind: "threefold";
  expectedStateVersion?: number;
};

export type ClaimDrawResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type OfferDrawRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  expectedStateVersion?: number;
};

export type OfferDrawResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type RespondDrawOfferRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  accept: boolean;
  expectedStateVersion?: number;
};

export type RespondDrawOfferResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type GetRoomSnapshotResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      identity?: IdentityByPlayerId;
      rules?: RoomRules;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type GetRoomMetaResponse =
  | {
      roomId: RoomId;
      variantId: VariantId;
      visibility: RoomVisibility;
      isOver: boolean;
      seatsTaken: PlayerColor[];
      seatsOpen: PlayerColor[];
      timeControl?: TimeControl;
    }
  | OnlineError;

export type GetRoomWatchTokenResponse =
  | {
      roomId: RoomId;
      visibility: RoomVisibility;
      /** Present only for private rooms. */
      watchToken?: string;
    }
  | OnlineError;

// --- Lobby / matchmaking ---

export type LobbyRoomStatus = "waiting" | "in_game";

export type LobbyRoomSummary = {
  roomId: RoomId;
  variantId: VariantId;
  visibility: RoomVisibility;
  /** Server-derived status for UI display. */
  status?: LobbyRoomStatus;
  /** ISO timestamp when the room was created (best-effort; may be omitted for older persisted rooms). */
  createdAt?: string;
  /** Optional room host display name (best-effort; informational only). */
  hostDisplayName?: string;
  /** Player colors currently taken (derived from server room.players). */
  seatsTaken: PlayerColor[];
  /** Player colors currently available to join. */
  seatsOpen: PlayerColor[];
  /** Optional public display names per seat (informational only). */
  displayNameByColor?: Partial<Record<PlayerColor, string>>;
  /** Included for UI display; informational only. */
  timeControl?: TimeControl;
};

export type GetLobbyResponse =
  | {
      rooms: LobbyRoomSummary[];
    }
  | OnlineError;

// --- Replay / post-game summary ---

export type ReplayEvent = {
  type: "GAME_CREATED" | "MOVE_APPLIED" | "GAME_OVER";
  ts: string;
  roomId: RoomId;
  rulesVersion: string;
  stateVersion: number;
  variantId?: any;
  action?: "SUBMIT_MOVE" | "FINALIZE_CAPTURE_CHAIN" | "END_TURN";
  move?: any;
  snapshot?: WireSnapshot;
  winner?: PlayerColor | null;
  reason?: string;
};

export type GetReplayResponse =
  | {
      events: ReplayEvent[];
      /** Optional public display names per seat (informational only). */
      displayNameByColor?: Partial<Record<PlayerColor, string>>;
    }
  | OnlineError;

// --- Debug reports ---

export type PostRoomDebugReportRequest = {
  roomId: RoomId;
  playerId?: PlayerId;
  debug: any;
};

export type PostRoomDebugReportResponse =
  | {
      ok: true;
      fileName: string;
    }
  | OnlineError;
