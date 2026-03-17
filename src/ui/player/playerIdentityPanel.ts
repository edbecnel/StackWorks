import type { PlayerIdentity } from "../../types";
import { createPlayerAvatar } from "./playerAvatar";
import { createPlayerStatusBadge } from "./playerStatusBadge";

export interface PlayerIdentityPanelOptions {
  identity: PlayerIdentity;
}

export interface PlayerIdentityPanelController {
  element: HTMLDivElement;
  update(identity: PlayerIdentity): void;
}

export function createPlayerIdentityPanel(opts: PlayerIdentityPanelOptions): PlayerIdentityPanelController {
  const root = document.createElement("div");
  root.className = "gameShellPlayerPanel";

  const identityRow = document.createElement("div");
  identityRow.className = "gameShellPlayerIdentityRow";

  let avatar = createPlayerAvatar({
    color: opts.identity.color,
    displayName: opts.identity.displayName,
    isLocal: opts.identity.isLocal,
  });

  const textBlock = document.createElement("div");
  textBlock.className = "gameShellPlayerText";

  const role = document.createElement("div");
  role.className = "gameShellPlayerRole";

  const name = document.createElement("div");
  name.className = "gameShellPlayerName";

  const detail = document.createElement("div");
  detail.className = "gameShellPlayerDetail";

  textBlock.append(role, name, detail);

  const badge = createPlayerStatusBadge({
    status: opts.identity.status,
    text: opts.identity.statusText,
  });

  const meta = document.createElement("div");
  meta.className = "gameShellPlayerMeta";

  const sideChip = document.createElement("span");
  sideChip.className = "gameShellPlayerMetaChip";

  const localChip = document.createElement("span");
  localChip.className = "gameShellPlayerMetaChip";

  const activeChip = document.createElement("span");
  activeChip.className = "gameShellPlayerMetaChip";

  meta.append(sideChip, localChip, activeChip);
  identityRow.append(avatar, textBlock, badge.element);
  root.append(identityRow, meta);

  const update = (identity: PlayerIdentity): void => {
    root.dataset.playerColor = identity.color;
    root.dataset.activeTurn = identity.isActiveTurn ? "1" : "0";
    root.dataset.playerStatus = identity.status;

    const nextAvatar = createPlayerAvatar({
      color: identity.color,
      displayName: identity.displayName,
      isLocal: identity.isLocal,
    });
    avatar.replaceWith(nextAvatar);
    avatar = nextAvatar;

    role.textContent = identity.roleLabel;
    name.textContent = identity.displayName;
    detail.textContent = identity.detailText;
    badge.setStatus({ status: identity.status, text: identity.statusText });

    sideChip.textContent = identity.color === "W" ? "White side" : "Black side";
    localChip.hidden = !identity.isLocal;
    localChip.textContent = "You";
    activeChip.hidden = !identity.isActiveTurn;
    activeChip.textContent = "To move";
  };

  update(opts.identity);

  return {
    element: root,
    update,
  };
}