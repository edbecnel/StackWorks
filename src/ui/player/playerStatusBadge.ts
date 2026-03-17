import type { PresenceState } from "../../types";

export interface PlayerStatusBadgeOptions {
  status: PresenceState;
  text: string;
}

export interface PlayerStatusBadgeController {
  element: HTMLSpanElement;
  setStatus(next: PlayerStatusBadgeOptions): void;
}

export function createPlayerStatusBadge(opts: PlayerStatusBadgeOptions): PlayerStatusBadgeController {
  const badge = document.createElement("span");
  badge.className = "gameShellPlayerStatusBadge";

  const setStatus = (next: PlayerStatusBadgeOptions): void => {
    badge.dataset.status = next.status;
    badge.textContent = next.text;
  };

  setStatus(opts);

  return {
    element: badge,
    setStatus,
  };
}