// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";

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

describe("server stockfish endpoint", () => {
  it("serves bestmove and evaluate through the main game server", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-stockfish-api-"));
    const gamesDir = path.join(tmpRoot, "games");
    const fakeEngine = path.resolve("src", "test-assets", "fakeStockfishEngine.mjs");
    const s = await startLascaServer({ port: 0, gamesDir, stockfishEngineJs: fakeEngine });

    try {
      const healthRes = await fetch(`${s.url}/api/stockfish/health`);
      expect(healthRes.ok).toBe(true);
      const healthJson = await healthRes.json() as any;
      expect(healthJson.ok).toBe(true);
      expect(healthJson.ready).toBe(true);
      expect(healthJson.running).toBe(true);

      const bestmoveRes = await fetch(`${s.url}/api/stockfish/bestmove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          movetimeMs: 25,
          skill: 7,
        }),
      });
      expect(bestmoveRes.ok).toBe(true);
      const bestmoveJson = await bestmoveRes.json() as any;
      expect(bestmoveJson).toEqual({ ok: true, uci: "e2e4" });

      const evalRes = await fetch(`${s.url}/api/stockfish/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          movetimeMs: 25,
        }),
      });
      expect(evalRes.ok).toBe(true);
      const evalJson = await evalRes.json() as any;
      expect(evalJson).toEqual({ ok: true, cp: 83 });

      const restartRes = await fetch(`${s.url}/api/stockfish/restart`, { method: "POST" });
      expect(restartRes.ok).toBe(true);
      const restartJson = (await restartRes.json()) as any;
      expect(restartJson).toEqual({ ok: true });

      const healthAfter = await fetch(`${s.url}/api/stockfish/health`);
      expect(healthAfter.ok).toBe(true);
      const bestAfter = await fetch(`${s.url}/api/stockfish/bestmove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          movetimeMs: 25,
        }),
      });
      expect(bestAfter.ok).toBe(true);
    } finally {
      await new Promise<void>((resolve) => s.server.close(() => resolve()));
      await rmWithRetries(tmpRoot);
    }
  });
});