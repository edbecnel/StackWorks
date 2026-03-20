// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";

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

function cookiePairFromSetCookie(setCookie: string | null): string {
  expect(typeof setCookie).toBe("string");
  expect(setCookie).toContain("lasca.sid=");
  const pair = String(setCookie).split(";")[0] ?? "";
  expect(pair).toMatch(/^lasca\.sid=[^;]+$/);
  return pair;
}

function decodeBase64(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

describe("MP4C accounts (authn/authz)", () => {
  it("supports register -> me -> profile update -> logout -> me", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-auth-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");

    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      const reg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "correct horse battery staple",
          displayName: "TestUser",
        }),
      });

      const regJson = (await reg.json()) as any;
      if (!reg.ok) {
        throw new Error(`register failed: HTTP ${reg.status} ${JSON.stringify(regJson)}`);
      }
      expect(regJson.ok).toBe(true);
      expect(regJson.user.email).toBe("test@example.com");
      expect(regJson.user.displayName).toBe("TestUser");

      const cookie = cookiePairFromSetCookie(reg.headers.get("set-cookie"));

      const me1 = await fetch(`${s.url}/api/auth/me`, { headers: { cookie } });
      const me1Json = (await me1.json()) as any;
      expect(me1.ok).toBe(true);
      expect(me1Json.ok).toBe(true);
      expect(me1Json.user.email).toBe("test@example.com");
      expect(me1Json.user.displayName).toBe("TestUser");

      const patch = await fetch(`${s.url}/api/auth/me`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          displayName: "Renamed",
          countryCode: "CA",
          timeZone: "America/Toronto",
        }),
      });
      const patchJson = (await patch.json()) as any;
      expect(patch.ok).toBe(true);
      expect(patchJson.ok).toBe(true);
      expect(patchJson.user.displayName).toBe("Renamed");
      expect(patchJson.user.countryCode).toBe("CA");
      expect(patchJson.user.countryName).toBeTruthy();
      expect(patchJson.user.timeZone).toBe("America/Toronto");

      const logout = await fetch(`${s.url}/api/auth/logout`, { method: "POST", headers: { cookie } });
      const logoutJson = (await logout.json()) as any;
      expect(logout.ok).toBe(true);
      expect(logoutJson.ok).toBe(true);

      const me2 = await fetch(`${s.url}/api/auth/me`, { headers: { cookie } });
      const me2Json = (await me2.json()) as any;
      expect(me2.ok).toBe(true);
      expect(me2Json.ok).toBe(true);
      expect(me2Json.user).toBe(null);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);

  it("supports login with an existing account", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-auth-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");

    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test2@example.com",
          password: "password12345",
          displayName: "Two",
        }),
      });

      const login = await fetch(`${s.url}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test2@example.com", password: "password12345" }),
      });

      const loginJson = (await login.json()) as any;
      if (!login.ok) {
        throw new Error(`login failed: HTTP ${login.status} ${JSON.stringify(loginJson)}`);
      }
      expect(loginJson.ok).toBe(true);
      expect(loginJson.user.email).toBe("test2@example.com");

      const cookie = cookiePairFromSetCookie(login.headers.get("set-cookie"));
      const me = await fetch(`${s.url}/api/auth/me`, { headers: { cookie } });
      const meJson = (await me.json()) as any;
      expect(me.ok).toBe(true);
      expect(meJson.user.email).toBe("test2@example.com");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);

  it("issues partitioned secure auth cookies for HTTPS-origin requests", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-auth-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");

    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      const reg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({
          email: "secure@example.com",
          password: "password12345",
          displayName: "SecureUser",
        }),
      });

      expect(reg.ok).toBe(true);
      const setCookie = reg.headers.get("set-cookie");
      expect(setCookie).toContain("SameSite=None");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("Partitioned");

      const cookie = cookiePairFromSetCookie(setCookie);
      const logout = await fetch(`${s.url}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie,
          "x-forwarded-proto": "https",
        },
      });

      expect(logout.ok).toBe(true);
      const cleared = logout.headers.get("set-cookie");
      expect(cleared).toContain("SameSite=None");
      expect(cleared).toContain("Secure");
      expect(cleared).toContain("Partitioned");
      expect(cleared).toContain("Max-Age=0");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);

  it("applies best-effort country and time-zone defaults from request headers", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-auth-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");

    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      const reg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-ipcountry": "GB",
          "cf-timezone": "Europe/London",
        },
        body: JSON.stringify({
          email: "geo@example.com",
          password: "password12345",
          displayName: "Geo",
        }),
      });

      const regJson = (await reg.json()) as any;
      if (!reg.ok) {
        throw new Error(`register failed: HTTP ${reg.status} ${JSON.stringify(regJson)}`);
      }

      expect(regJson.user.countryCode).toBe("GB");
      expect(regJson.user.countryName).toBeTruthy();
      expect(regJson.user.timeZone).toBe("Europe/London");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);

  it("supports uploading a PNG avatar and serving it back", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-auth-"));
    const gamesDir = path.join(tmpRoot, "games");
    const authDir = path.join(tmpRoot, "auth");

    const s = await startLascaServer({ port: 0, gamesDir, authDir, sessionTtlMs: 60_000 });

    try {
      const reg = await fetch(`${s.url}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "avatar@example.com",
          password: "password12345",
          displayName: "AvatarUser",
        }),
      });
      const regJson = (await reg.json()) as any;
      if (!reg.ok) {
        throw new Error(`register failed: HTTP ${reg.status} ${JSON.stringify(regJson)}`);
      }

      const cookie = cookiePairFromSetCookie(reg.headers.get("set-cookie"));

      // 1x1 transparent PNG.
      const png = decodeBase64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xy2m0AAAAASUVORK5CYII="
      );

      const up = await fetch(`${s.url}/api/auth/me/avatar`, {
        method: "PUT",
        headers: { "content-type": "image/png", cookie },
        body: png,
      });
      const upJson = (await up.json()) as any;
      if (!up.ok) {
        throw new Error(`avatar upload failed: HTTP ${up.status} ${JSON.stringify(upJson)}`);
      }
      expect(upJson.ok).toBe(true);
      expect(typeof upJson.user?.avatarUrl).toBe("string");
      expect(String(upJson.user.avatarUrl)).toContain("/api/auth/avatar/");

      const avatarPath = String(upJson.user.avatarUrl).split("?")[0];
      const get = await fetch(`${s.url}${avatarPath}`);
      expect(get.ok).toBe(true);
      expect(get.headers.get("content-type")).toContain("image/png");
      expect(get.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
      const bytes = new Uint8Array(await get.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(8);
      // Signature check.
      expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);
});
