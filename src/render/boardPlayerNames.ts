import type { GameController } from "../controller/gameController";
import {
  fetchSignedInLocalDisplayName,
  hasAnyLocalBotSide,
  resolveActiveLocalSeatDisplayNames,
} from "../shared/localPlayerNames";
import type { PlayerShellSnapshot } from "../types";
import {
  BOARD_VIEWPORT_MODE_CHANGED_EVENT,
  STACKWORKS_BOARD_CHROME_REFLOW_DONE_EVENT,
} from "../ui/boardViewportMode";
import { getBoardViewportMetrics } from "./boardViewport";
import { urlHasExplicitPlayMode } from "../ui/shell/explicitLocalModeNavigation";

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
  const inSvg = svg.querySelector(`#${PLAYER_NAME_LAYER_ID}`) as SVGGElement | null;
  if (inSvg) return inSvg;
  const stray = document.getElementById(PLAYER_NAME_LAYER_ID);
  if (stray && !svg.contains(stray)) {
    try {
      stray.remove();
    } catch {
      // ignore
    }
  }
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
  const verticalPadding = PLAYER_NAME_FONT_SIZE;
  rect.setAttribute("x", String(viewBox.x));
  rect.setAttribute("y", String(viewBox.y - verticalPadding));
  rect.setAttribute("width", String(viewBox.w));
  rect.setAttribute("height", String(viewBox.h + verticalPadding * 2));
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

/** Re-run playable viewBox + shell/board fit after names change (second in-page local start, etc.). */
function schedulePlayableViewportRefit(svg: SVGSVGElement): void {
  try {
    if (getBoardViewportMetrics(svg)?.mode !== "playable") return;
    window.dispatchEvent(new Event(BOARD_VIEWPORT_MODE_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

export function bindBoardPlayerNameOverlay(args: {
  svg: SVGSVGElement;
  controller: GameController;
  isFlipped: () => boolean;
}): BoardPlayerNameOverlayHandle {
  const { svg, controller, isFlipped } = args;
  const initialSnapshot = controller.getPlayerShellSnapshot();
  let signedInHumanDisplayName: string | null = null;
  let hasRequestedSignedInHumanDisplayName = false;

  const syncLocalSeatDisplayNames = (): void => {
    const snapshot = controller.getPlayerShellSnapshot();
    if (snapshot.mode !== "local") return;
    if (controller.isLoadedGameSeatLabelsActive()) return;
    if (!urlHasExplicitPlayMode() && controller.isShellStartupPlayLockEnabled()) {
      controller.setLocalPlayerDisplayNames({
        W: snapshot.players.W.sideLabel,
        B: snapshot.players.B.sideLabel,
      });
      return;
    }

    const fallbackStoredNames = readStoredLocalPlayerNames();
    const nextNames = resolveActiveLocalSeatDisplayNames({
      root: document,
      signedInDisplayName: signedInHumanDisplayName,
      sideLabels: {
        W: snapshot.players.W.sideLabel,
        B: snapshot.players.B.sideLabel,
      },
      fallbackDisplayNames: {
        W: fallbackStoredNames.white,
        B: fallbackStoredNames.black,
      },
      savePinnedSeatNames: {
        W: controller.getSavePinnedSeatDisplayName("W"),
        B: controller.getSavePinnedSeatDisplayName("B"),
      },
    });

    controller.setLocalPlayerDisplayNames(nextNames);
  };

  const maybeLoadSignedInHumanDisplayName = (): void => {
    if (hasRequestedSignedInHumanDisplayName || !hasAnyLocalBotSide(document)) return;
    hasRequestedSignedInHumanDisplayName = true;
    void fetchSignedInLocalDisplayName().then((nextDisplayName) => {
      if (signedInHumanDisplayName === nextDisplayName) return;
      signedInHumanDisplayName = nextDisplayName;
      syncLocalSeatDisplayNames();
      render();
      schedulePlayableViewportRefit(svg);
    });
  };

  const render = (): void => {
    const snapshot = controller.getPlayerShellSnapshot();
    const whiteName = snapshot.players.W.displayName?.trim() ?? "";
    const blackName = snapshot.players.B.displayName?.trim() ?? "";
    if (!whiteName && !blackName) {
      if (snapshot.mode !== "local") {
        const emptyLayer = ensurePlayerNameLayer(svg);
        while (emptyLayer.firstChild) emptyLayer.removeChild(emptyLayer.firstChild);
      }
      return;
    }

    const liveLayer = ensurePlayerNameLayer(svg);
    while (liveLayer.firstChild) liveLayer.removeChild(liveLayer.firstChild);

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

    if (topName) liveLayer.appendChild(makePlayerNameText(topName, centerX, topY, topIsBold));
    if (bottomName) liveLayer.appendChild(makePlayerNameText(bottomName, centerX, bottomY, bottomIsBold));
  };

  /**
   * Push resolved local/bot seat labels into the controller, then redraw.
   * Does not dispatch `boardViewportModeChanged` (avoids loops with viewport listeners).
   */
  const resyncSeatLabelsAndRedraw = (): void => {
    syncLocalSeatDisplayNames();
    maybeLoadSignedInHumanDisplayName();
    render();
  };

  const syncLocalNamesAndRender = (): void => {
    resyncSeatLabelsAndRedraw();
    schedulePlayableViewportRefit(svg);
  };

  const anySvg = svg as SVGSVGElement & { __stackworksBoardNamesReflowListener?: () => void };
  if (typeof window !== "undefined" && !anySvg.__stackworksBoardNamesReflowListener) {
    anySvg.__stackworksBoardNamesReflowListener = () => {
      syncLocalNamesAndRender();
    };
    window.addEventListener(STACKWORKS_BOARD_CHROME_REFLOW_DONE_EVENT, anySvg.__stackworksBoardNamesReflowListener);
  }

  controller.addHistoryChangeCallback((reason) => {
    // `newGame` clears save pins but not `localShellDisplayNames`; re-resolve so shell + board
    // do not keep a loaded game's labels. `loadGame` re-syncs when saves omit `playerNames`
    // (pin cleared) while still skipping overwrites while `isLoadedGameSeatLabelsActive()`.
    if (reason === "newGame" || reason === "loadGame") {
      syncLocalNamesAndRender();
    } else {
      render();
    }
  });
  controller.addShellSnapshotChangeCallback(() => render());
  controller.addAnalysisModeChangeCallback(() => render());
  for (const selector of ["#aiWhiteSelect", "#aiBlackSelect", "#botWhiteSelect", "#botBlackSelect"]) {
    const control = document.querySelector(selector) as HTMLSelectElement | null;
    control?.addEventListener("change", () => {
      controller.clearSeatDisplayNamesSavePin();
      syncLocalNamesAndRender();
    });
  }

  if (initialSnapshot.mode === "local") {
    syncLocalNamesAndRender();
  } else {
    render();
    schedulePlayableViewportRefit(svg);
  }

  return {
    /** Used after viewport/zoom reflow; must re-resolve names — plain `render` only cleared the layer. */
    sync: resyncSeatLabelsAndRedraw,
    hasNames: () => {
      const snapshot = controller.getPlayerShellSnapshot();
      return Boolean(snapshot.players.W.displayName?.trim() || snapshot.players.B.displayName?.trim());
    },
  };
}