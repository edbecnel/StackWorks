import { setBoardPlayAreaZoom } from "../render/boardPlayAreaZoom";
import { STACKWORKS_BOARD_CHROME_REFLOW_DONE_EVENT } from "./boardViewportMode";

export type PanelLayoutMode = "panels" | "menu";

const LS_KEY = "lasca.ui.panelLayout";

function detectDefaultPanelLayoutMode(): PanelLayoutMode {
  // Always default to panels on all devices.
  // Orientation-responsive CSS in ensureInjectedStyles() handles the
  // layout direction: landscape = left/right sidebars, portrait = top/bottom.
  // Users who prefer the hamburger menu can switch via the Layout option in Settings.
  return "panels";
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

export function togglePanelLayoutMode(): PanelLayoutMode {
  const next: PanelLayoutMode = readPanelLayoutMode() === "menu" ? "panels" : "menu";
  writePanelLayoutMode(next);
  applyPanelLayoutMode(next);
  return next;
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

/* Menu layout mode: remove desktop-only chrome that steals horizontal space. */
body[data-panel-layout="menu"] .gutter,
body[data-panel-layout="menu"] .sidebarTab {
  display: none !important;
}

/* Menu layout mode: reserve top space so hamburger/header never overlaps the board area. */
body[data-panel-layout="menu"] #centerArea {
  /* Keep a small edge margin so out-of-border coordinates don't touch the viewport edge. */
  padding-top: 56px;
  padding-right: max(4px, env(safe-area-inset-right));
  padding-bottom: max(4px, env(safe-area-inset-bottom));
  padding-left: max(4px, env(safe-area-inset-left));
  /* Some pages hard-code a desktop min-width (e.g. 420px) which can cause
     horizontal clipping in portrait on small devices (and in devtools emulation). */
  min-width: 0 !important;
}

/* Shared game shell already provides the top menu bar in menu layout.
   Do not add a second reserved strip above the player info / board area. */
body.stackworksGameShellEnabled[data-panel-layout="menu"] #centerArea {
  padding-top: 0;
}

/* When the legacy panel-layout header is activated, place it under the shell bar
   instead of on top of it, and keep the flyout aligned with that offset. */
body.stackworksGameShellEnabled[data-panel-layout="menu"] #panelLayoutHeader {
  top: 58px;
}

body.stackworksGameShellEnabled[data-panel-layout="menu"] #panelLayoutDropdown {
  top: 58px;
}

body.stackworksGameShellEnabled[data-panel-layout="menu"][data-panel-layout-header="1"] #panelLayoutDropdown {
  top: 104px;
}

/* Small screens (portrait/landscape): allow #centerArea to shrink even if the page
   stylesheet hard-codes a larger min-width. */
@media (max-width: 460px) {
  #centerArea { min-width: 0 !important; }
}

/* Menu layout mode: allow the SVG board to grow beyond the default 980px cap
   (sidebars are hidden, so we can use that space). */
body[data-panel-layout="menu"] #boardWrap svg {
  width: min(100%, 1280px) !important;
}

/* Board fit (all layout modes): never require scrolling to see the bottom of the board.
   JS sets --board-fit-max-h on #boardWrap based on the available space in #centerArea. */
#boardWrap svg {
  max-height: var(--board-fit-max-h, 100%) !important;
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
  box-sizing: border-box;
  padding: 12px;
  /* Keep the dialog clear of notches / OS UI on mobile browsers. */
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-right: calc(12px + env(safe-area-inset-right));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.78);
}

/* In menu mode (typically phones), anchor the dialog to the top so the header/Close
   isn't hidden behind dynamic browser chrome. */
body[data-panel-layout="menu"] #panelLayoutDialogOverlay {
  align-items: flex-start;
}

/* Keep playback dialog more see-through so the board is visible while scrubbing */
body[data-panel-layout="menu"] #panelLayoutDialogOverlay[data-variant="playback"] {
  background: rgba(0, 0, 0, 0.55);
}

body[data-panel-layout="menu"] #panelLayoutDialogOverlay[data-open="1"] {
  display: flex;
}

#panelLayoutDialog {
  width: min(560px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Darken the themed panel surface to reduce transparency */
  background: linear-gradient(rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.82)), var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
  color: var(--panel-text);
}

/* Prefer the visual viewport height on mobile browsers (fixes 100vh issues). */
@supports (height: 100dvh) {
  #panelLayoutDialog {
    max-height: 100%;
  }
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
  flex: 1 1 auto;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
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

/* ── Landscape orientation — panels mode ───────────────────────────
   Always restore row layout in landscape so panels stay left/right,
   overriding any per-page touch/mobile CSS that forces column.
   DOM order is already correct (leftSidebar → gutterLeft → centerArea →
   gutterRight → rightSidebar), so no flex order overrides are needed here.
   ────────────────────────────────────────────────────────────────── */
@media (orientation: landscape) {
  body[data-panel-layout="panels"] #appRoot {
    flex-direction: row;
  }

  /* Sidebars fill the full height of the row; let JS-set inline width apply */
  body[data-panel-layout="panels"] .sidebar {
    width: auto;
    height: auto !important;
    max-height: none;
  }

  /* Thin scrollbars inside sidebar panels (coarse-pointer scrollbar track
     can appear "dead"/extra-wide on Android in landscape). */
  body[data-panel-layout="panels"] .sidebarBody {
    scrollbar-width: thin;
    scrollbar-color: rgba(82, 82, 82, 0.68) transparent;
  }

  body[data-panel-layout="panels"] .sidebarBody::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  body[data-panel-layout="panels"] .sidebarBody::-webkit-scrollbar-track {
    background: transparent;
  }

  body[data-panel-layout="panels"] .sidebarBody::-webkit-scrollbar-thumb {
    background: rgba(82, 82, 82, 0.68);
    border-radius: 999px;
    border: 1px solid transparent;
    background-clip: padding-box;
  }

  body[data-panel-layout="panels"] .sidebarBody::-webkit-scrollbar-thumb:hover {
    background: rgba(146, 146, 146, 0.92);
  }

  /* Safe-area fix for landscape flex-row layout.
     Some game pages apply  body { padding-left/right: env(safe-area-inset-*) }
     via @supports, which was correct for portrait but in landscape creates a
     visible dark gap between the screen edge and the sidebar border ("multiple
     borders" on mobie).  Counter that by stretching #appRoot back to the true
     viewport edges, then re-applying safe-area insets as content padding
     INSIDE the outermost sidebar elements so content is never obscured by the
     device notch or home indicator. */
  @supports (padding: env(safe-area-inset-left)) {
    body[data-panel-layout="panels"] #appRoot {
      width: 100dvw;
      margin-left: calc(-1 * env(safe-area-inset-left, 0px));
    }
    body[data-panel-layout="panels"] #leftSidebar .sidebarHeader,
    body[data-panel-layout="panels"] #leftSidebar .sidebarBody {
      padding-left: max(10px, env(safe-area-inset-left, 0px));
    }
    body[data-panel-layout="panels"] #rightSidebar .sidebarHeader,
    body[data-panel-layout="panels"] #rightSidebar .sidebarBody {
      padding-right: max(8px, env(safe-area-inset-right, 0px));
    }
  }
}

/* ── Portrait orientation — panels mode ────────────────────────────
   Landscape (default): leftSidebar | board | rightSidebar  (row)
   Portrait:            leftSidebar above board, rightSidebar below  (column)
   ────────────────────────────────────────────────────────────────── */
@media (orientation: portrait) {
  body[data-panel-layout="panels"] #appRoot {
    flex-direction: column;
  }

  /* Explicit stack order: left panel on top, board in middle, right panel at bottom */
  body[data-panel-layout="panels"] #leftSidebar  { order: 1; }
  body[data-panel-layout="panels"] #centerArea   { order: 2; }
  body[data-panel-layout="panels"] #rightSidebar { order: 3; }

  /* Full-width top/bottom strips; cap height so the board still gets space */
  body[data-panel-layout="panels"] .sidebar {
    width: 100% !important;  /* override JS inline width from splitLayout */
    min-width: 0 !important;
    height: auto !important;
    flex: 0 0 auto;
    max-height: 35vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Board fills the remaining vertical space */
  body[data-panel-layout="panels"] #centerArea {
    flex: 1 1 0 !important;
    min-height: 0;
    min-width: 0;
  }

  /* Drag gutters are meaningless in portrait — hide them */
  body[data-panel-layout="panels"] #gutterLeft,
  body[data-panel-layout="panels"] #gutterRight,
  body[data-panel-layout="panels"] .gutter {
    display: none !important;
  }

  /* Collapse/expand tab strips are a landscape affordance; hide them on
     non-collapsed sidebars in portrait (the sidebar header already carries
     the collapse button). */
  body[data-panel-layout="panels"] .sidebar:not(.collapsed) .sidebarTab {
    display: none !important;
  }

  /* Collapsed sidebar in portrait: keep a compact 44 px tap-strip so the user
     can re-expand without a page reload.  The main .sidebar rule above sets
     height: auto !important which would collapse the element to 0 px when its
     content is hidden; override that here with higher specificity. */
  body[data-panel-layout="panels"] .sidebar.collapsed {
    height: 44px !important;
    max-height: 44px !important;
    flex: 0 0 44px !important;
    overflow: hidden;
  }
  body[data-panel-layout="panels"] .sidebar.collapsed .sidebarTab {
    display: flex !important;
    width: 100%;
    height: 44px;
  }
}
`;
  document.head.appendChild(style);
}

function parsePx(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function syncBoardViewportFit(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const centerArea = document.getElementById("centerArea") as HTMLElement | null;
  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  const svg = document.querySelector("#boardWrap svg") as SVGSVGElement | null;
  if (!centerArea || !boardWrap || !svg) return;

  // Compute available content-box height for the board, accounting for padding.
  let padTop = 0;
  let padBottom = 0;
  let padLeft = 0;
  let padRight = 0;

  try {
    const cs = window.getComputedStyle(centerArea);
    padTop = parsePx(cs.paddingTop);
    padBottom = parsePx(cs.paddingBottom);
    padLeft = parsePx(cs.paddingLeft);
    padRight = parsePx(cs.paddingRight);
  } catch {
    // ignore
  }

  // Prefer visual viewport sizing (handles mobile browser chrome / on-screen keyboard).
  const vv = window.visualViewport;
  const viewportW = (vv?.width ?? window.innerWidth) + (vv?.offsetLeft ?? 0);
  const viewportH = (vv?.height ?? window.innerHeight) + (vv?.offsetTop ?? 0);

  let rectTop = 0;
  let rectLeft = 0;
  try {
    const r = centerArea.getBoundingClientRect();
    rectTop = r.top;
    rectLeft = r.left;
  } catch {
    // ignore
  }

  const maxFromClientH = centerArea.clientHeight - padTop - padBottom;
  const maxFromClientW = centerArea.clientWidth - padLeft - padRight;
  const maxFromViewportH = viewportH - rectTop - padTop - padBottom;
  const maxFromViewportW = viewportW - rectLeft - padLeft - padRight;

  const availableH = Math.min(maxFromClientH > 0 ? maxFromClientH : Number.POSITIVE_INFINITY, maxFromViewportH);
  const availableW = Math.min(maxFromClientW > 0 ? maxFromClientW : Number.POSITIVE_INFINITY, maxFromViewportW);

  // If the layout isn't ready yet, skip.
  if (!Number.isFinite(availableH) || !Number.isFinite(availableW) || availableH <= 0 || availableW <= 0) return;

  // Keep a tiny buffer to avoid 1px rounding overflow creating a scroll bar.
  const maxH = Math.max(120, Math.floor(availableH - 2));

  // Only update when the value changes to avoid needless style recalcs.
  const prev = boardWrap.style.getPropertyValue("--board-fit-max-h");
  const next = `${maxH}px`;
  if (prev !== next) {
    boardWrap.style.setProperty("--board-fit-max-h", next);
  }
}

function scheduleBoardViewportFitSync(): void {
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__boardViewportFitSyncQueued) return;
  anyWin.__boardViewportFitSyncQueued = 1;

  try {
    window.requestAnimationFrame(() => {
      anyWin.__boardViewportFitSyncQueued = 0;
      syncBoardViewportFit();
    });
  } catch {
    anyWin.__boardViewportFitSyncQueued = 0;
    syncBoardViewportFit();
  }
}

/**
 * Re-apply board zoom, #boardWrap max-height fit, viewport mode, and shell resize handlers.
 * Needed when "Start new offline bot game" finishes in-page a second time (no navigation) —
 * `commitExplicitLocalPlayMode` is a no-op once the shell is already unlocked, so chrome
 * would otherwise stay on stale layout/theme geometry until a full reload.
 */
export function scheduleFullBoardChromeReflow(): void {
  scheduleBoardPlayAreaZoomSync();
  scheduleBoardViewportFitSync();
  const fire = (): void => {
    try {
      window.dispatchEvent(new Event("boardViewportModeChanged"));
      window.dispatchEvent(new Event("panelLayoutModeChanged"));
      window.dispatchEvent(new Event("resize"));
    } catch {
      // ignore
    }
  };
  fire();
  const fireReflowDone = (): void => {
    try {
      window.dispatchEvent(new CustomEvent(STACKWORKS_BOARD_CHROME_REFLOW_DONE_EVENT));
    } catch {
      // ignore
    }
  };
  try {
    window.requestAnimationFrame(() => {
      scheduleBoardPlayAreaZoomSync();
      scheduleBoardViewportFitSync();
      fire();
      fireReflowDone();
    });
  } catch {
    scheduleBoardPlayAreaZoomSync();
    scheduleBoardViewportFitSync();
    fire();
    fireReflowDone();
  }
  window.setTimeout(() => {
    scheduleBoardPlayAreaZoomSync();
    scheduleBoardViewportFitSync();
    fire();
    fireReflowDone();
  }, 0);
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

function syncBoardPlayAreaZoom(): void {
  if (typeof document === "undefined") return;
  const svg = document.querySelector("#boardWrap svg") as SVGSVGElement | null;
  if (!svg) return;

  // Scale up the *play area* (squares + coords + pieces) in BOTH layout modes.
  // This reduces the SVG's built-in margin between the checkerboard and the frame.
  try {
    // In playable-area viewport mode, the SVG viewBox is already cropped tightly
    // to the squares span. Applying the play-area zoom would clip the left/right
    // edge files/ranks, especially in tall portrait viewports.
    const viewportMode = document.body?.dataset?.boardViewport;
    const scale = viewportMode === "playable" ? 1.0 : 1.10;
    setBoardPlayAreaZoom(svg, scale);
  } catch {
    // ignore
  }
}

function scheduleBoardPlayAreaZoomSync(): void {
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__boardPlayAreaZoomSyncQueued) return;
  anyWin.__boardPlayAreaZoomSyncQueued = 1;
  try {
    window.requestAnimationFrame(() => {
      anyWin.__boardPlayAreaZoomSyncQueued = 0;
      syncBoardPlayAreaZoom();
    });
  } catch {
    anyWin.__boardPlayAreaZoomSyncQueued = 0;
    syncBoardPlayAreaZoom();
  }
}

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
    startLink.href = "./";
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

  // Keep the board zoom in sync with layout mode.
  try {
    window.addEventListener("panelLayoutModeChanged", () => {
      scheduleBoardPlayAreaZoomSync();
      scheduleBoardViewportFitSync();
    });
  } catch {
    // ignore
  }

  // Keep board zoom/fit in sync with the board viewport mode (framed vs playable).
  try {
    window.addEventListener("boardViewportModeChanged", () => {
      scheduleBoardPlayAreaZoomSync();
      scheduleBoardViewportFitSync();
    });
  } catch {
    // ignore
  }

  // Handle rotation / resizes that can change the mobile-like heuristic.
  try {
    window.addEventListener("resize", () => {
      scheduleBoardPlayAreaZoomSync();
      scheduleBoardViewportFitSync();
    });
  } catch {
    // ignore
  }

  // orientationchange fires before resize on some older mobile browsers.
  // Re-run viewport fit AND re-apply the shell mode (hamburger visibility etc.)
  // so the UI reflects the new orientation immediately.
  try {
    window.addEventListener("orientationchange", () => {
      // Let the browser finish rotating before measuring.
      setTimeout(() => {
        applyVisibility();
        scheduleBoardPlayAreaZoomSync();
        scheduleBoardViewportFitSync();
      }, 150);
    });
  } catch {
    // ignore
  }

  // visualViewport can change when mobile browser chrome expands/collapses.
  try {
    window.visualViewport?.addEventListener("resize", () => scheduleBoardViewportFitSync());
    window.visualViewport?.addEventListener("scroll", () => scheduleBoardViewportFitSync());
  } catch {
    // ignore
  }

  // Some pages bind menu mode before the board SVG is loaded.
  // Observe the board container so we apply zoom as soon as the SVG arrives,
  // and also when themes mutate the SVG (e.g. Stone/Burled raster layer).
  try {
    const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
    const anyWrap = boardWrap as any;
    if (boardWrap && typeof MutationObserver !== "undefined" && !anyWrap.__panelLayoutBoardWrapObserver) {
      const obs = new MutationObserver(() => {
        // If #boardPlayArea doesn't exist yet, the SVG just arrived for the first time.
        // Apply zoom synchronously so there's no visible 1-frame flash at un-zoomed size.
        // MutationObserver callbacks do not recurse within the same delivery, so this
        // is safe even though syncBoardPlayAreaZoom mutates child nodes.
        const svg = boardWrap.querySelector("svg") as SVGSVGElement | null;
        if (svg && !svg.querySelector("#boardPlayArea")) {
          syncBoardPlayAreaZoom();
        } else {
          scheduleBoardPlayAreaZoomSync();
        }
        scheduleBoardViewportFitSync();
      });
      // IMPORTANT: do NOT observe attributes. Our zoom implementation updates
      // `transform` attributes, which would create an observer feedback loop and
      // can freeze page load.
      obs.observe(boardWrap, { childList: true, subtree: true });
      anyWrap.__panelLayoutBoardWrapObserver = obs;
    }
  } catch {
    // ignore
  }

  // Apply immediately (covers initial page load).
  scheduleBoardPlayAreaZoomSync();
  scheduleBoardViewportFitSync();

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

    // Some layouts mutate DOM / order; ensure board zoom is re-applied after the
    // dataset change so it doesn't get lost across mode toggles.
    scheduleBoardPlayAreaZoomSync();

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
