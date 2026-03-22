const STONE_THEME_ID = "stone";
const SEMIPRECIOUS_THEME_ID = "semiprecious";

function cssEscapeForQuery(value: string): string {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  if (typeof esc === "function") return esc(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

const SVG_NS = "http://www.w3.org/2000/svg";

type Rgb = { r: number; g: number; b: number };

type GemStyle =
  | "cloudy" // quartz, carnelian, coral
  | "banded" // agate, sardonyx, malachite
  | "veined" // howlite
  | "oceanic" // larimar, amazonite
  | "zoned" // fluorite, jasper
  | "sparkly" // goldstone, lapis (pyrite flecks)
  | "iridescent"; // opal/moonstone adularescence

type GemDef = {
  id: string;
  label: string;
  style: GemStyle;
  base: string; // hex
  secondary?: string; // hex
  tertiary?: string; // hex
  accent?: string; // hex
};

// 12 light + 12 dark stones.
// Source: "Semi-precious Stones for Lasca, Dama, and Damasca" PDF, plus user-added light stones.
const SEMIPRECIOUS_LIGHT: readonly GemDef[] = [
  {
    id: "thulite",
    label: "Thulite",
    style: "cloudy",
    base: "#d97a8a",
    secondary: "#f2b3bf",
  },
  {
    id: "larimar",
    label: "Larimar",
    style: "oceanic",
    base: "#78cfe0",
    secondary: "#f7fbff",
    tertiary: "#2aa5b7",
  },
  {
    id: "blue_moonstone",
    label: "Blue Moonstone",
    style: "iridescent",
    base: "#b7c5d7",
    secondary: "#f4f6ff",
    accent: "#6aa7ff",
  },
  {
    id: "blue_lace_agate",
    label: "Blue Lace Agate",
    style: "banded",
    base: "#a8d3f0",
    secondary: "#f7fcff",
    tertiary: "#6aa7d6",
  },
  {
    id: "variscite",
    label: "Variscite",
    style: "cloudy",
    base: "#b1d6b7",
    secondary: "#6aa179",
  },
  {
    id: "fire_opal",
    label: "Fire Opal",
    style: "iridescent",
    base: "#f2b24b",
    secondary: "#f6d58a",
    accent: "#ff6a3d",
  },
  {
    id: "moonstone",
    label: "Moonstone",
    style: "iridescent",
    base: "#e6e2d6",
    secondary: "#ffffff",
    accent: "#c9d9ff",
  },
  {
    id: "opal",
    label: "Opal",
    style: "iridescent",
    base: "#f1f5f4",
    secondary: "#ffffff",
    accent: "#ffb6e1",
  },
  {
    id: "howlite",
    label: "Howlite",
    style: "veined",
    base: "#f6f6f6",
    secondary: "#8b8b8b",
  },
  {
    id: "blue_mist_chalcedony",
    label: "Blue Mist Chalcedony",
    style: "cloudy",
    base: "#8aa8d8",
    secondary: "#dfe9ff",
  },
  {
    id: "rose_quartz",
    label: "Rose Quartz",
    style: "cloudy",
    base: "#f3b6c8",
    secondary: "#ffdbe6",
  },
  {
    id: "natural_mint_green_jadeite",
    label: "Natural Mint Green Jadeite",
    style: "oceanic",
    base: "#b9e1c4",
    secondary: "#f6fff8",
    tertiary: "#2ea86a",
  },
];

const SEMIPRECIOUS_DARK: readonly GemDef[] = [
  {
    id: "sardonyx",
    label: "Sardonyx",
    style: "banded",
    base: "#2b1a1a",
    secondary: "#f4e8de",
    tertiary: "#8c2f2f",
  },
  {
    id: "carnelian",
    label: "Carnelian",
    style: "cloudy",
    base: "#c44b2b",
    secondary: "#ff9b62",
  },
  {
    id: "goldstone",
    label: "Goldstone",
    style: "sparkly",
    base: "#8a3d2e",
    secondary: "#3b1410",
    accent: "#d4af37",
  },
  {
    id: "coral",
    label: "Coral",
    style: "cloudy",
    base: "#d45b5b",
    secondary: "#f5a1a1",
  },
  {
    id: "jasper",
    label: "Jasper",
    style: "zoned",
    base: "#7b4a2b",
    secondary: "#b87c4d",
    tertiary: "#2d2018",
  },
  {
    id: "hemimorphite",
    label: "Hemimorphite",
    style: "oceanic",
    base: "#2d6e74",
    secondary: "#8fd3d5",
  },
  {
    id: "lapis_lazuli",
    label: "Lapis Lazuli",
    style: "sparkly",
    base: "#123a8b",
    secondary: "#1d5ad1",
    accent: "#d4af37",
  },
  {
    id: "fluorite",
    label: "Fluorite",
    style: "zoned",
    base: "#4a3a7a",
    secondary: "#22a675",
    tertiary: "#a0f1ff",
  },
  {
    id: "amazonite",
    label: "Amazonite",
    style: "oceanic",
    base: "#1f7f7a",
    secondary: "#6bd0c9",
    tertiary: "#e0f5f3",
  },
  {
    id: "malachite",
    label: "Malachite",
    style: "banded",
    base: "#0f6b3a",
    secondary: "#1fd46b",
    tertiary: "#07331b",
  },
  {
    id: "hydrogrossular",
    label: "Hydrogrossular",
    style: "cloudy",
    base: "#2f5b3f",
    secondary: "#7da57e",
  },
  {
    id: "black_opal",
    label: "Black Opal",
    style: "iridescent",
    base: "#090b10",
    secondary: "#1a2233",
    accent: "#00d6ff",
  },
];

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace(/^#/, "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length >= 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 128, g: 128, b: 128 };
}

function rgbToHex(c: Rgb): string {
  const r = clamp255(c.r).toString(16).padStart(2, "0");
  const g = clamp255(c.g).toString(16).padStart(2, "0");
  const b = clamp255(c.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function mix(a: string, b: string, t: number): string {
  const aa = hexToRgb(a);
  const bb = hexToRgb(b);
  const tt = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: aa.r + (bb.r - aa.r) * tt,
    g: aa.g + (bb.g - aa.g) * tt,
    b: aa.b + (bb.b - aa.b) * tt,
  });
}

function lighten(hex: string, t: number): string {
  return mix(hex, "#ffffff", t);
}

function darken(hex: string, t: number): string {
  return mix(hex, "#000000", t);
}

function createRadialGradient(
  defs: SVGDefsElement,
  id: string,
  stops: readonly { offset: string; color: string; opacity?: number }[],
  cx: string,
  cy: string,
  r: string
): void {
  if (defs.querySelector(`#${cssEscapeForQuery(id)}`)) return;
  const grad = document.createElementNS(SVG_NS, "radialGradient");
  grad.setAttribute("id", id);
  grad.setAttribute("cx", cx);
  grad.setAttribute("cy", cy);
  grad.setAttribute("r", r);
  for (const s of stops) {
    const stop = document.createElementNS(SVG_NS, "stop");
    stop.setAttribute("offset", s.offset);
    stop.setAttribute("stop-color", s.color);
    if (typeof s.opacity === "number") stop.setAttribute("stop-opacity", String(s.opacity));
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
}

function hashString(s: string): number {
  // djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureDefs(svgRoot: SVGSVGElement): SVGDefsElement {
  const defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (defs) return defs;
  const created = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
  svgRoot.insertBefore(created, svgRoot.firstChild);
  return created;
}

function setFillUrl(el: Element, patternId: string): void {
  el.setAttribute("fill", `url(#${patternId})`);
}

function ensureMarblePattern(defs: SVGDefsElement, id: string, seed: number): void {
  if (defs.querySelector(`#${cssEscapeForQuery(id)}`)) return;

  const rand = mulberry32(seed);

  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", id);
  pattern.setAttribute("x", "0");
  pattern.setAttribute("y", "0");
  pattern.setAttribute("width", "220");
  pattern.setAttribute("height", "220");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");

  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("width", "220");
  base.setAttribute("height", "220");
  base.setAttribute("fill", "url(#gradMarble)");
  pattern.appendChild(base);

  // Cloudy mottling so it reads as marble even when small.
  for (let i = 0; i < 26; i++) {
    const e = document.createElementNS(SVG_NS, "ellipse");
    const cx = 20 + rand() * 180;
    const cy = 20 + rand() * 180;
    const rx = 16 + rand() * 46;
    const ry = 14 + rand() * 40;
    e.setAttribute("cx", cx.toFixed(2));
    e.setAttribute("cy", cy.toFixed(2));
    e.setAttribute("rx", rx.toFixed(2));
    e.setAttribute("ry", ry.toFixed(2));
    e.setAttribute("fill", rand() < 0.6 ? "#f0f0f0" : "#d7d7d7");
    e.setAttribute("opacity", (0.06 + rand() * 0.13).toFixed(3));
    pattern.appendChild(e);
  }

  // Veins: wider + softer (less "ink line"), with a faint under-stroke.
  for (let i = 0; i < 16; i++) {
    const x0 = -20 + rand() * 260;
    const y0 = -20 + rand() * 260;
    const x1 = -20 + rand() * 260;
    const y1 = -20 + rand() * 260;
    const x2 = -20 + rand() * 260;
    const y2 = -20 + rand() * 260;
    const x3 = -20 + rand() * 260;
    const y3 = -20 + rand() * 260;

    const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} C ${x1.toFixed(2)} ${y1.toFixed(
      2
    )}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${x3.toFixed(2)} ${y3.toFixed(2)}`;
    const width = 1.4 + rand() * 3.4;
    const baseOpacity = 0.10 + rand() * 0.16;

    // Under-stroke (acts like blur/soft edge without relying on SVG filters).
    const under = document.createElementNS(SVG_NS, "path");
    under.setAttribute("d", d);
    under.setAttribute("fill", "none");
    under.setAttribute("stroke", rand() < 0.5 ? "#d6d6d6" : "#9c9c9c");
    under.setAttribute("stroke-width", (width * (1.9 + rand() * 0.6)).toFixed(2));
    under.setAttribute("stroke-linecap", "round");
    under.setAttribute("stroke-linejoin", "round");
    under.setAttribute("opacity", (baseOpacity * 0.35).toFixed(3));
    pattern.appendChild(under);

    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", rand() < 0.55 ? "#c9c9c9" : "#8d8d8d");
    p.setAttribute("stroke-width", width.toFixed(2));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("opacity", baseOpacity.toFixed(3));
    pattern.appendChild(p);

    // Add a faint highlight stroke on some veins.
    if (rand() < 0.55) {
      const h = document.createElementNS(SVG_NS, "path");
      h.setAttribute("d", d);
      h.setAttribute("fill", "none");
      h.setAttribute("stroke", "#ffffff");
      h.setAttribute("stroke-width", (0.6 + rand() * 1.6).toFixed(2));
      h.setAttribute("stroke-linecap", "round");
      h.setAttribute("stroke-linejoin", "round");
      h.setAttribute("opacity", (0.04 + rand() * 0.09).toFixed(3));
      pattern.appendChild(h);
    }
  }

  defs.appendChild(pattern);
}

function ensureGranitePattern(defs: SVGDefsElement, id: string, seed: number): void {
  if (defs.querySelector(`#${cssEscapeForQuery(id)}`)) return;

  const rand = mulberry32(seed);

  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", id);
  pattern.setAttribute("x", "0");
  pattern.setAttribute("y", "0");

  // Use a tile roughly the same scale as the piece (viewBox 0..100)
  // so speck density reads correctly and doesn't look sparse.
  const tile = 100;
  pattern.setAttribute("width", String(tile));
  pattern.setAttribute("height", String(tile));
  pattern.setAttribute("patternUnits", "userSpaceOnUse");

  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("width", String(tile));
  base.setAttribute("height", String(tile));
  base.setAttribute("fill", "url(#gradGranite)");
  pattern.appendChild(base);

  // Guarantee a few clearly-gold flecks per piece.
  // Tuned to reduce gold by ~1/3 while keeping it noticeable.
  const goldCount = 3;
  for (let i = 0; i < goldCount; i++) {
    const cx = 8 + rand() * (tile - 16);
    const cy = 8 + rand() * (tile - 16);
    const r = 1.25 + rand() * 1.05;

    const gold = document.createElementNS(SVG_NS, "circle");
    gold.setAttribute("cx", cx.toFixed(2));
    gold.setAttribute("cy", cy.toFixed(2));
    gold.setAttribute("r", r.toFixed(2));
    gold.setAttribute("fill", "url(#goldFleck)");
    gold.setAttribute("opacity", (0.96 + rand() * 0.04).toFixed(3));
    gold.setAttribute("stroke", "#5a3f00");
    gold.setAttribute("stroke-width", Math.max(0.18, r * 0.12).toFixed(2));
    pattern.appendChild(gold);

    const glint = document.createElementNS(SVG_NS, "circle");
    glint.setAttribute("cx", (cx + 0.25 + rand() * 0.35).toFixed(2));
    glint.setAttribute("cy", (cy - 0.25 + rand() * 0.35).toFixed(2));
    glint.setAttribute("r", Math.max(0.35, r * 0.28).toFixed(2));
    glint.setAttribute("fill", "#ffe28a");
    glint.setAttribute("opacity", (0.45 + rand() * 0.25).toFixed(3));
    pattern.appendChild(glint);
  }

  // Speckles: many small dots, occasional medium flecks, rare gold.
  const speckCount = 520;
  for (let i = 0; i < speckCount; i++) {
    const c = document.createElementNS(SVG_NS, "circle");
    const cx = rand() * tile;
    const cy = rand() * tile;

    const sizeRoll = rand();
    // Keep specks small at piece scale; avoid oversized dots.
    const r = sizeRoll < 0.96 ? 0.22 + rand() * 0.62 : 0.85 + rand() * 0.55;
    c.setAttribute("cx", cx.toFixed(2));
    c.setAttribute("cy", cy.toFixed(2));
    c.setAttribute("r", r.toFixed(2));

    const kind = rand();
    if (kind < 0.52) {
      c.setAttribute("fill", "#0a0a0a");
      c.setAttribute("opacity", (0.34 + rand() * 0.36).toFixed(3));
    } else if (kind < 0.88) {
      c.setAttribute("fill", "#4f4f4f");
      c.setAttribute("opacity", (0.24 + rand() * 0.30).toFixed(3));
    } else if (kind < 0.99) {
      // Keep highlights a bit gray so gold reads as gold.
      c.setAttribute("fill", "#cfcfcf");
      c.setAttribute("opacity", (0.22 + rand() * 0.40).toFixed(3));
    } else {
      // Extra gold flecks beyond the guaranteed ones.
      c.setAttribute("fill", "url(#goldFleck)");
      c.setAttribute("opacity", (0.92 + rand() * 0.08).toFixed(3));
      c.setAttribute("stroke", "#5a3f00");
      c.setAttribute("stroke-width", Math.max(0.16, r * 0.10).toFixed(2));
      pattern.appendChild(c);

      const glint = document.createElementNS(SVG_NS, "circle");
      glint.setAttribute("cx", (cx + 0.20 + rand() * 0.25).toFixed(2));
      glint.setAttribute("cy", (cy - 0.20 + rand() * 0.25).toFixed(2));
      glint.setAttribute("r", Math.max(0.25, r * 0.25).toFixed(2));
      glint.setAttribute("fill", "#ffe28a");
      glint.setAttribute("opacity", (0.35 + rand() * 0.20).toFixed(3));
      pattern.appendChild(glint);
      continue;
    }

    pattern.appendChild(c);
  }

  defs.appendChild(pattern);
}

function ensureUniqueStoneSymbol(svgRoot: SVGSVGElement, baseHref: string, seedKey: string): string {
  const defs = ensureDefs(svgRoot);
  const baseId = baseHref.startsWith("#") ? baseHref.slice(1) : baseHref;
  const h = hashString(`${seedKey}|${baseHref}`);
  const suffix = `u${h.toString(16)}`;
  const uniqueId = `${baseId}__${suffix}`;

  if (defs.querySelector(`#${cssEscapeForQuery(uniqueId)}`)) return `#${uniqueId}`;

  const baseSymbol = svgRoot.querySelector(baseHref) as SVGSymbolElement | null;
  if (!baseSymbol) return baseHref;

  const cloned = baseSymbol.cloneNode(true) as SVGSymbolElement;
  cloned.setAttribute("id", uniqueId);

  const marblePatternId = `marble_${suffix}`;
  const granitePatternId = `granite_${suffix}`;

  if (baseId.startsWith("W_")) {
    ensureMarblePattern(defs, marblePatternId, h ^ 0xa5a5a5a5);
  } else if (baseId.startsWith("B_")) {
    ensureGranitePattern(defs, granitePatternId, h ^ 0x5a5a5a5a);
  }

  const elements = Array.from(cloned.querySelectorAll("circle, path, rect, ellipse"));
  for (const el of elements) {
    const fill = el.getAttribute("fill") || "";
    if (fill.includes("url(#marbleVeins")) {
      setFillUrl(el, marblePatternId);
    }
    if (fill.includes("url(#graniteSpeckles")) {
      setFillUrl(el, granitePatternId);
    }
  }

  defs.appendChild(cloned);
  return `#${uniqueId}`;
}

function pickVariantIndex(seedKey: string, href: string, variantCount: number): number {
  const h = hashString(`${seedKey}|${href}`);
  return h % Math.max(1, variantCount);
}

function maybeVariantStoneSvgSymbolHref(svgRoot: SVGSVGElement, baseHref: string, seedKey: string): string {
  // The Granite & Marble theme already ships 6 baked-in variants per piece.
  // Returning a different symbol ID keeps the theme truly "unchanged" (no recoloring).
  const baseId = baseHref.startsWith("#") ? baseHref.slice(1) : baseHref;
  const idx = pickVariantIndex(seedKey, baseHref, 6);
  const candidate = `#${baseId}_v${idx}`;
  return svgRoot.querySelector(candidate) ? candidate : baseHref;
}

function ensureSemiPreciousPattern(
  defs: SVGDefsElement,
  id: string,
  seed: number,
  gem: GemDef,
  isLight: boolean
): void {
  if (defs.querySelector(`#${cssEscapeForQuery(id)}`)) return;

  const rand = mulberry32(seed);
  const tile = 100;

  const secondary = gem.secondary ?? lighten(gem.base, 0.35);
  const tertiary = gem.tertiary ?? lighten(gem.base, 0.55);
  const accent = gem.accent ?? (isLight ? darken(gem.base, 0.45) : lighten(gem.base, 0.65));

  const gradId = `${id}__grad`;
  createRadialGradient(
    defs,
    gradId,
    [
      { offset: "0%", color: lighten(gem.base, isLight ? 0.75 : 0.22) },
      { offset: "45%", color: gem.base },
      { offset: "75%", color: darken(gem.base, isLight ? 0.12 : 0.42) },
      { offset: "100%", color: darken(gem.base, isLight ? 0.22 : 0.62) },
    ],
    "38%",
    "34%",
    "64%"
  );

  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", id);
  pattern.setAttribute("x", "0");
  pattern.setAttribute("y", "0");
  pattern.setAttribute("width", String(tile));
  pattern.setAttribute("height", String(tile));
  pattern.setAttribute("patternUnits", "userSpaceOnUse");

  const baseRect = document.createElementNS(SVG_NS, "rect");
  baseRect.setAttribute("width", String(tile));
  baseRect.setAttribute("height", String(tile));
  baseRect.setAttribute("fill", `url(#${gradId})`);
  pattern.appendChild(baseRect);

  // Cloudy translucency / "internal" depth (common to most stones).
  const mottleCount = gem.style === "cloudy" ? 34 : 22;
  for (let i = 0; i < mottleCount; i++) {
    const e = document.createElementNS(SVG_NS, "ellipse");
    const cx = 6 + rand() * (tile - 12);
    const cy = 6 + rand() * (tile - 12);
    const rx = 6 + rand() * 22;
    const ry = 5 + rand() * 18;
    e.setAttribute("cx", cx.toFixed(2));
    e.setAttribute("cy", cy.toFixed(2));
    e.setAttribute("rx", rx.toFixed(2));
    e.setAttribute("ry", ry.toFixed(2));
    const c = rand() < 0.52 ? lighten(secondary, 0.18) : tertiary;
    e.setAttribute("fill", c);
    e.setAttribute("opacity", (0.05 + rand() * 0.14).toFixed(3));
    pattern.appendChild(e);
  }

  // Style-specific identifiers.
  if (gem.style === "banded") {
    const bandCount = 7 + Math.floor(rand() * 5);
    for (let i = 0; i < bandCount; i++) {
      const y = -25 + (i / (bandCount - 1)) * 150 + (rand() - 0.5) * 10;
      const x0 = -30;
      const x3 = 130;
      const x1 = 25 + rand() * 40;
      const x2 = 55 + rand() * 40;
      const y0 = y;
      const y3 = y + (rand() - 0.5) * 18;
      const y1 = y + (rand() - 0.5) * 34;
      const y2 = y + (rand() - 0.5) * 34;

      const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} C ${x1.toFixed(2)} ${y1.toFixed(
        2
      )}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${x3.toFixed(2)} ${y3.toFixed(2)}`;
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");

      const width = 6 + rand() * 14;
      p.setAttribute("stroke-width", width.toFixed(2));
      const c = i % 2 === 0 ? secondary : gem.base;
      p.setAttribute("stroke", c);
      p.setAttribute("opacity", (0.08 + rand() * 0.18).toFixed(3));
      pattern.appendChild(p);

      if (rand() < 0.55) {
        const edge = document.createElementNS(SVG_NS, "path");
        edge.setAttribute("d", d);
        edge.setAttribute("fill", "none");
        edge.setAttribute("stroke-linecap", "round");
        edge.setAttribute("stroke-linejoin", "round");
        edge.setAttribute("stroke-width", (1.2 + rand() * 2.8).toFixed(2));
        edge.setAttribute("stroke", darken(c, 0.35));
        edge.setAttribute("opacity", (0.06 + rand() * 0.10).toFixed(3));
        pattern.appendChild(edge);
      }
    }
  }

  if (gem.style === "veined") {
    const veinColor = darken(secondary, 0.35);
    const veinCount = 16;
    for (let i = 0; i < veinCount; i++) {
      const x0 = -10 + rand() * 120;
      const y0 = -10 + rand() * 120;
      const x1 = -10 + rand() * 120;
      const y1 = -10 + rand() * 120;
      const x2 = -10 + rand() * 120;
      const y2 = -10 + rand() * 120;
      const x3 = -10 + rand() * 120;
      const y3 = -10 + rand() * 120;

      const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} C ${x1.toFixed(2)} ${y1.toFixed(
        2
      )}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${x3.toFixed(2)} ${y3.toFixed(2)}`;

      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", veinColor);
      p.setAttribute("stroke-width", (0.55 + rand() * 1.25).toFixed(2));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("opacity", (0.18 + rand() * 0.30).toFixed(3));
      pattern.appendChild(p);
    }
  }

  if (gem.style === "oceanic") {
    const swirlCount = 10;
    for (let i = 0; i < swirlCount; i++) {
      const x0 = -25;
      const x3 = 125;
      const y0 = -10 + rand() * 120;
      const y3 = y0 + (rand() - 0.5) * 28;
      const x1 = 10 + rand() * 40;
      const x2 = 60 + rand() * 40;
      const y1 = y0 + (rand() - 0.5) * 40;
      const y2 = y0 + (rand() - 0.5) * 40;

      const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} C ${x1.toFixed(2)} ${y1.toFixed(
        2
      )}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${x3.toFixed(2)} ${y3.toFixed(2)}`;

      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("stroke-width", (3.5 + rand() * 7.5).toFixed(2));
      p.setAttribute("stroke", lighten(secondary, 0.30));
      p.setAttribute("opacity", (0.05 + rand() * 0.12).toFixed(3));
      pattern.appendChild(p);

      if (rand() < 0.65) {
        const p2 = document.createElementNS(SVG_NS, "path");
        p2.setAttribute("d", d);
        p2.setAttribute("fill", "none");
        p2.setAttribute("stroke-linecap", "round");
        p2.setAttribute("stroke-linejoin", "round");
        p2.setAttribute("stroke-width", (0.7 + rand() * 1.8).toFixed(2));
        p2.setAttribute("stroke", lighten(tertiary, 0.35));
        p2.setAttribute("opacity", (0.11 + rand() * 0.16).toFixed(3));
        pattern.appendChild(p2);
      }
    }
  }

  if (gem.style === "zoned") {
    const zoneCount = 16;
    for (let i = 0; i < zoneCount; i++) {
      const e = document.createElementNS(SVG_NS, "ellipse");
      e.setAttribute("cx", (rand() * tile).toFixed(2));
      e.setAttribute("cy", (rand() * tile).toFixed(2));
      e.setAttribute("rx", (10 + rand() * 28).toFixed(2));
      e.setAttribute("ry", (8 + rand() * 26).toFixed(2));
      const roll = rand();
      const c = roll < 0.45 ? secondary : roll < 0.85 ? tertiary : darken(gem.base, 0.35);
      e.setAttribute("fill", c);
      e.setAttribute("opacity", (0.05 + rand() * 0.18).toFixed(3));
      pattern.appendChild(e);
    }
  }

  if (gem.style === "sparkly") {
    // Goldstone reads by its glitter; lapis reads by pyrite flecks.
    const sparkleCount = gem.id === "goldstone" ? 240 : 160;
    const sparkleBase = gem.id === "goldstone" ? accent : accent;
    const sparkleDark = darken(sparkleBase, 0.35);
    for (let i = 0; i < sparkleCount; i++) {
      const cx = rand() * tile;
      const cy = rand() * tile;
      const r = 0.18 + rand() * 0.85;

      const s = document.createElementNS(SVG_NS, "circle");
      s.setAttribute("cx", cx.toFixed(2));
      s.setAttribute("cy", cy.toFixed(2));
      s.setAttribute("r", r.toFixed(2));
      s.setAttribute("fill", sparkleBase);
      s.setAttribute("opacity", (0.28 + rand() * 0.60).toFixed(3));
      if (r > 0.7 && rand() < 0.55) {
        s.setAttribute("stroke", sparkleDark);
        s.setAttribute("stroke-width", Math.max(0.12, r * 0.14).toFixed(2));
      }
      pattern.appendChild(s);

      if (r > 0.55 && rand() < 0.25) {
        const g = document.createElementNS(SVG_NS, "circle");
        g.setAttribute("cx", (cx + 0.18 + rand() * 0.18).toFixed(2));
        g.setAttribute("cy", (cy - 0.18 + rand() * 0.18).toFixed(2));
        g.setAttribute("r", Math.max(0.18, r * 0.28).toFixed(2));
        g.setAttribute("fill", lighten(sparkleBase, 0.55));
        g.setAttribute("opacity", (0.30 + rand() * 0.35).toFixed(3));
        pattern.appendChild(g);
      }
    }

    // Deep blue lapis base needs faint lighter "river" areas.
    if (gem.id === "lapis_lazuli") {
      for (let i = 0; i < 10; i++) {
        const e = document.createElementNS(SVG_NS, "ellipse");
        e.setAttribute("cx", (rand() * tile).toFixed(2));
        e.setAttribute("cy", (rand() * tile).toFixed(2));
        e.setAttribute("rx", (10 + rand() * 24).toFixed(2));
        e.setAttribute("ry", (8 + rand() * 22).toFixed(2));
        e.setAttribute("fill", lighten(secondary, 0.18));
        e.setAttribute("opacity", (0.05 + rand() * 0.10).toFixed(3));
        pattern.appendChild(e);
      }
    }
  }

  if (gem.style === "iridescent") {
    const colors =
      gem.id === "black_opal"
        ? ["#00e6ff", "#ff3da6", "#7cff00", "#6a5cff", "#ffd100", "#ff6a00"]
        : [
            lighten(gem.base, 0.45),
            lighten(secondary, 0.35),
            mix(accent, "#bfe2ff", 0.55),
            mix(accent, "#ffb3d9", 0.55),
            mix(accent, "#b4ffea", 0.55),
          ];
    const flakeCount = gem.id === "opal" ? 26 : gem.id === "black_opal" ? 24 : 18;
    for (let i = 0; i < flakeCount; i++) {
      const e = document.createElementNS(SVG_NS, "ellipse");
      e.setAttribute("cx", (rand() * tile).toFixed(2));
      e.setAttribute("cy", (rand() * tile).toFixed(2));
      const isBlackOpal = gem.id === "black_opal";
      e.setAttribute("rx", (isBlackOpal ? 4 + rand() * 14 : 6 + rand() * 18).toFixed(2));
      e.setAttribute("ry", (isBlackOpal ? 3 + rand() * 10 : 4 + rand() * 14).toFixed(2));
      e.setAttribute("fill", colors[Math.floor(rand() * colors.length)]);
      e.setAttribute(
        "opacity",
        (gem.id === "black_opal" ? 0.10 + rand() * 0.26 : 0.06 + rand() * 0.18).toFixed(3)
      );
      pattern.appendChild(e);
    }

    // A subtle "sheen" arc.
    const arc = document.createElementNS(SVG_NS, "path");
    const y = 18 + rand() * 8;
    arc.setAttribute(
      "d",
      `M -10 ${y.toFixed(2)} C 20 ${(y - 8).toFixed(2)}, 55 ${(y + 6).toFixed(2)}, 110 ${(y + 2).toFixed(2)}`
    );
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", lighten(accent, 0.65));
    arc.setAttribute("stroke-width", (3.6 + rand() * 4.8).toFixed(2));
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("opacity", (0.05 + rand() * 0.10).toFixed(3));
    pattern.appendChild(arc);
  }

  // Strong, non-repeating specular glints (these are per-piece because pattern tile == viewBox scale).
  const glint1 = document.createElementNS(SVG_NS, "ellipse");
  glint1.setAttribute("cx", (30 + rand() * 10).toFixed(2));
  glint1.setAttribute("cy", (22 + rand() * 10).toFixed(2));
  glint1.setAttribute("rx", (14 + rand() * 10).toFixed(2));
  glint1.setAttribute("ry", (9 + rand() * 8).toFixed(2));
  glint1.setAttribute("fill", "#ffffff");
  glint1.setAttribute("opacity", (0.12 + rand() * 0.14).toFixed(3));
  pattern.appendChild(glint1);

  const glint2 = document.createElementNS(SVG_NS, "ellipse");
  glint2.setAttribute("cx", (44 + rand() * 9).toFixed(2));
  glint2.setAttribute("cy", (30 + rand() * 10).toFixed(2));
  glint2.setAttribute("rx", (7 + rand() * 7).toFixed(2));
  glint2.setAttribute("ry", (4 + rand() * 6).toFixed(2));
  glint2.setAttribute("fill", "#ffffff");
  glint2.setAttribute("opacity", (0.08 + rand() * 0.12).toFixed(3));
  pattern.appendChild(glint2);

  // Subtle internal shadow for depth.
  const shadow = document.createElementNS(SVG_NS, "ellipse");
  shadow.setAttribute("cx", (62 + rand() * 10).toFixed(2));
  shadow.setAttribute("cy", (68 + rand() * 12).toFixed(2));
  shadow.setAttribute("rx", (18 + rand() * 12).toFixed(2));
  shadow.setAttribute("ry", (14 + rand() * 10).toFixed(2));
  shadow.setAttribute("fill", "#000000");
  shadow.setAttribute("opacity", (0.03 + rand() * 0.06).toFixed(3));
  pattern.appendChild(shadow);

  defs.appendChild(pattern);
}

function ensureUniqueSemiPreciousSymbol(svgRoot: SVGSVGElement, baseHref: string, seedKey: string): string {
  const defs = ensureDefs(svgRoot);

  const variantHref = maybeVariantStoneSvgSymbolHref(svgRoot, baseHref, seedKey);
  const baseId = variantHref.startsWith("#") ? variantHref.slice(1) : variantHref;
  const h = hashString(`${seedKey}|${variantHref}`);
  const suffix = `u${h.toString(16)}`;

  const isLight = baseId.startsWith("W_");
  const gems = isLight ? SEMIPRECIOUS_LIGHT : SEMIPRECIOUS_DARK;
  const gemIdx = h % gems.length;
  const gem = gems[gemIdx];

  const uniqueId = `${baseId}__${gem.id}__${suffix}`;
  if (defs.querySelector(`#${cssEscapeForQuery(uniqueId)}`)) return `#${uniqueId}`;

  const baseSymbol = svgRoot.querySelector(variantHref) as SVGSymbolElement | null;
  if (!baseSymbol) return baseHref;

  const patternId = `semiprec_${gem.id}_${suffix}`;
  ensureSemiPreciousPattern(defs, patternId, h ^ 0x9e3779b9 ^ (gemIdx * 997), gem, isLight);

  const cloned = baseSymbol.cloneNode(true) as SVGSymbolElement;
  cloned.setAttribute("id", uniqueId);

  const elements = Array.from(cloned.querySelectorAll("circle, path, rect, ellipse"));
  for (const el of elements) {
    const fill = el.getAttribute("fill") || "";
    if (fill.includes("url(#marbleVeins") || fill.includes("url(#graniteSpeckles")) {
      setFillUrl(el, patternId);
    }
  }

  defs.appendChild(cloned);
  return `#${uniqueId}`;
}

function isPieceHref(href: string): boolean {
  return (
    href === "#W_S" ||
    href === "#B_S" ||
    href === "#W_O" ||
    href === "#B_O" ||
    href === "#W_K" ||
    href === "#B_K"
  );
}

export function maybeVariantStonePieceHref(
  svgRoot: SVGSVGElement,
  baseHref: string,
  seedKey: string
): string {
  const themeId = svgRoot.getAttribute("data-theme-id");
  if (!isPieceHref(baseHref)) return baseHref;

  if (themeId === STONE_THEME_ID) {
    return ensureUniqueStoneSymbol(svgRoot, baseHref, seedKey);
  }

  if (themeId === SEMIPRECIOUS_THEME_ID) {
    return ensureUniqueSemiPreciousSymbol(svgRoot, baseHref, seedKey);
  }

  return baseHref;
}

export function maybeVariantSemiPreciousPieceHref(
  svgRoot: SVGSVGElement,
  baseHref: string,
  seedKey: string
): string {
  const themeId = svgRoot.getAttribute("data-theme-id");
  if (themeId !== SEMIPRECIOUS_THEME_ID) return baseHref;
  if (!isPieceHref(baseHref)) return baseHref;
  return ensureUniqueSemiPreciousSymbol(svgRoot, baseHref, seedKey);
}
