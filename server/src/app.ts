import express from "express";
import cors from "cors";
import { secureRandomHex } from "./secureRandom.ts";
import { createServer, type Server } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { applyMove } from "../../src/game/applyMove.ts";
import { finalizeDamaCaptureChain } from "../../src/game/damaCaptureChain.ts";
import { finalizeDamascaCaptureChain } from "../../src/game/damascaCaptureChain.ts";
import { ensureCheckersUsDraw } from "../../src/game/checkersUsDraw.ts";
import { endTurn } from "../../src/game/endTurn.ts";
import { nodeIdToA1 } from "../../src/game/coordFormat.ts";
import { HistoryManager } from "../../src/game/historyManager.ts";
import { checkCurrentPlayerLost } from "../../src/game/gameOver.ts";
import { hashGameState } from "../../src/game/hashState.ts";
import { adjudicateDamascaDeadPlay } from "../../src/game/damascaDeadPlay.ts";
import type { Move } from "../../src/game/moveTypes.ts";
import type { VariantId } from "../../src/variants/variantTypes.ts";

import type {
  ClaimDrawRequest,
  ClaimDrawResponse,
  OfferDrawRequest,
  OfferDrawResponse,
  RespondDrawOfferRequest,
  RespondDrawOfferResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  GetLobbyResponse,
  GetRoomMetaResponse,
  GetRoomWatchTokenResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  LocalSeatPlayerIdsByColor,
  LobbyRoomSummary,
  OnlineBotSeatRequest,
  SubmitMoveRequest,
  SubmitMoveResponse,
  FinalizeCaptureChainRequest,
  FinalizeCaptureChainResponse,
  EndTurnRequest,
  EndTurnResponse,
  GetReplayResponse,
  GetRoomSnapshotResponse,
  PostRoomDebugReportRequest,
  PostRoomDebugReportResponse,
  ReplayEvent,
  ResignRequest,
  ResignResponse,
  RoomId,
  PlayerId,
  PlayerColor,
  PlayerIdentity,
  IdentityByPlayerId,
  PresenceByPlayerId,
  RoomRules,
  RoomVisibility,
  TimeControl,
  ClockState,
} from "../../src/shared/onlineProtocol.ts";

import {
  deserializeWireGameState,
  deserializeWireHistory,
  serializeWireGameState,
  serializeWireHistory,
  type WireSnapshot,
} from "../../src/shared/wireState.ts";

import {
  appendEvent,
  ensureGamesDir,
  eventsPath,
  makeCreatedEvent,
  makeGameOverEvent,
  makeMoveAppliedEvent,
  resolveGamesDir,
  snapshotPath,
  tryLoadRoom,
  writeSnapshotAtomic,
  type PersistedSnapshotFile,
  SUPPORTED_RULES_VERSION,
} from "./persistence.ts";

import type {
  AuthMeResponse,
  AuthOkResponse,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
} from "../../src/shared/authProtocol.ts";
import {
  normalizeCountryCode,
  normalizeTimeZone,
  resolveCountryName,
} from "../../src/shared/profileMetadata.ts";
import {
  createUser,
  ensureAuthDir,
  findUserByEmail,
  findUserById,
  publicUser,
  resolveAuthDir,
  updateUserProfile,
} from "./auth/authStore.ts";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import { SessionStore } from "./auth/sessionStore.ts";
import { clearCookie, parseCookieHeader, setCookie } from "./auth/httpCookies.ts";
import { makeIpRateLimiter } from "./auth/rateLimit.ts";
import { StockfishService } from "./stockfishService.ts";

function avatarsDirPath(authDir: string): string {
  return path.join(authDir, "avatars");
}

function normalizeAvatarContentType(raw: unknown): "image/png" | "image/svg+xml" | null {
  if (typeof raw !== "string") return null;
  const ct = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "image/png") return "image/png";
  if (ct === "image/svg+xml") return "image/svg+xml";
  return null;
}

function avatarExtForContentType(ct: "image/png" | "image/svg+xml"): "png" | "svg" {
  return ct === "image/png" ? "png" : "svg";
}

function isValidAvatarFileId(s: string): boolean {
  // userId is 16 random bytes -> 32 hex chars.
  return /^[0-9a-f]{32}\.(png|svg)$/i.test(s);
}

function isProbablyPng(buf: Buffer): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length < 8) return false;
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function isProbablySvg(buf: Buffer): boolean {
  const s = buf.toString("utf8").trimStart();
  // Allow optional XML prolog.
  if (s.startsWith("<?xml")) {
    const idx = s.indexOf("?>");
    if (idx >= 0) {
      const rest = s.slice(idx + 2).trimStart();
      return rest.startsWith("<svg");
    }
  }
  return s.startsWith("<svg");
}

async function writeAvatarFileAtomic(args: {
  authDir: string;
  userId: string;
  ext: "png" | "svg";
  bytes: Buffer;
}): Promise<void> {
  const dir = avatarsDirPath(args.authDir);
  await fs.mkdir(dir, { recursive: true });

  const finalPath = path.join(dir, `${args.userId}.${args.ext}`);
  const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}.${secureRandomHex(6)}`;
  await fs.writeFile(tmpPath, args.bytes);
  await fs.rename(tmpPath, finalPath);

  // Remove the other extension if it exists.
  const otherExt: "png" | "svg" = args.ext === "png" ? "svg" : "png";
  const otherPath = path.join(dir, `${args.userId}.${otherExt}`);
  try {
    await fs.rm(otherPath, { force: true });
  } catch {
    // ignore
  }
}

type Room = {
  roomId: RoomId;
  history: HistoryManager;
  state: any;
  createdAtIso: string;
  creatorPlayerId: PlayerId;
  players: Map<PlayerId, PlayerColor>;
  colorsTaken: Set<PlayerColor>;
  variantId: VariantId;
  visibility: RoomVisibility;
  watchToken: string | null;
  rules: RoomRules;
  stateVersion: number;
  rulesVersion: string;
  lastGameOverVersion: number;
  identity: Map<PlayerId, PlayerIdentity>;
  presence: Map<PlayerId, { connected: boolean; lastSeenAt: string }>;
  disconnectGrace: Map<PlayerId, { graceUntilIso: string; graceUntilMs: number; timer: NodeJS.Timeout }>;
  timeControl: TimeControl;
  clock: ClockState | null;
  /** Serialize all room mutations to avoid races across concurrent HTTP/WS/timer actions. */
  actionChain: Promise<void>;
  persistChain: Promise<void>;
};

type ServerOpts = {
  gamesDir?: string;
  authDir?: string;
  snapshotEvery?: number;
  disconnectGraceMs?: number;
  sessionTtlMs?: number;
  stockfishEngineJs?: string;
};

const randId = () => secureRandomHex(16);

const AUTH_COOKIE_NAME = "lasca.sid";
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function isRequestSecure(req: express.Request): boolean {
  if ((req as any).secure) return true;
  const xfProtoRaw = typeof req.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"] : "";
  const xfProto = xfProtoRaw.split(",")[0]?.trim().toLowerCase();
  if (xfProto === "https") return true;
  return process.env.LASCA_COOKIE_SECURE === "1";
}

function isValidEmail(raw: any): raw is string {
  if (typeof raw !== "string") return false;
  const s = raw.trim();
  if (!s || s.length > 120) return false;
  // Minimal sanity check.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function isValidPassword(raw: any): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length < 8) return false;
  if (raw.length > 200) return false;
  return true;
}

function inferCountryCodeFromHeaders(headers: express.Request["headers"]): string | undefined {
  const raw =
    (typeof headers["cf-ipcountry"] === "string" ? headers["cf-ipcountry"] : "")
    || (typeof headers["cloudfront-viewer-country"] === "string" ? headers["cloudfront-viewer-country"] : "")
    || (typeof headers["x-vercel-ip-country"] === "string" ? headers["x-vercel-ip-country"] : "")
    || (typeof headers["x-country-code"] === "string" ? headers["x-country-code"] : "");
  return normalizeCountryCode(raw);
}

function inferTimeZoneFromHeaders(headers: express.Request["headers"]): string | undefined {
  const raw =
    (typeof headers["cf-timezone"] === "string" ? headers["cf-timezone"] : "")
    || (typeof headers["x-vercel-ip-timezone"] === "string" ? headers["x-vercel-ip-timezone"] : "")
    || (typeof headers["x-time-zone"] === "string" ? headers["x-time-zone"] : "");
  return normalizeTimeZone(raw);
}


function nowIso(): string {
  return new Date().toISOString();
}

function safeUrlForLog(originalUrl: string): string {
  // Redact seat/view capability tokens that may be sent as query params.
  // Keep other params for debuggability (e.g. lobby includeFull).
  try {
    const u = new URL(originalUrl, "http://local");
    for (const key of ["playerId", "watchToken", "guestId"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "<redacted>");
    }
    const qs = u.searchParams.toString();
    return qs ? `${u.pathname}?${qs}` : u.pathname;
  } catch {
    // If parsing fails, avoid logging the raw URL to be safe.
    return "<unparseable-url>";
  }
}

function ensurePresence(room: Room, playerId: PlayerId): { connected: boolean; lastSeenAt: string } {
  const existing = room.presence.get(playerId);
  if (existing) return existing;
  const created = { connected: false, lastSeenAt: nowIso() };
  room.presence.set(playerId, created);
  return created;
}

function sanitizeGuestId(raw: any): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(s)) return undefined;
  return s;
}

function sanitizeDisplayName(raw: any): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 24);
}

function sanitizeProfileAvatarUrl(raw: any): string | undefined {
  if (typeof raw !== "string") return undefined;
  const next = raw.trim();
  if (!next) return undefined;
  return next.slice(0, 300);
}

function sanitizeProfileCountryCode(raw: any): string | undefined {
  return normalizeCountryCode(raw);
}

function sanitizeProfileCountryName(raw: any): string | undefined {
  if (typeof raw !== "string") return undefined;
  const next = raw.trim();
  if (!next) return undefined;
  return next.slice(0, 80);
}

async function resolveAuthenticatedRoomIdentity(args: {
  req: express.Request;
  authDir: string;
}): Promise<Partial<PlayerIdentity>> {
  const auth = (args.req as any).auth as { userId: string } | null;
  if (!auth?.userId) return {};

  const user = await findUserById(args.authDir, auth.userId);
  if (!user) return {};

  return {
    ...(user.displayName ? { displayName: user.displayName } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.countryCode ? { countryCode: user.countryCode } : {}),
    ...(user.countryName ? { countryName: user.countryName } : {}),
  };
}

function ensureIdentity(room: Room, playerId: PlayerId): PlayerIdentity {
  const existing = room.identity.get(playerId);
  if (existing) return existing;
  const created: PlayerIdentity = {};
  room.identity.set(playerId, created);
  return created;
}

function setIdentity(room: Room, playerId: PlayerId, patch: Partial<PlayerIdentity>): void {
  const cur = ensureIdentity(room, playerId);
  if (typeof patch.guestId === "string") cur.guestId = patch.guestId;
  if (typeof patch.displayName === "string") cur.displayName = patch.displayName;
  else if (patch.displayName === null) delete cur.displayName;
  if (typeof patch.avatarUrl === "string") cur.avatarUrl = patch.avatarUrl;
  else if (patch.avatarUrl === null) delete cur.avatarUrl;
  if (typeof patch.countryCode === "string") cur.countryCode = patch.countryCode;
  else if (patch.countryCode === null) delete cur.countryCode;
  if (typeof patch.countryName === "string") cur.countryName = patch.countryName;
  else if (patch.countryName === null) delete cur.countryName;
}

function publicIdentityForRoom(room: Room): IdentityByPlayerId {
  const out: IdentityByPlayerId = {};
  for (const [playerId] of room.players.entries()) {
    const ident = room.identity.get(playerId);
    if (!ident) continue;
    const next: PlayerIdentity = {
      ...(ident.displayName ? { displayName: ident.displayName } : {}),
      ...(ident.avatarUrl ? { avatarUrl: ident.avatarUrl } : {}),
      ...(ident.countryCode ? { countryCode: ident.countryCode } : {}),
      ...(ident.countryName ? { countryName: ident.countryName } : {}),
    };
    if (Object.keys(next).length > 0) out[playerId] = next;
  }
  return out;
}

function displayNameByColorForPlayers(args: {
  players: Iterable<[PlayerId, PlayerColor]>;
  identity: IdentityByPlayerId | null | undefined;
}): Partial<Record<PlayerColor, string>> | undefined {
  if (!args.identity) return undefined;

  const out: Partial<Record<PlayerColor, string>> = {};
  for (const [playerId, color] of args.players) {
    const raw = args.identity[playerId]?.displayName;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) continue;
    out[color] = name;
  }

  return Object.keys(out).length ? out : undefined;
}

function identityByColorForPlayers(args: {
  players: Iterable<[PlayerId, PlayerColor]>;
  identity: IdentityByPlayerId | null | undefined;
}): Partial<Record<PlayerColor, PlayerIdentity>> | undefined {
  if (!args.identity) return undefined;

  const out: Partial<Record<PlayerColor, PlayerIdentity>> = {};
  for (const [playerId, color] of args.players) {
    const ident = args.identity[playerId];
    if (!ident) continue;

    const displayName = typeof ident.displayName === "string" ? ident.displayName.trim() : "";
    const next: PlayerIdentity = {
      ...(displayName ? { displayName } : {}),
      ...(ident.avatarUrl ? { avatarUrl: ident.avatarUrl } : {}),
      ...(ident.countryCode ? { countryCode: ident.countryCode } : {}),
      ...(ident.countryName ? { countryName: ident.countryName } : {}),
    };
    if (!Object.keys(next).length) continue;
    out[color] = next;
  }

  return Object.keys(out).length ? out : undefined;
}

function clearGrace(room: Room, playerId: PlayerId): void {
  const g = room.disconnectGrace.get(playerId);
  if (!g) return;
  clearTimeout(g.timer);
  room.disconnectGrace.delete(playerId);
}

function setPresence(room: Room, playerId: PlayerId, patch: Partial<{ connected: boolean; lastSeenAt: string }>): void {
  const p = ensurePresence(room, playerId);
  if (typeof patch.connected === "boolean") p.connected = patch.connected;
  if (typeof patch.lastSeenAt === "string") p.lastSeenAt = patch.lastSeenAt;
}

function presenceForRoom(room: Room): PresenceByPlayerId {
  const out: PresenceByPlayerId = {};
  for (const [playerId] of room.players.entries()) {
    const p = ensurePresence(room, playerId);
    const g = room.disconnectGrace.get(playerId);
    out[playerId] = {
      connected: p.connected,
      lastSeenAt: p.lastSeenAt,
      ...(g ? { inGrace: true, graceUntil: g.graceUntilIso } : {}),
    };
  }
  return out;
}

function isValidTimeControl(raw: any): raw is TimeControl {
  if (!raw || typeof raw !== "object") return false;
  if (raw.mode === "none") return true;
  if (raw.mode === "clock") {
    const initialMs = Number(raw.initialMs);
    const inc = raw.incrementMs == null ? 0 : Number(raw.incrementMs);
    return Number.isFinite(initialMs) && initialMs > 0 && Number.isFinite(inc) && inc >= 0;
  }
  return false;
}

function nextColor(room: Room): PlayerColor | null {
  // Be defensive: colorsTaken is redundant with players, and can become stale
  // across persistence/back-compat loads. Derive from players to ensure we never
  // assign the same color twice.
  const derived = new Set<PlayerColor>(Array.from(room.players.values()));
  room.colorsTaken = derived;
  if (!derived.has("W")) return "W";
  if (!derived.has("B")) return "B";
  return null;
}

function requirePlayer(room: Room, playerId: PlayerId): PlayerColor {
  const color = room.players.get(playerId);
  if (!color) throw new Error("Invalid player");
  return color;
}

function requireRoomReady(room: Room): void {
  // Enforce: no play until both players have joined.
  // Presence may show disconnected, but the seat still exists; we only require seats.
  if (room.players.size < 2) throw new Error("Waiting for opponent");
}

function snapshotForRoom(room: Room): WireSnapshot {
  return {
    state: serializeWireGameState(room.state),
    history: serializeWireHistory(room.history.exportSnapshots()),
    stateVersion: room.stateVersion,
  };
}

function isValidVisibility(raw: any): raw is RoomVisibility {
  return raw === "public" || raw === "private";
}

function requireRoomView(room: Room, playerId: PlayerId | null, watchToken: string | null): void {
  if (room.visibility !== "private") return;

  // Seated players always have view access.
  if (playerId && room.players.has(playerId)) return;

  // Optional spectator access via a secret watch token.
  if (watchToken && room.watchToken && watchToken === room.watchToken) return;

  throw new Error("Room is private");
}

function parseExpectedVersion(raw: any): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function persistSnapshot(
  gamesDir: string,
  room: Room,
  opts?: { allowCreateRoomDir?: boolean }
): Promise<void> {
  const presenceRecord: Record<PlayerId, { connected: boolean; lastSeenAt: string }> = {};
  for (const [pid, p] of room.presence.entries()) {
    presenceRecord[pid] = { connected: p.connected, lastSeenAt: p.lastSeenAt };
  }
  const graceRecord: Record<PlayerId, { graceUntilIso: string }> = {};
  for (const [pid, g] of room.disconnectGrace.entries()) {
    graceRecord[pid] = { graceUntilIso: g.graceUntilIso };
  }

  const identityRecord: Record<PlayerId, PlayerIdentity> = {};
  for (const [pid, ident] of room.identity.entries()) {
    identityRecord[pid] = {
      ...(ident.guestId ? { guestId: ident.guestId } : {}),
      ...(ident.displayName ? { displayName: ident.displayName } : {}),
      ...(ident.avatarUrl ? { avatarUrl: ident.avatarUrl } : {}),
      ...(ident.countryCode ? { countryCode: ident.countryCode } : {}),
      ...(ident.countryName ? { countryName: ident.countryName } : {}),
    };
  }

  const file: PersistedSnapshotFile = {
    meta: {
      roomId: room.roomId,
      variantId: room.variantId,
      rulesVersion: room.rulesVersion,
      stateVersion: room.stateVersion,
      createdAtIso: room.createdAtIso,
      createdByPlayerId: room.creatorPlayerId,
      players: Array.from(room.players.entries()),
      colorsTaken: Array.from(room.colorsTaken.values()),
      rules: room.rules,
      visibility: room.visibility,
      watchToken: room.watchToken ?? undefined,
      identity: identityRecord,
      presence: presenceRecord,
      disconnectGrace: graceRecord,
      timeControl: room.timeControl,
      clock: room.clock ?? undefined,
    },
    snapshot: snapshotForRoom(room),
  };
  await writeSnapshotAtomic(gamesDir, room.roomId, file, { allowCreateRoomDir: opts?.allowCreateRoomDir });

  if (process.env.LASCA_PERSIST_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] [persist] snapshot room=${room.roomId} v=${room.stateVersion}`);
  }
}

async function persistMoveApplied(args: {
  gamesDir: string;
  room: Room;
  action: "SUBMIT_MOVE" | "FINALIZE_CAPTURE_CHAIN" | "END_TURN";
  move?: any;
  snapshotEvery: number;
}): Promise<void> {
  const snap = snapshotForRoom(args.room);
  await appendEvent(
    args.gamesDir,
    args.room.roomId,
    makeMoveAppliedEvent({
      roomId: args.room.roomId,
      stateVersion: args.room.stateVersion,
      action: args.action,
      move: args.move,
      snapshot: snap,
      players: args.room.players,
      colorsTaken: args.room.colorsTaken,
    })
  );

  if (process.env.LASCA_PERSIST_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] [persist] event MOVE_APPLIED room=${args.room.roomId} v=${args.room.stateVersion}`);
  }

  if (args.room.stateVersion % args.snapshotEvery === 0) {
    await persistSnapshot(args.gamesDir, args.room);
  }
}

async function maybePersistGameOver(gamesDir: string, room: Room): Promise<void> {
  const forced = (room.state as any)?.forcedGameOver;
  const result = checkCurrentPlayerLost(room.state as any);

  const isForced = Boolean(forced?.message);
  const isNormalWin = Boolean(result.winner);
  if (!isForced && !isNormalWin) return;

  // Avoid spamming GAME_OVER on every subsequent action.
  if (room.lastGameOverVersion === room.stateVersion) return;
  room.lastGameOverVersion = room.stateVersion;

  await appendEvent(
    gamesDir,
    room.roomId,
    makeGameOverEvent({
      roomId: room.roomId,
      stateVersion: room.stateVersion,
      winner: (result.winner ?? forced?.winner ?? null) as any,
      reason: (result.reason ?? forced?.message ?? undefined) as any,
    })
  );
  await persistSnapshot(gamesDir, room);
}

export function createLascaApp(opts: ServerOpts = {}): {
  app: express.Express;
  rooms: Map<RoomId, Room>;
  gamesDir: string;
  authDir: string;
  attachWebSockets: (server: Server) => void;
  shutdown: () => Promise<void>;
} {
  const gamesDir = resolveGamesDir(opts.gamesDir);
  const authDir = resolveAuthDir({ gamesDir, authDir: opts.authDir });
  const sessionTtlMs = Number.isFinite(opts.sessionTtlMs as any) ? Number(opts.sessionTtlMs) : DEFAULT_SESSION_TTL_MS;
  const sessions = new SessionStore(sessionTtlMs);
  const snapshotEvery = Math.max(1, Number(opts.snapshotEvery ?? 20));
  const disconnectGraceMs = Math.max(0, Number(opts.disconnectGraceMs ?? 120_000));
  const stockfish = new StockfishService({ engineJsPath: opts.stockfishEngineJs });

  const rooms = new Map<RoomId, Room>();
  const streamClients = new Map<RoomId, Set<express.Response>>();
  const wsClients = new Map<RoomId, Set<WebSocket>>();
  const streamPlayerClients = new Map<RoomId, Map<PlayerId, Set<express.Response>>>();
  const wsPlayerClients = new Map<RoomId, Map<PlayerId, Set<WebSocket>>>();
  const tombstonedRooms = new Set<RoomId>();
  let wss: WebSocketServer | null = null;
  let wsHeartbeat: NodeJS.Timeout | null = null;
  let isShuttingDown = false;

  function readAdminToken(): string {
    return typeof process.env.LASCA_ADMIN_TOKEN === "string" ? process.env.LASCA_ADMIN_TOKEN.trim() : "";
  }

  function isAdminAuthorized(req: express.Request): boolean {
    const token = readAdminToken();
    if (!token) return false;

    const headerRaw =
      (typeof req.headers["x-lasca-admin-token"] === "string" ? req.headers["x-lasca-admin-token"] : "") ||
      (typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"] : "");
    const providedHeader = typeof headerRaw === "string" ? headerRaw.trim() : "";

    const q = typeof req.query.adminToken === "string" ? req.query.adminToken.trim() : "";
    const provided = providedHeader || q;

    return Boolean(provided && provided === token);
  }

  function evictRoomFromMemory(roomId: RoomId): void {
    const room = rooms.get(roomId);
    if (room) {
      // Stop any pending disconnect-grace timers from firing after deletion.
      for (const g of room.disconnectGrace.values()) {
        try {
          clearTimeout(g.timer);
        } catch {
          // ignore
        }
      }
      room.disconnectGrace.clear();
    }

    rooms.delete(roomId);

    // Close SSE clients.
    const sse = streamClients.get(roomId);
    if (sse) {
      for (const res of sse) {
        try {
          res.end();
        } catch {
          // ignore
        }
      }
      streamClients.delete(roomId);
    }

    const sseByPlayer = streamPlayerClients.get(roomId);
    if (sseByPlayer) {
      for (const set of sseByPlayer.values()) {
        for (const res of set) {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
      }
      streamPlayerClients.delete(roomId);
    }

    // Close WS clients.
    const wsSet = wsClients.get(roomId);
    if (wsSet) {
      for (const ws of wsSet) {
        try {
          ws.close(1000, "Room deleted");
        } catch {
          // ignore
        }
      }
      wsClients.delete(roomId);
    }

    const wsByPlayer = wsPlayerClients.get(roomId);
    if (wsByPlayer) {
      for (const set of wsByPlayer.values()) {
        for (const ws of set) {
          try {
            ws.close(1000, "Room deleted");
          } catch {
            // ignore
          }
        }
      }
      wsPlayerClients.delete(roomId);
    }
  }

  function addStreamPlayerClient(roomId: RoomId, playerId: PlayerId, res: express.Response): void {
    const byPlayer = streamPlayerClients.get(roomId) ?? new Map<PlayerId, Set<express.Response>>();
    const set = byPlayer.get(playerId) ?? new Set<express.Response>();
    set.add(res);
    byPlayer.set(playerId, set);
    streamPlayerClients.set(roomId, byPlayer);
  }

  function removeStreamPlayerClient(roomId: RoomId, playerId: PlayerId, res: express.Response): void {
    const byPlayer = streamPlayerClients.get(roomId);
    if (!byPlayer) return;
    const set = byPlayer.get(playerId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) byPlayer.delete(playerId);
    if (byPlayer.size === 0) streamPlayerClients.delete(roomId);
  }

  function addWsPlayerClient(roomId: RoomId, playerId: PlayerId, ws: WebSocket): void {
    const byPlayer = wsPlayerClients.get(roomId) ?? new Map<PlayerId, Set<WebSocket>>();
    const set = byPlayer.get(playerId) ?? new Set<WebSocket>();
    set.add(ws);
    byPlayer.set(playerId, set);
    wsPlayerClients.set(roomId, byPlayer);
  }

  function removeWsPlayerClient(roomId: RoomId, playerId: PlayerId, ws: WebSocket): void {
    const byPlayer = wsPlayerClients.get(roomId);
    if (!byPlayer) return;
    const set = byPlayer.get(playerId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) byPlayer.delete(playerId);
    if (byPlayer.size === 0) wsPlayerClients.delete(roomId);
  }

  function isPlayerConnectedByAnyTransport(roomId: RoomId, playerId: PlayerId): boolean {
    const wsByPlayer = wsPlayerClients.get(roomId);
    const wsCount = wsByPlayer?.get(playerId)?.size ?? 0;
    if (wsCount > 0) return true;
    const sseByPlayer = streamPlayerClients.get(roomId);
    const sseCount = sseByPlayer?.get(playerId)?.size ?? 0;
    return sseCount > 0;
  }

  function anyOtherSeatedPlayerConnected(room: Room, playerId: PlayerId): boolean {
    for (const [pid] of room.players.entries()) {
      if (pid === playerId) continue;
      if (room.presence.get(pid)?.connected) return true;
    }
    return false;
  }

  function scheduleGraceTimeout(room: Room, playerId: PlayerId, graceUntilMs: number): NodeJS.Timeout {
    const delay = Math.max(0, graceUntilMs - Date.now());
    return setTimeout(() => {
      if (isShuttingDown) return;
      if (tombstonedRooms.has(room.roomId)) return;

      void queueRoomAction(room, async () => {
        if (isShuttingDown) return;

        // If reconnected, clear grace and return.
        const p = room.presence.get(playerId);
        if (!p || p.connected) {
          clearGrace(room, playerId);
          updateClockPause(room);
          return;
        }

        // If the opponent is still connected, the disconnected player forfeits.
        // If both players are disconnected, extend grace indefinitely (mutual pause).
        if (anyOtherSeatedPlayerConnected(room, playerId)) {
          clearGrace(room, playerId);
          await forceDisconnectTimeout({ gamesDir, room, disconnectedPlayerId: playerId });
          return;
        }

        // Mutual disconnect: extend grace.
        const nextUntilMs = Date.now() + disconnectGraceMs;
        const nextUntilIso = new Date(nextUntilMs).toISOString();
        const g = room.disconnectGrace.get(playerId);
        if (!g) return;

        clearTimeout(g.timer);
        g.graceUntilMs = nextUntilMs;
        g.graceUntilIso = nextUntilIso;
        g.timer = scheduleGraceTimeout(room, playerId, nextUntilMs);

        updateClockPause(room);
        await queuePersist(room);
        broadcastRoomSnapshot(room);
      });
    }, delay);
  }

  function queuePersist(room: Room): Promise<void> {
    if (isShuttingDown) return Promise.resolve();
    if (tombstonedRooms.has(room.roomId)) return Promise.resolve();
    room.persistChain = room.persistChain
      .then(() => persistSnapshot(gamesDir, room))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[lasca-server] persistSnapshot error", err);
      });
    return room.persistChain;
  }

  function queueRoomAction<T>(room: Room, fn: () => Promise<T>): Promise<T> {
    if (isShuttingDown) return Promise.reject(new Error("Server shutting down"));

    // Chain actions so at most one runs at a time per room.
    const prev = room.actionChain;
    let resolveNext: (() => void) | null = null;
    room.actionChain = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    return prev
      .catch(() => undefined)
      .then(fn)
      .finally(() => {
        try {
          resolveNext?.();
        } catch {
          // ignore
        }
      });
  }

  function streamWrite(res: express.Response, eventName: string, payload: unknown): void {
    // SSE format: each message ends with a blank line
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function broadcastRoomEvent(roomId: RoomId, eventName: string, payload: unknown): void {
    const clients = streamClients.get(roomId);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      try {
        streamWrite(res, eventName, payload);
      } catch {
        // Ignore write failures; cleanup happens on close.
      }
    }
  }

  function broadcastRoomSnapshot(room: Room): void {
      const identity = publicIdentityForRoom(room);
      const identityByColor = identityByColorForPlayers({ players: room.players.entries(), identity });
      const payload = {
      roomId: room.roomId,
      snapshot: snapshotForRoom(room),
      presence: presenceForRoom(room),
        identity: Object.keys(identity).length > 0 ? identity : undefined,
        identityByColor: identityByColor && Object.keys(identityByColor).length > 0 ? identityByColor : undefined,
      rules: room.rules,
      timeControl: room.timeControl,
      clock: room.clock ?? undefined,
    };

    broadcastRoomEvent(room.roomId, "snapshot", payload);

    const sockets = wsClients.get(room.roomId);
    if (!sockets || sockets.size === 0) return;
    const msg = JSON.stringify({ event: "snapshot", payload });
    for (const ws of sockets) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      } catch {
        // ignore; cleanup on close
      }
    }
  }

  function removeWsClient(roomId: RoomId, ws: WebSocket): void {
    const set = wsClients.get(roomId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) wsClients.delete(roomId);
  }

  function attachWebSockets(server: Server): void {
    if (wss) return;

    wss = new WebSocketServer({ server, path: "/api/ws" });

    type WsConnState = {
      roomId: RoomId | null;
      playerId: PlayerId | null;
    };

    wss.on("connection", (ws: WebSocket) => {
      const state: WsConnState = { roomId: null, playerId: null };
      (ws as any).isAlive = true;

      ws.on("pong", () => {
        (ws as any).isAlive = true;
      });

      const joinTimeout = setTimeout(() => {
        try {
          if (!state.roomId) ws.close(1008, "JOIN required");
        } catch {
          // ignore
        }
      }, 5_000);

      ws.on("message", async (raw: RawData) => {
        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf8");
          const msg = JSON.parse(text) as any;

          if (msg?.type !== "JOIN") return;
          const roomId = typeof msg.roomId === "string" ? (msg.roomId as RoomId) : null;
          const playerId = typeof msg.playerId === "string" ? (msg.playerId as PlayerId) : null;
          if (!roomId) throw new Error("Missing roomId");

          // Re-join: move socket between rooms.
          if (state.roomId && state.roomId !== roomId) {
            removeWsClient(state.roomId, ws);
            if (state.playerId) {
              removeWsPlayerClient(state.roomId, state.playerId, ws);
            }

            const prevRoom = rooms.get(state.roomId);
            if (prevRoom && state.playerId && prevRoom.players.has(state.playerId)) {
              const prevPlayerId = state.playerId;
              // Only mark disconnected if this was the last connection.
              if (!isPlayerConnectedByAnyTransport(state.roomId, state.playerId)) {
                void queueRoomAction(prevRoom, async () => {
                  touchClock(prevRoom);
                  await maybeForceClockTimeout(prevRoom);
                  setPresence(prevRoom, prevPlayerId, { connected: false, lastSeenAt: nowIso() });
                  await startGraceIfNeeded(prevRoom, prevPlayerId);
                });
              }
            }
          }

          state.roomId = roomId;
          state.playerId = playerId;

          const room = await requireRoom(roomId);

          // Track room membership
          const set = wsClients.get(roomId) ?? new Set<WebSocket>();
          set.add(ws);
          wsClients.set(roomId, set);

          // Presence/clock behavior mirrors SSE stream behavior.
          if (playerId && room.players.has(playerId)) {
            addWsPlayerClient(roomId, playerId, ws);
            await queueRoomAction(room, async () => {
              touchClock(room);
              await maybeForceClockTimeout(room);
              setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
              clearGrace(room, playerId);
              updateClockPause(room);
              await persistSnapshot(gamesDir, room);
            });
          }

          // Send initial snapshot (authoritative) to this socket.
          const payload = {
            roomId,
            snapshot: snapshotForRoom(room),
            presence: presenceForRoom(room),
            timeControl: room.timeControl,
            clock: room.clock ?? undefined,
          };
          ws.send(JSON.stringify({ event: "snapshot", payload }));

          // Notify others that presence changed.
          if (playerId && room.players.has(playerId)) {
            broadcastRoomSnapshot(room);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "JOIN failed";
          try {
            ws.send(JSON.stringify({ event: "error", payload: { message } }));
          } catch {
            // ignore
          }
        }
      });

      ws.on("close", () => {
        clearTimeout(joinTimeout);
        const roomId = state.roomId;
        if (roomId) removeWsClient(roomId, ws);
        if (isShuttingDown) return;

        const playerId = state.playerId;
        if (!roomId || !playerId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        if (!room.players.has(playerId)) return;

        removeWsPlayerClient(roomId, playerId, ws);

        // If there is still another live connection for this player (e.g., another tab),
        // do NOT mark them disconnected or start grace.
        if (isPlayerConnectedByAnyTransport(roomId, playerId)) return;

        void queueRoomAction(room, async () => {
          touchClock(room);
          await maybeForceClockTimeout(room);
          setPresence(room, playerId, { connected: false, lastSeenAt: nowIso() });
          await startGraceIfNeeded(room, playerId);
        });
      });

      ws.on("error", () => {
        // ignore; close handler will do cleanup
      });
    });

    // Heartbeat to detect dead connections (needed for MP2 presence/grace).
    wsHeartbeat = setInterval(() => {
      if (!wss) return;
      for (const ws of wss.clients) {
        const alive = Boolean((ws as any).isAlive);
        if (!alive) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          continue;
        }
        (ws as any).isAlive = false;
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }
    }, 15_000);
  }

  async function requireRoom(roomId: RoomId): Promise<Room> {
    if (tombstonedRooms.has(roomId)) throw new Error("Room deleted");
    const existing = rooms.get(roomId);
    if (existing) return existing;

    const loaded = await tryLoadRoom(gamesDir, roomId);
    if (!loaded) throw new Error("Room not found");

    if (process.env.LASCA_PERSIST_LOG === "1") {
      // eslint-disable-next-line no-console
      console.log(`[lasca-server] [persist] loaded room ${roomId} from disk (stateVersion=${loaded.meta.stateVersion})`);
    }

    if (loaded.meta.rulesVersion !== SUPPORTED_RULES_VERSION) {
      throw new Error("Unsupported rules version for replay");
    }

    const loadedPresence = (loaded.meta as any).presence as Record<string, { connected: boolean; lastSeenAt: string }> | undefined;
    const loadedGrace = (loaded.meta as any).disconnectGrace as Record<string, { graceUntilIso: string }> | undefined;
    const loadedIdentityRaw = (loaded.meta as any).identity as Record<string, PlayerIdentity> | undefined;
    const loadedTimeControlRaw = (loaded.meta as any).timeControl;
    const loadedTimeControl: TimeControl = isValidTimeControl(loadedTimeControlRaw) ? loadedTimeControlRaw : { mode: "none" };
    const loadedClock = ((loaded.meta as any).clock as ClockState | undefined) ?? null;
    const loadedVisibility: RoomVisibility = isValidVisibility((loaded.meta as any).visibility) ? ((loaded.meta as any).visibility as any) : "public";
    const loadedWatchToken = typeof (loaded.meta as any).watchToken === "string" && (loaded.meta as any).watchToken
      ? String((loaded.meta as any).watchToken)
      : null;

    const loadedCreatedAtIsoRaw = (loaded.meta as any).createdAtIso;
    const loadedCreatedAtIso = typeof loadedCreatedAtIsoRaw === "string" && loadedCreatedAtIsoRaw.trim()
      ? String(loadedCreatedAtIsoRaw)
      : nowIso();

    const loadedCreatorRaw = (loaded.meta as any).createdByPlayerId;
    const fallbackCreator = Array.isArray((loaded.meta as any)?.players) && (loaded.meta as any).players.length
      ? (loaded.meta as any).players[0]?.[0]
      : null;
    const loadedCreatorPlayerId = typeof loadedCreatorRaw === "string" && loadedCreatorRaw.trim()
      ? (loadedCreatorRaw as any)
      : (typeof fallbackCreator === "string" && fallbackCreator.trim() ? (fallbackCreator as any) : (loaded.players.keys().next().value as any));

    const loadedRulesRaw = (loaded.meta as any).rules;
    const loadedRules: RoomRules = {
      drawByThreefold:
        typeof loadedRulesRaw?.drawByThreefold === "boolean" ? Boolean(loadedRulesRaw.drawByThreefold) : true,
    };

    const room: Room = {
      roomId,
      state: loaded.state,
      history: loaded.history,
      createdAtIso: loadedCreatedAtIso,
      creatorPlayerId: loadedCreatorPlayerId,
      players: loaded.players,
      colorsTaken: loaded.colorsTaken,
      variantId: loaded.meta.variantId as any,
      visibility: loadedVisibility,
      watchToken: loadedWatchToken,
      rules: loadedRules,
      stateVersion: loaded.meta.stateVersion,
      rulesVersion: loaded.meta.rulesVersion,
      lastGameOverVersion: -1,
      identity: new Map(),
      presence: new Map(),
      disconnectGrace: new Map(),
      timeControl: loadedTimeControl,
      clock: loadedTimeControl.mode === "clock" ? loadedClock : null,
      actionChain: Promise.resolve(),
      persistChain: Promise.resolve(),
    };

    // Repair any stale colorsTaken from older snapshots.
    room.colorsTaken = new Set<PlayerColor>(Array.from(room.players.values()));

    // Restore identity (informational only).
    for (const [playerId] of room.players.entries()) {
      const raw = loadedIdentityRaw?.[playerId];
      const guestId = sanitizeGuestId((raw as any)?.guestId);
      const displayName = sanitizeDisplayName((raw as any)?.displayName);
      const avatarUrl = sanitizeProfileAvatarUrl((raw as any)?.avatarUrl);
      const countryCode = sanitizeProfileCountryCode((raw as any)?.countryCode);
      const countryName = sanitizeProfileCountryName((raw as any)?.countryName);
      if (guestId || displayName || avatarUrl || countryCode || countryName) {
        setIdentity(room, playerId, {
          ...(guestId ? { guestId } : {}),
          ...(displayName ? { displayName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(countryCode ? { countryCode } : {}),
          ...(countryName ? { countryName } : {}),
        });
      }
    }

    // Restore presence (but server restart means no active connections).
    for (const [playerId] of room.players.entries()) {
      const saved = loadedPresence?.[playerId];
      setPresence(room, playerId, {
        connected: false,
        lastSeenAt: typeof saved?.lastSeenAt === "string" ? saved.lastSeenAt : nowIso(),
      });
    }
    rooms.set(roomId, room);

    // Restore grace timers.
    const graceMs = Math.max(0, Number(opts.disconnectGraceMs ?? 120_000));
    if (loadedGrace && graceMs > 0) {
      for (const [pid, g] of Object.entries(loadedGrace)) {
        if (!room.players.has(pid as any)) continue;
        const graceUntilMs = Date.parse(g.graceUntilIso);
        if (!Number.isFinite(graceUntilMs)) continue;
        // Only restore grace if player is disconnected.
        if (room.presence.get(pid as any)?.connected) continue;

        const timer = scheduleGraceTimeout(room, pid as any, graceUntilMs);
        room.disconnectGrace.set(pid as any, { graceUntilIso: g.graceUntilIso, graceUntilMs, timer });
      }
    }

    // If any grace is active, clocks should start paused.
    if (room.clock) {
      room.clock.lastTickMs = Date.now();
      // Restore pause state (disconnect grace OR pending draw offer).
      updateClockPause(room);
    }

    return room;
  }

  function touchClock(room: Room): void {
    if (!room.clock) return;
    const now = Date.now();
    const elapsed = Math.max(0, now - room.clock.lastTickMs);
    room.clock.lastTickMs = now;
    if (room.clock.paused) return;

    const active = room.clock.active;
    const next = Math.max(0, Number(room.clock.remainingMs[active] ?? 0) - elapsed);
    room.clock.remainingMs[active] = next;
  }

  function updateClockPause(room: Room): void {
    if (!room.clock) return;
    const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";
    const hasPendingDrawOffer =
      rulesetId === "checkers_us" && Boolean((room.state as any)?.checkersUsDraw?.pendingOffer);
    const shouldPause = room.disconnectGrace.size > 0 || hasPendingDrawOffer;
    if (room.clock.paused === shouldPause) return;
    // Settle time up to the transition point.
    touchClock(room);
    room.clock.paused = shouldPause;
    room.clock.lastTickMs = Date.now();
  }

  function requireNoPendingDrawOffer(room: Room): void {
    const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";
    if (rulesetId === "checkers_us") {
      if (Boolean((room.state as any)?.checkersUsDraw?.pendingOffer)) {
        throw new Error("Draw offer pending");
      }
    } else {
      if (Boolean((room.state as any)?.pendingDrawOffer)) {
        throw new Error("Draw offer pending");
      }
    }
  }

  function onTurnSwitch(room: Room, prevToMove: PlayerColor, nextToMove: PlayerColor): void {
    if (!room.clock) return;
    if (prevToMove === nextToMove) return;
    const inc = room.timeControl.mode === "clock" ? Number(room.timeControl.incrementMs ?? 0) : 0;
    if (inc > 0) {
      room.clock.remainingMs[prevToMove] = Number(room.clock.remainingMs[prevToMove] ?? 0) + inc;
    }
    room.clock.active = nextToMove;
    room.clock.lastTickMs = Date.now();
  }

  function isRoomOver(room: Room): boolean {
    return Boolean((room.state as any)?.forcedGameOver?.message);
  }

  function maybeApplyDamascaThreefold(room: Room): void {
    if (isRoomOver(room)) return;
    const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";
    if (rulesetId !== "damasca" && rulesetId !== "damasca_classic") return;

    const snap = room.history.exportSnapshots();
    const end = snap.currentIndex;
    if (end < 0 || end >= snap.states.length) return;

    const current = snap.states[end];
    const h = hashGameState(current as any);
    let count = 0;
    for (let i = 0; i <= end && i < snap.states.length; i++) {
      if (hashGameState(snap.states[i] as any) === h) count++;
    }
    if (count < 3) return;

    room.state = adjudicateDamascaDeadPlay(room.state as any, "DAMASCA_THREEFOLD_REPETITION", "threefold repetition");

    // Ensure history's current entry reflects the adjudicated state.
    const snap2 = room.history.exportSnapshots();
    if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
      snap2.states[snap2.currentIndex] = room.state as any;
      room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
    }
  }

  function maybeApplyCheckersUsThreefold(room: Room): void {
    if (isRoomOver(room)) return;
    const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";
    if (rulesetId !== "checkers_us") return;

    const count = repetitionCountForCurrentPosition(room);
    if (count < 3) return;

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner: null,
        reasonCode: "THREEFOLD_REPETITION",
        message: "Draw by threefold repetition",
      },
    };

    // Ensure history's current entry reflects the adjudicated state.
    const snap2 = room.history.exportSnapshots();
    if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
      snap2.states[snap2.currentIndex] = room.state as any;
      room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
    }
  }

  function repetitionCountForCurrentPosition(room: Room): number {
    const snap = room.history.exportSnapshots();
    const end = snap.currentIndex;
    if (end < 0 || end >= snap.states.length) return 0;
    const current = snap.states[end];
    const h = hashGameState(current as any);
    let count = 0;
    for (let i = 0; i <= end && i < snap.states.length; i++) {
      if (hashGameState(snap.states[i] as any) === h) count++;
    }
    return count;
  }

  function maybeApplyFivefoldRepetition(room: Room): void {
    if (isRoomOver(room)) return;
    const count = repetitionCountForCurrentPosition(room);
    if (count < 5) return;

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner: null,
        reasonCode: "FIVEFOLD_REPETITION",
        message: "Draw by fivefold repetition",
      },
    };

    // Ensure history's current entry reflects the adjudicated state.
    const snap2 = room.history.exportSnapshots();
    if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
      snap2.states[snap2.currentIndex] = room.state as any;
      room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
    }
  }

  async function forceDisconnectTimeout(args: { gamesDir: string; room: Room; disconnectedPlayerId: PlayerId }): Promise<void> {
    if (isShuttingDown) return;
    const { room, disconnectedPlayerId } = args;
    if (isRoomOver(room)) return;

    const disconnectedColor = room.players.get(disconnectedPlayerId);
    if (!disconnectedColor) return;
    const winner: PlayerColor = disconnectedColor === "W" ? "B" : "W";
    const winnerName = winner === "W" ? "White" : "Black";

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner,
        reasonCode: "DISCONNECT_TIMEOUT",
        message: `${winnerName} wins — disconnect timeout`,
      },
    };

    room.stateVersion += 1;
    try {
      await appendEvent(
        args.gamesDir,
        room.roomId,
        makeGameOverEvent({
          roomId: room.roomId,
          stateVersion: room.stateVersion,
          winner,
          reason: "DISCONNECT_TIMEOUT",
        })
      );
      await persistSnapshot(args.gamesDir, room);
    } catch (err) {
      // Persistence is best-effort; in tests the data dir may be deleted while the grace timer is running.
      // eslint-disable-next-line no-console
      console.error("[lasca-server] forceDisconnectTimeout persist error", err);
    }
    broadcastRoomSnapshot(room);
  }

  async function maybeForceClockTimeout(room: Room): Promise<void> {
    if (!room.clock) return;
    if (isRoomOver(room)) return;
    if (room.timeControl.mode !== "clock") return;

    const active = room.clock.active;
    const remaining = Number(room.clock.remainingMs[active] ?? 0);
    if (remaining > 0) return;

    const winner: PlayerColor = active === "W" ? "B" : "W";
    const winnerName = winner === "W" ? "White" : "Black";

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner,
        reasonCode: "TIMEOUT",
        message: `${winnerName} wins — time out`,
      },
    };

    room.stateVersion += 1;
    await appendEvent(
      gamesDir,
      room.roomId,
      makeGameOverEvent({
        roomId: room.roomId,
        stateVersion: room.stateVersion,
        winner,
        reason: "TIMEOUT",
      })
    );
    await queuePersist(room);
    broadcastRoomSnapshot(room);
  }

  async function startGraceIfNeeded(room: Room, playerId: PlayerId): Promise<void> {
    if (isShuttingDown) return;
    if (disconnectGraceMs <= 0) return;
    if (isRoomOver(room)) return;
    if (!room.players.has(playerId)) return;
    if (room.presence.get(playerId)?.connected) return;
    if (room.disconnectGrace.has(playerId)) return;

    const graceUntilMs = Date.now() + disconnectGraceMs;
    const graceUntilIso = new Date(graceUntilMs).toISOString();
    const timer = scheduleGraceTimeout(room, playerId, graceUntilMs);

    room.disconnectGrace.set(playerId, { graceUntilIso, graceUntilMs, timer });
    updateClockPause(room);
    // Persist grace start so it survives restart.
    await queuePersist(room);
    broadcastRoomSnapshot(room);
  }

  function getOpponentId(room: Room, selfId: PlayerId): PlayerId | null {
    for (const [pid] of room.players.entries()) {
      if (pid !== selfId) return pid;
    }
    return null;
  }

  async function requireOpponentConnected(room: Room, selfId: PlayerId): Promise<void> {
    // We only enforce this once both seats are filled.
    // Before that, the existing requireRoomReady() errors are more helpful.
    if (room.players.size < 2) return;

    const opponentId = getOpponentId(room, selfId);
    if (!opponentId) return;

    const oppPresence = ensurePresence(room, opponentId);
    if (oppPresence.connected) return;

    // Be defensive: if for any reason grace wasn't started by the transport close handler,
    // start it on-demand so clients can show an accurate countdown.
    await startGraceIfNeeded(room, opponentId);
    const g = room.disconnectGrace.get(opponentId);
    if (g) {
      throw new Error(`Opponent disconnected (grace until ${g.graceUntilIso})`);
    }

    throw new Error("Opponent disconnected");
  }

  const app = express();
  // Reflect the request origin to keep browser fetch happy across dev modes
  // (including file:// where Origin can be "null").
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin ?? true),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  // Attach auth session (cookie-based). Session state is currently in-memory.
  app.use((req, _res, next) => {
    try {
      const cookies = parseCookieHeader(typeof req.headers.cookie === "string" ? req.headers.cookie : undefined);
      const sid = cookies[AUTH_COOKIE_NAME];
      const session = sid ? sessions.get(String(sid)) : null;
      (req as any).auth = session ? { userId: session.userId, sessionId: session.sessionId } : null;
    } catch {
      (req as any).auth = null;
    }
    next();
  });

  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] ${req.method} ${safeUrlForLog(req.originalUrl || req.url || req.path)}`);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/stockfish/health", async (_req, res) => {
    try {
      await stockfish.init(60_000);
      const health = stockfish.getHealth();
      if (!health.ok) {
        res.status(503).json(health);
        return;
      }
      res.json(health);
    } catch (err) {
      const health = stockfish.getHealth();
      const msg = err instanceof Error ? err.message : "Stockfish health failed";
      res.status(503).json({ ...health, ok: false, error: msg });
    }
  });

  app.post("/api/stockfish/bestmove", async (req, res) => {
    try {
      const fen = typeof req.body?.fen === "string" ? req.body.fen : "";
      const movetimeMs = Number(req.body?.movetimeMs);
      const skill = Number.isFinite(req.body?.skill) ? Number(req.body.skill) : undefined;
      const timeoutMs = Number.isFinite(req.body?.timeoutMs) ? Number(req.body.timeoutMs) : undefined;

      if (!fen.trim() || !Number.isFinite(movetimeMs) || movetimeMs <= 0) {
        throw new Error("missing fen or movetimeMs");
      }

      const uci = await stockfish.bestMove({ fen, movetimeMs, skill, timeoutMs });
      res.json({ ok: true, uci });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stockfish bestmove failed";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/stockfish/evaluate", async (req, res) => {
    try {
      const fen = typeof req.body?.fen === "string" ? req.body.fen : "";
      const movetimeMs = Number.isFinite(req.body?.movetimeMs) ? Number(req.body.movetimeMs) : 200;
      const timeoutMs = Number.isFinite(req.body?.timeoutMs) ? Number(req.body.timeoutMs) : undefined;

      if (!fen.trim()) {
        throw new Error("missing fen");
      }

      const score = await stockfish.evaluate({ fen, movetimeMs, timeoutMs });
      if (!score) {
        res.json({ ok: false, error: "no score" });
        return;
      }
      res.json({ ok: true, ...score });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stockfish evaluate failed";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // MP4C: accounts + cookie sessions (authn/authz).
  // Minimal endpoints: register/login/logout/me + profile update.
  const authLimiter = makeIpRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "auth" });

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const body = req.body as RegisterRequest;
      if (!isValidEmail(body?.email)) throw new Error("Invalid email");
      if (!isValidPassword(body?.password)) throw new Error("Invalid password");

      const displayName = sanitizeDisplayName(body?.displayName) ?? "Player";
      const countryCode = normalizeCountryCode(body?.countryCode) ?? inferCountryCodeFromHeaders(req.headers);
      const countryName = countryCode ? resolveCountryName(countryCode) ?? undefined : undefined;
      const timeZone = normalizeTimeZone(body?.timeZone) ?? inferTimeZoneFromHeaders(req.headers);
      const pw = await hashPassword(String(body.password));
      const user = await createUser({
        authDir,
        email: body.email,
        password: pw,
        displayName,
        ...(countryCode ? { countryCode } : {}),
        ...(countryName ? { countryName } : {}),
        ...(timeZone ? { timeZone } : {}),
      });

      const secure = isRequestSecure(req);
      const sameSite = secure ? "None" : "Lax";
      const session = sessions.create(user.userId);
      setCookie({
        res,
        name: AUTH_COOKIE_NAME,
        value: session.sessionId,
        maxAgeSeconds: Math.floor(sessionTtlMs / 1000),
        secure,
        sameSite,
      });

      const response: AuthOkResponse = { ok: true, user: publicUser(user) };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Register failed";
      res.status(400).json({ error: msg });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const body = req.body as LoginRequest;
      if (!isValidEmail(body?.email)) throw new Error("Invalid email");
      if (!isValidPassword(body?.password)) throw new Error("Invalid password");

      const user = await findUserByEmail(authDir, body.email);
      if (!user) throw new Error("Invalid credentials");
      const ok = await verifyPassword(String(body.password), user.password);
      if (!ok) throw new Error("Invalid credentials");

      const secure = isRequestSecure(req);
      const sameSite = secure ? "None" : "Lax";
      const session = sessions.create(user.userId);
      setCookie({
        res,
        name: AUTH_COOKIE_NAME,
        value: session.sessionId,
        maxAgeSeconds: Math.floor(sessionTtlMs / 1000),
        secure,
        sameSite,
      });

      const response: AuthOkResponse = { ok: true, user: publicUser(user) };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      res.status(400).json({ error: msg });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    try {
      const auth = (req as any).auth as { sessionId: string } | null;
      if (auth?.sessionId) sessions.delete(auth.sessionId);
      clearCookie(res, AUTH_COOKIE_NAME);
      res.json({ ok: true });
    } catch {
      clearCookie(res, AUTH_COOKIE_NAME);
      res.json({ ok: true });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const auth = (req as any).auth as { userId: string } | null;
      if (!auth?.userId) {
        const response: AuthMeResponse = { ok: true, user: null };
        res.json(response);
        return;
      }

      const user = await findUserById(authDir, auth.userId);
      if (!user) {
        const response: AuthMeResponse = { ok: true, user: null };
        res.json(response);
        return;
      }

      const response: AuthMeResponse = { ok: true, user: publicUser(user) };
      res.json(response);
    } catch {
      const response: AuthMeResponse = { ok: true, user: null };
      res.json(response);
    }
  });

  app.patch("/api/auth/me", authLimiter, async (req, res) => {
    try {
      const auth = (req as any).auth as { userId: string } | null;
      if (!auth?.userId) throw new Error("Not authenticated");

      const body = req.body as UpdateProfileRequest;
      const displayName = body?.displayName != null ? sanitizeDisplayName(body.displayName) : undefined;
      const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl : undefined;
      const countryCode = body?.countryCode != null
        ? (body.countryCode.trim() ? normalizeCountryCode(body.countryCode) : "")
        : undefined;
      if (body?.countryCode != null && body.countryCode.trim() && !countryCode) {
        throw new Error("Invalid countryCode");
      }
      const timeZone = body?.timeZone != null
        ? (body.timeZone.trim() ? normalizeTimeZone(body.timeZone) : "")
        : undefined;
      if (body?.timeZone != null && body.timeZone.trim() && !timeZone) {
        throw new Error("Invalid timeZone");
      }

      const updated = await updateUserProfile({
        authDir,
        userId: auth.userId,
        displayName,
        avatarUrl,
        ...(body?.countryCode != null ? { countryCode: countryCode ?? "" } : {}),
        ...(countryCode ? { countryName: resolveCountryName(countryCode) ?? countryCode } : {}),
        ...(body?.timeZone != null ? { timeZone: timeZone ?? "" } : {}),
      });
      const response: AuthOkResponse = { ok: true, user: publicUser(updated) };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      res.status(400).json({ error: msg });
    }
  });

  // MP4C: avatar upload (PNG or SVG). Stores under authDir/avatars and updates user.avatarUrl.
  // Uses a raw body so we don't need multipart parsing.
  app.put(
    "/api/auth/me/avatar",
    authLimiter,
    express.raw({ type: ["image/png", "image/svg+xml"], limit: "512kb" }),
    async (req, res) => {
      try {
        const auth = (req as any).auth as { userId: string } | null;
        if (!auth?.userId) throw new Error("Not authenticated");

        const ct = normalizeAvatarContentType(req.headers["content-type"]);
        if (!ct) {
          res.status(415).json({ error: "Unsupported avatar content-type (use image/png or image/svg+xml)" });
          return;
        }

        const bytes = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from([]);
        if (!bytes.length) throw new Error("Missing avatar bytes");

        if (ct === "image/png" && !isProbablyPng(bytes)) {
          throw new Error("Invalid PNG file");
        }
        if (ct === "image/svg+xml" && !isProbablySvg(bytes)) {
          throw new Error("Invalid SVG file");
        }

        const ext = avatarExtForContentType(ct);
        await writeAvatarFileAtomic({ authDir, userId: auth.userId, ext, bytes });

        // Store a relative URL; clients can prefix with their configured server base.
        const avatarUrl = `/api/auth/avatar/${auth.userId}.${ext}?v=${Date.now()}`;
        const updated = await updateUserProfile({ authDir, userId: auth.userId, avatarUrl });
        const response: AuthOkResponse = { ok: true, user: publicUser(updated) };
        res.json(response);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Avatar upload failed";
        res.status(400).json({ error: msg });
      }
    }
  );

  // Serve avatar files (public). Path is `:userId.(png|svg)`.
  app.get("/api/auth/avatar/:fileId", async (req, res) => {
    try {
      const fileId = String(req.params.fileId || "");
      if (!isValidAvatarFileId(fileId)) {
        res.status(400).json({ error: "Invalid avatar id" });
        return;
      }

      const dir = avatarsDirPath(authDir);
      const p = path.join(dir, fileId);
      const ext = fileId.toLowerCase().endsWith(".png") ? "png" : "svg";
      const ct = ext === "png" ? "image/png" : "image/svg+xml";

      const bytes = await fs.readFile(p);
      res.setHeader("content-type", ct);
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("cache-control", "public, max-age=3600");
      res.setHeader("cross-origin-resource-policy", "cross-origin");
      res.send(bytes);
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  // Admin endpoint: delete a room (disk + memory).
  // No admin login UI: guarded by a shared secret in LASCA_ADMIN_TOKEN.
  app.delete("/api/admin/room/:roomId", async (req, res) => {
    try {
      // If no token is configured, hide the endpoint.
      if (!readAdminToken()) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!isAdminAuthorized(req)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const roomId = String(req.params.roomId || "").trim() as RoomId;
      if (!/^[0-9a-f]+$/i.test(roomId) || roomId.length < 4) {
        res.status(400).json({ error: "Invalid roomId" });
        return;
      }

      tombstonedRooms.add(roomId);
      evictRoomFromMemory(roomId);

      try {
        await fs.rm(path.join(gamesDir, roomId), { recursive: true, force: true });
      } catch {
        // ignore
      }

      res.json({ ok: true, roomId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      res.status(400).json({ error: msg });
    }
  });

  // Server-Sent Events stream for realtime room snapshots.
  // Clients should keep this open and will receive `snapshot` events.
  app.get("/api/stream/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const playerId = typeof req.query.playerId === "string" ? (req.query.playerId as PlayerId) : null;
      const watchToken = typeof req.query.watchToken === "string" ? String(req.query.watchToken) : null;

      // Spectator access control: private rooms may only be viewed by seated players.
      // (Players keep passing their playerId via querystring; observers do not.)
      requireRoomView(room, playerId, watchToken);

      if (playerId && room.players.has(playerId)) {
        await queueRoomAction(room, async () => {
          touchClock(room);
          await maybeForceClockTimeout(room);
          setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
          clearGrace(room, playerId);
          updateClockPause(room);
          await persistSnapshot(gamesDir, room);
        });
      }

      res.status(200);
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("connection", "keep-alive");
      // Best-effort: some proxies buffer without this.
      res.setHeader("x-accel-buffering", "no");
      (res as any).flushHeaders?.();

      // Register client before sending initial snapshot so it also gets broadcasts immediately.
      const set = streamClients.get(roomId) ?? new Set<express.Response>();
      set.add(res);
      streamClients.set(roomId, set);

      if (playerId && room.players.has(playerId)) {
        addStreamPlayerClient(roomId, playerId, res);
      }

      // Initial snapshot so client can render immediately.
      const identity = publicIdentityForRoom(room);
      streamWrite(res, "snapshot", {
        roomId,
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        identity: Object.keys(identity).length > 0 ? identity : undefined,
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
      });

      // Presence changed; notify other connected clients.
      if (playerId && room.players.has(playerId)) {
        broadcastRoomSnapshot(room);
      }

      // Heartbeat helps keep some intermediaries from closing idle connections.
      const heartbeat = setInterval(() => {
        try {
          res.write(`: keep-alive\n\n`);
        } catch {
          // ignore
        }
      }, 15_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        const clients = streamClients.get(roomId);
        if (clients) {
          clients.delete(res);
          if (clients.size === 0) streamClients.delete(roomId);
        }

        if (isShuttingDown) return;

        if (playerId && room.players.has(playerId)) {
          removeStreamPlayerClient(roomId, playerId, res);

          // If another connection still exists for this player (e.g., another tab),
          // do NOT mark disconnected or start grace.
          if (isPlayerConnectedByAnyTransport(roomId, playerId)) return;

          void queueRoomAction(room, async () => {
            touchClock(room);
            await maybeForceClockTimeout(room);
            setPresence(room, playerId, { connected: false, lastSeenAt: nowIso() });
            await startGraceIfNeeded(room, playerId);
          });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed";
      res.status(msg === "Room is private" ? 403 : 400).json({ error: msg });
    }
  });

  app.post("/api/create", async (req, res) => {
    try {
      const body = req.body as CreateRoomRequest;
      const variantId = body?.variantId as VariantId;
      if (!variantId) throw new Error("Missing variantId");
      const snapshot = body?.snapshot as WireSnapshot;
      if (!snapshot?.state || !snapshot?.history) throw new Error("Missing snapshot");

      const roomId: RoomId = randId();
      const playerId: PlayerId = randId();

      const state = deserializeWireGameState(snapshot.state);
      const history = new HistoryManager();
      const h = deserializeWireHistory(snapshot.history);
      history.replaceAll(h.states as any, h.notation, h.currentIndex);
      const current = history.getCurrent();
      const aligned = current ?? state;

      const timeControl: TimeControl = isValidTimeControl((body as any).timeControl) ? (body as any).timeControl : { mode: "none" };

      const visibility: RoomVisibility = isValidVisibility((body as any).visibility) ? (body as any).visibility : "public";
      const watchToken = visibility === "private" ? randId() : null;

      const preferredColor = (body as any)?.preferredColor;
      const creatorColor: PlayerColor = preferredColor === "B" || preferredColor === "W" ? preferredColor : "W";
      const botSeatsRaw = Array.isArray((body as any)?.botSeats) ? ((body as any).botSeats as OnlineBotSeatRequest[]) : [];

      const rulesRaw = (body as any)?.rules;
      const rules: RoomRules = {
        drawByThreefold: typeof rulesRaw?.drawByThreefold === "boolean" ? Boolean(rulesRaw.drawByThreefold) : true,
      };

      const room: Room = {
        roomId,
        state: aligned,
        history,
        createdAtIso: nowIso(),
        creatorPlayerId: playerId,
        players: new Map([[playerId, creatorColor]]),
        colorsTaken: new Set([creatorColor]),
        variantId,
        visibility,
        watchToken,
        rules,
        stateVersion: 0,
        rulesVersion: SUPPORTED_RULES_VERSION,
        lastGameOverVersion: -1,
        identity: new Map(),
        presence: new Map(),
        disconnectGrace: new Map(),
        timeControl,
        clock:
          timeControl.mode === "clock"
            ? {
                remainingMs: { W: timeControl.initialMs, B: timeControl.initialMs },
                active: (aligned as any).toMove === "B" ? "B" : "W",
                paused: false,
                lastTickMs: Date.now(),
              }
            : null,
        actionChain: Promise.resolve(),
        persistChain: Promise.resolve(),
      };

      const guestId = sanitizeGuestId((body as any).guestId);
      const displayName = sanitizeDisplayName((body as any).displayName);
      const authIdentity = await resolveAuthenticatedRoomIdentity({ req, authDir });
      if (guestId || displayName || Object.keys(authIdentity).length > 0) {
        setIdentity(room, playerId, {
          ...(guestId ? { guestId } : {}),
          ...(displayName ? { displayName } : {}),
          ...authIdentity,
        });
      }

      setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });

      const localSeatPlayerIdsByColor: LocalSeatPlayerIdsByColor = {
        [creatorColor]: playerId,
      };

      const seenBotColors = new Set<PlayerColor>([creatorColor]);
      for (const seat of botSeatsRaw) {
        const color = seat?.color === "B" || seat?.color === "W" ? seat.color : null;
        if (!color || seenBotColors.has(color)) continue;
        seenBotColors.add(color);

        const botPlayerId: PlayerId = randId();
        room.players.set(botPlayerId, color);
        room.colorsTaken.add(color);
        setPresence(room, botPlayerId, { connected: true, lastSeenAt: nowIso() });

        const botDisplayName = sanitizeDisplayName((seat as any)?.displayName);
        if (botDisplayName) {
          setIdentity(room, botPlayerId, { displayName: botDisplayName });
        }

        localSeatPlayerIdsByColor[color] = botPlayerId;
      }

      rooms.set(roomId, room);

      // Persist creation event and initial snapshot.
      await appendEvent(
        gamesDir,
        roomId,
        makeCreatedEvent({
        roomId,
        variantId,
        stateVersion: room.stateVersion,
        snapshot: snapshotForRoom(room),
        players: room.players,
        colorsTaken: room.colorsTaken,
        }),
        { allowCreateRoomDir: true }
      );
      await persistSnapshot(gamesDir, room, { allowCreateRoomDir: true });

      const response: CreateRoomResponse = {
        roomId,
        playerId,
        color: creatorColor,
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        identity: publicIdentityForRoom(room),
        rules: room.rules,
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
        visibility: room.visibility,
        watchToken: room.watchToken ?? undefined,
        localSeatPlayerIdsByColor,
      };
      broadcastRoomSnapshot(room);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      const response: CreateRoomResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/join", async (req, res) => {
    try {
      const body = req.body as JoinRoomRequest;
      const roomId = body?.roomId;
      if (!roomId) throw new Error("Missing roomId");

      const room = await requireRoom(roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const guestId = sanitizeGuestId((body as any).guestId);
        const displayName = sanitizeDisplayName((body as any).displayName);
        const authIdentity = await resolveAuthenticatedRoomIdentity({ req, authDir });

        const findPlayerIdsByGuestId = (gid: string): PlayerId[] => {
          const out: PlayerId[] = [];
          for (const [pid] of room.players.entries()) {
            const ident = room.identity.get(pid);
            if (ident?.guestId === gid) out.push(pid);
          }
          return out;
        };

        const rejoinCandidates = guestId ? findPlayerIdsByGuestId(guestId) : [];
        const ensureRejoinCandidate = (): PlayerId => {
          if (rejoinCandidates.length === 1) return rejoinCandidates[0];
          if (rejoinCandidates.length > 1) throw new Error("Multiple seats match this guest identity; use playerId");
          throw new Error("Room full");
        };

        const maybeRejoin = async (playerId: PlayerId): Promise<JoinRoomResponse> => {
          const color = room.players.get(playerId);
          if (!color) throw new Error("Room full");

          if (guestId || displayName || Object.keys(authIdentity).length > 0) {
            setIdentity(room, playerId, {
              ...(guestId ? { guestId } : {}),
              ...(displayName ? { displayName } : {}),
              ...authIdentity,
            });
          }

          setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
          clearGrace(room, playerId);
          updateClockPause(room);

          // Keep rejoin working across server restarts.
          await persistSnapshot(gamesDir, room);

          const resp: JoinRoomResponse = {
            roomId,
            playerId,
            color,
            snapshot: snapshotForRoom(room),
            presence: presenceForRoom(room),
            identity: publicIdentityForRoom(room),
            rules: room.rules,
            timeControl: room.timeControl,
            clock: room.clock ?? undefined,
          };
          broadcastRoomSnapshot(room);
          return resp;
        };

        const preferredColor = (body as any)?.preferredColor;
        let color: PlayerColor | null = null;
        if (preferredColor === "W" || preferredColor === "B") {
          // Enforce explicit seat choice.
          const taken = new Set<PlayerColor>(Array.from(room.players.values()));
          if (taken.has(preferredColor)) {
            if (guestId) {
              // If this guest already owns the requested seat, treat as rejoin.
              for (const pid of rejoinCandidates) {
                if (room.players.get(pid) === preferredColor) {
                  return await maybeRejoin(pid);
                }
              }
            }
            throw new Error("Color taken");
          }
          color = preferredColor;
        } else {
          color = nextColor(room);
        }
        if (!color) {
          // Room is full. If this request carries a matching guestId for a seated
          // player, treat this as a rejoin and return their existing playerId.
          if (guestId) {
            const pid = ensureRejoinCandidate();
            return await maybeRejoin(pid);
          }
          throw new Error("Room full");
        }

        const playerId: PlayerId = randId();
        room.players.set(playerId, color);
        room.colorsTaken.add(color);
        if (guestId || displayName || Object.keys(authIdentity).length > 0) {
          setIdentity(room, playerId, {
            ...(guestId ? { guestId } : {}),
            ...(displayName ? { displayName } : {}),
            ...authIdentity,
          });
        }

        setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
        clearGrace(room, playerId);
        updateClockPause(room);

        // Persist join as a snapshot-only update (no gameplay change).
        // This keeps reconnection (roomId+playerId) working across server restarts.
        await persistSnapshot(gamesDir, room);

        const resp: JoinRoomResponse = {
          roomId,
          playerId,
          color,
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          rules: room.rules,
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Join failed";
      const response: JoinRoomResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  // MP3: Basic public lobby list of joinable rooms.
  // Note: currently lists rooms that are active in memory on this server process.
  app.get("/api/lobby", async (req, res) => {
    try {
      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(500, Number.parseInt(limitRaw || "200", 10) || 200));

      const includeFull = req.query.includeFull === "1" || req.query.includeFull === "true";

      type LobbyCandidate = LobbyRoomSummary & { sortMs: number };
      const byId = new Map<RoomId, LobbyCandidate>();

      const consider = (cand: LobbyCandidate): void => {
        // Enforce discoverability rules.
        const isFull = cand.seatsOpen.length === 0;
        if (!includeFull && isFull) return;
        if (cand.visibility === "private" && isFull) return;
        const prev = byId.get(cand.roomId);
        if (!prev || cand.sortMs > prev.sortMs) byId.set(cand.roomId, cand);
      };

      // First: active rooms in memory (authoritative, freshest).
      for (const room of rooms.values()) {
        if (isRoomOver(room)) continue;

        // Admin safety: if a room's persisted folder/snapshot was deleted on disk,
        // it should no longer show as active (and should be dropped from memory).
        // This allows an admin to remove rooms by deleting their folder.
        try {
          await fs.stat(snapshotPath(gamesDir, room.roomId));
        } catch {
          rooms.delete(room.roomId);
          continue;
        }

        const seatsTaken = new Set<PlayerColor>(Array.from(room.players.values()));
        const seatsOpen: PlayerColor[] = [];
        if (!seatsTaken.has("W")) seatsOpen.push("W");
        if (!seatsTaken.has("B")) seatsOpen.push("B");

        const identity = publicIdentityForRoom(room);
        const displayNameByColor = displayNameByColorForPlayers({ players: room.players.entries(), identity });
        const identityByColor = identityByColorForPlayers({ players: room.players.entries(), identity });
        const hostNameRaw = identity?.[room.creatorPlayerId]?.displayName;
        const hostDisplayName = typeof hostNameRaw === "string" ? hostNameRaw.trim() : "";
        const hostIdentity = room.creatorPlayerId ? identity?.[room.creatorPlayerId] : undefined;

        const status = seatsOpen.length > 0 ? "waiting" : "in_game";

        consider({
          roomId: room.roomId,
          variantId: room.variantId,
          visibility: room.visibility,
          status,
          createdAt: room.createdAtIso,
          ...(hostDisplayName ? { hostDisplayName } : {}),
          ...(hostIdentity ? { hostIdentity } : {}),
          seatsTaken: Array.from(seatsTaken.values()),
          seatsOpen,
          ...(displayNameByColor ? { displayNameByColor } : {}),
          ...(identityByColor ? { identityByColor } : {}),
          timeControl: room.timeControl,
          sortMs: Date.now(),
        });
      }

      // Second: rooms persisted on disk but not currently loaded.
      // This makes joinable rooms discoverable after a server restart.
      try {
        const entries = await fs.readdir(gamesDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const roomId = ent.name as RoomId;
          if (rooms.has(roomId)) continue;

          // Avoid reading obviously invalid folders.
          if (!/^[0-9a-f]+$/i.test(roomId) || roomId.length < 4) continue;

          const snapP = snapshotPath(gamesDir, roomId);
          let raw: string;
          try {
            raw = await fs.readFile(snapP, "utf8");
          } catch {
            continue;
          }

          let file: PersistedSnapshotFile | null = null;
          try {
            file = JSON.parse(raw) as PersistedSnapshotFile;
          } catch {
            file = null;
          }
          if (!file?.meta) continue;

          const forcedOver = Boolean((file.snapshot as any)?.state?.forcedGameOver?.message);
          if (forcedOver) continue;

          const visibility: RoomVisibility = isValidVisibility((file.meta as any).visibility)
            ? ((file.meta as any).visibility as any)
            : "public";

          const timeControl: TimeControl = isValidTimeControl((file.meta as any).timeControl)
            ? ((file.meta as any).timeControl as any)
            : { mode: "none" };

          const seatsTaken = new Set<PlayerColor>(Array.from((file.meta.players ?? []).map((x) => x[1])));
          const seatsOpen: PlayerColor[] = [];
          if (!seatsTaken.has("W")) seatsOpen.push("W");
          if (!seatsTaken.has("B")) seatsOpen.push("B");

          const fileIdentityRaw = (file.meta as any)?.identity as IdentityByPlayerId | undefined;
          const publicIdentity: IdentityByPlayerId | undefined = fileIdentityRaw
            ? Object.fromEntries(
                Object.entries(fileIdentityRaw)
                  .map(([pid, ident]) => {
                    const displayName = sanitizeDisplayName((ident as any)?.displayName);
                    const avatarUrl = sanitizeProfileAvatarUrl((ident as any)?.avatarUrl);
                    const countryCode = sanitizeProfileCountryCode((ident as any)?.countryCode);
                    const countryName = sanitizeProfileCountryName((ident as any)?.countryName);
                    return [
                      pid,
                      {
                        ...(displayName ? { displayName } : {}),
                        ...(avatarUrl ? { avatarUrl } : {}),
                        ...(countryCode ? { countryCode } : {}),
                        ...(countryName ? { countryName } : {}),
                      },
                    ];
                  })
                  .filter(([, ident]) => Object.keys(ident as object).length > 0)
              )
            : undefined;

          const creatorIdRaw = (file.meta as any)?.createdByPlayerId;
          const creatorId = typeof creatorIdRaw === "string" && creatorIdRaw.trim()
            ? String(creatorIdRaw)
            : (Array.isArray(file.meta.players) && file.meta.players.length ? String(file.meta.players[0]?.[0] ?? "") : "");
          const hostNameRaw = creatorId ? (publicIdentity as any)?.[creatorId]?.displayName : null;
          const hostDisplayName = typeof hostNameRaw === "string" ? String(hostNameRaw).trim() : "";
          const displayNameByColor = displayNameByColorForPlayers({
            players: (file.meta.players ?? []) as Array<[PlayerId, PlayerColor]>,
            identity: publicIdentity,
          });
          const identityByColor = identityByColorForPlayers({
            players: (file.meta.players ?? []) as Array<[PlayerId, PlayerColor]>,
            identity: publicIdentity,
          });
          const hostIdentity = creatorId ? publicIdentity?.[creatorId] : undefined;

          const stat = await fs
            .stat(snapP)
            .then((s) => s)
            .catch(() => null);
          const sortMs = stat?.mtimeMs ?? 0;

          const metaCreatedAt = typeof (file.meta as any)?.createdAtIso === "string" ? String((file.meta as any).createdAtIso).trim() : "";
          const fallbackCreatedMs = Math.min(stat?.birthtimeMs ?? sortMs, sortMs);
          const createdAt = metaCreatedAt || (fallbackCreatedMs > 0 ? new Date(fallbackCreatedMs).toISOString() : undefined);
          const status = seatsOpen.length > 0 ? "waiting" : "in_game";

          consider({
            roomId,
            variantId: file.meta.variantId,
            visibility,
            status,
            ...(createdAt ? { createdAt } : {}),
            ...(hostDisplayName ? { hostDisplayName } : {}),
            ...(hostIdentity ? { hostIdentity } : {}),
            seatsTaken: Array.from(seatsTaken.values()),
            seatsOpen,
            ...(displayNameByColor ? { displayNameByColor } : {}),
            ...(identityByColor ? { identityByColor } : {}),
            timeControl,
            sortMs,
          });
        }
      } catch {
        // ignore
      }

      const out: LobbyRoomSummary[] = Array.from(byId.values())
        .sort((a, b) => b.sortMs - a.sortMs)
        .slice(0, limit)
        .map(({ sortMs: _sortMs, ...rest }) => rest);

      const response: GetLobbyResponse = { rooms: out };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lobby failed";
      const response: GetLobbyResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  // Room metadata suitable for Start Page routing (variant selection) without leaking private game state.
  app.get("/api/room/:roomId/meta", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const seatsTaken = new Set<PlayerColor>(Array.from(room.players.values()));
      const seatsOpen: PlayerColor[] = [];
      if (!seatsTaken.has("W")) seatsOpen.push("W");
      if (!seatsTaken.has("B")) seatsOpen.push("B");

      const response: GetRoomMetaResponse = {
        roomId: room.roomId,
        variantId: room.variantId as any,
        visibility: room.visibility,
        isOver: isRoomOver(room),
        seatsTaken: Array.from(seatsTaken.values()),
        seatsOpen,
        timeControl: room.timeControl,
      };

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Room meta failed";
      const response: GetRoomMetaResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  // Private-room spectator token (only revealed to seated players).
  // This lets either player share a watch link after the room is full.
  app.get("/api/room/:roomId/watchToken", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const playerId = typeof req.query.playerId === "string" ? String(req.query.playerId) : "";
      if (!playerId) throw new Error("Missing playerId");
      requirePlayer(room, playerId);

      const response: GetRoomWatchTokenResponse = {
        roomId: room.roomId,
        visibility: room.visibility,
        ...(room.visibility === "private" && room.watchToken ? { watchToken: room.watchToken } : {}),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Watch token failed";
      const response: GetRoomWatchTokenResponse = { error: msg };
      res.status(msg === "Room is private" ? 403 : 400).json(response);
    }
  });

  app.get("/api/room/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const playerId = typeof req.query.playerId === "string" ? (req.query.playerId as PlayerId) : null;
      const watchToken = typeof req.query.watchToken === "string" ? String(req.query.watchToken) : null;
      requireRoomView(room, playerId, watchToken);

      // Treat authenticated snapshot fetches as presence activity.
      // This is important for environments where realtime transports are unavailable
      // and the client falls back to polling.
      if (playerId && room.players.has(playerId)) {
        await queueRoomAction(room, async () => {
          touchClock(room);
          await maybeForceClockTimeout(room);

          const wasConnected = Boolean(room.presence.get(playerId)?.connected);
          const hadGrace = room.disconnectGrace.has(playerId);

          setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
          clearGrace(room, playerId);
          updateClockPause(room);

          // Avoid churning disk/broadcasts on every poll; only persist/broadcast
          // when presence/grace meaningfully changes.
          if (!wasConnected || hadGrace) {
            await persistSnapshot(gamesDir, room);
            broadcastRoomSnapshot(room);
          }
        });
      }

      touchClock(room);
      await maybeForceClockTimeout(room);
      updateClockPause(room);
      await room.persistChain;
      const response: GetRoomSnapshotResponse = {
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        identity: publicIdentityForRoom(room),
        identityByColor: identityByColorForPlayers({ players: room.players.entries(), identity: publicIdentityForRoom(room) }),
        rules: room.rules,
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Snapshot failed";
      const response: GetRoomSnapshotResponse = { error: msg };
      res.status(msg === "Room is private" ? 403 : 400).json(response);
    }
  });

  // Debug report endpoint: persist client-provided debug JSON under this room's folder.
  // Files are written to: <gamesDir>/<roomId>/debug/debug.<n>.json
  app.post("/api/room/:roomId/debug", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const body = req.body as PostRoomDebugReportRequest;
      if (!body || typeof body !== "object") throw new Error("Missing body");
      const debug = (body as any).debug;
      if (!debug || typeof debug !== "object") throw new Error("Missing debug object");

      const response = await queueRoomAction(room, async () => {
        // Ensure we don't race with any in-flight persistence.
        await room.persistChain;

        // If the room folder was deleted (admin cleanup), don't recreate it.
        try {
          await fs.stat(path.join(gamesDir, roomId));
        } catch {
          throw new Error("Room folder missing");
        }

        const debugDir = path.join(gamesDir, roomId, "debug");
        await fs.mkdir(debugDir, { recursive: true });

        let existing: string[] = [];
        try {
          existing = await fs.readdir(debugDir);
        } catch {
          existing = [];
        }

        let maxN = 0;
        for (const name of existing) {
          const m = /^debug\.(\d+)\.json$/i.exec(name);
          if (!m) continue;
          const n = Number.parseInt(m[1], 10);
          if (Number.isFinite(n) && n > maxN) maxN = n;
        }

        // Best-effort unique counter even under unexpected concurrency.
        let n = maxN + 1;
        let fileName = `debug.${n}.json`;
        for (let attempt = 0; attempt < 10; attempt++) {
          fileName = `debug.${n}.json`;
          const filePath = path.join(debugDir, fileName);
          const payload = {
            receivedAtIso: nowIso(),
            roomId,
            playerId: (body as any).playerId ?? null,
            identityByPlayerId: Object.fromEntries(room.identity.entries()),
            ip: (req as any).ip ?? null,
            debug,
          };

          try {
            await fs.writeFile(filePath, JSON.stringify(payload, null, 2), { encoding: "utf8", flag: "wx" });
            const resp: PostRoomDebugReportResponse = { ok: true, fileName };
            return resp;
          } catch (err: any) {
            // If a collision happens, bump counter and retry.
            if (err && err.code === "EEXIST") {
              n++;
              continue;
            }
            throw err;
          }
        }

        throw new Error("Failed to allocate debug filename");
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Debug report failed";
      const response: PostRoomDebugReportResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  // Replay/event log fetch (post-game summary / replay viewer).
  // Returns the persisted JSONL event log as an array of objects.
  app.get("/api/room/:roomId/replay", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const playerId = typeof req.query.playerId === "string" ? (req.query.playerId as PlayerId) : null;
      const watchToken = typeof req.query.watchToken === "string" ? String(req.query.watchToken) : null;
      requireRoomView(room, playerId, watchToken);

      // Ensure any in-flight persistence (e.g. recent moves) is flushed before reading.
      await room.persistChain;

      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(10_000, Number.parseInt(limitRaw || "5000", 10) || 5000));

      const p = eventsPath(gamesDir, roomId);
      let raw = "";
      try {
        raw = await fs.readFile(p, "utf8");
      } catch {
        raw = "";
      }

      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const sliced = lines.length > limit ? lines.slice(lines.length - limit) : lines;

      const events: ReplayEvent[] = [];
      for (const line of sliced) {
        try {
          events.push(JSON.parse(line) as any);
        } catch {
          // ignore malformed log lines
        }
      }

      const identity = publicIdentityForRoom(room);
      const displayNameByColor = displayNameByColorForPlayers({ players: room.players.entries(), identity });

      const response: GetReplayResponse = {
        events,
        ...(displayNameByColor ? { displayNameByColor } : {}),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replay failed";
      const response: GetReplayResponse = { error: msg };
      res.status(msg === "Room is private" ? 403 : 400).json(response);
    }
  });

  app.post("/api/submitMove", async (req, res) => {
    try {
      const body = req.body as SubmitMoveRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);

  // Freeze play while opponent is disconnected (until reconnect or disconnect-forfeit).
  await requireOpponentConnected(room, body.playerId);

          requireNoPendingDrawOffer(room);

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        const move = body.move as Move;
        if (!move || typeof (move as any).from !== "string" || typeof (move as any).to !== "string") {
          throw new Error("Invalid move");
        }

        const prevToMove = (room.state as any).toMove as PlayerColor;
        const next = applyMove(room.state as any, move as any) as any;

        room.state = next;

        // Record history for every applied move so capture-chain steps are visible in the UI.
        const boardSize = Number((next as any)?.meta?.boardSize ?? 7);
        const from = nodeIdToA1(move.from, boardSize);
        const to = nodeIdToA1(move.to, boardSize);
        const sep = move.kind === "capture" ? " × " : " → ";
        const notation = `${from}${sep}${to}`;
        room.history.push(room.state, notation);

        // Damasca: adjudicate and end on threefold repetition.
        maybeApplyDamascaThreefold(room);

        // Fivefold repetition is an automatic draw.
        maybeApplyFivefoldRepetition(room);

        // US Checkers: threefold repetition is an automatic draw.
        maybeApplyCheckersUsThreefold(room);

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "SUBMIT_MOVE", move, snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: SubmitMoveResponse = {
          snapshot: snapshotForRoom(room),
          didPromote: Boolean(next.didPromote) || undefined,
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Move failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] submitMove error", msg);
      const response: SubmitMoveResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/finalizeCaptureChain", async (req, res) => {
    try {
      const body = req.body as FinalizeCaptureChainRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);

  // Freeze play while opponent is disconnected (until reconnect or disconnect-forfeit).
  await requireOpponentConnected(room, body.playerId);

          requireNoPendingDrawOffer(room);

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        let next: any;
        if (body.rulesetId === "dama") {
          next = finalizeDamaCaptureChain(room.state as any, body.landing, new Set(body.jumpedSquares));
        } else {
          next = finalizeDamascaCaptureChain(room.state as any, body.landing);
        }

        const prevToMove = (room.state as any).toMove as PlayerColor;
        room.state = next;
        // Turn does not switch here; client will call /api/endTurn when the capture turn ends.

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "FINALIZE_CAPTURE_CHAIN", snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: FinalizeCaptureChainResponse = {
          snapshot: snapshotForRoom(room),
          didPromote: Boolean(next.didPromote) || undefined,
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] finalizeCaptureChain error", msg);
      const response: FinalizeCaptureChainResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/endTurn", async (req, res) => {
    try {
      const body = req.body as EndTurnRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);

  // Freeze play while opponent is disconnected (until reconnect or disconnect-forfeit).
  await requireOpponentConnected(room, body.playerId);

          requireNoPendingDrawOffer(room);

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        const prevToMove = (room.state as any).toMove as PlayerColor;
        room.state = endTurn(room.state as any);

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        // END_TURN is not a move by itself. The move/capture steps were already recorded via /api/submitMove.
        // We still need history's *current* entry to reflect the authoritative state (esp. toMove),
        // otherwise the UI can highlight the wrong row.
        const notation = typeof (body as any).notation === "string" ? (body as any).notation : undefined;
        const snap = room.history.exportSnapshots();
        if (snap.states.length === 0) {
          room.history.push(room.state as any, notation);
        } else {
          snap.states[snap.states.length - 1] = room.state as any;
          if (typeof notation === "string") {
            snap.notation[snap.notation.length - 1] = notation;
          }
          room.history.replaceAll(snap.states as any, snap.notation, snap.states.length - 1);
        }

        // Damasca: adjudicate and end on threefold repetition.
        maybeApplyDamascaThreefold(room);

        // Fivefold repetition is an automatic draw.
        maybeApplyFivefoldRepetition(room);

        // US Checkers: threefold repetition is an automatic draw.
        maybeApplyCheckersUsThreefold(room);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "END_TURN", snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: EndTurnResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "End turn failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] endTurn error", msg);
      const response: EndTurnResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/claimDraw", async (req, res) => {
    try {
      const body = req.body as ClaimDrawRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);

        // Freeze play while opponent is disconnected (until reconnect or disconnect-forfeit).
        await requireOpponentConnected(room, body.playerId);

        if (isRoomOver(room)) throw new Error("Game over");
        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        const kind = (body as any).kind === "threefold" ? "threefold" : null;
        if (!kind) throw new Error("Invalid draw claim");

        const count = repetitionCountForCurrentPosition(room);
        if (count < 3) throw new Error("Threefold repetition is not available");

        room.state = {
          ...(room.state as any),
          forcedGameOver: {
            winner: null,
            reasonCode: "THREEFOLD_REPETITION",
            message: "Draw by threefold repetition",
          },
        };

        // Ensure history's current entry reflects the adjudicated state.
        const snap2 = room.history.exportSnapshots();
        if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
          snap2.states[snap2.currentIndex] = room.state as any;
          room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
        }

        room.stateVersion += 1;
        await maybePersistGameOver(gamesDir, room);

        const resp: ClaimDrawResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim draw failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] claimDraw error", msg);
      const response: ClaimDrawResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/offerDraw", async (req, res) => {
    try {
      const body = req.body as OfferDrawRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);
        // Freeze play while opponent is disconnected (until reconnect or disconnect-forfeit).
        await requireOpponentConnected(room, body.playerId);

        if (isRoomOver(room)) throw new Error("Game over");

        const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";

        if (rulesetId === "checkers_us") {
          if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

          requireNoPendingDrawOffer(room);

          const prev = room.state as any;
          const draw = ensureCheckersUsDraw(prev.checkersUsDraw);

          const currentTurns = Math.max(0, Math.floor(draw.turnCount?.[color] ?? 0));
          const lastTurn = Math.floor(draw.lastOfferTurn?.[color] ?? -999);
          if (currentTurns - lastTurn < 3) {
            throw new Error("You can only offer a draw once every 3 moves");
          }

          const nonce = Number.parseInt(secureRandomHex(8), 16);
          draw.lastOfferTurn[color] = currentTurns;
          draw.pendingOffer = { offeredBy: color as any, nonce };

          room.state = { ...prev, checkersUsDraw: draw };
        } else {
          requireNoPendingDrawOffer(room);

          const prev = room.state as any;
          const nonce = Number.parseInt(secureRandomHex(8), 16);
          room.state = { ...prev, pendingDrawOffer: { offeredBy: color, nonce } };
        }
        updateClockPause(room);

        room.stateVersion += 1;
        await queuePersist(room);

        const resp: OfferDrawResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Offer draw failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] offerDraw error", msg);
      const response: OfferDrawResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/respondDrawOffer", async (req, res) => {
    try {
      const body = req.body as RespondDrawOfferRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        requireRoomReady(room);
        if (isRoomOver(room)) throw new Error("Game over");

        const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";

        const prev = room.state as any;

        let pendingOffer: { offeredBy: string; nonce: number } | undefined;
        if (rulesetId === "checkers_us") {
          pendingOffer = ensureCheckersUsDraw(prev.checkersUsDraw).pendingOffer;
        } else {
          pendingOffer = prev.pendingDrawOffer;
        }

        if (!pendingOffer) throw new Error("No draw offer pending");
        if (pendingOffer.offeredBy === (color as any)) throw new Error("You cannot respond to your own draw offer");

        if (Boolean((body as any).accept)) {
          const nextState: any = {
            ...prev,
            forcedGameOver: {
              winner: null,
              reasonCode: "DRAW_BY_AGREEMENT",
              message: "Draw by mutual agreement",
            },
          };
          if (rulesetId === "checkers_us") {
            const draw = ensureCheckersUsDraw(prev.checkersUsDraw);
            draw.pendingOffer = undefined;
            nextState.checkersUsDraw = draw;
          } else {
            nextState.pendingDrawOffer = undefined;
          }
          room.state = nextState;

          // Ensure history's current entry reflects the adjudicated state.
          const snap2 = room.history.exportSnapshots();
          if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
            snap2.states[snap2.currentIndex] = room.state as any;
            room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
          }
        } else {
          if (rulesetId === "checkers_us") {
            const draw = ensureCheckersUsDraw(prev.checkersUsDraw);
            draw.pendingOffer = undefined;
            room.state = { ...prev, checkersUsDraw: draw };
          } else {
            room.state = { ...prev, pendingDrawOffer: undefined };
          }
        }

        updateClockPause(room);

        room.stateVersion += 1;
        if (Boolean((body as any).accept)) {
          await maybePersistGameOver(gamesDir, room);
        } else {
          await queuePersist(room);
        }

        const resp: RespondDrawOfferResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Respond draw offer failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] respondDrawOffer error", msg);
      const response: RespondDrawOfferResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/resign", async (req, res) => {
    try {
      const body = req.body as ResignRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        if (isRoomOver(room)) throw new Error("Game over");

        const winner: PlayerColor = color === "W" ? "B" : "W";
        const winnerName = winner === "W" ? "White" : "Black";
        const loserName = color === "W" ? "White" : "Black";

        room.state = {
          ...(room.state as any),
          forcedGameOver: {
            winner,
            reasonCode: "RESIGN",
            message: `${loserName} resigned — ${winnerName} wins!`,
          },
        };

        room.stateVersion += 1;
        room.lastGameOverVersion = room.stateVersion;
        await appendEvent(
          gamesDir,
          room.roomId,
          makeGameOverEvent({
            roomId: room.roomId,
            stateVersion: room.stateVersion,
            winner,
            reason: "RESIGN",
          })
        );
        await persistSnapshot(gamesDir, room);

        const resp: ResignResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          identity: publicIdentityForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resign failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] resign error", msg);
      const response: ResignResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  async function shutdown(): Promise<void> {
    isShuttingDown = true;

    if (wsHeartbeat) {
      clearInterval(wsHeartbeat);
      wsHeartbeat = null;
    }

    if (wss) {
      try {
        wss.close();
      } catch {
        // ignore
      }
      wss = null;
    }

    // Best-effort cleanup: stop grace timers so they don't fire after teardown.
    for (const room of rooms.values()) {
      for (const g of room.disconnectGrace.values()) {
        clearTimeout(g.timer);
      }
      room.disconnectGrace.clear();
    }

    // Wait for any queued persistence to finish.
    await Promise.all(Array.from(rooms.values()).map((r) => r.persistChain.catch(() => undefined)));
    await stockfish.shutdown();
  }

  return { app, rooms, gamesDir, authDir, attachWebSockets, shutdown };
}

export async function startLascaServer(args: {
  port?: number;
  gamesDir?: string;
  authDir?: string;
  snapshotEvery?: number;
  disconnectGraceMs?: number;
  sessionTtlMs?: number;
  stockfishEngineJs?: string;
}): Promise<{
  app: express.Express;
  server: Server;
  url: string;
  gamesDir: string;
  authDir: string;
}> {
  const { app, gamesDir, authDir, attachWebSockets, shutdown } = createLascaApp({
    gamesDir: args.gamesDir,
    authDir: args.authDir,
    snapshotEvery: args.snapshotEvery,
    disconnectGraceMs: args.disconnectGraceMs,
    sessionTtlMs: args.sessionTtlMs,
    stockfishEngineJs: args.stockfishEngineJs,
  });
  await ensureGamesDir(gamesDir);
  await ensureAuthDir(authDir);

  const port = Number.isFinite(args.port as any) ? Number(args.port) : 8788;

  // Use an explicit HTTP server so WebSockets can attach cleanly.
  const server = createServer(app);
  attachWebSockets(server);
  const listenError = await new Promise<Error | null>((resolve) => {
    const onError = (err: any) => resolve(err instanceof Error ? err : new Error(String(err)));
    const onListening = () => resolve(null);
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });

  if (listenError) {
    // eslint-disable-next-line no-console
    const anyErr = listenError as any;
    if (anyErr && anyErr.code === "EADDRINUSE") {
      console.error(`[lasca-server] Port ${port} is already in use. Stop the other process or set PORT to a free port.`);
    } else {
      console.error("[lasca-server] Server failed to start:", listenError);
    }
    throw listenError;
  }

  // Ensure teardown disables grace/persistence side effects.
  const originalClose = server.close.bind(server);
  (server as any).close = (cb?: any) => {
    void (async () => {
      await shutdown();
      originalClose(cb);
    })();
    return server;
  };

  const actualPort = (server.address() as any)?.port ?? port;
  return { app, server, url: `http://localhost:${actualPort}`, gamesDir, authDir };
}
