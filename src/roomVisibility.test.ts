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

describe("room visibility", () => {
  it("blocks spectators from private rooms (snapshot/stream) but allows meta and players", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-room-vis-"));
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
          displayName: "Host",
          preferredColor: "W",
          visibility: "private",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      expect(createRes.visibility).toBe("private");

      const roomId = createRes.roomId as string;
      const playerId = createRes.playerId as string;
      const watchToken = createRes.watchToken as string | undefined;
      expect(typeof watchToken).toBe("string");
      expect(String(watchToken || "").length).toBeGreaterThan(0);

      // Meta is safe to expose.
      const metaRes = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}/meta`);
      expect(metaRes.ok).toBe(true);
      const metaJson = (await metaRes.json()) as any;
      expect(metaJson.error).toBeUndefined();
      expect(metaJson.roomId).toBe(roomId);
      expect(metaJson.visibility).toBe("private");
      expect(metaJson.variantId).toBe("lasca_7_classic");

      // Snapshot without playerId should be forbidden.
      const snapSpect = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`);
      expect(snapSpect.status).toBe(403);
      const snapSpectJson = (await snapSpect.json()) as any;
      expect(String(snapSpectJson.error)).toContain("private");

      // Snapshot with wrong watchToken should be forbidden.
      const snapWrongToken = await fetch(
        `${s.url}/api/room/${encodeURIComponent(roomId)}?watchToken=${encodeURIComponent("wrong-token")}`
      );
      expect(snapWrongToken.status).toBe(403);

      // Snapshot with correct watchToken should be allowed (spectator via secret link).
      const snapToken = await fetch(
        `${s.url}/api/room/${encodeURIComponent(roomId)}?watchToken=${encodeURIComponent(String(watchToken))}`
      );
      expect(snapToken.ok).toBe(true);
      const snapTokenJson = (await snapToken.json()) as any;
      expect(snapTokenJson.error).toBeUndefined();
      expect(snapTokenJson.snapshot?.state).toBeTruthy();
      expect(snapTokenJson.identityByColor?.W?.displayName).toBe("Host");

      // Snapshot with valid playerId should be allowed.
      const snapPlayer = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerId)}`);
      expect(snapPlayer.ok).toBe(true);
      const snapPlayerJson = (await snapPlayer.json()) as any;
      expect(snapPlayerJson.error).toBeUndefined();
      expect(snapPlayerJson.snapshot?.state).toBeTruthy();

      // Stream without playerId should be forbidden.
      const streamSpect = await fetch(`${s.url}/api/stream/${encodeURIComponent(roomId)}`, {
        headers: { accept: "text/event-stream" },
      });
      expect(streamSpect.status).toBe(403);

      // Stream with correct watchToken should be allowed.
      const controllerTok = new AbortController();
      const streamToken = await fetch(
        `${s.url}/api/stream/${encodeURIComponent(roomId)}?watchToken=${encodeURIComponent(String(watchToken))}`,
        { headers: { accept: "text/event-stream" }, signal: controllerTok.signal }
      );
      expect(streamToken.ok).toBe(true);
      controllerTok.abort();

      // Stream with playerId should be allowed.
      const controller = new AbortController();
      const streamPlayer = await fetch(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerId)}`,
        { headers: { accept: "text/event-stream" }, signal: controller.signal }
      );
      expect(streamPlayer.ok).toBe(true);
      controller.abort();

      // Replay with correct watchToken should be allowed.
      const replayToken = await fetch(
        `${s.url}/api/room/${encodeURIComponent(roomId)}/replay?watchToken=${encodeURIComponent(String(watchToken))}`
      );
      expect(replayToken.ok).toBe(true);
      const replayTokenJson = (await replayToken.json()) as any;
      expect(replayTokenJson.error).toBeUndefined();
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 15_000);

  it("lists only public rooms in lobby (and includeFull shows full games)", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-room-lobby-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const mkRoom = async (visibility: "public" | "private") => {
        const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
        const history = new HistoryManager();
        history.push(initial);

        const createRes = await fetch(`${s.url}/api/create`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            variantId: "lasca_7_classic",
            visibility,
            snapshot: {
              state: serializeWireGameState(initial),
              history: serializeWireHistory(history.exportSnapshots()),
              stateVersion: 0,
            },
          }),
        }).then((r) => r.json() as Promise<any>);

        expect(createRes.error).toBeUndefined();
        return { roomId: createRes.roomId as string };
      };

      const privateRoom = await mkRoom("private");
      const publicRoom = await mkRoom("public");

      // Fill the public room.
      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: publicRoom.roomId }),
      }).then((r) => r.json() as Promise<any>);
      expect(joinRes.error).toBeUndefined();

      const lobbyDefault = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      const idsDefault = (Array.isArray(lobbyDefault.rooms) ? lobbyDefault.rooms : []).map((x: any) => x.roomId);
      // Joinable private rooms should be visible so Player 2 can discover/join.
      expect(idsDefault).toContain(privateRoom.roomId);
      // Full rooms are hidden by default.
      expect(idsDefault).not.toContain(publicRoom.roomId);

      const lobbyAll = await fetch(`${s.url}/api/lobby?includeFull=1`).then((r) => r.json() as Promise<any>);
      const idsAll = (Array.isArray(lobbyAll.rooms) ? lobbyAll.rooms : []).map((x: any) => x.roomId);
      expect(idsAll).toContain(privateRoom.roomId);
      expect(idsAll).toContain(publicRoom.roomId);

      // Even with includeFull=1, full private rooms should not be listed (spectating requires a secret token).
      const joinResPrivate = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: privateRoom.roomId }),
      }).then((r) => r.json() as Promise<any>);
      expect(joinResPrivate.error).toBeUndefined();

      const lobbyAll2 = await fetch(`${s.url}/api/lobby?includeFull=1`).then((r) => r.json() as Promise<any>);
      const idsAll2 = (Array.isArray(lobbyAll2.rooms) ? lobbyAll2.rooms : []).map((x: any) => x.roomId);
      expect(idsAll2).not.toContain(privateRoom.roomId);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });
});
