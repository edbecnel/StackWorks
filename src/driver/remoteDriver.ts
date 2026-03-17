import type { GameDriver, HistorySnapshots } from "./gameDriver.ts";
import type { GameState, Move } from "../core/index.ts";
import { HistoryManager } from "../game/historyManager.ts";
import type {
  ClaimDrawRequest,
  ClaimDrawResponse,
  CreateRoomResponse,
  EndTurnRequest,
  EndTurnResponse,
  FinalizeCaptureChainRequest,
  FinalizeCaptureChainResponse,
  GetReplayResponse,
  GetRoomSnapshotResponse,
  JoinRoomResponse,
  IdentityByPlayerId,
  PresenceByPlayerId,
  RoomRules,
  ReplayEvent,
  ResignRequest,
  ResignResponse,
  SubmitMoveRequest,
  SubmitMoveResponse,
} from "../shared/onlineProtocol.ts";
import type { OfferDrawRequest, OfferDrawResponse, RespondDrawOfferRequest, RespondDrawOfferResponse } from "../shared/onlineProtocol.ts";
import { hashGameState } from "../game/hashState.ts";
import {
  deserializeWireGameState,
  deserializeWireHistory,
  type WireSnapshot,
} from "../shared/wireState.ts";

/**
 * RemoteDriver.
 *
 * This is the multiplayer/online path.
 * Realtime transport preference order:
 * 1) WebSockets (MP1.5 primary)
 * 2) SSE (legacy push)
 * 3) Polling fallback (controller layer)
 */
type RemoteIds = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  /** Secret spectator token for private rooms (optional). */
  watchToken?: string;
};

export class RemoteDriver implements GameDriver {
  readonly mode = "online" as const;

  private state: GameState;
  private history: HistoryManager;
  private ids: RemoteIds | null = null;
  private playerColor: "W" | "B" | null = null;
  private lastStateHash: string;
  private lastStateVersion: number = -1;
  private eventSource: EventSource | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: number | null = null;
  private wsReconnectAttempt: number = 0;
  private transportStatus: "connected" | "reconnecting" = "connected";
  private onRealtimeUpdate: (() => void) | null = null;
  private realtimeListeners = new Map<string, Set<(payload: any) => void>>();
  private resyncInFlight: Promise<void> | null = null;
  private lastPresence: PresenceByPlayerId | null = null;
  private lastIdentity: IdentityByPlayerId | null = null;
  private roomRules: RoomRules | null = null;

  // Burst/backpressure handling for realtime snapshots.
  // Strategy: coalesce snapshots (keep only the latest), apply at most once per tick.
  // If we detect a burst, prefer drop-to-resync over trying to process every frame.
  private pendingRealtimeSnapshot: WireSnapshot | null = null;
  private realtimeFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private ignoreRealtimeSnapshotsUntilResync: boolean = false;
  private burstWindowStartMs: number = 0;
  private burstCount: number = 0;

  constructor(state: GameState) {
    this.state = state;
    this.history = new HistoryManager();
    this.history.push(state);
    this.lastStateHash = hashGameState(state as any);
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  setRemoteIds(ids: RemoteIds): void {
    this.ids = ids;
  }

  setPlayerColor(color: "W" | "B"): void {
    this.playerColor = color;
  }

  getPlayerColor(): "W" | "B" | null {
    return this.playerColor;
  }

  getRoomId(): string | null {
    return this.ids?.roomId ?? null;
  }

  getServerUrl(): string | null {
    return this.ids?.serverUrl ?? null;
  }

  getPlayerId(): string | null {
    return this.ids?.playerId ?? null;
  }

  getPresence(): PresenceByPlayerId | null {
    return this.lastPresence;
  }

  getIdentity(): IdentityByPlayerId | null {
    return this.lastIdentity;
  }

  getRoomRules(): RoomRules | null {
    return this.roomRules;
  }

  async fetchReplayEvents(args?: { limit?: number }): Promise<ReplayEvent[]> {
    const res = await this.fetchReplay(args);
    if ((res as any)?.error) throw new Error(String((res as any).error));
    const events = (res as any)?.events;
    if (!Array.isArray(events)) return [];
    return events as ReplayEvent[];
  }

  async fetchReplay(args?: { limit?: number }): Promise<GetReplayResponse> {
    const ids = this.requireIds();
    const limit = args?.limit;
    const qs = this.toAccessQuery(ids, { limit });
    const res = await this.getJson<GetReplayResponse>(`/api/room/${encodeURIComponent(ids.roomId)}/replay?${qs}`);
    return res;
  }

  private requireIds(): RemoteIds {
    if (!this.ids) throw new Error("RemoteDriver is not connected (missing roomId/playerId)");
    return this.ids;
  }

  private toAccessQuery(ids: RemoteIds, opts?: { limit?: number }): string {
    const qs = new URLSearchParams();
    qs.set("playerId", ids.playerId);
    if (ids.watchToken) qs.set("watchToken", ids.watchToken);
    if (typeof opts?.limit === "number" && Number.isFinite(opts.limit)) qs.set("limit", String(opts.limit));
    return qs.toString();
  }

  private toStreamUrl(ids: RemoteIds): string {
    const base = ids.serverUrl.replace(/\/$/, "");
    const qs = new URLSearchParams({ playerId: ids.playerId });
    if (ids.watchToken) qs.set("watchToken", ids.watchToken);
    return `${base}/api/stream/${encodeURIComponent(ids.roomId)}?${qs.toString()}`;
  }

  private toWsUrl(serverUrl: string): string {
    const base = serverUrl.replace(/\/$/, "");
    const u = new URL(base);
    if (u.protocol === "https:") u.protocol = "wss:";
    else u.protocol = "ws:";
    // WebSocket server is attached to the same HTTP server.
    u.pathname = `${u.pathname.replace(/\/$/, "")}/api/ws`;
    u.search = "";
    return u.toString();
  }

  /**
   * Subscribe to a realtime SSE event.
   * Returns an unsubscribe function.
   */
  onSseEvent(eventName: string, cb: (payload: any) => void): () => void {
    const set = this.realtimeListeners.get(eventName) ?? new Set<(payload: any) => void>();
    set.add(cb);
    this.realtimeListeners.set(eventName, set);
    return () => {
      const cur = this.realtimeListeners.get(eventName);
      if (!cur) return;
      cur.delete(cb);
      if (cur.size === 0) this.realtimeListeners.delete(eventName);
    };
  }

  private emitSseEvent(eventName: string, payload: any): void {
    const set = this.realtimeListeners.get(eventName);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch {
        // ignore listener errors
      }
    }
  }

  private setTransportStatus(next: "connected" | "reconnecting"): void {
    if (this.transportStatus === next) return;
    this.transportStatus = next;
    this.emitSseEvent("transport_status", { status: next });
  }

  /**
   * Starts realtime server push.
   * Returns true if started (browser-only), else false.
   */
  startRealtime(onUpdated: () => void): boolean {
    if (typeof window === "undefined") return false;

    // Prefer WebSockets.
    if (typeof (window as any).WebSocket !== "undefined") {
      if (this.ws) return true;
      this.onRealtimeUpdate = onUpdated;
      this.startWebSocketRealtime();
      return true;
    }

    // Fallback: SSE.
    if (typeof (window as any).EventSource === "undefined") return false;
    if (this.eventSource) return true;

    const ids = this.requireIds();
    this.onRealtimeUpdate = onUpdated;

    const url = this.toStreamUrl(ids);
    const es = new EventSource(url);
    this.eventSource = es;

    const listen = (eventName: string, handler: (payload: any) => void) => {
      es.addEventListener(eventName, (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(String(ev.data)) as any;
          handler(payload);
          this.emitSseEvent(eventName, payload);
        } catch {
          // ignore malformed events
        }
      });
    };

    // Required event today.
    listen("snapshot", (payload) => {
      if (payload?.presence) this.lastPresence = payload.presence as PresenceByPlayerId;
      if (payload?.identity && typeof payload.identity === "object") this.lastIdentity = payload.identity as IdentityByPlayerId;
      if (payload?.rules && typeof payload.rules === "object") this.roomRules = payload.rules as RoomRules;
      const snap = payload?.snapshot as WireSnapshot | undefined;
      if (!snap) return;
      this.enqueueRealtimeSnapshot(snap);
    });

    // Reserved for MP2+; wiring here avoids transport changes later.
    // Server can start broadcasting these event types when implemented.
    listen("opponent_status", () => void 0);
    listen("clock_sync", () => void 0);
    listen("adjourn", () => void 0);

    // EventSource auto-reconnects. We keep polling fallback at the controller layer.
    es.addEventListener("error", () => {
      // ignore transient disconnects
    });

    return true;
  }

  private scheduleWsReconnect(): void {
    if (typeof window === "undefined") return;
    if (this.wsReconnectTimer != null) return;

    const attempt = this.wsReconnectAttempt;
    // quick retry ramp: 250ms, 500ms, 1s, 2s, 2s...
    const delay = Math.min(2000, 250 * Math.pow(2, Math.min(3, attempt)));
    this.wsReconnectTimer = window.setTimeout(() => {
      this.wsReconnectTimer = null;
      this.startWebSocketRealtime();
    }, delay);
  }

  private startWebSocketRealtime(): void {
    if (typeof window === "undefined") return;
    const ids = this.requireIds();

    // Cleanup any previous socket.
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const url = this.toWsUrl(ids.serverUrl);
    const ws = new WebSocket(url);
    this.ws = ws;

    if (this.wsReconnectAttempt > 0) this.setTransportStatus("reconnecting");

    ws.addEventListener("open", () => {
      this.wsReconnectAttempt = 0;
      // JOIN handshake required by server. lastSeenVersion enables resync logic.
      const join = {
        type: "JOIN",
        roomId: ids.roomId,
        playerId: ids.playerId,
        lastSeenVersion: this.lastStateVersion,
      };
      try {
        ws.send(JSON.stringify(join));
      } catch {
        // ignore
      }
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as any;
        const eventName = typeof msg?.event === "string" ? msg.event : null;
        const payload = msg?.payload;

        if (eventName === "snapshot") {
          if (payload?.presence) this.lastPresence = payload.presence as PresenceByPlayerId;
          if (payload?.identity && typeof payload.identity === "object") this.lastIdentity = payload.identity as IdentityByPlayerId;
          if (payload?.rules && typeof payload.rules === "object") this.roomRules = payload.rules as RoomRules;
          const snap = payload?.snapshot as WireSnapshot | undefined;
          if (!snap) return;
          this.enqueueRealtimeSnapshot(snap);
          this.emitSseEvent("snapshot", payload);
          return;
        }

        // Reserved for MP2+.
        if (eventName) {
          this.emitSseEvent(eventName, payload);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      // Reconnect loop.
      this.wsReconnectAttempt += 1;
      this.setTransportStatus("reconnecting");
      this.scheduleWsReconnect();
    });

    ws.addEventListener("error", () => {
      // Some browsers only fire close; be defensive.
      this.wsReconnectAttempt += 1;
      this.setTransportStatus("reconnecting");
      this.scheduleWsReconnect();
    });
  }

  stopRealtime(): void {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
    }
    this.eventSource = null;

    if (this.wsReconnectTimer != null && typeof window !== "undefined") {
      window.clearTimeout(this.wsReconnectTimer);
    }
    this.wsReconnectTimer = null;
    this.wsReconnectAttempt = 0;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;

    this.transportStatus = "connected";

    this.onRealtimeUpdate = null;
  }

  private async postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const { serverUrl } = this.requireIds();
    const res = await fetch(`${serverUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg =
        typeof json?.error === "string"
          ? json.error
          : raw && raw.trim()
            ? raw.trim().slice(0, 200)
            : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (json == null) throw new Error("Invalid JSON response");
    if (json?.error) throw new Error(String(json.error));
    return json as TRes;
  }

  private async getJson<TRes>(path: string): Promise<TRes> {
    const { serverUrl } = this.requireIds();
    const res = await fetch(`${serverUrl}${path}`);
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg =
        typeof json?.error === "string"
          ? json.error
          : raw && raw.trim()
            ? raw.trim().slice(0, 200)
            : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (json == null) throw new Error("Invalid JSON response");
    if (json?.error) throw new Error(String(json.error));
    return json as TRes;
  }

  private nowMs(): number {
    // Prefer a monotonic timer when available.
    try {
      const p = (globalThis as any)?.performance;
      if (p && typeof p.now === "function") return p.now();
    } catch {
      // ignore
    }
    return Date.now();
  }

  private isStaleCasErrorMessage(msg: unknown): boolean {
    if (typeof msg !== "string") return false;
    return msg.startsWith("Stale request (") || msg.includes("STALE_STATE_VERSION");
  }

  private triggerResync(reason: string): void {
    void reason;
    if (this.resyncInFlight) return;

    this.setTransportStatus("reconnecting");
    this.resyncInFlight = (async () => {
      try {
        const changed = await this.fetchLatest();
        if (changed) this.onRealtimeUpdate?.();
      } catch {
        // ignore; controller layer can surface error if needed
      } finally {
        this.ignoreRealtimeSnapshotsUntilResync = false;
        this.resyncInFlight = null;
      }
    })();
  }

  private enqueueRealtimeSnapshot(snapshot: WireSnapshot): void {
    if (this.ignoreRealtimeSnapshotsUntilResync) return;
    if (this.resyncInFlight) return;

    const now = this.nowMs();
    if (this.burstWindowStartMs === 0 || now - this.burstWindowStartMs > 200) {
      this.burstWindowStartMs = now;
      this.burstCount = 0;
    }
    this.burstCount += 1;

    // If snapshots are arriving very quickly, prefer drop-to-resync.
    if (this.burstCount >= 25) {
      this.pendingRealtimeSnapshot = null;
      if (this.realtimeFlushTimer) {
        clearTimeout(this.realtimeFlushTimer);
        this.realtimeFlushTimer = null;
      }
      this.ignoreRealtimeSnapshotsUntilResync = true;
      this.triggerResync("burst");
      return;
    }

    // Coalesce: keep only latest snapshot.
    this.pendingRealtimeSnapshot = snapshot;
    if (this.realtimeFlushTimer) return;

    // Flush on next tick.
    this.realtimeFlushTimer = setTimeout(() => {
      this.realtimeFlushTimer = null;
      const snap = this.pendingRealtimeSnapshot;
      this.pendingRealtimeSnapshot = null;
      if (!snap) return;
      const applied = this.applySnapshot(snap);
      if (applied.changed) this.onRealtimeUpdate?.();
    }, 0);
  }

  private applySnapshot(snapshot: WireSnapshot): { next: GameState & { didPromote?: boolean }; changed: boolean } {
    const prevHash = this.lastStateHash;
    const prevVersion = this.lastStateVersion;

    const incomingVersion = Number.isFinite((snapshot as any).stateVersion)
      ? Number((snapshot as any).stateVersion)
      : null;

    // Gap/out-of-order handling for versioned snapshots.
    // - Duplicate/out-of-order: ignore
    // - Gap: trigger resync and ignore the snapshot (avoid applying a potentially inconsistent jump)
    if (incomingVersion != null) {
      if (incomingVersion <= prevVersion) {
        return { next: this.state as any, changed: false };
      }
      if (prevVersion >= 0 && incomingVersion > prevVersion + 1) {
        this.triggerResync(`gap ${prevVersion} -> ${incomingVersion}`);
        return { next: this.state as any, changed: false };
      }
    }

    const nextState = deserializeWireGameState(snapshot.state) as GameState & { didPromote?: boolean };
    const h = deserializeWireHistory(snapshot.history);
    this.history.replaceAll(h.states as any, h.notation, h.currentIndex, (h as any).emtMs, (h as any).evals);
    this.state = nextState;
    this.lastStateHash = hashGameState(nextState as any);

    // Server-provided monotonic version is the authoritative change detector.
    // Hash is retained as a fallback for legacy snapshots.
    const nextVersion = incomingVersion != null ? incomingVersion : prevVersion;
    this.lastStateVersion = nextVersion;

    const changed = nextVersion !== prevVersion || this.lastStateHash !== prevHash;
    this.setTransportStatus("connected");
    return { next: nextState, changed };
  }

  async connectFromSnapshot(
    ids: RemoteIds,
    snapshot: WireSnapshot,
    presence?: PresenceByPlayerId | null,
    rules?: RoomRules | null,
    identity?: IdentityByPlayerId | null
  ): Promise<void> {
    this.ids = ids;
    this.lastPresence = presence ?? null;
    this.roomRules = rules ?? this.roomRules;
    this.lastIdentity = identity ?? this.lastIdentity;
    this.applySnapshot(snapshot);
  }

  async fetchLatest(): Promise<boolean> {
    const ids = this.requireIds();
    const res = await this.getJson<GetRoomSnapshotResponse>(`/api/room/${encodeURIComponent(ids.roomId)}?${this.toAccessQuery(ids)}`);
    if ((res as any).error) throw new Error((res as any).error);
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    if ((res as any).rules && typeof (res as any).rules === "object") this.roomRules = (res as any).rules as RoomRules;
    const applied = this.applySnapshot((res as any).snapshot);
    return applied.changed;
  }

  async submitMove(_move: Move): Promise<GameState & { didPromote?: boolean }> {
    const ids = this.requireIds();
    let res: SubmitMoveResponse;
    try {
      res = await this.postJson<SubmitMoveRequest, SubmitMoveResponse>("/api/submitMove", {
        roomId: ids.roomId,
        playerId: ids.playerId,
        move: _move,
        expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
      });
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    const next = this.applySnapshot((res as any).snapshot).next;
    (next as any).didPromote = (res as any).didPromote;
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return next;
  }

  finalizeCaptureChain(
    _args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca" | "damasca_classic"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean } {
    // In online mode, chain finalization must come from the server.
    // Keep interface sync by throwing if called synchronously; use finalizeCaptureChainRemote.
    throw new Error("RemoteDriver.finalizeCaptureChain must be awaited via finalizeCaptureChainRemote()");
  }

  async finalizeCaptureChainRemote(
    args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca" | "damasca_classic"; state: GameState; landing: string }
  ): Promise<GameState & { didPromote?: boolean }> {
    const ids = this.requireIds();
    const req: FinalizeCaptureChainRequest =
      args.rulesetId === "dama"
        ? {
            roomId: ids.roomId,
            playerId: ids.playerId,
            rulesetId: "dama",
            landing: args.landing,
            jumpedSquares: Array.from(args.jumpedSquares),
            expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
          }
        : {
            roomId: ids.roomId,
            playerId: ids.playerId,
            rulesetId: args.rulesetId,
            landing: args.landing,
            expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
          };

    let res: FinalizeCaptureChainResponse;
    try {
      res = await this.postJson<FinalizeCaptureChainRequest, FinalizeCaptureChainResponse>(
        "/api/finalizeCaptureChain",
        req
      );
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    const next = this.applySnapshot((res as any).snapshot).next;
    (next as any).didPromote = (res as any).didPromote;
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return next;
  }

  async endTurnRemote(notation?: string): Promise<GameState> {
    const ids = this.requireIds();
    const req: EndTurnRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      ...(notation ? { notation } : {}),
      expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
    };
    let res: EndTurnResponse;
    try {
      res = await this.postJson<EndTurnRequest, EndTurnResponse>("/api/endTurn", req);
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return this.applySnapshot((res as any).snapshot).next;
  }

  async resignRemote(): Promise<GameState> {
    const ids = this.requireIds();
    const req: ResignRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
    };
    let res: ResignResponse;
    try {
      res = await this.postJson<ResignRequest, ResignResponse>("/api/resign", req);
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return this.applySnapshot((res as any).snapshot).next;
  }

  async claimDrawRemote(args: { kind: "threefold" }): Promise<GameState> {
    const ids = this.requireIds();
    const req: ClaimDrawRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      kind: args.kind,
      expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
    };
    let res: ClaimDrawResponse;
    try {
      res = await this.postJson<ClaimDrawRequest, ClaimDrawResponse>("/api/claimDraw", req);
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return this.applySnapshot((res as any).snapshot).next;
  }

  async offerDrawRemote(): Promise<GameState> {
    const ids = this.requireIds();
    const req: OfferDrawRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
    };
    let res: OfferDrawResponse;
    try {
      res = await this.postJson<OfferDrawRequest, OfferDrawResponse>("/api/offerDraw", req);
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return this.applySnapshot((res as any).snapshot).next;
  }

  async respondDrawOfferRemote(args: { accept: boolean }): Promise<GameState> {
    const ids = this.requireIds();
    const req: RespondDrawOfferRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      accept: Boolean(args.accept),
      expectedStateVersion: this.lastStateVersion >= 0 ? this.lastStateVersion : undefined,
    };
    let res: RespondDrawOfferResponse;
    try {
      res = await this.postJson<RespondDrawOfferRequest, RespondDrawOfferResponse>("/api/respondDrawOffer", req);
    } catch (e) {
      if (this.isStaleCasErrorMessage((e as any)?.message)) {
        try {
          await this.fetchLatest();
        } catch {
          // ignore
        }
      }
      throw e;
    }
    if ((res as any).presence) this.lastPresence = (res as any).presence as PresenceByPlayerId;
    if ((res as any).identity && typeof (res as any).identity === "object") this.lastIdentity = (res as any).identity as IdentityByPlayerId;
    return this.applySnapshot((res as any).snapshot).next;
  }

  canUndo(): boolean {
    return false;
  }

  canRedo(): boolean {
    return false;
  }

  undo(): GameState | null {
    return null;
  }

  redo(): GameState | null {
    return null;
  }

  jumpToHistory(_index: number): GameState | null {
    return null;
  }

  clearHistory(): void {
    this.history.clear();
  }

  pushHistory(state: GameState, notation?: string, emtMs?: number | null): void {
    // In online mode, server is authoritative; local pushes are ignored.
    // We still update local state for UI consistency.
    this.state = state;
    void notation;
    void emtMs;
  }

  replaceHistory(snap: HistorySnapshots): void {
    this.history.replaceAll(snap.states as any, snap.notation, snap.currentIndex, snap.emtMs, snap.evals);
  }

  exportHistorySnapshots(): HistorySnapshots {
    return this.history.exportSnapshots();
  }

  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string; emtMs: number | null }> {
    return this.history.getHistory();
  }

  getHistoryCurrent(): GameState | null {
    return this.history.getCurrent();
  }
}
