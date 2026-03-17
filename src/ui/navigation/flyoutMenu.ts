export interface FlyoutMenuAction {
  label: string;
  description?: string;
  onSelect: () => void;
}

export interface FlyoutMenuContent {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: readonly FlyoutMenuAction[];
}

export interface HoverFlyoutAnchor {
  anchor: HTMLElement;
  getContent: () => FlyoutMenuContent;
}

export interface HoverFlyoutMenuController {
  hide(): void;
  dispose(): void;
}

const FLYOUT_STYLE_ID = "stackworks-flyout-menu-style";

function ensureFlyoutStyles(): void {
  if (document.getElementById(FLYOUT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = FLYOUT_STYLE_ID;
  style.textContent = `
    .stackworksFlyoutMenu {
      position: fixed;
      z-index: 120;
      width: min(320px, calc(100vw - 32px));
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
        rgba(9, 9, 9, 0.96);
      box-shadow: 0 20px 44px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(18px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(6px) scale(0.98);
      transition:
        opacity 130ms ease,
        transform 130ms ease;
    }

    .stackworksFlyoutMenu[data-open="1"] {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    .stackworksFlyoutEyebrow {
      margin: 0 0 6px;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .stackworksFlyoutTitle {
      margin: 0;
      font-size: 17px;
      font-weight: 760;
      color: rgba(255, 255, 255, 0.96);
    }

    .stackworksFlyoutDescription {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.7);
    }

    .stackworksFlyoutActions {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }

    .stackworksFlyoutAction {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.94);
      border-radius: 14px;
      padding: 10px 12px;
      text-align: left;
      cursor: pointer;
    }

    .stackworksFlyoutAction:hover,
    .stackworksFlyoutAction:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.16);
      outline: none;
    }

    .stackworksFlyoutActionLabel {
      display: block;
      font-size: 12px;
      font-weight: 700;
    }

    .stackworksFlyoutActionDescription {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.64);
    }
  `;

  document.head.appendChild(style);
}

function canUseHoverFlyout(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 1040px) and (hover: hover) and (pointer: fine)").matches;
}

export function attachHoverFlyoutMenu(anchors: readonly HoverFlyoutAnchor[]): HoverFlyoutMenuController {
  ensureFlyoutStyles();

  const flyout = document.createElement("div");
  flyout.className = "stackworksFlyoutMenu";
  flyout.dataset.open = "0";
  document.body.appendChild(flyout);

  let hideTimer = 0;
  let activeAnchor: HTMLElement | null = null;

  const clearHideTimer = (): void => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const hide = (): void => {
    clearHideTimer();
    flyout.dataset.open = "0";
    activeAnchor = null;
  };

  const scheduleHide = (): void => {
    clearHideTimer();
    hideTimer = window.setTimeout(() => hide(), 90);
  };

  const positionFlyout = (anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect();
    const flyoutWidth = Math.min(320, window.innerWidth - 32);
    let left = rect.right + 14;
    if (left + flyoutWidth > window.innerWidth - 16) {
      left = Math.max(16, rect.left - flyoutWidth - 14);
    }

    const flyoutHeight = flyout.getBoundingClientRect().height || 180;
    let top = rect.top;
    if (top + flyoutHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - flyoutHeight - 16);
    }

    flyout.style.left = `${Math.round(left)}px`;
    flyout.style.top = `${Math.round(top)}px`;
  };

  const render = (content: FlyoutMenuContent): void => {
    flyout.replaceChildren();

    if (content.eyebrow) {
      const eyebrow = document.createElement("p");
      eyebrow.className = "stackworksFlyoutEyebrow";
      eyebrow.textContent = content.eyebrow;
      flyout.appendChild(eyebrow);
    }

    const title = document.createElement("h3");
    title.className = "stackworksFlyoutTitle";
    title.textContent = content.title;
    flyout.appendChild(title);

    if (content.description) {
      const description = document.createElement("p");
      description.className = "stackworksFlyoutDescription";
      description.textContent = content.description;
      flyout.appendChild(description);
    }

    if (content.actions?.length) {
      const actions = document.createElement("div");
      actions.className = "stackworksFlyoutActions";

      for (const action of content.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stackworksFlyoutAction";

        const label = document.createElement("span");
        label.className = "stackworksFlyoutActionLabel";
        label.textContent = action.label;
        button.appendChild(label);

        if (action.description) {
          const description = document.createElement("span");
          description.className = "stackworksFlyoutActionDescription";
          description.textContent = action.description;
          button.appendChild(description);
        }

        button.addEventListener("click", () => {
          action.onSelect();
          hide();
        });
        actions.appendChild(button);
      }

      flyout.appendChild(actions);
    }
  };

  const show = (entry: HoverFlyoutAnchor): void => {
    if (!canUseHoverFlyout()) {
      hide();
      return;
    }

    clearHideTimer();
    activeAnchor = entry.anchor;
    render(entry.getContent());
    flyout.dataset.open = "1";
    positionFlyout(entry.anchor);
  };

  const onViewportChange = (): void => {
    if (!activeAnchor) return;
    if (!canUseHoverFlyout()) {
      hide();
      return;
    }
    positionFlyout(activeAnchor);
  };

  const cleanup = new Array<() => void>();

  flyout.addEventListener("pointerenter", clearHideTimer);
  flyout.addEventListener("pointerleave", scheduleHide);

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (!target) return;
    if (flyout.contains(target)) return;
    if (anchors.some((entry) => entry.anchor.contains(target))) return;
    hide();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  cleanup.push(() => document.removeEventListener("pointerdown", onPointerDown, true));

  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  cleanup.push(() => window.removeEventListener("resize", onViewportChange));
  cleanup.push(() => window.removeEventListener("scroll", onViewportChange, true));

  for (const entry of anchors) {
    const onEnter = (): void => show(entry);
    const onLeave = (): void => scheduleHide();
    const onFocus = (): void => show(entry);
    const onBlur = (): void => scheduleHide();

    entry.anchor.addEventListener("pointerenter", onEnter);
    entry.anchor.addEventListener("pointerleave", onLeave);
    entry.anchor.addEventListener("focus", onFocus);
    entry.anchor.addEventListener("blur", onBlur);

    cleanup.push(() => entry.anchor.removeEventListener("pointerenter", onEnter));
    cleanup.push(() => entry.anchor.removeEventListener("pointerleave", onLeave));
    cleanup.push(() => entry.anchor.removeEventListener("focus", onFocus));
    cleanup.push(() => entry.anchor.removeEventListener("blur", onBlur));
  }

  return {
    hide,
    dispose(): void {
      hide();
      clearHideTimer();
      for (const fn of cleanup) fn();
      flyout.remove();
    },
  };
}