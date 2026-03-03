const SVG_NS = "http://www.w3.org/2000/svg";

type ViewBox = { x: number; y: number; w: number; h: number };

function parseViewBox(svg: SVGSVGElement): ViewBox {
  const raw = svg.getAttribute("viewBox") ?? "";
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => Number(p));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, w, h] = parts;
    return { x, y, w, h };
  }
  // Default for bundled board assets.
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

function numAttr(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  if (raw == null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function readFrameSafeBounds(svg: SVGSVGElement): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const vb = parseViewBox(svg);
  const frameRect = svg.querySelector("#frame rect") as SVGRectElement | null;
  if (!frameRect) {
    // Fallback: assume a border sits on the viewBox edge; keep a tiny inset.
    return { minX: vb.x + 8, minY: vb.y + 8, maxX: vb.x + vb.w - 8, maxY: vb.y + vb.h - 8 };
  }

  const x = numAttr(frameRect, "x");
  const y = numAttr(frameRect, "y");
  const w = numAttr(frameRect, "width");
  const h = numAttr(frameRect, "height");
  if (x == null || y == null || w == null || h == null) return null;

  // Stroke is centered on the rect; text that visually "touches" the border is
  // still annoying, so be slightly conservative.
  const sw = Math.max(0, numAttr(frameRect, "stroke-width") ?? 0);
  const inset = Math.max(10, sw * 1.5);
  return { minX: x + inset, minY: y + inset, maxX: x + w - inset, maxY: y + h - inset };
}

function shouldStayOutsideGrouping(child: ChildNode): boolean {
  if (child.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (child as Element).tagName.toLowerCase();
  return tag === "defs" || tag === "style" || tag === "metadata";
}

function ensurePlayAreaGroup(svg: SVGSVGElement): SVGGElement {
  const boardView = ((svg.querySelector("#boardView") as SVGGElement | null) ?? svg) as SVGSVGElement | SVGGElement;

  const existing = boardView.querySelector("#boardPlayArea") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "boardPlayArea";

  // Insert so the outer frame stays on top.
  // Desired order: bgFill (bottom) -> playArea (zoomed) -> frame (top).
  const frameEl = boardView.querySelector("#frame");
  if (frameEl && frameEl.parentNode === boardView) {
    boardView.insertBefore(g, frameEl);
  } else {
    boardView.appendChild(g);
  }

  // Move visual children under the play-area group, preserving order.
  const toMove = Array.from(boardView.childNodes).filter((n) => n !== g);
  for (const child of toMove) {
    if (shouldStayOutsideGrouping(child) && boardView === svg) continue;

    // Keep the outer background + frame unscaled so the border never overlaps
    // due to transform interactions.
    if (child.nodeType === Node.ELEMENT_NODE) {
      const id = (child as Element).getAttribute("id") ?? "";
      if (id === "bgFill" || id === "frame") continue;
    }

    g.appendChild(child);
  }

  return g;
}

function stashTransform(el: Element, key: string): void {
  try {
    const anyEl = el as any;
    if (anyEl.dataset?.[key] != null) return;
    const prev = (el as SVGElement).getAttribute("transform") ?? "";
    if (!anyEl.dataset) anyEl.dataset = {};
    anyEl.dataset[key] = prev;
  } catch {
    // ignore
  }
}

function restoreTransform(el: Element, key: string): void {
  try {
    const anyEl = el as any;
    const prev = anyEl.dataset?.[key];
    if (prev == null) {
      (el as SVGElement).removeAttribute("transform");
      return;
    }
    if (String(prev).trim().length === 0) (el as SVGElement).removeAttribute("transform");
    else (el as SVGElement).setAttribute("transform", String(prev));
    delete anyEl.dataset[key];
  } catch {
    // ignore
  }
}

/**
 * Scales the board play area (squares + pieces + coords) while keeping the outer
 * frame at its original size via an inverse transform.
 *
 * This is meant for menu-mode on small screens where the board SVG has a lot of
 * built-in margin between the checkerboard and the frame.
 */
export function setBoardPlayAreaZoom(svg: SVGSVGElement, scale: number): void {
  if (!svg) return;
  if (typeof document === "undefined") return;

  const playArea = ensurePlayAreaGroup(svg);
  const vb = parseViewBox(svg);
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;

  // Treat near-1 as reset.
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) {
    restoreTransform(playArea, "origTransform");
    return;
  }

  stashTransform(playArea, "origTransform");

  // Clamp scale so scaled content never overlaps the border/frame.
  // IMPORTANT: `getBBox()` is not reliably transform-aware across browsers.
  // Compute the bbox in the untransformed coordinate system, then derive the
  // maximum legal scale analytically.
  let clampedScale = scale;
  try {
    const safe = readFrameSafeBounds(svg);
    if (safe) {
      // Ensure bbox is measured without our zoom transform.
      restoreTransform(playArea, "origTransform");

      // The Stone/Burled themes may inject a full-board raster <image> layer
      // (x/y = viewBox origin; width/height = viewBox size). That background
      // is intentionally scaled with the play area, but it must NOT participate
      // in clamping; otherwise `getBBox()` becomes the entire viewBox and the
      // computed max scale collapses back to ~1.
      const rasterLayer = svg.querySelector("#checkerboardRasterLayer") as SVGGElement | null;
      const prevRasterDisplay = rasterLayer?.getAttribute("display") ?? null;
      try {
        if (rasterLayer) rasterLayer.setAttribute("display", "none");
      } catch {
        // ignore
      }

      const baseBBox = playArea.getBBox();

      try {
        if (rasterLayer) {
          if (prevRasterDisplay == null) rasterLayer.removeAttribute("display");
          else rasterLayer.setAttribute("display", prevRasterDisplay);
        }
      } catch {
        // ignore
      }

      stashTransform(playArea, "origTransform");

      // Defensive: during theme swaps or early paint, some browsers can report a
      // degenerate bbox (0×0 at origin) for a group that is in flux. If we clamp
      // using that, we can erroneously force the scale down to ~1.
      if (
        !Number.isFinite(baseBBox.x) ||
        !Number.isFinite(baseBBox.y) ||
        !Number.isFinite(baseBBox.width) ||
        !Number.isFinite(baseBBox.height) ||
        baseBBox.width < 2 ||
        baseBBox.height < 2
      ) {
        // Skip clamping; apply requested scale.
        playArea.setAttribute(
          "transform",
          `translate(${cx} ${cy}) scale(${clampedScale}) translate(${-cx} ${-cy})`
        );
        return;
      }

      // Also avoid clamping against obviously wrong boxes.
      if (baseBBox.x < vb.x - vb.w || baseBBox.y < vb.y - vb.h || baseBBox.x > vb.x + vb.w || baseBBox.y > vb.y + vb.h) {
        playArea.setAttribute(
          "transform",
          `translate(${cx} ${cy}) scale(${clampedScale}) translate(${-cx} ${-cy})`
        );
        return;
      }

      const leftD0 = cx - baseBBox.x;
      const rightD0 = baseBBox.x + baseBBox.width - cx;
      const topD0 = cy - baseBBox.y;
      const bottomD0 = baseBBox.y + baseBBox.height - cy;

      const maxL = leftD0 > 0 ? (cx - safe.minX) / leftD0 : Infinity;
      const maxR = rightD0 > 0 ? (safe.maxX - cx) / rightD0 : Infinity;
      const maxT = topD0 > 0 ? (cy - safe.minY) / topD0 : Infinity;
      const maxB = bottomD0 > 0 ? (safe.maxY - cy) / bottomD0 : Infinity;

      const maxScale = Math.min(scale, maxL, maxR, maxT, maxB);
      if (Number.isFinite(maxScale) && maxScale > 0) clampedScale = Math.min(clampedScale, maxScale);
    }
  } catch {
    // ignore
  }

  playArea.setAttribute(
    "transform",
    `translate(${cx} ${cy}) scale(${clampedScale}) translate(${-cx} ${-cy})`
  );
}
