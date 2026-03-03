export type PanelLayoutMode = "panels" | "menu";

const LS_KEY = "lasca.ui.panelLayout";

function detectDefaultPanelLayoutMode(): PanelLayoutMode {
  // Use menu mode for mobile-like environments (small screens / coarse pointer).
  // Only used when the user has NOT explicitly saved a preference.
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "panels";

    const small = window.matchMedia("(max-width: 820px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;

    return small || (coarse && noHover) ? "menu" : "panels";
  } catch {
    return "panels";
  }
}

export function readPanelLayoutMode(): PanelLayoutMode {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored == null || stored === "") return detectDefaultPanelLayoutMode();

    const raw = String(stored).toLowerCase();
    return raw === "menu" ? "menu" : "panels";
  } catch {
    return detectDefaultPanelLayoutMode();
  }
}

export function writePanelLayoutMode(mode: PanelLayoutMode): void {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    // ignore
  }

  // Same-tab updates: the `storage` event doesn't fire in the same document.
  try {
    window.dispatchEvent(new Event("panelLayoutModeChanged"));
  } catch {
    // ignore
  }
}

function ensureInjectedStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("panelLayoutModeStyles")) return;

  const style = document.createElement("style");
  style.id = "panelLayoutModeStyles";
  style.textContent = `
/* Menu layout mode: hide sidebars and show a top-left menu affordance */
body[data-panel-layout="menu"] .sidebar {
  display: none !important;
}

/* Menu layout mode: reserve top space so hamburger/header never overlaps the board area. */
body[data-panel-layout="menu"] #centerArea {
  padding-top: 70px;
}

/* Top header (menu mode) */
#panelLayoutHeader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9991;
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  background: linear-gradient(rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.86)), var(--panel-bg);
  border-bottom: 1px solid var(--panel-border);
}

/* Header appears only after the hamburger is touched */
body[data-panel-layout="menu"][data-panel-layout-header="1"] #panelLayoutHeader {
  display: flex;
}

#panelLayoutHeaderLeft {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

#panelLayoutHeaderTitle {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.2px;
  color: var(--panel-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100vw - 140px);
}

#panelLayoutHeaderRight {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

#panelLayoutHeaderFlyout {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 9992;
  min-width: 150px;
  padding: 6px;
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border);
  background: linear-gradient(rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.86)), var(--panel-bg);
  display: none;
}

body[data-panel-layout="menu"] #panelLayoutHeaderFlyout[data-open="1"] {
  display: block;
}

.panelLayoutFlyoutItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.36);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  text-decoration: none;
}

.panelLayoutFlyoutItem:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* Hamburger + dropdown */
#panelLayoutHamburger {
  z-index: 9990;
}

/* Hamburger is always visible in menu mode; header is optional */
body[data-panel-layout="menu"] #panelLayoutHamburger {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 9990;
}

/* When the header is activated, keep hamburger in-flow inside it */
body[data-panel-layout="menu"][data-panel-layout-header="1"] #panelLayoutHamburger {
  position: static;
  top: auto;
  left: auto;
}

#panelLayoutDropdown {
  position: fixed;
  top: 48px;
  left: 10px;
  z-index: 9990;
  min-width: 220px;
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 70px);
  overflow: auto;
  /* Darken the themed panel surface to make the menu readable */
  background: linear-gradient(rgba(0, 0, 0, 0.84), rgba(0, 0, 0, 0.84)), var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--panel-text);
  padding: 6px;
  border-radius: var(--panel-radius);
  display: none;
}

body[data-panel-layout="menu"][data-panel-layout-header="1"] #panelLayoutDropdown {
  top: 56px;
}

body[data-panel-layout="menu"] #panelLayoutDropdown[data-open="1"] {
  display: block;
}

.panelLayoutMenuItem {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.36);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  cursor: pointer;
}

.panelLayoutMenuItem:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* Dialog overlay */
#panelLayoutDialogOverlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 0, 0, 0.78);
}

/* Keep playback dialog more see-through so the board is visible while scrubbing */
body[data-panel-layout="menu"] #panelLayoutDialogOverlay[data-variant="playback"] {
  background: rgba(0, 0, 0, 0.55);
}

body[data-panel-layout="menu"] #panelLayoutDialogOverlay[data-open="1"] {
  display: flex;
}

#panelLayoutDialog {
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  /* Darken the themed panel surface to reduce transparency */
  background: linear-gradient(rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.82)), var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
  color: var(--panel-text);
}

body[data-panel-layout="menu"] #panelLayoutDialogOverlay[data-variant="playback"] #panelLayoutDialog {
  background: var(--panel-bg);
}

#panelLayoutDialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

#panelLayoutDialogTitle {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#panelLayoutDialogBody {
  padding: 10px;
}

/* Force-open moved sections inside the dialog */
#panelLayoutDialogBody .panelSection[data-force-open="1"] .sectionContent {
  display: block !important;
}
#panelLayoutDialogBody .panelSection[data-force-open="1"] .sectionHeader {
  display: none !important;
}
#panelLayoutDialogBody .panelSection[data-force-open="1"] .collapseBtn {
  display: none !important;
}
`;
  document.head.appendChild(style);
}

function createButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "panelBtn";
  btn.textContent = text;
  return btn;
}

export function installPanelLayoutOptionUI(opts?: { label?: string }): void {
  if (typeof document === "undefined") return;

  const labelText = opts?.label ?? "Layout";
  const host = document.querySelector('.panelSection[data-section="options"] .sectionContent') as HTMLElement | null;
  if (!host) return;

  // Avoid duplicate injection.
  if (host.querySelector('[data-ui="panelLayoutMode"]')) return;

  const row = document.createElement("div");
  row.dataset.ui = "panelLayoutMode";
  row.style.display = "grid";
  row.style.gridTemplateColumns = "52px minmax(0, 1fr)";
  row.style.gap = "8px 2px";
  row.style.alignItems = "center";
  row.style.justifyItems = "start";
  row.style.fontSize = "12px";
  row.style.marginTop = "10px";

  const lab = document.createElement("label");
  lab.textContent = labelText;

  const select = document.createElement("select");
  select.className = "panelSelect";
  select.setAttribute("aria-label", "Panel layout mode");

  const optPanels = document.createElement("option");
  optPanels.value = "panels";
  optPanels.textContent = "Panels";

  const optMenu = document.createElement("option");
  optMenu.value = "menu";
  optMenu.textContent = "Menu";

  select.appendChild(optPanels);
  select.appendChild(optMenu);

  const cur = readPanelLayoutMode();
  select.value = cur;

  select.addEventListener("change", () => {
    const next = (String(select.value) === "menu" ? "menu" : "panels") as PanelLayoutMode;
    writePanelLayoutMode(next);
    applyPanelLayoutMode(next);
  });

  row.appendChild(lab);
  row.appendChild(select);

  // Insert near the top of options, but after any existing first grid block.
  host.insertBefore(row, host.firstChild);
}

export function installPanelLayoutStartPageOptionUI(opts?: {
  label?: string;
  /** Which panel section to insert into on the Start Page. */
  sectionAriaLabel?: string;
}): void {
  if (typeof document === "undefined") return;

  const labelText = opts?.label ?? "Layout";
  const sectionLabel = opts?.sectionAriaLabel ?? "Startup options";
  const section = document.querySelector(`.panelSection[aria-label="${sectionLabel}"]`) as HTMLElement | null;
  if (!section) return;

  // Avoid duplicate injection.
  if (section.querySelector('[data-ui="panelLayoutMode"]')) return;

  const row = document.createElement("div");
  row.className = "row";
  row.dataset.ui = "panelLayoutMode";

  const selectId = "startPanelLayoutMode";

  const lab = document.createElement("label");
  lab.textContent = labelText;
  lab.htmlFor = selectId;

  const select = document.createElement("select");
  select.id = selectId;
  select.className = "panelSelect";
  select.setAttribute("aria-label", "Panel layout mode");

  const optPanels = document.createElement("option");
  optPanels.value = "panels";
  optPanels.textContent = "Panels";

  const optMenu = document.createElement("option");
  optMenu.value = "menu";
  optMenu.textContent = "Menu";

  select.appendChild(optPanels);
  select.appendChild(optMenu);

  select.value = readPanelLayoutMode();

  select.addEventListener("change", () => {
    const next = (String(select.value) === "menu" ? "menu" : "panels") as PanelLayoutMode;
    writePanelLayoutMode(next);
    applyPanelLayoutMode(next);
  });

  row.appendChild(lab);
  row.appendChild(select);

  const h2 = section.querySelector("h2");
  if (h2 && h2.parentElement === section) {
    h2.insertAdjacentElement("afterend", row);
  } else {
    section.insertBefore(row, section.firstChild);
  }
}

export function applyPanelLayoutMode(mode: PanelLayoutMode): void {
  if (typeof document === "undefined") return;
  document.body.dataset.panelLayout = mode;
}

type SectionRecord = {
  key: string;
  title: string;
  variant?: "default" | "playback";
  sections: Array<{ sectionEl: HTMLElement; placeholderEl: HTMLElement | null }>;
};

export function bindPanelLayoutMenuMode(): void {
  if (typeof document === "undefined") return;

  ensureInjectedStyles();

  const hasSidebar = Boolean(document.querySelector(".sidebar"));
  const hasPanelSections = document.querySelectorAll(".panelSection").length > 0;
  if (!hasSidebar || !hasPanelSections) return;

  // Inject UI scaffolding once.
  let headerBar = document.getElementById("panelLayoutHeader") as HTMLDivElement | null;
  const ensureHamburgerDetached = (hamburgerEl: HTMLButtonElement): void => {
    if (hamburgerEl.parentElement !== document.body) {
      document.body.appendChild(hamburgerEl);
    }
  };

  if (!headerBar) {
    headerBar = document.createElement("div");
    headerBar.id = "panelLayoutHeader";

    const left = document.createElement("div");
    left.id = "panelLayoutHeaderLeft";

    const title = document.createElement("div");
    title.id = "panelLayoutHeaderTitle";
    title.textContent = "StackWorks";

    left.appendChild(title);

    const right = document.createElement("div");
    right.id = "panelLayoutHeaderRight";

    const flyBtn = createButton("⋯");
    flyBtn.id = "panelLayoutHeaderFlyoutBtn";
    flyBtn.title = "Menu";
    flyBtn.style.padding = "6px 10px";
    flyBtn.style.borderRadius = "10px";

    const flyout = document.createElement("div");
    flyout.id = "panelLayoutHeaderFlyout";
    flyout.dataset.open = "0";

    const startLink = document.createElement("a");
    startLink.className = "panelLayoutFlyoutItem";
    startLink.href = "./index.html";
    startLink.textContent = "Start Page";

    const helpLink = document.createElement("a");
    helpLink.className = "panelLayoutFlyoutItem";
    helpLink.id = "panelLayoutHeaderHelp";
    helpLink.href = "./help.html";
    helpLink.target = "_blank";
    helpLink.rel = "noopener noreferrer";
    helpLink.textContent = "?";

    flyout.appendChild(startLink);
    flyout.appendChild(helpLink);

    right.appendChild(flyBtn);
    right.appendChild(flyout);

    headerBar.appendChild(left);
    headerBar.appendChild(right);
    document.body.appendChild(headerBar);

    const closeFlyout = (): void => {
      flyout.dataset.open = "0";
    };

    const toggleFlyout = (): void => {
      flyout.dataset.open = flyout.dataset.open === "1" ? "0" : "1";
    };

    flyBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (readPanelLayoutMode() !== "menu") return;
      toggleFlyout();
    });

    document.addEventListener("click", () => {
      if (flyout.dataset.open === "1") closeFlyout();
    });

    startLink.addEventListener("click", () => closeFlyout());
    helpLink.addEventListener("click", () => closeFlyout());
  }

  let hamburger = document.getElementById("panelLayoutHamburger") as HTMLButtonElement | null;
  if (!hamburger) {
    hamburger = createButton("☰");
    hamburger.id = "panelLayoutHamburger";
    hamburger.title = "Menu";
    hamburger.style.padding = "6px 10px";
    hamburger.style.borderRadius = "10px";
    document.body.appendChild(hamburger);
  }

  const activateHeader = (): void => {
    if (document.body.dataset.panelLayoutHeader === "1") return;
    document.body.dataset.panelLayoutHeader = "1";

    const headerLeft = document.getElementById("panelLayoutHeaderLeft") as HTMLElement | null;
    if (headerLeft && hamburger!.parentElement !== headerLeft) {
      headerLeft.insertBefore(hamburger!, headerLeft.firstChild);
    }
  };

  const deactivateHeader = (): void => {
    document.body.dataset.panelLayoutHeader = "0";
    ensureHamburgerDetached(hamburger!);

    const flyout = document.getElementById("panelLayoutHeaderFlyout") as HTMLDivElement | null;
    if (flyout) flyout.dataset.open = "0";
  };

  let dropdown = document.getElementById("panelLayoutDropdown") as HTMLDivElement | null;
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.id = "panelLayoutDropdown";
    dropdown.dataset.open = "0";
    document.body.appendChild(dropdown);
  }

  let overlay = document.getElementById("panelLayoutDialogOverlay") as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "panelLayoutDialogOverlay";
    overlay.dataset.open = "0";

    const dialog = document.createElement("div");
    dialog.id = "panelLayoutDialog";

    const header = document.createElement("div");
    header.id = "panelLayoutDialogHeader";

    const title = document.createElement("div");
    title.id = "panelLayoutDialogTitle";
    title.textContent = "Panel";

    const close = createButton("Close");
    close.id = "panelLayoutDialogClose";

    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement("div");
    body.id = "panelLayoutDialogBody";

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close on backdrop click.
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        closePanelDialog();
      }
    });

    close.addEventListener("click", () => closePanelDialog());
  }

  const getMode = () => readPanelLayoutMode();
  applyPanelLayoutMode(getMode());

  const resolveGameName = (): string => {
    const rawExplicit = (document.getElementById("gameTitle") as HTMLElement | null)?.textContent?.trim();
    const rawTitle = (document.title || "").trim();

    const raw = rawExplicit || rawTitle;
    if (!raw) return "Game";

    // Remove trailing "Online!" etc.
    const noOnline = raw.replace(/\s+online!?\s*$/i, "").trim();

    // Some pages may include "StackWorks" as part of their title; strip it so we can
    // consistently render "StackWorks - <game>".
    const stripped = noOnline
      // "StackWorks - Checkers (US)" / "StackWorks: Checkers" / "StackWorks—Checkers"
      .replace(/^stackworks\s*[-:—]?\s*/i, "")
      // "StackWorksCheckers (US)" (no separator)
      .replace(/^stackworks/i, "")
      .trim();

    return stripped || "Game";
  };

  const resolveHelpHref = (): string => {
    const hl = document.getElementById("helpLink") as HTMLAnchorElement | null;
    const href = (hl?.getAttribute("href") ?? "").trim();
    if (href) return href;

    const any = document.querySelector('a[href*="help" i]') as HTMLAnchorElement | null;
    const anyHref = (any?.getAttribute("href") ?? "").trim();
    if (anyHref) return anyHref;

    return "./help.html";
  };

  const records = new Map<string, SectionRecord>();
  let activeKey: string | null = null;

  // Must be hoisted for event handlers created earlier.
  const closePanelDialog = (): void => {
    const ov = document.getElementById("panelLayoutDialogOverlay") as HTMLDivElement | null;
    const bodyEl = document.getElementById("panelLayoutDialogBody") as HTMLElement | null;
    if (ov) {
      ov.dataset.open = "0";
      ov.dataset.variant = "default";
    }

    if (!activeKey) return;

    const rec = records.get(activeKey);
    activeKey = null;
    if (!rec) return;

    for (const moved of rec.sections) {
      const ph = moved.placeholderEl;
      if (ph && ph.parentElement) {
        // Restore prior collapsed state (if we forced it open for the dialog).
        if (moved.sectionEl.dataset.panelWasCollapsed === "1") {
          moved.sectionEl.classList.add("collapsed");
        }
        delete moved.sectionEl.dataset.panelWasCollapsed;

        moved.sectionEl.removeAttribute("data-force-open");
        ph.parentElement.insertBefore(moved.sectionEl, ph);
        ph.remove();
      }
      moved.placeholderEl = null;
    }

    if (bodyEl) bodyEl.replaceChildren();

    // Returning to the game view should hide the header bar.
    deactivateHeader();
  };

  const openPanelDialog = (rec: SectionRecord): void => {
    const mode = getMode();
    if (mode !== "menu") return;

    // After choosing an item, hide the bar to maximize space.
    deactivateHeader();

    // If another section is active, close it first.
    if (activeKey) closePanelDialog();

    const titleEl = document.getElementById("panelLayoutDialogTitle") as HTMLElement | null;
    const bodyEl = document.getElementById("panelLayoutDialogBody") as HTMLElement | null;
    if (!titleEl || !bodyEl) return;

    bodyEl.replaceChildren();

    for (const moved of rec.sections) {
      const parent = moved.sectionEl.parentElement;
      if (!parent) continue;

      // Insert a placeholder so we can restore.
      const placeholder = document.createElement("div");
      placeholder.dataset.panelPlaceholder = rec.key;
      moved.placeholderEl = placeholder;
      parent.insertBefore(placeholder, moved.sectionEl);

      // Force content visible in dialog.
      moved.sectionEl.setAttribute("data-force-open", "1");

      // Some panels collapse via max-height/opacity (not display:none). Since we hide the
      // section header inside the dialog, ensure the content is actually visible.
      const wasCollapsed = moved.sectionEl.classList.contains("collapsed");
      moved.sectionEl.dataset.panelWasCollapsed = wasCollapsed ? "1" : "0";
      if (wasCollapsed) moved.sectionEl.classList.remove("collapsed");

      bodyEl.appendChild(moved.sectionEl);
    }
    titleEl.textContent = rec.title;

    const ov = document.getElementById("panelLayoutDialogOverlay") as HTMLDivElement | null;
    if (ov) {
      ov.dataset.open = "1";
      ov.dataset.variant = rec.variant ?? "default";
    }
    activeKey = rec.key;
  };

  const rebuildMenu = (): void => {
    dropdown!.replaceChildren();
    records.clear();

    const sections = Array.from(document.querySelectorAll(".panelSection")) as HTMLElement[];

    let playbackEl: HTMLElement | null = null;
    let moveHistoryEl: HTMLElement | null = null;

    let idx = 0;
    for (const sec of sections) {
      // Don't show sections that are explicitly hidden by their own CSS.
      // (Important for pages like Classic Chess where some panels don't apply.)
      try {
        const disp = window.getComputedStyle(sec).display;
        if (disp === "none") continue;
      } catch {
        // ignore
      }

      const header = sec.querySelector(".sectionHeader h3") as HTMLElement | null;
      const title = (header?.textContent ?? "").trim() || (sec.getAttribute("data-section") ?? "Panel");

      // Combine Playback + Move History into a single menu item.
      if (title === "Playback") {
        playbackEl = sec;
        continue;
      }
      if (title === "Move History") {
        moveHistoryEl = sec;
        continue;
      }

      const stable = String(sec.getAttribute("data-section") ?? title).toLowerCase();
      const key = `${stable}_${idx++}`;

      const rec: SectionRecord = {
        key,
        title,
        variant: "default",
        sections: [{ sectionEl: sec, placeholderEl: null }],
      };
      records.set(key, rec);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "panelLayoutMenuItem";
      btn.textContent = rec.title;
      btn.addEventListener("click", () => {
        dropdown!.dataset.open = "0";
        openPanelDialog(rec);
      });
      dropdown!.appendChild(btn);
    }

    if (playbackEl && moveHistoryEl) {
      const key = `playback_history_${idx++}`;
      const rec: SectionRecord = {
        key,
        title: "Playback & Move History",
        variant: "playback",
        sections: [
          { sectionEl: playbackEl, placeholderEl: null },
          { sectionEl: moveHistoryEl, placeholderEl: null },
        ],
      };

      records.set(key, rec);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "panelLayoutMenuItem";
      btn.textContent = rec.title;
      btn.addEventListener("click", () => {
        dropdown!.dataset.open = "0";
        openPanelDialog(rec);
      });

      dropdown!.appendChild(btn);
    }
  };

  const closeDropdown = (): void => {
    dropdown!.dataset.open = "0";
    // Clicking outside (resume) should hide the header bar.
    deactivateHeader();
  };

  const openDropdown = (): void => {
    dropdown!.dataset.open = "1";
  };

  // Hamburger toggles dropdown.
  hamburger.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const mode = getMode();
    if (mode !== "menu") return;

    // First interaction reveals the header.
    activateHeader();

    rebuildMenu();
    const isOpen = dropdown!.dataset.open === "1";
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  // Click outside closes dropdown.
  document.addEventListener("click", () => {
    if (dropdown!.dataset.open === "1") closeDropdown();
  });

  // React to mode changes across UI (e.g. Start Page changes then navigates back).
  const applyVisibility = (): void => {
    const mode = getMode();
    applyPanelLayoutMode(mode);

    // Default: header stays hidden until first hamburger tap.
    if (mode === "menu" && document.body.dataset.panelLayoutHeader !== "1") {
      document.body.dataset.panelLayoutHeader = "0";

      // Ensure hamburger is NOT inside the hidden header; keep it fixed on the page.
      if (hamburger!.parentElement !== document.body) {
        document.body.appendChild(hamburger!);
      }
    }

    // If header is active, keep hamburger inside it.
    if (mode === "menu" && document.body.dataset.panelLayoutHeader === "1") {
      const headerLeft = document.getElementById("panelLayoutHeaderLeft") as HTMLElement | null;
      if (headerLeft && hamburger!.parentElement !== headerLeft) {
        headerLeft.insertBefore(hamburger!, headerLeft.firstChild);
      }
    }

    const titleEl = document.getElementById("panelLayoutHeaderTitle") as HTMLElement | null;
    if (titleEl) titleEl.textContent = `StackWorks - ${resolveGameName()}`;

    const headerHelp = document.getElementById("panelLayoutHeaderHelp") as HTMLAnchorElement | null;
    if (headerHelp) headerHelp.href = resolveHelpHref();

    // Hamburger only relevant in menu mode.
    hamburger!.style.display = mode === "menu" ? "inline-flex" : "none";

    // If leaving menu mode, ensure any moved section is restored.
    if (mode !== "menu") {
      dropdown!.dataset.open = "0";
      closePanelDialog();

      document.body.dataset.panelLayoutHeader = "0";

      const flyout = document.getElementById("panelLayoutHeaderFlyout") as HTMLDivElement | null;
      if (flyout) flyout.dataset.open = "0";
    }
  };

  applyVisibility();

  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) applyVisibility();
  });

  window.addEventListener("panelLayoutModeChanged", () => {
    applyVisibility();
  });
}
