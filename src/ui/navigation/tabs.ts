export interface TabItem {
  id: string;
  label: string;
  onSelect?: () => void;
}

export interface TabsOptions {
  items: readonly TabItem[];
  activeId?: string;
  className?: string;
}

export interface TabsController {
  element: HTMLElement;
  setActiveTab(tabId: string): void;
}

const TABS_STYLE_ID = "stackworks-tabs-style";

function ensureTabsStyles(): void {
  if (document.getElementById(TABS_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = TABS_STYLE_ID;
  style.textContent = `
    .stackworksTabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .stackworksTabButton {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.9);
      border-radius: 999px;
      padding: 9px 13px;
      font-size: 12px;
      cursor: pointer;
    }

    .stackworksTabButton:hover,
    .stackworksTabButton:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }

    .stackworksTabButton.isActive {
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.2), rgba(202, 157, 78, 0.08));
      border-color: rgba(232, 191, 112, 0.34);
      color: rgba(255, 255, 255, 0.98);
    }

    @media (max-width: 560px) {
      .stackworksTabs {
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 2px;
      }
    }
  `;

  document.head.appendChild(style);
}

export function createTabs(opts: TabsOptions): TabsController {
  ensureTabsStyles();

  const root = document.createElement("div");
  root.className = opts.className ? `stackworksTabs ${opts.className}` : "stackworksTabs";
  root.setAttribute("role", "tablist");

  const buttons = new Map<string, HTMLButtonElement>();

  const setActiveTab = (tabId: string): void => {
    for (const [id, button] of buttons) {
      const isActive = id === tabId;
      button.classList.toggle("isActive", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    }
  };

  for (const item of opts.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stackworksTabButton";
    button.textContent = item.label;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      setActiveTab(item.id);
      item.onSelect?.();
    });
    buttons.set(item.id, button);
    root.appendChild(button);
  }

  setActiveTab(opts.activeId ?? (opts.items[0]?.id ?? ""));

  return {
    element: root,
    setActiveTab,
  };
}