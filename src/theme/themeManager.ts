import { loadSvgDefsInto } from "../render/loadSvgDefs";
import { waitForSvgImagesLoaded } from "../render/waitForSvgImages";
import { DEFAULT_THEME_ID, THEMES, getThemeById } from "./themes";
import { createThemeDropdown } from "../ui/components/themeDropdown";
import { nextPaint } from "../ui/nextPaint";

const LS_KEY = "lasca.theme";
const GLASS_BG_LS_KEY = "lasca.theme.glassBg";
const GLASS_PALETTE_LS_KEY = "lasca.theme.glassPalette";
const LINK_ID = "lascaThemeCss";
const OVERLAY_FX_STYLE_ID = "lascaOverlayFxCss";

export const THEME_CHANGE_EVENT = "lasca:themechange" as const;
export const THEME_WILL_CHANGE_EVENT = "lasca:themeloadstart" as const;
export const THEME_DID_CHANGE_EVENT = "lasca:themeloadend" as const;

type GlassBgMode = "original" | "felt" | "walnut";

type GlassPaletteId =
  | "yellow_blue"
  | "cyan_violet"
  | "mint_magenta"
  | "pearl_smoke"
  | "lavender_sapphire"
  | "aqua_amber";

type GlassPaletteDef = {
  id: GlassPaletteId;
  label: string;
  lightStops: [string, string, string, string];
  darkStops: [string, string, string, string];
  lightPolishedStops: [string, string, string, string];
  darkPolishedStops: [string, string, string, string];
  lightStroke?: string;
  darkStroke?: string;
  lightAccent?: string;
  darkAccent?: string;
};

const GLASS_PALETTES: GlassPaletteDef[] = [
  {
    id: "yellow_blue",
    label: "Yellow / Blue (default)",
    lightStops: ["#ffffed", "#fffacd", "#ffec8b", "#ffd700"],
    darkStops: ["#4169e1", "#1e3a8a", "#0f1e47", "#0a1128"],
    lightPolishedStops: ["#ffffff", "#ffffed", "#fff8a8", "#ffeb3b"],
    darkPolishedStops: ["#5b9bd5", "#2563eb", "#1e40af", "#0f1e47"],
  },
  {
    id: "cyan_violet",
    label: "Cyan / Violet",
    lightStops: ["#f1feff", "#c8fbff", "#6ee7ff", "#22d3ee"],
    darkStops: ["#e9d5ff", "#a78bfa", "#6d28d9", "#2e1065"],
    lightPolishedStops: ["#ffffff", "#e8fdff", "#a5f3fc", "#38bdf8"],
    darkPolishedStops: ["#f5f3ff", "#c4b5fd", "#7c3aed", "#3b0764"],
  },
  {
    id: "mint_magenta",
    label: "Mint / Magenta",
    lightStops: ["#f2fff9", "#bbf7d0", "#34d399", "#10b981"],
    darkStops: ["#ffe4f6", "#f472b6", "#db2777", "#4a044e"],
    lightPolishedStops: ["#ffffff", "#dcfce7", "#86efac", "#22c55e"],
    darkPolishedStops: ["#fff1f2", "#fda4af", "#e11d48", "#500724"],
  },
  {
    id: "pearl_smoke",
    label: "Pearl / Smoke (high contrast)",
    lightStops: ["#ffffff", "#eef2ff", "#c7d2fe", "#93c5fd"],
    darkStops: ["#e5e7eb", "#6b7280", "#374151", "#0b1220"],
    lightPolishedStops: ["#ffffff", "#f1f5f9", "#dbeafe", "#60a5fa"],
    darkPolishedStops: ["#f3f4f6", "#9ca3af", "#4b5563", "#111827"],
  },
  {
    id: "lavender_sapphire",
    label: "Lavender / Sapphire",
    lightStops: ["#ffffff", "#ede9fe", "#c4b5fd", "#a78bfa"],
    darkStops: ["#dbeafe", "#60a5fa", "#1d4ed8", "#0b102a"],
    lightPolishedStops: ["#ffffff", "#f5f3ff", "#ddd6fe", "#8b5cf6"],
    darkPolishedStops: ["#eff6ff", "#93c5fd", "#2563eb", "#0b102a"],
  },
  {
    id: "aqua_amber",
    label: "Aqua / Amber",
    lightStops: ["#f0fdff", "#99f6e4", "#2dd4bf", "#0891b2"],
    darkStops: ["#fff7ed", "#fdba74", "#f59e0b", "#3a1f06"],
    lightPolishedStops: ["#ffffff", "#ccfbf1", "#5eead4", "#0ea5e9"],
    darkPolishedStops: ["#ffffff", "#ffedd5", "#fb923c", "#7c2d12"],
  },
];

function isGlassBgMode(v: unknown): v is GlassBgMode {
  return v === "original" || v === "felt" || v === "walnut";
}

function isGlassPaletteId(v: unknown): v is GlassPaletteId {
  return (
    v === "yellow_blue" ||
    v === "cyan_violet" ||
    v === "mint_magenta" ||
    v === "pearl_smoke" ||
    v === "lavender_sapphire" ||
    v === "aqua_amber"
  );
}

function getGlassPaletteById(id: GlassPaletteId): GlassPaletteDef {
  return GLASS_PALETTES.find((p) => p.id === id) ?? GLASS_PALETTES[0];
}

function readSavedGlassBgMode(key = GLASS_BG_LS_KEY): GlassBgMode | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return isGlassBgMode(raw) ? raw : null;
}

function readSavedGlassPaletteId(key = GLASS_PALETTE_LS_KEY): GlassPaletteId | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return isGlassPaletteId(raw) ? raw : null;
}

function saveGlassBgMode(mode: GlassBgMode, key = GLASS_BG_LS_KEY) {
  localStorage.setItem(key, mode);
}

function saveGlassPaletteId(id: GlassPaletteId, key = GLASS_PALETTE_LS_KEY) {
  localStorage.setItem(key, id);
}

function applyGlassBgMode(mode: GlassBgMode) {
  document.body?.setAttribute("data-glass-bg", mode);
}

function clearGlassBgMode() {
  document.body?.removeAttribute("data-glass-bg");
}

function setSvgGradientStops(svgRoot: SVGSVGElement, gradientId: string, colors: readonly string[]) {
  const grad = svgRoot.querySelector(`#${CSS.escape(gradientId)}`) as SVGGradientElement | null;
  if (!grad) return;
  const stops = Array.from(grad.querySelectorAll("stop")) as SVGStopElement[];
  for (let i = 0; i < Math.min(stops.length, colors.length); i++) {
    const stop = stops[i];
    const color = colors[i];

    // Prefer setting via attribute (works regardless of how the SVG wrote it).
    stop.setAttribute("stop-color", color);

    // Also patch inline style if present.
    const rawStyle = stop.getAttribute("style");
    if (rawStyle && rawStyle.includes("stop-color")) {
      const nextStyle = rawStyle.replace(/stop-color\s*:\s*#[0-9a-fA-F]{3,8}/, `stop-color:${color}`);
      stop.setAttribute("style", nextStyle);
    }
  }
}

function setFirstCircleStroke(svgRoot: SVGSVGElement, symbolId: string, fillUrlId: string, stroke: string | null) {
  const sel = `#${CSS.escape(symbolId)} circle[fill="url(#${fillUrlId})"]`;
  const circle = svgRoot.querySelector(sel) as SVGCircleElement | null;
  if (!circle || !stroke) return;
  circle.setAttribute("stroke", stroke);
}

function setSymbolAccentStroke(svgRoot: SVGSVGElement, symbolId: string, stroke: string | null) {
  if (!stroke) return;
  const path = svgRoot.querySelector(`#${CSS.escape(symbolId)} path`) as SVGPathElement | null;
  if (!path) return;
  path.setAttribute("stroke", stroke);
}

function applyGlassPaletteToSvg(svgRoot: SVGSVGElement, paletteId: GlassPaletteId) {
  const p = getGlassPaletteById(paletteId);

  // Base gradients
  setSvgGradientStops(svgRoot, "gradYellowGlass", p.lightStops);
  setSvgGradientStops(svgRoot, "gradBlueGlass", p.darkStops);

  // Polished gradients (officers / kings)
  setSvgGradientStops(svgRoot, "gradYellowGlassPolished", p.lightPolishedStops);
  setSvgGradientStops(svgRoot, "gradBlueGlassPolished", p.darkPolishedStops);

  // Borders / accents (optional overrides; otherwise keep existing)
  setFirstCircleStroke(svgRoot, "W_S", "gradYellowGlass", p.lightStroke ?? null);
  setFirstCircleStroke(svgRoot, "W_O", "gradYellowGlassPolished", p.lightStroke ?? null);
  setFirstCircleStroke(svgRoot, "W_K", "gradYellowGlassPolished", p.lightStroke ?? null);

  setFirstCircleStroke(svgRoot, "B_S", "gradBlueGlass", p.darkStroke ?? null);
  setFirstCircleStroke(svgRoot, "B_O", "gradBlueGlassPolished", p.darkStroke ?? null);
  setFirstCircleStroke(svgRoot, "B_K", "gradBlueGlassPolished", p.darkStroke ?? null);

  setSymbolAccentStroke(svgRoot, "W_O", p.lightAccent ?? null);
  setSymbolAccentStroke(svgRoot, "W_K", p.lightAccent ?? null);
  setSymbolAccentStroke(svgRoot, "B_O", p.darkAccent ?? null);
  setSymbolAccentStroke(svgRoot, "B_K", p.darkAccent ?? null);
}

function ensureDefsStructure(svgRoot: SVGSVGElement) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  let defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
    defs.setAttribute("id", "lascaDefs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  let themeDefs = svgRoot.querySelector("#lascaThemeDefs") as SVGGElement | null;
  if (!themeDefs) {
    themeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
    themeDefs.setAttribute("id", "lascaThemeDefs");
    defs.appendChild(themeDefs);
  }

  let runtimeDefs = svgRoot.querySelector("#lascaRuntimeDefs") as SVGGElement | null;
  if (!runtimeDefs) {
    runtimeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
    runtimeDefs.setAttribute("id", "lascaRuntimeDefs");
    defs.appendChild(runtimeDefs);
  }

  return { defs, themeDefs, runtimeDefs } as const;
}

function ensureThemeCssLink(): HTMLLinkElement {
  let link = document.getElementById(LINK_ID);
  if (link && link.tagName.toLowerCase() !== "link") {
    link.remove();
    link = null;
  }
  if (!link) {
    const l = document.createElement("link");
    l.id = LINK_ID;
    l.rel = "stylesheet";
    document.head.appendChild(l);
    link = l;
  }
  return link as HTMLLinkElement;
}

function readSavedThemeId(storageKey: string = LS_KEY): string | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  return raw;
}

function isVisibleThemeId(id: string | null | undefined): boolean {
  if (!id) return false;
  const t = getThemeById(id);
  return Boolean(t && !t.hidden);
}

function saveThemeId(id: string, storageKey: string = LS_KEY) {
  localStorage.setItem(storageKey, id);
}

function ensureOverlayFxCss(): void {
  if (document.getElementById(OVERLAY_FX_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = OVERLAY_FX_STYLE_ID;
  style.textContent = `
:root{
  --halo-selection: #66ccff;
  --halo-target: #00e676;
  --halo-highlight: #ff9f40;
}

#lascaBoard .halo{ pointer-events:none; }

#lascaBoard .halo circle{
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}

#lascaBoard .halo--selection{ --halo-color: var(--halo-selection); }
#lascaBoard .halo--target{ --halo-color: var(--halo-target); }
#lascaBoard .halo--highlight{ --halo-color: var(--halo-highlight); }

#lascaBoard .halo .halo-glow{
  stroke: var(--halo-color) !important;
  opacity: 0.22;
  filter:
    drop-shadow(0 0 8px var(--halo-color))
    drop-shadow(0 0 16px var(--halo-color));
  animation: lascaHaloPulse 1200ms ease-in-out infinite alternate;
}

#lascaBoard .halo .halo-core{
  stroke: var(--halo-color) !important;
  opacity: 0.9;
  stroke-dasharray: 14 9;
  animation: lascaHaloSpin 1100ms linear infinite;
  filter: drop-shadow(0 0 6px var(--halo-color));
}

#lascaBoard .halo .halo-sparks{
  stroke: rgba(255,255,255,0.92) !important;
  opacity: 0.75;
  stroke-dasharray: 2 18;
  animation: lascaHaloSpin 700ms linear infinite, lascaHaloFlicker 2100ms ease-in-out infinite;
  filter:
    drop-shadow(0 0 5px var(--halo-color))
    drop-shadow(0 0 12px rgba(255,255,255,0.35));
}

@keyframes lascaHaloSpin{
  from{ stroke-dashoffset: 0; }
  to{ stroke-dashoffset: -96; }
}

@keyframes lascaHaloPulse{
  from{ opacity: 0.14; }
  to{ opacity: 0.30; }
}

@keyframes lascaHaloFlicker{
  0%, 100%{ opacity: 0.55; }
  40%{ opacity: 0.92; }
  65%{ opacity: 0.40; }
  80%{ opacity: 0.85; }
}

@media (prefers-reduced-motion: reduce){
  #lascaBoard .halo .halo-glow,
  #lascaBoard .halo .halo-core,
  #lascaBoard .halo .halo-sparks{
    animation: none !important;
  }
}
`;
  document.head.appendChild(style);
}

export function createThemeManager(svgRoot: SVGSVGElement, opts?: { themeStorageKey?: string }) {
  if (!svgRoot) throw new Error("createThemeManager: svgRoot is required");

  const themeStorageKey = opts?.themeStorageKey ?? LS_KEY;
  const glassBgStorageKey = `${themeStorageKey}.glassBg`;
  const glassPaletteStorageKey = `${themeStorageKey}.glassPalette`;

  ensureOverlayFxCss();

  const { themeDefs } = ensureDefsStructure(svgRoot);

  let currentId: string | null = null;
  let currentCssHref: string | null = null;

  let glassPaletteRowEl: HTMLElement | null = null;
  let glassPaletteSelectEl: HTMLSelectElement | null = null;

  let glassBgRowEl: HTMLElement | null = null;
  let glassBgSelectEl: HTMLSelectElement | null = null;
  // Default to the historical Glass look.
  let glassBgMode: GlassBgMode = readSavedGlassBgMode(glassBgStorageKey) ?? "original";

  // Default to the current palette.
  let glassPaletteId: GlassPaletteId = readSavedGlassPaletteId(glassPaletteStorageKey) ?? "yellow_blue";

  function emitThemeVariantChange(): void {
    const themeId = currentId ?? svgRoot.getAttribute("data-theme-id");
    if (!themeId) return;
    svgRoot.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { themeId } }));
  }

  function updateGlassUi(themeId: string | null) {
    const enabled = themeId === "glass";
    if (glassPaletteRowEl) {
      glassPaletteRowEl.style.display = enabled ? "grid" : "none";
    }
    if (glassPaletteSelectEl) {
      glassPaletteSelectEl.disabled = !enabled;
      glassPaletteSelectEl.value = glassPaletteId;
    }

    if (glassBgRowEl) {
      glassBgRowEl.style.display = enabled ? "grid" : "none";
    }
    if (glassBgSelectEl) {
      glassBgSelectEl.disabled = !enabled;
      glassBgSelectEl.value = glassBgMode;
    }
    if (enabled) {
      applyGlassBgMode(glassBgMode);
      applyGlassPaletteToSvg(svgRoot, glassPaletteId);
    } else {
      clearGlassBgMode();
    }
  }

  async function applyThemeCss(cssUrl: string | URL | null | undefined) {
    if (!cssUrl) return;
    const href = String(cssUrl);
    if (href === currentCssHref) return;
    const link = ensureThemeCssLink();
    await new Promise<void>((resolve) => {
      const onDone = () => {
        link.removeEventListener("load", onDone);
        link.removeEventListener("error", onDone);
        resolve();
      };
      link.addEventListener("load", onDone);
      link.addEventListener("error", onDone);
      link.href = href;
    });
    currentCssHref = href;
  }

  async function setTheme(id: string) {
    const theme = getThemeById(id) ?? getThemeById(DEFAULT_THEME_ID);
    if (!theme) throw new Error("No themes available.");
    if (currentId === theme.id) return theme;

    svgRoot.dispatchEvent(new CustomEvent(THEME_WILL_CHANGE_EVENT, { detail: { themeId: theme.id } }));
    // Give the UI a chance to paint the loading overlay before we hide the SVG.
    await nextPaint(1);

    const prevVis = svgRoot.style.visibility;
    svgRoot.style.visibility = "hidden";

    themeDefs.replaceChildren();
    await loadSvgDefsInto(themeDefs, [theme.piecesDefs, theme.boardDefs]);
    await applyThemeCss(theme.css);

    // Raster piece themes can be substantially slower to decode than vector themes.
    // Do not block app initialization or theme-complete events on those decodes;
    // let the browser continue loading them progressively after the SVG swap.
    void waitForSvgImagesLoaded(svgRoot, { selector: "image", timeoutMs: 30_000 }).catch(() => {
      // Best-effort cache warming only.
    });

    // Luminous theme relies on outer glow; ensure nothing in the board template
    // (notably node outline strokes) visually sits above the piece glyphs.
    if (theme.id === "luminous") {
      const pieces = svgRoot.querySelector("#pieces") as SVGGElement | null;
      const nodes = svgRoot.querySelector("#nodes") as SVGGElement | null;
      if (pieces && nodes && nodes.parentElement) {
        nodes.parentElement.insertBefore(pieces, nodes.nextSibling);
      }
    }

    svgRoot.setAttribute("data-theme-id", theme.id);

    // Apply theme-specific UI state (e.g. Glass background variants).
    updateGlassUi(theme.id);

    // Notify listeners (e.g. controller) so they can re-render any <use href="#..."></use>
    // that may be theme-dependent (Wooden variants).
    svgRoot.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { themeId: theme.id } }));

    currentId = theme.id;
    saveThemeId(currentId, themeStorageKey);
    svgRoot.style.visibility = prevVis || "visible";
    // Ensure the newly-applied theme has a chance to paint before consumers hide overlays.
    await nextPaint(1);
    svgRoot.dispatchEvent(new CustomEvent(THEME_DID_CHANGE_EVENT, { detail: { themeId: theme.id } }));
    return theme;
  }

  function bindGlassPieceColorsSelect(rowEl: HTMLElement | null | undefined, selectEl: HTMLSelectElement | null | undefined) {
    glassPaletteRowEl = rowEl ?? null;
    glassPaletteSelectEl = selectEl ?? null;
    if (!glassPaletteRowEl || !glassPaletteSelectEl) return;

    glassPaletteId = readSavedGlassPaletteId(glassPaletteStorageKey) ?? glassPaletteId;
    glassPaletteSelectEl.value = glassPaletteId;

    glassPaletteSelectEl.addEventListener("change", () => {
      const next = glassPaletteSelectEl?.value;
      if (!isGlassPaletteId(next)) return;
      glassPaletteId = next;
      saveGlassPaletteId(glassPaletteId, glassPaletteStorageKey);
      updateGlassUi(currentId ?? svgRoot.getAttribute("data-theme-id"));
      if ((currentId ?? svgRoot.getAttribute("data-theme-id")) === "glass") {
        emitThemeVariantChange();
      }
    });

    updateGlassUi(currentId ?? svgRoot.getAttribute("data-theme-id"));
  }

  function bindGlassBackgroundSelect(rowEl: HTMLElement | null | undefined, selectEl: HTMLSelectElement | null | undefined) {
    glassBgRowEl = rowEl ?? null;
    glassBgSelectEl = selectEl ?? null;
    if (!glassBgRowEl || !glassBgSelectEl) return;

    // Initialize from persisted value (or default).
    glassBgMode = readSavedGlassBgMode(glassBgStorageKey) ?? glassBgMode;
    glassBgSelectEl.value = glassBgMode;

    glassBgSelectEl.addEventListener("change", () => {
      const next = glassBgSelectEl?.value;
      if (!isGlassBgMode(next)) return;
      glassBgMode = next;
      saveGlassBgMode(glassBgMode, glassBgStorageKey);
      // Only affects visuals when glass theme is active.
      updateGlassUi(currentId ?? svgRoot.getAttribute("data-theme-id"));
      if ((currentId ?? svgRoot.getAttribute("data-theme-id")) === "glass") {
        emitThemeVariantChange();
      }
    });

    updateGlassUi(currentId ?? svgRoot.getAttribute("data-theme-id"));
  }

  async function bindThemeDropdown(
    dropdownRootEl: HTMLElement | null | undefined,
    onUserSelect?: (id: string) => void | Promise<void>,
  ) {
    if (!dropdownRootEl) return;
    const items = THEMES.filter((t) => !t.hidden).map((t) => ({ id: t.id, label: t.label }));
    const saved = readSavedThemeId(themeStorageKey);
    const initial = isVisibleThemeId(saved) ? (saved as string) : DEFAULT_THEME_ID;
    await setTheme(initial);
    const dropdown = createThemeDropdown({
      rootEl: dropdownRootEl,
      items,
      initialId: initial,
      onSelect: async (id) => {
        await setTheme(id);
        if (typeof onUserSelect === "function") {
          await onUserSelect(id);
        }
      },
    });
    void dropdown;
  }

  async function bindThemeSelect(selectEl: HTMLSelectElement | null | undefined) {
    if (!selectEl) return;
    selectEl.textContent = "";
    for (const t of THEMES.filter((t) => !t.hidden)) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      selectEl.appendChild(opt);
    }
    const saved = readSavedThemeId(themeStorageKey);
    const initial = isVisibleThemeId(saved) ? (saved as string) : DEFAULT_THEME_ID;
    selectEl.value = initial;
    await setTheme(initial);
    selectEl.addEventListener("change", async () => {
      await setTheme(selectEl.value);
    });
  }

  return {
    setTheme,
    bindThemeDropdown,
    bindThemeSelect,
    bindGlassPieceColorsSelect,
    bindGlassBackgroundSelect,
    getCurrentThemeId: () => currentId,
  } as const;
}
