// @vitest-environment node
import { describe, expect, it } from "vitest";
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
      await new Promise((resolve) => setTimeout(resolve, 25 * (i + 1)));
    }
  }
  await fs.rm(p, { recursive: true, force: true });
}

function cookiePairFromSetCookie(setCookie: string | null): string {
  expect(typeof setCookie).toBe("string");
  const pair = String(setCookie).split(";")[0] ?? "";
  expect(pair).toMatch(/^lasca\.sid=[^;]+$/);
  return pair;
}

function bearerHeaderFromAuthResponse(body: any): Record<string, string> {
  const token = typeof body?.sessionToken === "string" ? body.sessionToken : "";
  expect(token).toMatch(/^[0-9a-f]+$/i);
  return { authorization: `Bearer ${token}` };
}

describe("online authenticated room identity", () => {
  it("surfaces avatar and country metadata from authenticated accounts in room identity", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-auth-identity-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");
    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const hostReg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "host@example.com",
          password: "password12345",
          displayName: "HostAccount",
          countryCode: "CA",
          timeZone: "America/Toronto",
        }),
      });
      const hostRegJson = await hostReg.json() as any;
      const hostCookie = cookiePairFromSetCookie(hostReg.headers.get("set-cookie"));
      const hostBearer = bearerHeaderFromAuthResponse(hostRegJson);

      const hostPatch = await fetch(`${s.url}/api/auth/me`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...hostBearer },
        body: JSON.stringify({ avatarUrl: "https://example.com/host.png" }),
      }).then((response) => response.json() as Promise<any>);
      expect(hostPatch.ok).toBe(true);
      expect(hostPatch.user.avatarUrl).toBe("https://example.com/host.png");

      const guestReg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "guest@example.com",
          password: "password12345",
          displayName: "GuestAccount",
          countryCode: "GB",
          timeZone: "Europe/London",
        }),
      });
      const guestRegJson = await guestReg.json() as any;
      const guestBearer = bearerHeaderFromAuthResponse(guestRegJson);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json", ...hostBearer },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((response) => response.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      expect(createRes.identity?.[createRes.playerId]?.displayName).toBe("HostAccount");
      expect(createRes.identity?.[createRes.playerId]?.avatarUrl).toBe("https://example.com/host.png");
      expect(createRes.identity?.[createRes.playerId]?.countryCode).toBe("CA");
      expect(createRes.identity?.[createRes.playerId]?.countryName).toBeTruthy();

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json", ...guestBearer },
        body: JSON.stringify({ roomId: createRes.roomId }),
      }).then((response) => response.json() as Promise<any>);

      expect(joinRes.error).toBeUndefined();
      expect(joinRes.identity?.[createRes.playerId]?.displayName).toBe("HostAccount");
      expect(joinRes.identity?.[joinRes.playerId]?.displayName).toBe("GuestAccount");
      expect(joinRes.identity?.[joinRes.playerId]?.countryCode).toBe("GB");
      expect(joinRes.identity?.[joinRes.playerId]?.countryName).toBeTruthy();

      const roomRes = await fetch(`${s.url}/api/room/${encodeURIComponent(createRes.roomId)}?playerId=${encodeURIComponent(createRes.playerId)}`, {
        headers: hostBearer,
      }).then((response) => response.json() as Promise<any>);

      expect(roomRes.error).toBeUndefined();
      expect(roomRes.identity?.[createRes.playerId]?.avatarUrl).toBe("https://example.com/host.png");
      expect(roomRes.identity?.[joinRes.playerId]?.countryCode).toBe("GB");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);
});