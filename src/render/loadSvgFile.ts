const BOARD_SRC_ATTR = "data-stackworks-board-src";

export async function loadSvgFileInto(containerEl: HTMLElement, url: string | URL): Promise<SVGSVGElement> {
  if (!containerEl) throw new Error("loadSvgFileInto: containerEl is required");

  const urlStr = typeof url === "string" ? url : url.href;

  // Preserve any existing UI overlays inside the board container (e.g. the loading spinner).
  // `replaceChildren()` would otherwise remove them.
  const preservedChildren = Array.from(containerEl.children).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    return el.classList.contains("lascaBoardLoadingOverlay") || el.hasAttribute("data-preserve");
  });

  const firstChild = containerEl.firstElementChild;
  if (firstChild instanceof SVGSVGElement && firstChild.getAttribute(BOARD_SRC_ATTR) === urlStr) {
    return firstChild;
  }

  const res = await fetch(url as string);
  if (!res.ok) {
    throw new Error(`loadSvgFileInto: failed to fetch ${String(url)} (${res.status})`);
  }

  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");

  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    throw new Error(`loadSvgFileInto: ${String(url)} did not parse as an <svg> root`);
  }

  const imported = document.importNode(svg, true) as unknown as SVGSVGElement;
  imported.setAttribute(BOARD_SRC_ATTR, urlStr);
  // Keep the SVG first and overlays last so overlays sit above it.
  containerEl.replaceChildren(imported, ...preservedChildren);
  return imported;
}
