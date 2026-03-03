export type CheckerboardThemeId = "classic" | "green" | "blue" | "stone" | "burled" | "checkers";

export type CheckerboardThemeDef = {
  id: CheckerboardThemeId;
  label: string;
  light: string;
  dark: string;
  bg?: string;
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
  },
] as const;

export function normalizeCheckerboardThemeId(raw: string | null | undefined): CheckerboardThemeId {
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

    // iPadOS often reports as "MacIntel" but has touch points.
    const isIOSUA = /iPad|iPhone|iPod/i.test(ua);
    const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;
    return isIOSUA || isIPadOS;
  } catch {
    return false;
  }
}

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

  // Insert as early as possible inside the view group so it stays behind
  // nodes/pieces/overlays.
  try {
    const bgFill = svgRoot.querySelector("#bgFill");
    if (bgFill && bgFill.parentNode) {
      bgFill.parentNode.insertBefore(g, bgFill);
    } else {
      view.insertBefore(g, view.firstChild);
    }
  } catch {
    view.appendChild(g);
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
  for (const id of ["bgFill", "squares", "frame"]) {
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

async function rasterizeBoardBackgroundOnce(svgRoot: SVGSVGElement): Promise<{ url: string; w: number; h: number } | null> {
  if (typeof document === "undefined") return null;

  const vb = parseViewBox(svgRoot);

  // Determine raster target size based on the on-screen size.
  let targetW = Math.max(1, Math.round(vb.w));
  let targetH = Math.max(1, Math.round(vb.h));
  try {
    const rect = svgRoot.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    if (rect.width > 10 && rect.height > 10) {
      targetW = Math.max(1, Math.round(rect.width * dpr));
      targetH = Math.max(1, Math.round(rect.height * dpr));
    }
  } catch {
    // ignore; fall back to viewBox size
  }

  // Build a minimal SVG that contains only the background layers and defs.
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

  for (const id of ["bgFill", "squares", "frame"]) {
    const g = svgRoot.querySelector(`#${id}`) as SVGGElement | null;
    if (!g) continue;
    const clone = g.cloneNode(true) as SVGGElement;
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

  const squares = svgRoot.querySelector("#squares") as SVGGElement | null;
  if (!squares) return;

  const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
  if (rects.length === 0) return;

  // Boards in this repo use x/y starting at 100 with 100px tiles (viewBox 0..1000).
  const start = 100;
  const step = 100;

  if (themeId === "stone") ensureStoneCheckerboardDefs(svgRoot);
  if (themeId === "burled") ensureBurledWoodCheckerboardDefs(svgRoot);

  // iOS Safari is known to have incomplete SVG support for filters inside <pattern>
  // fills (often rendering them as solid white/blank). For iOS, fall back to applying
  // the filter directly to each tile (no pattern), which tends to be more reliable.
  const useDirectFilterFallback = (themeId === "stone" || themeId === "burled") && isLikelyIOSBrowser();

  for (const rect of rects) {
    const x = parseNum(rect.getAttribute("x"));
    const y = parseNum(rect.getAttribute("y"));
    if (x == null || y == null) continue;

    const col = Math.round((x - start) / step);
    const row = Math.round((y - start) / step);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

    const isLight = (row + col) % 2 === 0;
    if (themeId === "stone") {
      if (useDirectFilterFallback) {
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
      if (useDirectFilterFallback) {
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

      const vb = parseViewBox(svgRoot);
      const img = document.createElementNS(SVG_NS, "image") as SVGImageElement;
      img.setAttribute("x", String(vb.x));
      img.setAttribute("y", String(vb.y));
      img.setAttribute("width", String(vb.w));
      img.setAttribute("height", String(vb.h));
      img.setAttribute("preserveAspectRatio", "none");
      img.setAttribute("href", raster.url);
      img.setAttributeNS(XLINK_NS, "xlink:href", raster.url);
      img.setAttribute("data-raster-url", raster.url);
      layer.appendChild(img);

      // Hide vector background layers to avoid triggering expensive repaints.
      for (const id of ["bgFill", "squares", "frame"]) {
        const g = svgRoot.querySelector(`#${id}`) as SVGGElement | null;
        if (!g) continue;
        try {
          (g as any).dataset.rasterHidden = "1";
          g.style.display = "none";
        } catch {
          // ignore
        }
      }
    })();
  }
}
