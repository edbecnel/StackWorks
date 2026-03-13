const SVG_NS = "http://www.w3.org/2000/svg";

import { getBoardViewportMetrics } from "./boardViewport.ts";

type PresenceStatus = "connected" | "in_grace" | "disconnected" | "waiting";

type OpponentPresenceOpts = {
  opponentColor: "W" | "B";
  status: PresenceStatus;
  graceUntil?: string | null;
  hidden?: boolean;
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
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

export function ensureOpponentPresenceIndicatorLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#opponentPresenceIndicator") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "opponentPresenceIndicator";
  // Allow click/tap so the controller can show status details.
  g.setAttribute("pointer-events", "auto");
  (g as any).style && (((g as any).style.cursor = "pointer"), ((g as any).style.touchAction = "manipulation"));
  svg.appendChild(g);
  return g;
}

export function renderOpponentPresenceIndicator(svg: SVGSVGElement, layer: SVGGElement, opts: OpponentPresenceOpts): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (opts.hidden) return;

  const vb = parseViewBox(svg);
  const metrics = getBoardViewportMetrics(svg);

  const iconSize = 33;
  const padX = metrics?.mode === "playable" ? 6 : 18;

  const baseX = vb.x + padX;

  const desiredGapToBoard = 4;
  const baseY =
    metrics?.mode === "playable" && metrics.squares
      ? (metrics.squares.y - desiredGapToBoard - iconSize - 6)
      : (vb.y + 18 + iconSize + 10);

  // In playable mode, place to the right of the turn indicator.
  const x = metrics?.mode === "playable" ? (baseX + (iconSize + 12) + 8) : baseX;
  const y = baseY;

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
  layer.appendChild(backing);

  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  const href = opts.opponentColor === "W" ? "#W_S" : "#B_S";
  use.setAttribute("href", href);
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));
  use.setAttribute("width", String(iconSize));
  use.setAttribute("height", String(iconSize));
  layer.appendChild(use);

  const dot = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  dot.setAttribute("cx", String(x + iconSize - 3));
  dot.setAttribute("cy", String(y + iconSize - 3));
  dot.setAttribute("r", "7");
  dot.setAttribute("stroke", "rgba(0,0,0,0.55)");
  dot.setAttribute("stroke-width", "2");
  dot.setAttribute("vector-effect", "non-scaling-stroke");

  let dotFill = "#9aa0a6";
  let title = "Opponent";

  if (opts.status === "connected") {
    dotFill = "#22c55e";
    title = "Opponent connected";
  } else if (opts.status === "in_grace") {
    dotFill = "#f59e0b";
    title = opts.graceUntil ? `Opponent disconnected (grace until ${opts.graceUntil})` : "Opponent disconnected (in grace)";
  } else if (opts.status === "disconnected") {
    dotFill = "#ef4444";
    title = "Opponent disconnected";
  } else if (opts.status === "waiting") {
    dotFill = "#9aa0a6";
    title = "Waiting for opponent";
  }

  dot.setAttribute("fill", dotFill);
  layer.appendChild(dot);

  const t = document.createElementNS(SVG_NS, "title");
  t.textContent = title;
  layer.appendChild(t);
}
