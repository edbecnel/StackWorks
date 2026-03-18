import fs from "node:fs/promises";
import path from "node:path";

import { secureRandomHex } from "../secureRandom.ts";
import type { AuthUser, UserId } from "../../../src/shared/authProtocol.ts";
import type { PasswordHash } from "./password.ts";

export type StoredUser = AuthUser & {
  password: PasswordHash;
};

type PersistedUsersFileV1 = {
  version: 1;
  users: StoredUser[];
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function resolveAuthDir(args: { gamesDir: string; authDir?: string | undefined }): string {
  if (args.authDir && args.authDir.trim()) return path.resolve(args.authDir);

  // Default: keep auth data adjacent to the default games folder.
  // If gamesDir ends with "games", use its parent; otherwise, keep auth under gamesDir.
  const base = path.resolve(args.gamesDir);
  const parent = path.dirname(base);
  const isDefaultLayout = path.basename(base).toLowerCase() === "games";
  return isDefaultLayout ? path.join(parent, "auth") : path.join(base, "auth");
}

export async function ensureAuthDir(authDir: string): Promise<void> {
  await fs.mkdir(authDir, { recursive: true });
}

function usersFilePath(authDir: string): string {
  return path.join(authDir, "users.json");
}

async function readUsersFile(authDir: string): Promise<PersistedUsersFileV1> {
  const p = usersFilePath(authDir);
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as any;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.users)) {
      return { version: 1, users: parsed.users as StoredUser[] };
    }
  } catch {
    // ignore
  }
  return { version: 1, users: [] };
}

async function writeUsersFileAtomic(authDir: string, file: PersistedUsersFileV1): Promise<void> {
  const p = usersFilePath(authDir);
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}.${secureRandomHex(8)}`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function findUserByEmail(authDir: string, email: string): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email);
  const file = await readUsersFile(authDir);
  const u = file.users.find((x) => normalizeEmail(x.email) === normalized) ?? null;
  return u;
}

export async function findUserById(authDir: string, userId: UserId): Promise<StoredUser | null> {
  const file = await readUsersFile(authDir);
  const u = file.users.find((x) => x.userId === userId) ?? null;
  return u;
}

export async function createUser(args: {
  authDir: string;
  email: string;
  password: PasswordHash;
  displayName: string;
  countryCode?: string | undefined;
  countryName?: string | undefined;
  timeZone?: string | undefined;
}): Promise<StoredUser> {
  const email = normalizeEmail(args.email);
  const displayName = args.displayName.trim();
  if (!email) throw new Error("Missing email");
  if (!displayName) throw new Error("Missing displayName");

  const file = await readUsersFile(args.authDir);
  if (file.users.some((u) => normalizeEmail(u.email) === email)) {
    throw new Error("Email already registered");
  }

  const userId: UserId = secureRandomHex(16);
  const createdAtIso = new Date().toISOString();

  const user: StoredUser = {
    userId,
    email,
    displayName,
    ...(args.countryCode ? { countryCode: args.countryCode } : {}),
    ...(args.countryName ? { countryName: args.countryName } : {}),
    ...(args.timeZone ? { timeZone: args.timeZone } : {}),
    createdAtIso,
    password: args.password,
  };

  file.users.push(user);
  await writeUsersFileAtomic(args.authDir, file);
  return user;
}

export async function updateUserProfile(args: {
  authDir: string;
  userId: UserId;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  countryCode?: string | undefined;
  countryName?: string | undefined;
  timeZone?: string | undefined;
}): Promise<StoredUser> {
  const file = await readUsersFile(args.authDir);
  const idx = file.users.findIndex((u) => u.userId === args.userId);
  if (idx < 0) throw new Error("User not found");

  const cur = file.users[idx];
  const next: StoredUser = { ...cur };

  if (typeof args.displayName === "string") {
    const name = args.displayName.trim();
    if (!name) throw new Error("Invalid displayName");
    next.displayName = name.slice(0, 24);
  }

  if (typeof args.avatarUrl === "string") {
    const v = args.avatarUrl.trim();
    if (!v) {
      delete (next as any).avatarUrl;
    } else {
      // Keep this permissive; UI can validate further.
      next.avatarUrl = v.slice(0, 300);
    }
  }

  if (typeof args.countryCode === "string") {
    const code = args.countryCode.trim().toUpperCase();
    if (!code) {
      delete (next as any).countryCode;
      delete (next as any).countryName;
    } else {
      next.countryCode = code;
      if (typeof args.countryName === "string" && args.countryName.trim()) {
        next.countryName = args.countryName.trim().slice(0, 80);
      } else {
        delete (next as any).countryName;
      }
    }
  }

  if (typeof args.timeZone === "string") {
    const tz = args.timeZone.trim();
    if (!tz) {
      delete (next as any).timeZone;
    } else {
      next.timeZone = tz.slice(0, 80);
    }
  }

  file.users[idx] = next;
  await writeUsersFileAtomic(args.authDir, file);
  return next;
}

export function publicUser(u: StoredUser): AuthUser {
  const { password: _pw, ...pub } = u;
  return pub;
}
