export type BoardCoordsInSquaresUI = {
  toggle: HTMLInputElement | null;
  row: HTMLElement | null;
  hint: HTMLElement | null;
};

function getClosestDiv(el: Element | null): HTMLDivElement | null {
  return (el?.closest("div") as HTMLDivElement | null) ?? null;
}

function insertAfter(parent: HTMLElement, after: Element, el: HTMLElement): void {
  const next = after.nextElementSibling;
  if (next) parent.insertBefore(el, next);
  else parent.appendChild(el);
}

/**
 * Ensures an "Inside squares" checkbox exists just below the "Show board coordinates" option.
 * Used by multiple 8x8 checkerboard games whose HTML doesn't include the toggle.
 */
export function ensureBoardCoordsInSquaresOption(
  boardCoordsToggle: HTMLInputElement | null,
  opts?: {
    toggleId?: string;
    labelText?: string;
    hintText?: string;
  },
): BoardCoordsInSquaresUI {
  const toggleId = opts?.toggleId ?? "boardCoordsInSquaresToggle";
  const labelText = opts?.labelText ?? "Inside squares";
  const hintText = opts?.hintText ?? "Lowercase letters on bottom row; numbers on left column";

  const existingToggle = (document.getElementById(toggleId) as HTMLInputElement | null) ?? null;
  if (existingToggle) {
    const row = getClosestDiv(existingToggle);
    const hint = (row?.nextElementSibling as HTMLElement | null) ?? null;
    return { toggle: existingToggle, row, hint };
  }

  if (!boardCoordsToggle) return { toggle: null, row: null, hint: null };

  const baseRow = getClosestDiv(boardCoordsToggle);
  const baseHint = (baseRow?.nextElementSibling as HTMLElement | null) ?? null;
  const parent = (baseRow?.parentElement as HTMLElement | null) ?? null;
  if (!baseRow || !parent) return { toggle: null, row: null, hint: null };

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;margin-left:24px;";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = toggleId;
  toggle.style.cssText = "width:16px;height:16px;cursor:pointer";

  const label = document.createElement("label");
  label.htmlFor = toggleId;
  label.textContent = labelText;
  label.style.cssText = "font-size:13px;cursor:pointer;user-select:none";

  row.appendChild(toggle);
  row.appendChild(label);

  const hint = document.createElement("div");
  hint.textContent = hintText;
  hint.style.cssText = "font-size:11px;color:rgba(255,255,255,0.6);margin-top:6px;margin-left:48px;";

  const insertAfterEl = baseHint ?? baseRow;
  insertAfter(parent, insertAfterEl, row);
  insertAfter(parent, row, hint);

  return { toggle, row, hint };
}
