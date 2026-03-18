// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

async function rmWithRetries(p: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      await fs.rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  await fs.rm(p, { recursive: true, force: true });
}

describe("MP3 lobby", () => {
  it("lists joinable rooms and hides rooms once full", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-lobby-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const mkRoom = async () => {
        const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
        const history = new HistoryManager();
        history.push(initial);

        const createRes = await fetch(`${s.url}/api/create`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            variantId: "lasca_7_classic",
            snapshot: {
              state: serializeWireGameState(initial),
              history: serializeWireHistory(history.exportSnapshots()),
              stateVersion: 0,
            },
          }),
        }).then((r) => r.json() as Promise<any>);

        expect(createRes.error).toBeUndefined();
        expect(createRes.roomId).toBeTruthy();
        expect(createRes.playerId).toBeTruthy();
        return { roomId: createRes.roomId as string };
      };

      const r1 = await mkRoom();
      const r2 = await mkRoom();

      const lobby1 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby1.error).toBeUndefined();
      const rooms1 = Array.isArray(lobby1.rooms) ? lobby1.rooms : [];
      const ids1 = rooms1.map((x: any) => x.roomId);
      expect(ids1).toContain(r1.roomId);
      expect(ids1).toContain(r2.roomId);

      const item1 = rooms1.find((x: any) => x?.roomId === r1.roomId);
      expect(item1?.status).toBe("waiting");
      expect(typeof item1?.createdAt).toBe("string");
      expect(Number.isFinite(Date.parse(String(item1?.createdAt)))).toBe(true);

      // Fill r1 by joining as player 2.
      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: r1.roomId }),
      }).then((r) => r.json() as Promise<any>);
      expect(joinRes.error).toBeUndefined();
      expect(joinRes.playerId).toBeTruthy();

      const lobby2 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby2.error).toBeUndefined();
      const rooms2 = Array.isArray(lobby2.rooms) ? lobby2.rooms : [];
      const ids2 = rooms2.map((x: any) => x.roomId);

      expect(ids2).not.toContain(r1.roomId);
      expect(ids2).toContain(r2.roomId);

      // When includeFull=1, the full room should appear with status=in_game.
      const lobbyFull = await fetch(`${s.url}/api/lobby?includeFull=1`).then((r) => r.json() as Promise<any>);
      expect(lobbyFull.error).toBeUndefined();
      const roomsFull = Array.isArray(lobbyFull.rooms) ? lobbyFull.rooms : [];
      const fullItem1 = roomsFull.find((x: any) => x?.roomId === r1.roomId);
      expect(fullItem1).toBeTruthy();
      expect(fullItem1?.status).toBe("in_game");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });

  it("does not list rooms whose folder was deleted", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-lobby-delete-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      const roomId = String(createRes.roomId || "");
      expect(roomId).toBeTruthy();

      const lobby1 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby1.error).toBeUndefined();
      const ids1 = (Array.isArray(lobby1.rooms) ? lobby1.rooms : []).map((x: any) => x.roomId);
      expect(ids1).toContain(roomId);

      // Simulate admin deletion: remove the room folder from disk.
      await rmWithRetries(path.join(gamesDir, roomId));

      // Lobby refresh should not show the deleted room.
      const lobby2 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby2.error).toBeUndefined();
      const ids2 = (Array.isArray(lobby2.rooms) ? lobby2.rooms : []).map((x: any) => x.roomId);
      expect(ids2).not.toContain(roomId);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });

  it("includes displayNameByColor when provided", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-lobby-names-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          displayName: "Alice",
          preferredColor: "W",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      expect(createRes.roomId).toBeTruthy();
      expect(createRes.color).toBe("W");
      const roomId = String(createRes.roomId);

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, displayName: "Bob", preferredColor: "B" }),
      }).then((r) => r.json() as Promise<any>);

      expect(joinRes.error).toBeUndefined();
      expect(joinRes.color).toBe("B");

      const lobby = await fetch(`${s.url}/api/lobby?includeFull=1`).then((r) => r.json() as Promise<any>);
      expect(lobby.error).toBeUndefined();
      const rooms = Array.isArray(lobby.rooms) ? lobby.rooms : [];
      const item = rooms.find((x: any) => x?.roomId === roomId);
      expect(item).toBeTruthy();

      const names = (item as any)?.displayNameByColor ?? null;
      expect(names?.W).toBe("Alice");
      expect(names?.B).toBe("Bob");

      expect((item as any)?.hostDisplayName).toBe("Alice");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });

  it("includes public avatar and country metadata in lobby seat identities", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-lobby-identities-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const register = async (email: string, displayName: string, countryCode: string) => {
        const res = await fetch(`${s.url}/api/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: "pw123456", displayName, countryCode }),
        });
        const json = await res.json() as any;
        expect(json.error).toBeUndefined();
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toContain("lasca.sid=");
        return { cookie, json };
      };

      const host = await register("host-lobby@example.com", "HostAccount", "CA");
      const guest = await register("guest-lobby@example.com", "GuestAccount", "GB");

      const patchRes = await fetch(`${s.url}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: host.cookie,
        },
        body: JSON.stringify({ avatarUrl: "/api/auth/avatar/host-lobby.png" }),
      }).then((r) => r.json() as Promise<any>);
      expect(patchRes.error).toBeUndefined();

      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: host.cookie,
        },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          preferredColor: "W",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: guest.cookie,
        },
        body: JSON.stringify({ roomId: createRes.roomId, preferredColor: "B" }),
      }).then((r) => r.json() as Promise<any>);

      expect(joinRes.error).toBeUndefined();

      const lobby = await fetch(`${s.url}/api/lobby?includeFull=1`).then((r) => r.json() as Promise<any>);
      expect(lobby.error).toBeUndefined();
      const rooms = Array.isArray(lobby.rooms) ? lobby.rooms : [];
      const item = rooms.find((x: any) => x?.roomId === createRes.roomId);
      expect(item).toBeTruthy();

      expect((item as any)?.hostIdentity?.displayName).toBe("HostAccount");
      expect((item as any)?.hostIdentity?.countryCode).toBe("CA");
      expect((item as any)?.hostIdentity?.countryName).toBeTruthy();
      expect((item as any)?.hostIdentity?.avatarUrl).toBe("/api/auth/avatar/host-lobby.png");

      expect((item as any)?.identityByColor?.W?.displayName).toBe("HostAccount");
      expect((item as any)?.identityByColor?.W?.countryCode).toBe("CA");
      expect((item as any)?.identityByColor?.W?.avatarUrl).toBe("/api/auth/avatar/host-lobby.png");
      expect((item as any)?.identityByColor?.B?.displayName).toBe("GuestAccount");
      expect((item as any)?.identityByColor?.B?.countryCode).toBe("GB");
      expect((item as any)?.identityByColor?.B?.countryName).toBeTruthy();
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });
});
