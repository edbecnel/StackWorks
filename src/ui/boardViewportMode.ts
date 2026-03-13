import type { BoardViewportMode } from "../render/boardViewport";

export const BOARD_VIEWPORT_MODE_CHANGED_EVENT = "boardViewportModeChanged";

const LS_KEY = "lasca.ui.boardViewport";

function detectDefaultBoardViewportMode(): BoardViewportMode {
  return "framed";
}

export function readBoardViewportMode(): BoardViewportMode {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored == null || stored === "") return detectDefaultBoardViewportMode();
    const raw = String(stored).trim().toLowerCase();
    return raw === "playable" ? "playable" : "framed";
  } catch {
    return detectDefaultBoardViewportMode();
  }
}

export function writeBoardViewportMode(mode: BoardViewportMode): void {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(BOARD_VIEWPORT_MODE_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

function ensureInjectedStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("boardViewportModeStyles")) return;

  const style = document.createElement("style");
  style.id = "boardViewportModeStyles";
  style.textContent = `
/* Playable-area viewport mode: slightly reduce padding so the cropped board can grow. */
body[data-board-viewport="playable"] #centerArea {
  padding: max(6px, env(safe-area-inset-top))
           max(6px, env(safe-area-inset-right))
           max(6px, env(safe-area-inset-bottom))
           max(6px, env(safe-area-inset-left));
}
`;
  document.head.appendChild(style);
}

export function applyBoardViewportMode(mode: BoardViewportMode): void {
  if (typeof document === "undefined") return;
  ensureInjectedStyles();
  document.body.dataset.boardViewport = mode;
}

export function installBoardViewportOptionUI(opts?: { label?: string }): void {
  if (typeof document === "undefined") return;

  const labelText = opts?.label ?? "Board";
  const host = document.querySelector('.panelSection[data-section="options"] .sectionContent') as HTMLElement | null;
  if (!host) return;

  // Avoid duplicate injection.
  if (host.querySelector('[data-ui="boardViewportMode"]')) return;

  const row = document.createElement("div");
  row.dataset.ui = "boardViewportMode";
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
  select.setAttribute("aria-label", "Board viewport mode");

  const optFramed = document.createElement("option");
  optFramed.value = "framed";
  optFramed.textContent = "Framed";

  const optPlayable = document.createElement("option");
  optPlayable.value = "playable";
  optPlayable.textContent = "Playable area";

  select.appendChild(optFramed);
  select.appendChild(optPlayable);

  select.value = readBoardViewportMode();

  select.addEventListener("change", () => {
    const next = String(select.value) === "playable" ? "playable" : "framed";
    writeBoardViewportMode(next);
    applyBoardViewportMode(next);
  });

  row.appendChild(lab);
  row.appendChild(select);

  // Insert near the top of options.
  host.insertBefore(row, host.firstChild);
}
