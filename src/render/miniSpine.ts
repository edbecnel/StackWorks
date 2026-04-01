import { MINI_SPINE_MAX_SHOWN, MINI_SPINE_KEEP_BOTTOM, MINI_SPINE_KEEP_TOP } from "../config/constants";
import { pieceToHref } from "../pieces/pieceToHref";
import { makeUseWithTitle } from "./svgUse";
import { pieceTooltip } from "../pieces/pieceLabel";
import { maybeVariantStonePieceHref } from "./stonePieceVariant";
import { maybeVariantWoodenPieceHref } from "./woodenPieceVariant";
import { pieceVariantSeed } from "./pieceVariantSeed";
import type { Stack } from "../types";
import { isBoardFlipped } from "./boardFlip";

const SVG_NS = "http://www.w3.org/2000/svg";

let nextClipId = 1;

interface MiniSpineOptions {
  pieceSize: number;
  maxShown: number;
  keepTop: number;
  keepBottom: number;
  miniSize: number;
  miniGap: number;
  spineGap: number;
  spinePad: number;
  crackGap: number;
  rulesetId?: string;
  seedKey?: string;
  countLayer?: SVGGElement | null;
}

export function drawMiniStackSpine(
  svgRoot: SVGSVGElement,
  g: SVGGElement,
  cx: number,
  cy: number,
  stack: Stack,
  opts: Partial<MiniSpineOptions> = {}
): void {
  const {
    pieceSize = 86,
    maxShown = MINI_SPINE_MAX_SHOWN,
    keepTop = MINI_SPINE_KEEP_TOP,
    keepBottom = MINI_SPINE_KEEP_BOTTOM,
    miniSize = 18,
    miniGap = 3,
    spineGap = 6,
    spinePad = 6,
    crackGap = 12,
    rulesetId,
    seedKey,
    countLayer,
  } = opts;

  const n = stack.length;
  if (n <= 1) return;

  let shown = [] as Array<{ piece: Stack[number]; stackIndex: number }>;
  let hasCrack = false;

  if (n <= maxShown) {
    shown = stack.map((piece, stackIndex) => ({ piece, stackIndex }));
  } else {
    hasCrack = true;
    const bottom = stack.slice(0, keepBottom).map((piece, stackIndex) => ({ piece, stackIndex }));
    const top = stack.slice(n - keepTop).map((piece, offset) => ({ piece, stackIndex: n - keepTop + offset }));
    shown = bottom.concat(top);
  }

  const countShown = shown.length;
  const stackH = countShown * miniSize + (countShown - 1) * miniGap + (hasCrack ? crackGap : 0);

  const spineW = miniSize + spinePad * 2;
  const spineH = stackH + spinePad * 2;

  const flipped = isBoardFlipped(svgRoot);
  const themeId = svgRoot.getAttribute("data-theme-id");

  // If we're on a checkered board, prefer placing the spine inside the square,
  // pinned to the viewer-right edge. When the whole board is rotated 180°,
  // we must mirror the placement in board coordinates so it still appears on
  // the right side of the screen.
  const squaresRect = svgRoot.querySelector("#squares rect") as SVGRectElement | null;
  const tileWRaw = squaresRect?.getAttribute("width") ?? null;
  const tileW = tileWRaw ? Number.parseFloat(tileWRaw) : NaN;
  const tileHalf = Number.isFinite(tileW) && tileW > 0 ? tileW / 2 : NaN;
  const inset = 3;

  const x = Number.isFinite(tileHalf)
    ? (flipped ? (cx - tileHalf + inset) : (cx + tileHalf - spineW - inset))
    : (flipped ? (cx - pieceSize / 2 - spineGap - spineW) : (cx + pieceSize / 2 + spineGap));

  const y = cy - spineH / 2;

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(spineW));
  bg.setAttribute("height", String(spineH));
  bg.setAttribute("rx", "10");
  bg.setAttribute("fill", "rgba(56,56,56,0.55)");
  bg.setAttribute("stroke", "rgba(255,255,255,0.35)");
  bg.setAttribute("stroke-width", "1.4");
  bg.setAttribute("pointer-events", "none");
  g.appendChild(bg);

  const defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (!defs) throw new Error("SVG <defs> not found. miniSpine requires <defs>.");

  const clipId = `clip_${nextClipId++}`;
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", clipId);

  const clipRect = document.createElementNS(SVG_NS, "rect");
  clipRect.setAttribute("x", String(x + 1));
  clipRect.setAttribute("y", String(y + 1));
  clipRect.setAttribute("width", String(spineW - 2));
  clipRect.setAttribute("height", String(spineH - 2));
  clipRect.setAttribute("rx", "9");

  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  const minis = document.createElementNS(SVG_NS, "g") as SVGGElement;
  minis.setAttribute("clip-path", `url(#${clipId})`);
  // Enable pointer events so <title> tooltips work on the mini pieces.
  minis.setAttribute("pointer-events", "auto");

  const innerLeft = x + spinePad;
  const innerBottom = y + spineH - spinePad;

  const crackAfterIndex = keepBottom - 1;

  for (let i = 0; i < countShown; i++) {
    const { piece: p, stackIndex } = shown[i]!;
    const baseHref = pieceToHref(p, { rulesetId, themeId });
    const variantSeed = seedKey ? pieceVariantSeed(seedKey, stackIndex) : null;
    const href = seedKey
      ? maybeVariantStonePieceHref(
          svgRoot,
          maybeVariantWoodenPieceHref(svgRoot, baseHref, variantSeed!),
          variantSeed!
        )
      : baseHref;

    let yOffset = i * (miniSize + miniGap);
    if (hasCrack && i > crackAfterIndex) {
      yOffset += crackGap;
    }

    const miniY = innerBottom - miniSize - yOffset;
    const miniX = innerLeft;

    const u = makeUseWithTitle(href, miniX, miniY, miniSize, pieceTooltip(p, { rulesetId }), themeId);
    if (flipped) {
      const ux = miniX + miniSize / 2;
      const uy = miniY + miniSize / 2;
      u.setAttribute("transform", `rotate(180 ${ux} ${uy})`);
    }
    minis.appendChild(u);
  }

  g.appendChild(minis);

  if (hasCrack) {
    const crackTopY = innerBottom - miniSize - crackAfterIndex * (miniSize + miniGap) - miniGap;
    const crackMidY = crackTopY - crackGap / 2;

    const left = x + 3;
    const right = x + spineW - 3;
    const midX = (left + right) / 2;

    const d = [
      `M ${left} ${crackMidY - 5}`,
      `L ${midX - 6} ${crackMidY + 2}`,
      `L ${midX} ${crackMidY - 3}`,
      `L ${midX + 6} ${crackMidY + 4}`,
      `L ${right} ${crackMidY - 1}`,
    ].join(" ");

    const crackShadow = document.createElementNS(SVG_NS, "path");
    crackShadow.setAttribute("d", d);
    crackShadow.setAttribute("fill", "none");
    crackShadow.setAttribute("stroke", "rgba(0,0,0,0.45)");
    crackShadow.setAttribute("stroke-width", "4.0");
    crackShadow.setAttribute("stroke-linecap", "round");
    crackShadow.setAttribute("stroke-linejoin", "round");
    crackShadow.setAttribute("pointer-events", "none");

    const crack = document.createElementNS(SVG_NS, "path");
    crack.setAttribute("d", d);
    crack.setAttribute("fill", "none");
    crack.setAttribute("stroke", "rgba(255,255,255,0.75)");
    crack.setAttribute("stroke-width", "2.2");
    crack.setAttribute("stroke-linecap", "round");
    crack.setAttribute("stroke-linejoin", "round");
    crack.setAttribute("pointer-events", "none");

    g.appendChild(crackShadow);
    g.appendChild(crack);
  }

  const bubbleCx = x + spineW / 2;
  const bubbleCy = y - 12;

  const bubble = document.createElementNS(SVG_NS, "circle");
  bubble.setAttribute("cx", String(bubbleCx));
  bubble.setAttribute("cy", String(bubbleCy));
  bubble.setAttribute("r", "10");
  bubble.setAttribute("fill", "rgba(0,0,0,0.78)");
  bubble.setAttribute("stroke", "rgba(255,255,255,0.65)");
  bubble.setAttribute("stroke-width", "1.4");
  bubble.setAttribute("pointer-events", "none");

  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", String(bubbleCx));
  t.setAttribute("y", String(bubbleCy + 0.5));
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("dominant-baseline", "middle");
  t.setAttribute("fill", "#fff");
  t.setAttribute("font-size", "12");
  t.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");
  t.textContent = String(n);
  t.setAttribute("pointer-events", "none");

  const targetLayer = countLayer ?? g;
  if (targetLayer !== g) {
    const countGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
    countGroup.setAttribute("class", "stackCount");
    countGroup.setAttribute("data-node", String(g.getAttribute("data-node") || ""));
    countGroup.setAttribute("pointer-events", "none");
    if (flipped) countGroup.setAttribute("transform", `rotate(180 ${bubbleCx} ${bubbleCy})`);
    countGroup.appendChild(bubble);
    countGroup.appendChild(t);
    targetLayer.appendChild(countGroup);
  } else {
    if (flipped) {
      // Bubble is symmetric, but the number text must remain upright.
      t.setAttribute("transform", `rotate(180 ${bubbleCx} ${bubbleCy})`);
    }
    g.appendChild(bubble);
    g.appendChild(t);
  }
}
