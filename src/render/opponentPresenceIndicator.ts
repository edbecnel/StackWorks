const SVG_NS = "http://www.w3.org/2000/svg";

import { getBoardViewportMetrics } from "./boardViewport.ts";

type PresenceStatus = "connected" | "in_grace" | "disconnected" | "waiting";

type OpponentPresenceOpts = {
  opponentColor: "W" | "B";
  status: PresenceStatus;
  graceUntil?: string | null;
  hidden?: boolean;
};

function appendOpponentToken(layer: SVGGElement, args: { x: number; y: number; size: number; color: "W" | "B" }): void {
  const token = document.createElementNS(SVG_NS, "g") as SVGGElement;
  token.setAttribute("transform", `translate(${args.x} ${args.y})`);

  const fill = args.color === "W" ? "#f8fafc" : "#111827";
  const stroke = args.color === "W" ? "rgba(15,23,42,0.72)" : "rgba(248,250,252,0.82)";

  const base = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  base.setAttribute(
    "d",
    "M16.5 8.5 C12.7 8.5 9.8 11.5 9.8 15.2 C9.8 17.6 11.1 19.7 13.1 20.9 C10.2 22.3 8.3 25.1 8.0 28.7 L25.0 28.7 C24.7 25.1 22.8 22.3 19.9 20.9 C21.9 19.7 23.2 17.6 23.2 15.2 C23.2 11.5 20.3 8.5 16.5 8.5 Z"
  );
  base.setAttribute("fill", fill);
  base.setAttribute("stroke", stroke);
  base.setAttribute("stroke-width", "1.8");
  base.setAttribute("stroke-linejoin", "round");
  token.appendChild(base);

  const plinth = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  plinth.setAttribute("x", "6.5");
  plinth.setAttribute("y", "27.6");
  plinth.setAttribute("width", "20");
  plinth.setAttribute("height", "3.4");
  plinth.setAttribute("rx", "1.7");
  plinth.setAttribute("fill", fill);
  plinth.setAttribute("stroke", stroke);
  plinth.setAttribute("stroke-width", "1.4");
  token.appendChild(plinth);

  const gloss = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  gloss.setAttribute("d", "M12.2 13.4 C13.8 10.7 17.1 9.7 19.4 10.4");
  gloss.setAttribute("fill", "none");
  gloss.setAttribute("stroke", args.color === "W" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.24)");
  gloss.setAttribute("stroke-width", "1.3");
  gloss.setAttribute("stroke-linecap", "round");
  token.appendChild(gloss);

  const scale = args.size / 33;
  token.setAttribute("transform", `translate(${args.x} ${args.y}) scale(${scale})`);
  layer.appendChild(token);
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

  appendOpponentToken(layer, { x, y, size: iconSize, color: opts.opponentColor });

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
