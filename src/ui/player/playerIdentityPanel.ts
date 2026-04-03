import type { PlayerIdentity } from "../../types";
import { createPlayerAvatar } from "./playerAvatar";
import { createPlayerStatusBadge } from "./playerStatusBadge";
import { attachShellAvatarEnlarge } from "./shellAvatarEnlarge";

export interface PlayerIdentityPanelOptions {
  identity: PlayerIdentity;
}

export interface PlayerIdentityPanelController {
  element: HTMLDivElement;
  update(identity: PlayerIdentity): void;
}

function isRedundantLocalStatus(identity: PlayerIdentity): boolean {
  return identity.status === "offline" && identity.statusText.trim().toLowerCase() === "local play";
}

function getActiveTurnChipText(identity: PlayerIdentity): string {
  const normalizedDetail = identity.detailText.trim().replace(/[.!?]+$/, "");
  if (!normalizedDetail || /^to move$/i.test(normalizedDetail)) {
    return `${identity.sideLabel} to move`;
  }
  return normalizedDetail;
}

function countryCodeToFlagEmoji(countryCode: string | null | undefined): string {
  const code = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(...code.split("").map((ch) => base + ch.charCodeAt(0) - 65));
}

export function createPlayerIdentityPanel(opts: PlayerIdentityPanelOptions): PlayerIdentityPanelController {
  const root = document.createElement("div");
  root.className = "gameShellPlayerPanel";

  const identityRow = document.createElement("div");
  identityRow.className = "gameShellPlayerIdentityRow";

  let displayNameForAvatarAlt = opts.identity.displayName;

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "shellAvatarEnlargeWrap";
  const avatarTap = document.createElement("button");
  avatarTap.type = "button";
  avatarTap.className = "shellAvatarEnlargeTap";
  avatarTap.setAttribute("aria-label", "View avatar");

  let avatar = createPlayerAvatar({
    color: opts.identity.color,
    displayName: opts.identity.displayName,
    isLocal: opts.identity.isLocal,
  });
  avatarTap.appendChild(avatar);

  const avatarHover = document.createElement("div");
  avatarHover.className = "shellAvatarEnlargeHover";
  avatarHover.hidden = true;
  const avatarHoverImg = document.createElement("img");
  avatarHoverImg.className = "shellAvatarEnlargeHoverImg";
  avatarHoverImg.alt = "";
  avatarHover.appendChild(avatarHoverImg);
  avatarWrap.append(avatarTap, avatarHover);

  const syncAvatarEnlargeTap = (): void => {
    if (avatarWrap.hidden) {
      avatarTap.disabled = true;
      avatarHover.hidden = true;
      avatarTap.setAttribute("aria-label", "Avatar");
      return;
    }
    const img = avatar.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;
    const ready = Boolean(
      img?.src && (avatar.dataset.hasImage === "1" || (img.complete && img.naturalWidth > 0)),
    );
    avatarTap.disabled = !ready;
    if (!ready) {
      avatarHover.hidden = true;
    }
    avatarTap.setAttribute("aria-label", ready ? "Enlarge avatar" : "Avatar");
  };

  attachShellAvatarEnlarge(avatarWrap, {
    tapButton: avatarTap,
    getThumbSrc: () => {
      const img = avatar.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;
      if (!img?.src) return null;
      if (avatar.dataset.hasImage !== "1" && !(img.complete && img.naturalWidth > 0)) return null;
      return img.currentSrc || img.src;
    },
    getThumbAlt: () => displayNameForAvatarAlt.trim() || "Player avatar",
  });

  const textBlock = document.createElement("div");
  textBlock.className = "gameShellPlayerText";

  const role = document.createElement("div");
  role.className = "gameShellPlayerRole";

  const nameRow = document.createElement("div");
  nameRow.className = "gameShellPlayerNameRow";

  const flag = document.createElement("span");
  flag.className = "gameShellPlayerFlag";

  const name = document.createElement("div");
  name.className = "gameShellPlayerName";

  const detail = document.createElement("div");
  detail.className = "gameShellPlayerDetail";

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
  nameRow.append(flag, name);
  textBlock.append(role, nameRow, detail);
  identityRow.append(avatarWrap, textBlock, meta, badge.element);
  root.append(identityRow);

  const update = (identity: PlayerIdentity): void => {
    root.dataset.playerColor = identity.color;
    root.dataset.activeTurn = identity.isActiveTurn ? "1" : "0";
    root.dataset.playerStatus = identity.status;
    root.dataset.redundantStatus = isRedundantLocalStatus(identity) ? "1" : "0";
    avatarWrap.hidden = Boolean(identity.hideAvatar);

    displayNameForAvatarAlt = identity.displayName;

    const nextAvatar = createPlayerAvatar({
      color: identity.color,
      displayName: identity.displayName,
      isLocal: identity.isLocal,
      avatarUrl: identity.avatarUrl,
    });
    avatar.replaceWith(nextAvatar);
    avatar = nextAvatar;

    role.textContent = identity.roleLabel;
    const flagEmoji = countryCodeToFlagEmoji(identity.countryCode);
    flag.hidden = !flagEmoji;
    flag.textContent = flagEmoji;
    if (flagEmoji && identity.countryName) {
      flag.title = identity.countryName;
      flag.setAttribute("aria-label", identity.countryName);
    } else {
      flag.removeAttribute("title");
      flag.removeAttribute("aria-label");
    }
    name.textContent = identity.displayName;
    detail.textContent = identity.detailText;
    badge.setStatus({ status: identity.status, text: identity.statusText });

    sideChip.textContent = identity.sideLabel;
    const viewerTag = typeof identity.viewerTag === "string" && identity.viewerTag.trim() ? identity.viewerTag.trim() : (identity.isLocal ? "You" : "");
    localChip.hidden = !viewerTag;
    localChip.textContent = viewerTag;
    activeChip.hidden = !identity.isActiveTurn;
    activeChip.textContent = getActiveTurnChipText(identity);

    syncAvatarEnlargeTap();
    const shellImg = avatar.querySelector(".gameShellPlayerAvatarImage") as HTMLImageElement | null;
    shellImg?.addEventListener("load", syncAvatarEnlargeTap, { once: true });
    shellImg?.addEventListener("error", syncAvatarEnlargeTap, { once: true });
    queueMicrotask(syncAvatarEnlargeTap);
  };

  update(opts.identity);

  return {
    element: root,
    update,
  };
}