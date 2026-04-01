const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function lightDarkTooltipFromHref(href: string): string | null {
  const id = href.startsWith("#") ? href.slice(1) : href;
  if (id.startsWith("W_")) return "Light";
  if (id.startsWith("B_")) return "Dark";
  return null;
}

export function makeUse(href: string, x: number, y: number, size: number): SVGUseElement {
  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS(XLINK_NS, "xlink:href", href);

  use.setAttribute("width", String(size));
  use.setAttribute("height", String(size));
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));

  const tooltip = lightDarkTooltipFromHref(href);
  if (tooltip) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = tooltip;
    use.appendChild(title);
  }
  return use;
}

/**
 * Lock presentation on a live board piece <use> to the active piece theme.
 * Global theme CSS (e.g. Glass opacity on `#lascaBoard #pieces use`) can otherwise
 * linger across theme swaps until a later layout (same stylesheet URL, slow cascade, etc.).
 */
export function finalizeLivePieceUse(use: SVGUseElement, themeId: string | null | undefined): void {
  const id = String(themeId ?? "").trim().toLowerCase();
  if (id === "glass") {
    use.style.removeProperty("opacity");
  } else {
    use.style.setProperty("opacity", "1", "important");
  }
}

export function makeUseWithTitle(
  href: string,
  x: number,
  y: number,
  size: number,
  titleText: string | null | undefined,
  liveThemeId?: string | null,
): SVGUseElement {
  const use = makeUse(href, x, y, size);
  if (titleText) {
    // Prefer our explicit title over the generic Light/Dark fallback.
    while (use.firstChild) use.removeChild(use.firstChild);
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = titleText;
    use.appendChild(title);
  }
  if (liveThemeId !== undefined) {
    finalizeLivePieceUse(use, liveThemeId);
  }
  return use;
}
