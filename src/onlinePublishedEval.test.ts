// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { deserializeWireGameState, serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

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

describe("online published eval", () => {
  it("returns the last published player eval to spectators and clears it after a move", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-published-eval-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "chess_classic",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;
    const playerW = createRes.playerId as string;

    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();
    const playerB = joinRes.playerId as string;

    const publishRes = await fetch(`${s.url}/api/publishEval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId: playerW, score: { cp: 37 }, expectedStateVersion: 0 }),
    }).then((r) => r.json() as Promise<any>);

    expect(publishRes.error).toBeUndefined();
    expect(publishRes.publishedEval).toEqual({ stateVersion: 0, score: { cp: 37 } });

    const spectatorSnap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(spectatorSnap.publishedEval).toEqual({ stateVersion: 0, score: { cp: 37 } });

    const state = deserializeWireGameState(spectatorSnap.snapshot.state);
    const legal = generateLegalMoves(state);
    expect(legal.length).toBeGreaterThan(0);
    const move = legal.find((candidate) => candidate.kind === "move") ?? legal[0];
    const mover = state.toMove === "W" ? playerW : playerB;

    const moveRes = await fetch(`${s.url}/api/submitMove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId: mover, move, expectedStateVersion: 0 }),
    }).then((r) => r.json() as Promise<any>);

    expect(moveRes.error).toBeUndefined();
    expect(moveRes.publishedEval ?? null).toBeNull();

    const spectatorAfterMove = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(spectatorAfterMove.publishedEval ?? null).toBeNull();

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
