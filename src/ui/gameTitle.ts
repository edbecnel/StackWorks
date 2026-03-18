import { renderLogo } from "./branding/logo";

const GAME_TITLE_STYLE_ID = "stackworks-game-title-style";

function ensureGameTitleStyles(): void {
  if (document.getElementById(GAME_TITLE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = GAME_TITLE_STYLE_ID;
  style.textContent = `
    .stackworksGameTitleRoot {
      display: flex;
      flex-direction: column;
      gap: 1px;
      line-height: 1.1;
      min-width: 0;
    }

    .stackworksGameTitleBrandLink {
      display: inline-flex;
      align-items: center;
      width: min(128px, 100%);
      max-width: min(128px, 100%);
      text-decoration: none;
      overflow: hidden;
    }

    .stackworksGameTitleBrandLink img {
      display: block;
      width: calc(100% + 3px);
      max-width: none;
      height: auto;
      margin-left: -3px;
    }

    .stackworksGameTitleTextBrand {
      font-size: 14px;
    }

    .stackworksGameTitleGameName {
      font-size: 13px;
    }

    body[data-panel-layout="menu"] .stackworksGameTitleBrandLink {
      display: none;
    }

    body[data-panel-layout="menu"] .stackworksGameTitleTextBrand {
      display: block;
    }

    body:not([data-panel-layout="menu"]) .stackworksGameTitleBrandLink {
      display: inline-flex;
    }

    body:not([data-panel-layout="menu"]) .stackworksGameTitleTextBrand {
      display: none;
    }
  `;

  document.head.appendChild(style);
}

export function setStackWorksGameTitle(el: HTMLElement, gameName: string, startHref = "./"): void {
  ensureGameTitleStyles();

  const name = String(gameName ?? "").trim();
  const game = name.length > 0 ? name : "Game";

  // Override the one-line sidebar title styling.
  el.style.whiteSpace = "normal";
  el.style.overflow = "visible";
  el.style.textOverflow = "clip";

  el.classList.add("stackworksGameTitleRoot");

  const brandLink = document.createElement("a");
  brandLink.className = "stackworksGameTitleBrandLink";
  brandLink.href = startHref;
  brandLink.setAttribute("aria-label", "Start Page");
  brandLink.title = "Start Page";
  renderLogo(brandLink, { variant: "wordmark", ariaHidden: true });

  const top = document.createElement("div");
  top.className = "stackworksGameTitleTextBrand";
  top.textContent = "StackWorks";

  const bottom = document.createElement("div");
  bottom.className = "stackworksGameTitleGameName";
  bottom.textContent = game;

  el.replaceChildren(brandLink, top, bottom);
}
