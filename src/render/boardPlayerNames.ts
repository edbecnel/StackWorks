import type { GameController } from "../controller/gameController";
import type { PlayerShellSnapshot } from "../types";
import { getBoardViewportMetrics } from "./boardViewport";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLAYER_NAME_LAYER_ID = "playerNameLayer";
const PLAYER_NAME_CLIP_ID = "playerNameClip";
const PLAYER_NAME_FILL = "#4a3020";
const PLAYER_NAME_FONT_SIZE = 30;
const PLAYER_NAME_BOARD_GAP = Math.round(PLAYER_NAME_FONT_SIZE * 0.3);

const LOCAL_PLAYER_NAME_KEYS = {
  light: "lasca.local.nameLight",
  dark: "lasca.local.nameDark",
} as const;

type ParsedViewBox = { x: number; y: number; w: number; h: number };

export interface BoardPlayerNameOverlayHandle {
  sync(): void;
  hasNames(): boolean;
}

function parseViewBox(svg: SVGSVGElement): ParsedViewBox {
  const raw = svg.getAttribute("viewBox") ?? "";
  const parts = raw.trim().split(/[\s,]+/).map((value) => Number(value));
  if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
    const [x, y, w, h] = parts;
    return { x, y, w, h };
  }
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

function ensurePlayerNameLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector(`#${PLAYER_NAME_LAYER_ID}`) as SVGGElement | null;
  if (existing) return existing;
  const layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
  layer.id = PLAYER_NAME_LAYER_ID;
  layer.setAttribute("pointer-events", "none");
  svg.appendChild(layer);
  return layer;
}

function ensurePlayerNameClip(svg: SVGSVGElement, viewBox: ParsedViewBox): void {
  let clipEl = svg.querySelector(`#${PLAYER_NAME_CLIP_ID}`) as SVGClipPathElement | null;
  if (!clipEl) {
    const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(SVG_NS, "defs"), svg.firstChild);
    clipEl = document.createElementNS(SVG_NS, "clipPath") as SVGClipPathElement;
    clipEl.id = PLAYER_NAME_CLIP_ID;
    clipEl.appendChild(document.createElementNS(SVG_NS, "rect"));
    defs.appendChild(clipEl);
  }
  const rect = clipEl.querySelector("rect") as SVGRectElement | null;
  if (!rect) return;
  rect.setAttribute("x", String(viewBox.x));
  rect.setAttribute("y", String(viewBox.y));
  rect.setAttribute("width", String(viewBox.w));
  rect.setAttribute("height", String(viewBox.h));
}

function makePlayerNameText(label: string, x: number, y: number, bold: boolean): SVGTextElement {
  const text = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  text.textContent = label;
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("font-size", String(PLAYER_NAME_FONT_SIZE));
  text.setAttribute("font-weight", bold ? "800" : "500");
  text.setAttribute("fill", PLAYER_NAME_FILL);
  text.setAttribute("opacity", bold ? "1" : "0.65");
  text.setAttribute("clip-path", `url(#${PLAYER_NAME_CLIP_ID})`);
  return text;
}

function readStoredLocalPlayerNames(): { white: string; black: string } {
  try {
    return {
      white: localStorage.getItem(LOCAL_PLAYER_NAME_KEYS.light)?.trim() ?? "",
      black: localStorage.getItem(LOCAL_PLAYER_NAME_KEYS.dark)?.trim() ?? "",
    };
  } catch {
    return { white: "", black: "" };
  }
}

function currentTurn(snapshot: PlayerShellSnapshot): "W" | "B" {
  if (snapshot.players.W.isActiveTurn) return "W";
  if (snapshot.players.B.isActiveTurn) return "B";
  return "W";
}

export function bindBoardPlayerNameOverlay(args: {
  svg: SVGSVGElement;
  controller: GameController;
  isFlipped: () => boolean;
}): BoardPlayerNameOverlayHandle {
  const { svg, controller, isFlipped } = args;
  const initialSnapshot = controller.getPlayerShellSnapshot();
  const storedNames = initialSnapshot.mode === "local"
    ? readStoredLocalPlayerNames()
    : { white: "", black: "" };
  if (storedNames.white || storedNames.black) {
    controller.setLocalPlayerDisplayNames({ W: storedNames.white, B: storedNames.black });
  }

  const layer = ensurePlayerNameLayer(svg);

  const render = (): void => {
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    const snapshot = controller.getPlayerShellSnapshot();
    const whiteName = snapshot.players.W.displayName?.trim() ?? "";
    const blackName = snapshot.players.B.displayName?.trim() ?? "";
    if (!whiteName && !blackName) return;

    const metrics = getBoardViewportMetrics(svg);
    const viewBox = metrics?.viewBox ?? parseViewBox(svg);
    const centerX = viewBox.x + viewBox.w / 2;
    let topY = viewBox.y + 34;
    let bottomY = viewBox.y + viewBox.h - 34;

    if (metrics?.mode === "playable" && metrics.squares) {
      topY = metrics.squares.y - PLAYER_NAME_BOARD_GAP - PLAYER_NAME_FONT_SIZE / 2;
      bottomY = metrics.squares.y + metrics.squares.h + PLAYER_NAME_BOARD_GAP + PLAYER_NAME_FONT_SIZE / 2;
    }

    ensurePlayerNameClip(svg, viewBox);

    const flipped = isFlipped();
    const topName = flipped ? whiteName : blackName;
    const bottomName = flipped ? blackName : whiteName;
    const turn = currentTurn(snapshot);
    const topColor = flipped ? "W" : "B";
    const topIsBold = turn === topColor;
    const bottomIsBold = turn !== topColor;

    if (topName) layer.appendChild(makePlayerNameText(topName, centerX, topY, topIsBold));
    if (bottomName) layer.appendChild(makePlayerNameText(bottomName, centerX, bottomY, bottomIsBold));
  };

  controller.addHistoryChangeCallback(() => render());
  controller.addShellSnapshotChangeCallback(() => render());
  controller.addAnalysisModeChangeCallback(() => render());
  render();

  return {
    sync: render,
    hasNames: () => {
      const snapshot = controller.getPlayerShellSnapshot();
      return Boolean(snapshot.players.W.displayName?.trim() || snapshot.players.B.displayName?.trim());
    },
  };
}