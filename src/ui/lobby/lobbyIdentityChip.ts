import type { PlayerColor, PlayerIdentity } from "../../shared/onlineProtocol";
import { normalizeCountryCode } from "../../shared/profileMetadata";

function initialsForDisplayName(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function countryCodeToFlagEmoji(countryCode: string | null | undefined): string {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized || normalized.length !== 2) return "";
  return normalized
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function resolveLobbyAvatarUrl(serverUrl: string, avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  if (!serverUrl) return null;
  try {
    return new URL(avatarUrl, `${serverUrl}/`).toString();
  } catch {
    return null;
  }
}

export function createLobbyIdentityChip(args: {
  serverUrl: string;
  seatLabel: string;
  identity?: Pick<PlayerIdentity, "displayName" | "avatarUrl" | "countryCode" | "countryName">;
  color: PlayerColor;
}): HTMLDivElement | null {
  const displayName = typeof args.identity?.displayName === "string" ? args.identity.displayName.trim() : "";
  const countryCode = normalizeCountryCode(args.identity?.countryCode) ?? "";
  const countryName = typeof args.identity?.countryName === "string" ? args.identity.countryName.trim() : "";
  const avatarUrl = resolveLobbyAvatarUrl(args.serverUrl, args.identity?.avatarUrl ?? null);
  if (!displayName && !countryCode && !countryName && !avatarUrl) return null;

  const chip = document.createElement("div");
  chip.className = "lobbyIdentityChip";

  const avatar = document.createElement("div");
  avatar.className = "lobbyIdentityAvatar";
  avatar.dataset.playerColor = args.color;

  const fallback = document.createElement("span");
  fallback.className = "lobbyIdentityAvatarFallback";
  fallback.textContent = initialsForDisplayName(displayName || args.seatLabel);
  avatar.appendChild(fallback);

  if (avatarUrl) {
    const image = document.createElement("img");
    image.className = "lobbyIdentityAvatarImage";
    image.src = avatarUrl;
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    image.addEventListener("load", () => {
      avatar.dataset.hasImage = "1";
    });
    image.addEventListener("error", () => {
      avatar.dataset.hasImage = "0";
      image.remove();
    });
    avatar.appendChild(image);
  }

  const text = document.createElement("div");
  text.className = "lobbyIdentityText";

  const name = document.createElement("div");
  name.className = "lobbyIdentityName";
  name.textContent = `${args.seatLabel}: ${displayName || "—"}`;

  const meta = document.createElement("div");
  meta.className = "lobbyIdentityMeta";
  const flagEmoji = countryCodeToFlagEmoji(countryCode);
  meta.textContent = [flagEmoji, countryName || countryCode].filter(Boolean).join(" ");

  text.appendChild(name);
  if (meta.textContent) text.appendChild(meta);

  chip.append(avatar, text);
  return chip;
}