import type express from "express";

export function parseCookieHeader(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;

  // Very small cookie parser: "a=b; c=d".
  const parts = raw.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function clearCookie(
  res: express.Response,
  name: string,
  opts?: { secure?: boolean; sameSite?: "Lax" | "None"; partitioned?: boolean },
): void {
  // Set expired cookie. Keep attributes matching setCookie() defaults.
  const secure = Boolean(opts?.secure);
  const sameSite = opts?.sameSite ?? (secure ? "None" : "Lax");
  const partitioned = Boolean(opts?.partitioned);
  const parts: string[] = [];
  parts.push(`${name}=`);
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push("Secure");
  if (partitioned) parts.push("Partitioned");
  parts.push("Max-Age=0");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function setCookie(args: {
  res: express.Response;
  name: string;
  value: string;
  maxAgeSeconds: number;
  secure: boolean;
  sameSite: "Lax" | "None";
  partitioned?: boolean;
}): void {
  const parts: string[] = [];
  parts.push(`${args.name}=${encodeURIComponent(args.value)}`);
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push(`SameSite=${args.sameSite}`);
  if (args.secure) parts.push("Secure");
  if (args.partitioned) parts.push("Partitioned");
  parts.push(`Max-Age=${Math.max(0, Math.floor(args.maxAgeSeconds))}`);
  args.res.setHeader("Set-Cookie", parts.join("; "));
}
