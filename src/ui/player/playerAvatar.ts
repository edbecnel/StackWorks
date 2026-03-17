import type { Player } from "../../types";

export interface PlayerAvatarOptions {
  color: Player;
  displayName: string;
  isLocal: boolean;
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
  avatar.textContent = initialsForName(opts.displayName);
  return avatar;
}