import { maybeVariantSemiPreciousPieceHref } from "./semipreciousPieceVariant";

const STONE_THEME_ID = "stone";

function cssEscapeForQuery(value: string): string {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  if (typeof esc === "function") return esc(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

const SVG_NS = "http://www.w3.org/2000/svg";

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

  // Semi-precious stones are rendered with their own procedural textures.
  if (themeId === "semiprecious") {
    return maybeVariantSemiPreciousPieceHref(svgRoot, baseHref, seedKey);
  }

  // Generate per-piece unique stone symbols/patterns to avoid repeats.
  return baseHref;
}
