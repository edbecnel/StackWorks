// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { deserializeWireGameState, serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

async function rmWithRetries(targetPath: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25 * (i + 1)));
    }
  }
  await fs.rm(targetPath, { recursive: true, force: true });
}

describe("online move latency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not block submitMove responses on event persistence", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-latency-"));
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
      }).then((response) => response.json() as Promise<any>);

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId }),
      }).then((response) => response.json() as Promise<any>);

      const roomRes = await fetch(`${s.url}/api/room/${encodeURIComponent(createRes.roomId)}`)
        .then((response) => response.json() as Promise<any>);
      const state = deserializeWireGameState(roomRes.snapshot.state);
      const mover = state.toMove === "W" ? createRes.playerId : joinRes.playerId;
      const legal = generateLegalMoves(state);
      const move = legal.find((candidate) => candidate.kind === "move") ?? legal[0];
      expect(move).toBeTruthy();

      let releaseAppend!: () => void;
      const appendBlocked = new Promise<void>((resolve) => {
        releaseAppend = () => resolve();
      });
      const originalAppendFile = fs.appendFile.bind(fs);
      const appendSpy = vi.spyOn(fs, "appendFile").mockImplementation(async (filePath, data, options) => {
        const target = String(filePath);
        if (target.endsWith(".events.jsonl") && String(data).includes('"type":"MOVE_APPLIED"')) {
          await appendBlocked;
        }
        return originalAppendFile(filePath as any, data as any, options as any);
      });

      const submitPromise = fetch(`${s.url}/api/submitMove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId, playerId: mover, move }),
      }).then((response) => response.json() as Promise<any>);

      const raced = await Promise.race([
        submitPromise.then(() => "resolved" as const),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 150)),
      ]);

      releaseAppend();
      expect(raced).toBe("resolved");

      const submitRes = await submitPromise;
      expect(submitRes.error).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(appendSpy).toHaveBeenCalled();
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);
});
