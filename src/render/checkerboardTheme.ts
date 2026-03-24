export type CheckerboardThemeId = "classic" | "green" | "blue" | "stone" | "burled" | "checkers" | "candy" | "tournament";

export type CheckerboardThemeDef = {
  id: CheckerboardThemeId;
  label: string;
  light: string;
  dark: string;
  bg?: string;
  frameStroke?: string;
  frameStrokeOpacity?: string;
  edgeFill?: string;
  edgeOpacity?: string;
  squareStroke?: string;
  lightSquareStroke?: string;
  darkSquareStroke?: string;
  squareStrokeOpacity?: string;
  squareStrokeWidth?: string;
};

export const DEFAULT_CHECKERBOARD_THEME_ID: CheckerboardThemeId = "classic";

export const CHECKERBOARD_THEMES: readonly CheckerboardThemeDef[] = [
  {
    id: "classic",
    label: "Classic",
    // Matches src/assets/chess_board.svg + src/assets/columns_chess_board.svg
    light: "#f0d9b5",
    dark: "#b58863",
    bg: "#e8ddcc",
  },
  {
    id: "green",
    label: "Green",
    // Lichess-style green board (approx)
    light: "#e7edd4",
    dark: "#6d8a3e",
    bg: "#dfe6c2",
  },
  {
    id: "blue",
    label: "Blue",
    // Cool blue board (matches the blue/white screenshot vibe)
    light: "#eef3ff",
    dark: "#6b84b3",
    bg: "#dde6f7",
  },
  {
    id: "stone",
    label: "Stone",
    // Fallback colors; actual stone texture uses SVG patterns.
    light: "#d8d8d8",
    dark: "#3f3f3f",
    bg: "#c9c9c9",
  },
  {
    id: "burled",
    label: "Burled Wood",
    // Fallback colors; actual wood texture uses SVG patterns.
    light: "#d9c09a",
    dark: "#7a4a26",
    bg: "#cbb08c",
  },
  {
    id: "checkers",
    label: "Classic Checkers",
    light: "#b21f1f",
    dark: "#111111",
    bg: "#1b1b1b",
    edgeFill: "#bdbdbd",
    edgeOpacity: "0.78",
  },
  {
    id: "candy",
    label: "Candy",
    light: "#f5efff",
    dark: "#f4b199",
    bg: "#cf6d84",
    frameStroke: "#8c6ddb",
    frameStrokeOpacity: "0.85",
    edgeFill: "#5c45b8",
    edgeOpacity: "0.92",
    lightSquareStroke: "#d7c9ff",
    darkSquareStroke: "#c96d3d",
    squareStrokeOpacity: "0.92",
    squareStrokeWidth: "4",
  },
  {
    id: "tournament",
    label: "Tournament",
    light: "#F5F1E6",
    dark: "#6B4A2B",
    bg: "#E3D8C7",
  },
] as const;

export function normalizeCheckerboardThemeId(raw: string | null | undefined): CheckerboardThemeId {
  if (raw === "tournament") return "tournament";
  if (raw === "candy") return "candy";
  if (raw === "checkers") return "checkers";
  if (raw === "burled") return "burled";
  if (raw === "stone") return "stone";
  if (raw === "blue") return "blue";
  if (raw === "green") return "green";
  return "classic";
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function isLikelyIOSBrowser(): boolean {
  try {
    const nav = navigator as any;
    const ua = String(nav?.userAgent ?? "");
    const platform = String(nav?.platform ?? "");
    const maxTouchPoints = Number(nav?.maxTouchPoints ?? 0);

    // iOS UA tokens (Safari + embedded webviews).
    const isIOSUA = /iPad|iPhone|iPod/i.test(ua);
    const isIOSWebKitShell = /\b(CriOS|FxiOS|EdgiOS|OPiOS)\b/i.test(ua);
    const isAppleVendor = /Apple/i.test(String(nav?.vendor ?? ""));

    // iPadOS often reports as "MacIntel" but has touch points.
    const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

    // Some iPadOS Safari builds report as Macintosh in the UA.
    const isTouchMacLike = /Macintosh/i.test(ua) && maxTouchPoints > 1;

    return isIOSUA || isIPadOS || isTouchMacLike || (isAppleVendor && isIOSWebKitShell);
  } catch {
    return false;
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const s = String(hex || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const raw = m[1];
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0] + raw[0], 16);
    const g = Number.parseInt(raw[1] + raw[1], 16);
    const b = Number.parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return { r, g, b };
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  const tt = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * tt),
    g: Math.round(a.g + (b.g - a.g) * tt),
    b: Math.round(a.b + (b.b - a.b) * tt),
  };
}

function rgbCss(rgb: { r: number; g: number; b: number }, a?: number): string {
  if (typeof a === "number") {
    const aa = Math.max(0, Math.min(1, a));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${aa})`;
  }
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function ensureImagePattern(svgRoot: SVGSVGElement, opts: { id: string; dataUrl: string; size: number }): void {
  if (!opts.dataUrl) return;
  const defs = ensureSvgDefs(svgRoot);
  if (defs.querySelector(`#${opts.id}`)) return;

  const pattern = document.createElementNS(SVG_NS, "pattern") as SVGPatternElement;
  pattern.setAttribute("id", opts.id);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(opts.size));
  pattern.setAttribute("height", String(opts.size));

  const img = document.createElementNS(SVG_NS, "image") as SVGImageElement;
  img.setAttribute("x", "0");
  img.setAttribute("y", "0");
  img.setAttribute("width", String(opts.size));
  img.setAttribute("height", String(opts.size));
  img.setAttribute("preserveAspectRatio", "none");
  img.setAttribute("href", opts.dataUrl);
  img.setAttributeNS(XLINK_NS, "xlink:href", opts.dataUrl);
  pattern.appendChild(img);

  defs.appendChild(pattern);
}

function genTextureDataUrl(opts: {
  themeId: "stone" | "burled";
  variant: "light" | "dark";
  baseHex: string;
  seed: number;
  size?: number;
}): { url: string; size: number } {
  const size = Math.max(64, Math.min(512, opts.size ?? 256));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { url: "", size };

    ctx.fillStyle = opts.baseHex;
    ctx.fillRect(0, 0, size, size);

    const baseRgb = hexToRgb(opts.baseHex) ?? { r: 128, g: 128, b: 128 };
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };

    const rnd = mulberry32(opts.seed);

    // Fine noise
    const dots = opts.themeId === "burled" ? 9000 : 6500;
    for (let i = 0; i < dots; i++) {
      const x = Math.floor(rnd() * size);
      const y = Math.floor(rnd() * size);
      const a = opts.themeId === "burled" ? 0.035 + rnd() * 0.045 : 0.02 + rnd() * 0.03;

      // Stone: bias speck colors by variant so dark tiles don't wash out.
      if (opts.themeId === "stone") {
        const speck = opts.variant === "dark" ? mixRgb(baseRgb, white, 0.55) : mixRgb(baseRgb, black, 0.55);
        ctx.fillStyle = rgbCss(speck, a);
      } else {
        const v = rnd() < 0.5 ? 0 : 255;
        ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a})`;
      }
      ctx.fillRect(x, y, 1, 1);
    }

    // Broad swirls / figure
    ctx.save();
    // Stone: use multiply on light tiles (dark veins) and screen on dark tiles (light veins)
    // to preserve clear checker contrast.
    if (opts.themeId === "stone") {
      ctx.globalCompositeOperation = opts.variant === "dark" ? "screen" : "multiply";
    } else if (opts.themeId === "burled") {
      // Burled: keep light tiles darker-veined, but give dark tiles lighter highlights.
      // Using multiply for the dark variant tends to crush texture into a flat field.
      ctx.globalCompositeOperation = opts.variant === "dark" ? "screen" : "multiply";
    } else {
      ctx.globalCompositeOperation = "multiply";
    }
    const blobs = opts.themeId === "burled" ? 150 : 95;
    for (let i = 0; i < blobs; i++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      const r = (0.08 + rnd() * 0.22) * size;
      const alpha = opts.themeId === "burled" ? 0.06 + rnd() * 0.10 : 0.05 + rnd() * 0.07;

      // Choose a vein color that is relative to the base so it reads as texture.
      const veinRgb = opts.themeId === "stone"
        ? (opts.variant === "dark" ? mixRgb(baseRgb, white, 0.55) : mixRgb(baseRgb, black, 0.55))
        : (opts.variant === "dark" ? mixRgb(baseRgb, white, 0.34) : mixRgb(baseRgb, black, 0.35));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgbCss(veinRgb, alpha));
      g.addColorStop(1, rgbCss(veinRgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Burled: add subtle directional grain so it reads more like wood.
    if (opts.themeId === "burled") {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      const angle = (rnd() - 0.5) * 0.35;
      ctx.translate(size / 2, size / 2);
      ctx.rotate(angle);
      ctx.translate(-size / 2, -size / 2);

      const lines = 420;
      for (let i = 0; i < lines; i++) {
        const y = rnd() * size;
        const w = (0.4 + rnd() * 1.6);
        const a = 0.02 + rnd() * 0.04;
        const c = opts.variant === "dark" ? mixRgb(baseRgb, white, 0.18) : mixRgb(baseRgb, black, 0.25);
        ctx.strokeStyle = rgbCss(c, a);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(-size * 0.1, y);
        ctx.lineTo(size * 1.1, y + (rnd() - 0.5) * size * 0.04);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Final bias for Stone dark tiles to keep them distinctly dark.
    if (opts.themeId === "stone" && opts.variant === "dark") {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = rgbCss(mixRgb(white, black, 0.35), 0.55);
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }

    // Light blur pass if supported (some older WebKit builds can ignore ctx.filter).
    try {
      const tmp = document.createElement("canvas");
      tmp.width = size;
      tmp.height = size;
      const tctx = tmp.getContext("2d");
      if (tctx) {
        (tctx as any).filter = "blur(1.1px)";
        tctx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.globalAlpha = 1;
        ctx.drawImage(tmp, 0, 0);
      }
    } catch {
      // ignore
    }

    return { url: canvas.toDataURL("image/png"), size };
  } catch {
    return { url: "", size };
  }
}

type IosTextureCache = {
  stone?: { light: { url: string; size: number }; dark: { url: string; size: number } };
  burled?: { light: { url: string; size: number }; dark: { url: string; size: number } };
};

function parseViewBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } {
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

function stripHiddenPresentation(root: Element): void {
  // Ensure cloning for rasterization still paints even if the live DOM has
  // been hidden (we hide original groups after rasterization).
  const walk = (el: Element) => {
    try {
      if (el.hasAttribute("display")) el.removeAttribute("display");
      const style = el.getAttribute("style");
      if (style && /display\s*:\s*none/i.test(style)) {
        // Remove display:none while preserving other inline styles.
        const cleaned = style
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s && !/^display\s*:/i.test(s))
          .join("; ");
        if (cleaned) el.setAttribute("style", cleaned);
        else el.removeAttribute("style");
      }
    } catch {
      // ignore
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

function ensureRasterLayer(svgRoot: SVGSVGElement): SVGGElement {
  const view = (svgRoot.querySelector("#boardView") as SVGGElement | null) ?? (svgRoot as any);
  const existing = svgRoot.querySelector("#checkerboardRasterLayer") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "checkerboardRasterLayer";
  g.setAttribute("pointer-events", "none");

  // If a play-area zoom group exists, attach the raster layer inside it so the
  // background scales together with squares/coords/pieces.
  const playArea = svgRoot.querySelector("#boardPlayArea") as SVGGElement | null;
  const parent = playArea?.parentNode ? playArea : view;

  // Insert as early as possible inside the view group so it stays behind
  // nodes/pieces/overlays.
  try {
    parent.insertBefore(g, parent.firstChild);
  } catch {
    parent.appendChild(g);
  }

  return g;
}

function removeRasterizedBackground(svgRoot: SVGSVGElement): void {
  const raster = svgRoot.querySelector("#checkerboardRasterLayer") as SVGGElement | null;
  if (raster) {
    const img = raster.querySelector("image") as SVGImageElement | null;
    const oldUrl = img?.getAttribute("data-raster-url") ?? null;
    if (oldUrl) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {
        // ignore
      }
    }
    try {
      raster.remove();
    } catch {
      // ignore
    }
  }

  // Restore hidden groups (if we hid them after rasterization).
  // NOTE: we intentionally keep `#bgFill` + `#frame` vector (never hidden).
  for (const id of ["squares"]) {
    const g = svgRoot.querySelector(`#${id}`) as SVGGElement | null;
    if (!g) continue;
    if ((g as any).dataset?.rasterHidden === "1") {
      try {
        g.style.removeProperty("display");
        delete (g as any).dataset.rasterHidden;
      } catch {
        // ignore
      }
    }
  }
}

function getSquaresViewBox(svgRoot: SVGSVGElement): { x: number; y: number; w: number; h: number } {
  try {
    const squares = svgRoot.querySelector("#squares") as SVGGElement | null;
    if (squares) {
      const rects = Array.from(squares.querySelectorAll("rect"));
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const rect of rects) {
        const xAttr = rect.getAttribute("data-checkerboard-orig-x") ?? rect.getAttribute("x");
        const yAttr = rect.getAttribute("data-checkerboard-orig-y") ?? rect.getAttribute("y");
        const widthAttr = rect.getAttribute("data-checkerboard-orig-width") ?? rect.getAttribute("width");
        const heightAttr = rect.getAttribute("data-checkerboard-orig-height") ?? rect.getAttribute("height");

        const x = parseNum(xAttr);
        const y = parseNum(yAttr);
        const width = parseNum(widthAttr);
        const height = parseNum(heightAttr);
        if (x == null || y == null || width == null || height == null) continue;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
        if (width <= 0 || height <= 0) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      }

      if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
        const w = maxX - minX;
        const h = maxY - minY;
        if (w > 0 && h > 0) return { x: minX, y: minY, w, h };
      }

      const bb = squares.getBBox();
      if (Number.isFinite(bb.x) && Number.isFinite(bb.y) && Number.isFinite(bb.width) && Number.isFinite(bb.height)) {
        if (bb.width > 0 && bb.height > 0) return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      }
    }
  } catch {
    // ignore
  }

  // Fallback for unexpected SVGs.
  return parseViewBox(svgRoot);
}

function hideVectorSquaresForRaster(svgRoot: SVGSVGElement): void {
  // Hide vector background layers to avoid triggering expensive repaints.
  // NOTE: do NOT hide the frame; it should remain crisp and unscaled.
  for (const id of ["squares"]) {
    const g = svgRoot.querySelector(`#${id}`) as SVGGElement | null;
    if (!g) continue;
    try {
      (g as any).dataset.rasterHidden = "1";
      g.style.display = "none";
    } catch {
      // ignore
    }
  }
}

function waitForImageUrlDecode(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        clearTimeout(timer);
      } catch {
        // ignore
      }
      resolve(ok);
    };

    const timer = window.setTimeout(() => settle(false), Math.max(1, timeoutMs | 0));

    try {
      const img = new Image();
      (img as any).decoding = "async";
      img.onload = () => settle(true);
      img.onerror = () => settle(false);

      // Some browsers support decode(), which resolves after decoding.
      const decode = (img as any).decode as (() => Promise<void>) | undefined;
      if (typeof decode === "function") {
        void decode.call(img).then(
          () => settle(true),
          () => {
            // Fall back to onload/onerror.
          }
        );
      }

      img.src = url;
    } catch {
      settle(false);
    }
  });
}

async function rasterizeBoardBackgroundOnce(svgRoot: SVGSVGElement): Promise<{ url: string; w: number; h: number } | null> {
  if (typeof document === "undefined") return null;

  // Rasterize only the checkerboard squares area. This prevents the Stone/Burled
  // texture from bleeding into the SVG's outer margin when the play-area is zoomed.
  const rootVb = parseViewBox(svgRoot);
  const vb = getSquaresViewBox(svgRoot);

  // Determine raster target size based on the on-screen size.
  let targetW = Math.max(1, Math.round(vb.w));
  let targetH = Math.max(1, Math.round(vb.h));
  try {
    const rect = svgRoot.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    if (rect.width > 10 && rect.height > 10) {
      const sx = rootVb.w > 0 ? vb.w / rootVb.w : 1;
      const sy = rootVb.h > 0 ? vb.h / rootVb.h : 1;
      targetW = Math.max(1, Math.round(rect.width * dpr * sx));
      targetH = Math.max(1, Math.round(rect.height * dpr * sy));
    }
  } catch {
    // ignore; fall back to viewBox size
  }

  // Build a minimal SVG that contains only the squares + defs.
  const tempSvg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  tempSvg.setAttribute("xmlns", SVG_NS);
  tempSvg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  tempSvg.setAttribute("width", String(vb.w));
  tempSvg.setAttribute("height", String(vb.h));

  const defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (defs) {
    const defsClone = defs.cloneNode(true) as SVGDefsElement;
    stripHiddenPresentation(defsClone);
    tempSvg.appendChild(defsClone);
  }

  const squares = svgRoot.querySelector("#squares") as SVGGElement | null;
  if (squares) {
    const clone = squares.cloneNode(true) as SVGGElement;
    stripHiddenPresentation(clone);
    tempSvg.appendChild(clone);
  }

  // Serialize and paint to canvas.
  const xml = new XMLSerializer().serializeToString(tempSvg);
  const svgBlob = new Blob([xml], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  (img as any).decoding = "async";

  const pngUrl = await new Promise<string | null>((resolve) => {
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            resolve(URL.createObjectURL(blob));
          },
          "image/png",
          0.92
        );
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = svgUrl;
  });

  try {
    URL.revokeObjectURL(svgUrl);
  } catch {
    // ignore
  }

  if (!pngUrl) return null;
  return { url: pngUrl, w: targetW, h: targetH };
}

function ensureRasterResizeObserver(svgRoot: SVGSVGElement): void {
  // Keep a single observer per SVG.
  const anyRoot = svgRoot as any;
  if (anyRoot.__checkerboardRasterObserver) return;
  if (typeof ResizeObserver === "undefined") return;

  let timer: number | null = null;
  const obs = new ResizeObserver(() => {
    if (timer !== null) window.clearTimeout(timer);
    // Debounce resize; rasterization is expensive.
    timer = window.setTimeout(() => {
      timer = null;
      const curTheme = (svgRoot as any).__checkerboardThemeId as CheckerboardThemeId | undefined;
      if (curTheme !== "stone" && curTheme !== "burled") return;
      // Re-apply current theme, which will re-rasterize at the new size.
      try {
        applyCheckerboardTheme(svgRoot, curTheme);
      } catch {
        // ignore
      }
    }, 150);
  });

  try {
    obs.observe(svgRoot);
    anyRoot.__checkerboardRasterObserver = obs;
  } catch {
    // ignore
  }
}

function ensureSvgDefs(svgRoot: SVGSVGElement): SVGDefsElement {
  const existing = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (existing) return existing;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs") as SVGDefsElement;
  // Insert early for predictable url(#id) resolution.
  svgRoot.insertBefore(defs, svgRoot.firstChild);
  return defs;
}

function ensureCheckerboardTileClip(
  svgRoot: SVGSVGElement,
  clipId: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const defs = ensureSvgDefs(svgRoot);
  let clipPath = defs.querySelector(`#${clipId}`) as SVGClipPathElement | null;
  if (!clipPath) {
    clipPath = document.createElementNS(SVG_NS, "clipPath") as SVGClipPathElement;
    clipPath.setAttribute("id", clipId);
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
    defs.appendChild(clipPath);
  }

  let rect = clipPath.querySelector("rect") as SVGRectElement | null;
  if (!rect) {
    rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    clipPath.appendChild(rect);
  }

  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
}

function ensureStoneCheckerboardDefs(svgRoot: SVGSVGElement): void {
  const defs = ensureSvgDefs(svgRoot);
  if (defs.querySelector("#stoneCheckerboardDefs")) return;

  const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
  wrapper.setAttribute("id", "stoneCheckerboardDefs");
  // Inline SVG string keeps this compact and avoids lots of DOM calls.
  wrapper.innerHTML = `
    <filter id="stoneLightTex" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
      <!-- Flowing marble-like veins (stronger contrast) -->
      <feTurbulence type="turbulence" baseFrequency="0.010 0.028" numOctaves="2" seed="11" result="warp" />
      <feTurbulence type="fractalNoise" baseFrequency="0.030 0.070" numOctaves="3" seed="12" result="veinNoise" />
      <feDisplacementMap in="veinNoise" in2="warp" scale="26" xChannelSelector="R" yChannelSelector="G" result="veinSwirl" />
      <feColorMatrix in="veinSwirl" type="saturate" values="0" result="veinGray" />
      <feGaussianBlur in="veinGray" stdDeviation="0.25" result="veinBlur" />
      <feComponentTransfer in="veinBlur" result="veinMask">
        <feFuncR type="table" tableValues="0 0 0.06 0.62 1" />
        <feFuncG type="table" tableValues="0 0 0.06 0.62 1" />
        <feFuncB type="table" tableValues="0 0 0.06 0.62 1" />
      </feComponentTransfer>

      <!-- Subtle fine grain, kept low so veins remain visible -->
      <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="2" seed="7" result="grainN" />
      <feColorMatrix in="grainN" type="saturate" values="0" result="grainG" />
      <feComponentTransfer in="grainG" result="grain">
        <feFuncR type="gamma" amplitude="1" exponent="1.35" offset="0" />
        <feFuncG type="gamma" amplitude="1" exponent="1.35" offset="0" />
        <feFuncB type="gamma" amplitude="1" exponent="1.35" offset="0" />
      </feComponentTransfer>
      <feGaussianBlur in="grain" stdDeviation="0.22" result="grainBlur" />

      <feFlood flood-color="#d8d8d8" result="base" />
      <feFlood flood-color="#8f8f8f" flood-opacity="0.82" result="veinCol" />
      <feComposite in="veinCol" in2="veinMask" operator="in" result="veins" />

      <feComposite in="base" in2="grainBlur" operator="arithmetic" k1="0" k2="1" k3="0.14" k4="-0.05" result="marble" />
      <feMerge>
        <feMergeNode in="marble" />
        <feMergeNode in="veins" />
      </feMerge>
    </filter>

    <filter id="stoneDarkTex" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
      <!-- Flowing light-gray swirls (match the scale of the light stone veins) -->
      <feTurbulence type="turbulence" baseFrequency="0.010 0.026" numOctaves="2" seed="23" result="warp" />
      <feTurbulence type="fractalNoise" baseFrequency="0.020 0.060" numOctaves="2" seed="29" result="swirlN" />
      <feDisplacementMap in="swirlN" in2="warp" scale="30" xChannelSelector="R" yChannelSelector="G" result="swirled" />
      <feColorMatrix in="swirled" type="saturate" values="0" result="swirledG" />
      <feGaussianBlur in="swirledG" stdDeviation="0.20" result="swirledB" />
      <feComponentTransfer in="swirledB" result="swirlMask">
        <!-- Strong, broad swirls (avoid fine noisy pepper) -->
        <feFuncR type="table" tableValues="0 0 0.10 0.62 1" />
        <feFuncG type="table" tableValues="0 0 0.10 0.62 1" />
        <feFuncB type="table" tableValues="0 0 0.10 0.62 1" />
      </feComponentTransfer>

      <!-- Very subtle grain only (keep it smooth) -->
      <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="1" seed="19" result="grainN" />
      <feColorMatrix in="grainN" type="saturate" values="0" result="grainG" />
      <feComponentTransfer in="grainG" result="grain">
        <feFuncR type="gamma" amplitude="1" exponent="1.6" offset="0" />
        <feFuncG type="gamma" amplitude="1" exponent="1.6" offset="0" />
        <feFuncB type="gamma" amplitude="1" exponent="1.6" offset="0" />
      </feComponentTransfer>

      <feFlood flood-color="#3f3f3f" result="base" />
      <feComposite in="base" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.14" k4="-0.04" result="granite" />

      <feFlood flood-color="#9a9a9a" flood-opacity="0.38" result="swirlCol" />
      <feComposite in="swirlCol" in2="swirlMask" operator="in" result="swirls" />

      <feMerge>
        <feMergeNode in="granite" />
        <feMergeNode in="swirls" />
      </feMerge>
    </filter>

  `;

  defs.appendChild(wrapper);
}

function ensureBurledWoodCheckerboardDefs(svgRoot: SVGSVGElement): void {
  const defs = ensureSvgDefs(svgRoot);
  if (defs.querySelector("#burledWoodCheckerboardDefs")) return;

  const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
  wrapper.setAttribute("id", "burledWoodCheckerboardDefs");

  // Strong, flowing burl figure (swirls/"eyes") rather than linear plank grain.
  // Use low-frequency turbulence + displacement, then exaggerate contrast and tint.
  wrapper.innerHTML = `
    <filter id="burledLightTex" x="-15%" y="-15%" width="130%" height="130%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">
      <feTurbulence type="turbulence" baseFrequency="0.006 0.020" numOctaves="2" seed="41" result="warp" />
      <feTurbulence type="turbulence" baseFrequency="0.012 0.040" numOctaves="2" seed="43" result="burl" />
      <feDisplacementMap in="burl" in2="warp" scale="56" xChannelSelector="R" yChannelSelector="G" result="swirled" />
      <feColorMatrix in="swirled" type="saturate" values="0" result="swirledG" />
      <feGaussianBlur in="swirledG" stdDeviation="0.12" result="swirledB" />
      <feComponentTransfer in="swirledB" result="figure">
        <feFuncR type="table" tableValues="0 0.08 0.30 0.78 1" />
        <feFuncG type="table" tableValues="0 0.08 0.30 0.78 1" />
        <feFuncB type="table" tableValues="0 0.08 0.30 0.78 1" />
      </feComponentTransfer>

      <feTurbulence type="fractalNoise" baseFrequency="0.28" numOctaves="1" seed="47" result="grainN" />
      <feColorMatrix in="grainN" type="saturate" values="0" result="grainG" />
      <feGaussianBlur in="grainG" stdDeviation="0.25" result="grain" />

      <feFlood flood-color="#d8bf95" result="base" />
      <feFlood flood-color="#8b4a22" flood-opacity="0.92" result="figCol" />
      <feComposite in="figCol" in2="figure" operator="in" result="figTint" />
      <feBlend in="base" in2="figTint" mode="multiply" result="wood" />
      <feComposite in="wood" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.10" k4="-0.03" result="wood2" />

      <feMerge>
        <feMergeNode in="wood2" />
      </feMerge>
    </filter>

    <filter id="burledDarkTex" x="-15%" y="-15%" width="130%" height="130%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">
      <feTurbulence type="turbulence" baseFrequency="0.006 0.018" numOctaves="2" seed="51" result="warp" />
      <feTurbulence type="turbulence" baseFrequency="0.012 0.036" numOctaves="2" seed="53" result="burl" />
      <feDisplacementMap in="burl" in2="warp" scale="58" xChannelSelector="R" yChannelSelector="G" result="swirled" />
      <feColorMatrix in="swirled" type="saturate" values="0" result="swirledG" />
      <feGaussianBlur in="swirledG" stdDeviation="0.12" result="swirledB" />
      <feComponentTransfer in="swirledB" result="figure">
        <feFuncR type="table" tableValues="0 0.10 0.34 0.80 1" />
        <feFuncG type="table" tableValues="0 0.10 0.34 0.80 1" />
        <feFuncB type="table" tableValues="0 0.10 0.34 0.80 1" />
      </feComponentTransfer>

      <feTurbulence type="fractalNoise" baseFrequency="0.24" numOctaves="1" seed="57" result="grainN" />
      <feColorMatrix in="grainN" type="saturate" values="0" result="grainG" />
      <feGaussianBlur in="grainG" stdDeviation="0.28" result="grain" />

      <feFlood flood-color="#8a5a32" result="base" />
      <feFlood flood-color="#2a140b" flood-opacity="0.88" result="figCol" />
      <feComposite in="figCol" in2="figure" operator="in" result="figTint" />
      <feBlend in="base" in2="figTint" mode="multiply" result="wood" />
      <feComposite in="wood" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.10" k4="-0.03" result="wood2" />

      <feMerge>
        <feMergeNode in="wood2" />
      </feMerge>
    </filter>
  `;

  defs.appendChild(wrapper);
}

function ensurePattern(
  svgRoot: SVGSVGElement,
  opts: { id: string; filterId: string; size: number; dx: number; dy: number; angleDeg?: number }
): void {
  const defs = ensureSvgDefs(svgRoot);
  if (defs.querySelector(`#${opts.id}`)) return;

  const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern") as SVGPatternElement;
  pattern.setAttribute("id", opts.id);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(opts.size));
  pattern.setAttribute("height", String(opts.size));
  pattern.setAttribute("x", String(-opts.dx));
  pattern.setAttribute("y", String(-opts.dy));
  if (opts.angleDeg && opts.angleDeg !== 0) {
    pattern.setAttribute("patternTransform", `rotate(${opts.angleDeg})`);
  }

  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect") as SVGRectElement;
  r.setAttribute("x", "0");
  r.setAttribute("y", "0");
  r.setAttribute("width", String(opts.size));
  r.setAttribute("height", String(opts.size));
  r.setAttribute("fill", "#ffffff");
  r.setAttribute("filter", `url(#${opts.filterId})`);
  pattern.appendChild(r);

  defs.appendChild(pattern);
}

function getCheckerboardThemeById(id: CheckerboardThemeId): CheckerboardThemeDef {
  return CHECKERBOARD_THEMES.find((t) => t.id === id) ?? CHECKERBOARD_THEMES[0];
}

function parseNum(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function deriveCheckerboardGrid(rects: readonly SVGRectElement[]): {
  startX: number;
  startY: number;
  stepX: number;
  stepY: number;
} | null {
  if (rects.length === 0) return null;

  const first = rects[0];
  const firstWidth = parseNum(first.getAttribute("data-checkerboard-orig-width") ?? first.getAttribute("width"));
  const firstHeight = parseNum(first.getAttribute("data-checkerboard-orig-height") ?? first.getAttribute("height"));
  if (firstWidth == null || firstHeight == null || firstWidth <= 0 || firstHeight <= 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  for (const rect of rects) {
    const x = parseNum(rect.getAttribute("data-checkerboard-orig-x") ?? rect.getAttribute("x"));
    const y = parseNum(rect.getAttribute("data-checkerboard-orig-y") ?? rect.getAttribute("y"));
    if (x != null) minX = Math.min(minX, x);
    if (y != null) minY = Math.min(minY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    startX: minX,
    startY: minY,
    stepX: firstWidth,
    stepY: firstHeight,
  };
}

/**
 * Apply a checkerboard theme to an SVG board with a `#squares` group of 8×8 <rect> tiles.
 * Safe no-op if the expected structure is missing.
 */
export function applyCheckerboardTheme(svgRoot: SVGSVGElement, themeId: CheckerboardThemeId): void {
  if (!svgRoot) return;

  // Remember current theme for resize observer.
  (svgRoot as any).__checkerboardThemeId = themeId;

  // If we previously rasterized the background, restore vector groups first.
  removeRasterizedBackground(svgRoot);

  const theme = getCheckerboardThemeById(themeId);

  // Optional: tint the background fill to match.
  const bgFill = svgRoot.querySelector("#bgFill") as SVGGElement | null;
  if (bgFill && theme.bg) {
    const bgRects = Array.from(bgFill.querySelectorAll("rect")) as SVGRectElement[];
    for (const rect of bgRects) {
      rect.setAttribute("fill", theme.bg);
      // Ensure board selector wins over theme CSS.
      rect.style.setProperty("fill", theme.bg, "important");
    }
  }

  const frame = svgRoot.querySelector("#frame") as SVGGElement | null;
  if (frame) {
    const frameRects = Array.from(frame.querySelectorAll("rect")) as SVGRectElement[];
    for (const rect of frameRects) {
      const stroke = theme.frameStroke ?? "#000";
      const strokeOpacity = theme.frameStrokeOpacity ?? "0.15";
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-opacity", strokeOpacity);
      rect.style.setProperty("stroke", stroke, "important");
      rect.style.setProperty("stroke-opacity", strokeOpacity, "important");
    }
  }

  const squares = svgRoot.querySelector("#squares") as SVGGElement | null;
  if (!squares) return;

  const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
  if (rects.length === 0) return;

  const grid = deriveCheckerboardGrid(rects);
  if (!grid) return;

  if (themeId === "stone") ensureStoneCheckerboardDefs(svgRoot);
  if (themeId === "burled") ensureBurledWoodCheckerboardDefs(svgRoot);

  const isIOS = (themeId === "stone" || themeId === "burled") && isLikelyIOSBrowser();

  // iOS WebKit is notorious for flaky rendering of SVG filters inside <pattern> fills.
  // Our most reliable option is an image-based pattern (generated via canvas) with no
  // SVG filters involved.
  const useIOSImagePatternFallback = isIOS;

  // Secondary iOS fallback: apply the filter directly to each tile (no pattern).
  // Keep this as a backup if the image fallback can't be generated.
  const useDirectFilterFallback = isIOS && !useIOSImagePatternFallback;

  if (useIOSImagePatternFallback) {
    const anyRoot = svgRoot as any;
    const cache: IosTextureCache = (anyRoot.__checkerboardIOSTextureCache ??= {});

    // IMPORTANT: cache is per-theme. On iOS, users can switch Stone <-> Burled;
    // we must ensure both sets of pattern IDs exist when needed.
    if (themeId === "stone") {
      const stone = (cache.stone ??= {
        light: genTextureDataUrl({ themeId: "stone", variant: "light", baseHex: theme.light, seed: 11011, size: 256 }),
        dark: genTextureDataUrl({ themeId: "stone", variant: "dark", baseHex: theme.dark, seed: 22023, size: 256 }),
      });
      ensureImagePattern(svgRoot, { id: "stoneIOSLightImg", dataUrl: stone.light.url, size: stone.light.size });
      ensureImagePattern(svgRoot, { id: "stoneIOSDarkImg", dataUrl: stone.dark.url, size: stone.dark.size });
    }

    if (themeId === "burled") {
      const burled = (cache.burled ??= {
        light: genTextureDataUrl({ themeId: "burled", variant: "light", baseHex: theme.light, seed: 33031, size: 256 }),
        dark: genTextureDataUrl({ themeId: "burled", variant: "dark", baseHex: theme.dark, seed: 44041, size: 256 }),
      });
      ensureImagePattern(svgRoot, { id: "burledIOSLightImg", dataUrl: burled.light.url, size: burled.light.size });
      ensureImagePattern(svgRoot, { id: "burledIOSDarkImg", dataUrl: burled.dark.url, size: burled.dark.size });
    }
  }

  for (const rect of rects) {
    const originalXAttr = rect.getAttribute("data-checkerboard-orig-x") ?? rect.getAttribute("x");
    const originalYAttr = rect.getAttribute("data-checkerboard-orig-y") ?? rect.getAttribute("y");
    const originalWidthAttr = rect.getAttribute("data-checkerboard-orig-width") ?? rect.getAttribute("width");
    const originalHeightAttr = rect.getAttribute("data-checkerboard-orig-height") ?? rect.getAttribute("height");

    if (!rect.hasAttribute("data-checkerboard-orig-x") && rect.hasAttribute("x")) {
      rect.setAttribute("data-checkerboard-orig-x", rect.getAttribute("x") ?? "");
    }
    if (!rect.hasAttribute("data-checkerboard-orig-y") && rect.hasAttribute("y")) {
      rect.setAttribute("data-checkerboard-orig-y", rect.getAttribute("y") ?? "");
    }
    if (!rect.hasAttribute("data-checkerboard-orig-width") && rect.hasAttribute("width")) {
      rect.setAttribute("data-checkerboard-orig-width", rect.getAttribute("width") ?? "");
    }
    if (!rect.hasAttribute("data-checkerboard-orig-height") && rect.hasAttribute("height")) {
      rect.setAttribute("data-checkerboard-orig-height", rect.getAttribute("height") ?? "");
    }

    const x = parseNum(originalXAttr);
    const y = parseNum(originalYAttr);
    const width = parseNum(originalWidthAttr);
    const height = parseNum(originalHeightAttr);
    if (x == null || y == null || width == null || height == null) continue;

    const col = Math.round((x - grid.startX) / grid.stepX);
    const row = Math.round((y - grid.startY) / grid.stepY);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

    const isLight = (row + col) % 2 === 0;
    if (themeId === "stone") {
      if (useIOSImagePatternFallback) {
        const pid = isLight ? "stoneIOSLightImg" : "stoneIOSDarkImg";
        const fill = `url(#${pid})`;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");
        try {
          rect.removeAttribute("filter");
          rect.style.removeProperty("filter");
        } catch {
          // ignore
        }
      } else if (useDirectFilterFallback) {
        const fill = isLight ? theme.light : theme.dark;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");

        const filter = `url(#${isLight ? "stoneLightTex" : "stoneDarkTex"})`;
        rect.setAttribute("filter", filter);
        rect.style.setProperty("filter", filter, "important");
      } else {
        // Use per-tile patterns for variation (best-looking path on most browsers).
        const size = 820;
        const dx = col * 137 + row * 29;
        const dy = row * 131 + col * 31;
        const pid = isLight ? `stoneLight_r${row}c${col}` : `stoneDark_r${row}c${col}`;
        ensurePattern(svgRoot, {
          id: pid,
          filterId: isLight ? "stoneLightTex" : "stoneDarkTex",
          size,
          dx,
          dy,
          angleDeg: ((row * 7 + col * 11) % 7 - 3) * 1.5,
        });
        const fill = `url(#${pid})`;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");
        try {
          rect.removeAttribute("filter");
          rect.style.removeProperty("filter");
        } catch {
          // ignore
        }
      }
    } else if (themeId === "burled") {
      if (useIOSImagePatternFallback) {
        const pid = isLight ? "burledIOSLightImg" : "burledIOSDarkImg";
        const fill = `url(#${pid})`;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");
        try {
          rect.removeAttribute("filter");
          rect.style.removeProperty("filter");
        } catch {
          // ignore
        }
      } else if (useDirectFilterFallback) {
        const fill = isLight ? theme.light : theme.dark;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");

        const filter = `url(#${isLight ? "burledLightTex" : "burledDarkTex"})`;
        rect.setAttribute("filter", filter);
        rect.style.setProperty("filter", filter, "important");
      } else {
        // Use per-tile patterns for variation (best-looking path on most browsers).
        const size = 900;
        const dx = col * 149 + row * 23;
        const dy = row * 157 + col * 19;
        const pid = isLight ? `burledLight_r${row}c${col}` : `burledDark_r${row}c${col}`;
        ensurePattern(svgRoot, {
          id: pid,
          filterId: isLight ? "burledLightTex" : "burledDarkTex",
          size,
          dx,
          dy,
          angleDeg: ((row * 5 + col * 13) % 9 - 4) * 2,
        });
        const fill = `url(#${pid})`;
        rect.setAttribute("fill", fill);
        rect.style.setProperty("fill", fill, "important");
        try {
          rect.removeAttribute("filter");
          rect.style.removeProperty("filter");
        } catch {
          // ignore
        }
      }
    } else {
      const fill = isLight ? theme.light : theme.dark;
      rect.setAttribute("fill", fill);
      rect.style.setProperty("fill", fill, "important");

      try {
        rect.removeAttribute("filter");
        rect.style.removeProperty("filter");
      } catch {
        // ignore
      }
    }

    const squareStroke = isLight ? (theme.lightSquareStroke ?? theme.squareStroke) : (theme.darkSquareStroke ?? theme.squareStroke);
    const strokeWidth = theme.squareStrokeWidth ? Number.parseFloat(theme.squareStrokeWidth) : null;
    const useInsetSquareBorder = themeId === "candy" && squareStroke && strokeWidth != null && Number.isFinite(strokeWidth) && strokeWidth > 0;

    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));

    if (useInsetSquareBorder) {
      const clipId = `checkerboardTileClip_r${row}c${col}`;
      ensureCheckerboardTileClip(svgRoot, clipId, x, y, width, height);
      rect.setAttribute("clip-path", `url(#${clipId})`);
      rect.style.setProperty("clip-path", `url(#${clipId})`, "important");
    } else {
      rect.removeAttribute("clip-path");
      rect.style.removeProperty("clip-path");
    }

    if (squareStroke) {
      rect.setAttribute("stroke", squareStroke);
      rect.style.setProperty("stroke", squareStroke, "important");
    } else {
      rect.removeAttribute("stroke");
      rect.style.removeProperty("stroke");
    }

    if (theme.squareStrokeOpacity) {
      rect.setAttribute("stroke-opacity", theme.squareStrokeOpacity);
      rect.style.setProperty("stroke-opacity", theme.squareStrokeOpacity, "important");
    } else {
      rect.removeAttribute("stroke-opacity");
      rect.style.removeProperty("stroke-opacity");
    }

    if (theme.squareStrokeWidth) {
      const appliedStrokeWidth = useInsetSquareBorder && strokeWidth != null ? String(strokeWidth * 2) : theme.squareStrokeWidth;
      rect.setAttribute("stroke-width", appliedStrokeWidth);
      rect.style.setProperty("stroke-width", appliedStrokeWidth, "important");
    } else {
      rect.removeAttribute("stroke-width");
      rect.style.removeProperty("stroke-width");
    }
  }

  // Patterned boards are expensive to repaint every animation frame. Rasterize the
  // static background once, then animate pieces on top of an <image>.
  if ((themeId === "stone" || themeId === "burled") && !isLikelyIOSBrowser()) {
    ensureRasterResizeObserver(svgRoot);
    const jobId = (((svgRoot as any).__checkerboardRasterJobId as number | undefined) ?? 0) + 1;
    (svgRoot as any).__checkerboardRasterJobId = jobId;

    void (async () => {
      const raster = await rasterizeBoardBackgroundOnce(svgRoot);
      if (!raster) return;
      if ((svgRoot as any).__checkerboardRasterJobId !== jobId) {
        // Outdated job.
        try {
          URL.revokeObjectURL(raster.url);
        } catch {
          // ignore
        }
        return;
      }

      const layer = ensureRasterLayer(svgRoot);
      // Replace any prior image.
      while (layer.firstChild) layer.removeChild(layer.firstChild);

      const vb = getSquaresViewBox(svgRoot);
      const img = document.createElementNS(SVG_NS, "image") as SVGImageElement;

      const hideIfCurrent = () => {
        // Only hide if this raster job is still current.
        if ((svgRoot as any).__checkerboardRasterJobId !== jobId) return;
        if (!img.isConnected) return;
        hideVectorSquaresForRaster(svgRoot);
      };

      // Prefer hiding after the SVG <image> load event.
      try {
        img.addEventListener("load", hideIfCurrent, { once: true } as any);
        img.addEventListener("error", () => {
          // Keep vector squares visible on failure.
        }, { once: true } as any);
      } catch {
        // ignore
      }

      img.setAttribute("x", String(vb.x));
      img.setAttribute("y", String(vb.y));
      img.setAttribute("width", String(vb.w));
      img.setAttribute("height", String(vb.h));
      img.setAttribute("preserveAspectRatio", "none");
      img.setAttribute("href", raster.url);
      img.setAttributeNS(XLINK_NS, "xlink:href", raster.url);
      img.setAttribute("data-raster-url", raster.url);
      layer.appendChild(img);

      // Some mobile browsers can delay SVG <image> rendering; as a backup, also
      // preload+decode the blob URL before hiding vector squares.
      const decoded = await waitForImageUrlDecode(raster.url, 2000);
      if (decoded) hideIfCurrent();
    })();
  }
}
