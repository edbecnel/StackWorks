import { APP_SHELL_GAMES } from "../../config/appShellConfig";
import { GlobalSection, PlaySubSection, readShellState, updateShellState } from "../../config/shellState";
import { createTabs } from "../navigation/tabs";
import type { VariantId } from "../../variants/variantTypes";

export interface PlayHubAction {
  label: string;
  description: string;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}

export interface PlayHubOptions {
  currentVariantId: VariantId;
  backHref?: string;
  helpHref?: string;
  onlineAction?: PlayHubAction | null;
  botAction?: PlayHubAction | null;
  friendAction?: PlayHubAction | null;
}

export interface PlayHubController {
  element: HTMLElement;
  setActiveTab(tabId: PlaySubSection): void;
}

const PLAY_HUB_STYLE_ID = "stackworks-play-hub-style";

function ensurePlayHubStyles(): void {
  if (document.getElementById(PLAY_HUB_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PLAY_HUB_STYLE_ID;
  style.textContent = `
    .playHub {
      display: grid;
      gap: 12px;
    }

    .playHubHeader {
      display: grid;
      gap: 6px;
    }

    .playHubEyebrow {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .playHubTitle {
      margin: 0;
      font-size: 18px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.96);
    }

    .playHubDescription {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.68);
    }

    .playHubTabs {
      gap: 6px;
    }

    .playHubBody {
      display: grid;
      gap: 10px;
    }

    .playHubPanel {
      display: none;
      gap: 10px;
    }

    .playHubPanel.isActive {
      display: grid;
    }

    .playHubActions,
    .playHubVariants {
      display: grid;
      gap: 8px;
    }

    .playHubAction,
    .playHubVariantButton {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 14px;
      padding: 11px 12px;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .playHubAction:hover,
    .playHubAction:focus-visible,
    .playHubVariantButton:hover,
    .playHubVariantButton:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .playHubAction:disabled,
    .playHubVariantButton:disabled {
      cursor: default;
      opacity: 0.55;
      background: rgba(255, 255, 255, 0.03);
    }

    .playHubVariantButton.isActive {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }

    .playHubActionLabel,
    .playHubVariantLabel {
      display: block;
      font-size: 12px;
      font-weight: 700;
    }

    .playHubActionDescription,
    .playHubVariantDescription {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.62);
    }

    .playHubPlaceholder {
      border-radius: 14px;
      border: 1px dashed rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
    }

    .playHubPlaceholderTitle {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
    }

    .playHubPlaceholderText {
      margin: 6px 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.62);
    }
  `;

  document.head.appendChild(style);
}

function setLauncherVariant(variantId: VariantId): void {
  try {
    localStorage.setItem("lasca.variantId", variantId);
  } catch {
    // ignore
  }
}

function navigateToHref(href: string): void {
  window.location.href = href;
}

function updatePlayHubState(currentVariantId: VariantId, playSubSection: PlaySubSection): void {
  updateShellState({
    activeGame: currentVariantId,
    activeSection: GlobalSection.Games,
    playSubSection,
  });
}

function createAction(action: PlayHubAction): HTMLElement {
  const element = action.href ? document.createElement("a") : document.createElement("button");
  element.className = "playHubAction";
  element.innerHTML = `<span class="playHubActionLabel">${action.label}</span><span class="playHubActionDescription">${action.description}</span>`;

  if (element instanceof HTMLAnchorElement) {
    element.href = action.href as string;
    if (action.external) {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
    element.addEventListener("click", (event) => {
      if (action.disabled) {
        event.preventDefault();
        return;
      }
      action.onSelect?.();
    });
  } else {
    element.type = "button";
    element.disabled = Boolean(action.disabled);
    element.addEventListener("click", () => {
      if (action.disabled) return;
      action.onSelect?.();
    });
  }

  if (action.disabled) {
    element.setAttribute("aria-disabled", "true");
  }

  return element;
}

function createPlaceholder(title: string, description: string): HTMLElement {
  const placeholder = document.createElement("div");
  placeholder.className = "playHubPlaceholder";
  placeholder.innerHTML = `<p class="playHubPlaceholderTitle">${title}</p><p class="playHubPlaceholderText">${description}</p>`;
  return placeholder;
}

export function createPlayHub(opts: PlayHubOptions): PlayHubController {
  ensurePlayHubStyles();

  const root = document.createElement("section");
  root.className = "playHub";

  const header = document.createElement("div");
  header.className = "playHubHeader";
  header.innerHTML = `
    <p class="playHubEyebrow">Play hub</p>
    <h2 class="playHubTitle">Choose the next move</h2>
    <p class="playHubDescription">Route into the current game's live controls, jump back to the launcher, or switch to another StackWorks variant without relying on the legacy sidebars.</p>
  `;

  const body = document.createElement("div");
  body.className = "playHubBody";
  const panels = new Map<PlaySubSection, HTMLElement>();

  const tabs = createTabs({
    className: "playHubTabs",
    activeId: readShellState().playSubSection ?? PlaySubSection.Online,
    items: [
      { id: PlaySubSection.Online, label: "Online" },
      { id: PlaySubSection.Bots, label: "Bots" },
      { id: PlaySubSection.Coach, label: "Coach" },
      { id: PlaySubSection.Friend, label: "Friend" },
      { id: PlaySubSection.Tournaments, label: "Tournaments" },
      { id: PlaySubSection.Variants, label: "Variants" },
    ],
  });

  const setActiveTab = (tabId: PlaySubSection): void => {
    tabs.setActiveTab(tabId);
    updatePlayHubState(opts.currentVariantId, tabId);
    for (const [id, panel] of panels) {
      panel.classList.toggle("isActive", id === tabId);
    }
  };

  const onlinePanel = document.createElement("div");
  onlinePanel.className = "playHubPanel";
  const onlineActions = document.createElement("div");
  onlineActions.className = "playHubActions";
  if (opts.onlineAction) {
    onlineActions.appendChild(createAction(opts.onlineAction));
  }
  if (opts.backHref) {
    onlineActions.appendChild(createAction({
      label: "Open launcher lobby",
      description: "Return to the start page and continue into lobby, room, rejoin, or spectate flows.",
      onSelect: () => {
        updateShellState({
          activeGame: opts.currentVariantId,
          activeSection: GlobalSection.Community,
          playSubSection: PlaySubSection.Online,
        });
      },
      href: opts.backHref,
    }));
  }
  if (opts.helpHref) {
    onlineActions.appendChild(createAction({
      label: "Read online help",
      description: "Open the current game's rules and room guidance in a separate tab.",
      href: opts.helpHref,
      external: true,
    }));
  }
  onlinePanel.appendChild(onlineActions);
  panels.set(PlaySubSection.Online, onlinePanel);

  const botsPanel = document.createElement("div");
  botsPanel.className = "playHubPanel";
  const botActions = document.createElement("div");
  botActions.className = "playHubActions";
  if (opts.botAction) {
    botActions.appendChild(createAction(opts.botAction));
  }
  if (opts.backHref) {
    botActions.appendChild(createAction({
      label: "Tune bots in launcher",
      description: "Return to the start page with this variant selected to adjust launch and bot presets.",
      onSelect: () => {
        updateShellState({
          activeGame: opts.currentVariantId,
          activeSection: GlobalSection.Games,
          playSubSection: PlaySubSection.Bots,
        });
      },
      href: opts.backHref,
    }));
  }
  botsPanel.appendChild(botActions);
  panels.set(PlaySubSection.Bots, botsPanel);

  const coachPanel = document.createElement("div");
  coachPanel.className = "playHubPanel";
  coachPanel.appendChild(createPlaceholder(
    "Coach tools coming soon",
    "This tab is reserved for guided study, teaching overlays, and move explanation surfaces. The shell keeps the slot visible now so the navigation model stays stable while the feature is unfinished.",
  ));
  panels.set(PlaySubSection.Coach, coachPanel);

  const friendPanel = document.createElement("div");
  friendPanel.className = "playHubPanel";
  const friendActions = document.createElement("div");
  friendActions.className = "playHubActions";
  if (opts.friendAction) {
    friendActions.appendChild(createAction(opts.friendAction));
  }
  if (opts.backHref) {
    friendActions.appendChild(createAction({
      label: "Create or join a room",
      description: "Return to the launcher and use the existing play-with-friend room flow for this variant.",
      onSelect: () => {
        updateShellState({
          activeGame: opts.currentVariantId,
          activeSection: GlobalSection.Community,
          playSubSection: PlaySubSection.Friend,
        });
      },
      href: opts.backHref,
    }));
  }
  friendPanel.appendChild(friendActions);
  panels.set(PlaySubSection.Friend, friendPanel);

  const tournamentsPanel = document.createElement("div");
  tournamentsPanel.className = "playHubPanel";
  tournamentsPanel.appendChild(createPlaceholder(
    "Tournament surface reserved",
    "Tournament scheduling and bracket flows are not wired yet. The placeholder keeps the future information architecture visible without pretending the feature already exists.",
  ));
  panels.set(PlaySubSection.Tournaments, tournamentsPanel);

  const variantsPanel = document.createElement("div");
  variantsPanel.className = "playHubPanel";
  const variantsList = document.createElement("div");
  variantsList.className = "playHubVariants";
  for (const game of APP_SHELL_GAMES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playHubVariantButton";
    button.innerHTML = `<span class="playHubVariantLabel">${game.displayName}</span><span class="playHubVariantDescription">${game.subtitle}</span>`;
    const isActive = game.variantId === opts.currentVariantId;
    button.classList.toggle("isActive", isActive);
    button.disabled = isActive || !game.entryUrl;
    button.addEventListener("click", () => {
      if (!game.entryUrl || isActive) return;
      setLauncherVariant(game.variantId);
      updateShellState({
        activeGame: game.variantId,
        activeSection: GlobalSection.Games,
        playSubSection: PlaySubSection.Variants,
      });
      navigateToHref(game.entryUrl);
    });
    variantsList.appendChild(button);
  }
  variantsPanel.appendChild(variantsList);
  panels.set(PlaySubSection.Variants, variantsPanel);

  for (const panel of panels.values()) {
    body.appendChild(panel);
  }

  root.append(header, tabs.element, body);
  setActiveTab((readShellState().playSubSection ?? PlaySubSection.Online) as PlaySubSection);

  return {
    element: root,
    setActiveTab,
  };
}