const SVG_NS = "http://www.w3.org/2000/svg";

import { getBoardViewportMetrics } from "./boardViewport.ts";

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

export function ensureTurnIndicatorLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#turnIndicator") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "turnIndicator";
  // Allow hover so the icon can show an SVG tooltip (<title>).
  g.setAttribute("pointer-events", "auto");
  svg.appendChild(g);
  return g;
}

export function renderTurnIndicator(
  svg: SVGSVGElement,
  layer: SVGGElement,
  toMove: "W" | "B",
  opts?: {
    hidden?: boolean;
    tooltipText?: string;
    icon?: "stone" | "pawn";
    labels?: { W: string; B: string };
    decorator?: "analysis";
  }
): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (opts?.hidden) return;

  const vb = parseViewBox(svg);

  const metrics = getBoardViewportMetrics(svg);

  // Pieces are rendered at ~86 units; this is ~1/4.
  const iconSize = 33;
  const padX = metrics?.mode === "playable" ? 6 : 18;

  const x = vb.x + padX;

  // Playable mode: keep the icon just above the top-left board edge.
  // Backing rect extends 6px below the icon's bottom, so account for that.
  const desiredGapToBoard = 4;
  const y =
    metrics?.mode === "playable" && metrics.squares
      ? (metrics.squares.y - desiredGapToBoard - iconSize - 6)
      : (vb.y + 18);

  // A subtle backing so the icon is readable on any theme.
  const backing = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  backing.setAttribute("x", String(x - 6));
  backing.setAttribute("y", String(y - 6));
  backing.setAttribute("width", String(iconSize + 12));
  backing.setAttribute("height", String(iconSize + 12));
  backing.setAttribute("rx", "10");
  backing.setAttribute("ry", "10");
  backing.setAttribute("fill", "rgba(0,0,0,0.28)");
  backing.setAttribute("stroke", "rgba(255,255,255,0.22)");
  backing.setAttribute("stroke-width", "2");
  backing.setAttribute("vector-effect", "non-scaling-stroke");

  backing.setAttribute("pointer-events", "all");
  const title = document.createElementNS(SVG_NS, "title");
  const labels = opts?.labels ?? { W: "Light", B: "Dark" };
  title.textContent = opts?.tooltipText ?? `${toMove === "W" ? labels.W : labels.B} to move`;
  backing.appendChild(title);
  layer.appendChild(backing);

  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  const icon = opts?.icon ?? "stone";
  const href =
    icon === "pawn"
      ? (toMove === "W" ? "#W_P" : "#B_P")
      : (toMove === "W" ? "#W_S" : "#B_S");
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));
  use.setAttribute("width", String(iconSize));
  use.setAttribute("height", String(iconSize));
  // Keep the hover target to the backing rect (prevents the icon from
  // intercepting pointer events in some browsers).
  use.setAttribute("pointer-events", "none");
  layer.appendChild(use);

  if (opts?.decorator === "analysis") {
    // Small "eye" badge (analysis mode) in the indicator corner.
    const badgeR = 9;
    const backingLeft = x - 6;
    const backingTop = y - 6;
    const backingSize = iconSize + 12;
    const inset = 3;
    const badgeCx = backingLeft + backingSize - inset - badgeR;
    const badgeCy = backingTop + inset + badgeR;

    const badge = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    badge.setAttribute("cx", String(badgeCx));
    badge.setAttribute("cy", String(badgeCy));
    badge.setAttribute("r", String(badgeR));
    badge.setAttribute("fill", "rgba(0,0,0,0.28)");
    badge.setAttribute("stroke", "rgba(255,255,255,0.22)");
    badge.setAttribute("stroke-width", "2");
    badge.setAttribute("vector-effect", "non-scaling-stroke");
  // Allow hover so the badge can show an SVG tooltip (<title>).
  badge.setAttribute("pointer-events", "all");

  const badgeTitle = document.createElementNS(SVG_NS, "title");
  badgeTitle.textContent = "Analysis mode";
  badge.appendChild(badgeTitle);
    layer.appendChild(badge);

    const eye = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    const eyeW = 11;
    const eyeH = 6.5;
    // Almond outline, centered.
    const d = [
      `M ${badgeCx - eyeW / 2} ${badgeCy}`,
      `Q ${badgeCx} ${badgeCy - eyeH} ${badgeCx + eyeW / 2} ${badgeCy}`,
      `Q ${badgeCx} ${badgeCy + eyeH} ${badgeCx - eyeW / 2} ${badgeCy}`,
      "Z",
    ].join(" ");
    eye.setAttribute("d", d);
    eye.setAttribute("fill", "none");
    eye.setAttribute("stroke", "rgba(255,255,255,0.85)");
    eye.setAttribute("stroke-width", "2");
    eye.setAttribute("stroke-linecap", "round");
    eye.setAttribute("stroke-linejoin", "round");
    eye.setAttribute("vector-effect", "non-scaling-stroke");
    eye.setAttribute("pointer-events", "none");
    layer.appendChild(eye);

    const pupil = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    pupil.setAttribute("cx", String(badgeCx));
    pupil.setAttribute("cy", String(badgeCy));
    pupil.setAttribute("r", "2.2");
    pupil.setAttribute("fill", "rgba(255,255,255,0.85)");
    pupil.setAttribute("pointer-events", "none");
    layer.appendChild(pupil);
  }
}
