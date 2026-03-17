import type { Player } from "../../types";

export interface PlayerAvatarOptions {
  color: Player;
  displayName: string;
  isLocal: boolean;
  avatarUrl?: string | null;
}

function initialsForName(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function createPlayerAvatar(opts: PlayerAvatarOptions): HTMLDivElement {
  const avatar = document.createElement("div");
  avatar.className = "gameShellPlayerAvatar";
  avatar.dataset.playerColor = opts.color;
  if (opts.isLocal) avatar.dataset.isLocal = "1";
  avatar.setAttribute("aria-hidden", "true");

  const fallback = document.createElement("span");
  fallback.className = "gameShellPlayerAvatarFallback";
  fallback.textContent = initialsForName(opts.displayName);
  avatar.appendChild(fallback);

  const rawAvatarUrl = typeof opts.avatarUrl === "string" ? opts.avatarUrl.trim() : "";
  if (rawAvatarUrl) {
    const image = document.createElement("img");
    image.className = "gameShellPlayerAvatarImage";
    image.src = rawAvatarUrl;
    image.alt = "";
    image.decoding = "async";
    image.loading = "eager";
    image.addEventListener("load", () => {
      avatar.dataset.hasImage = "1";
    });
    image.addEventListener("error", () => {
      avatar.dataset.hasImage = "0";
      image.remove();
    });
    avatar.appendChild(image);
  }

  return avatar;
}