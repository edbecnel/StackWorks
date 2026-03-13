import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager, THEME_DID_CHANGE_EVENT, THEME_WILL_CHANGE_EVENT } from "./theme/themeManager";
import columnsChessBoardSvgUrl from "./assets/columns_chess_board.svg?url";
import { renderGameState } from "./render/renderGameState";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { initCollapsibleSections } from "./ui/layout/collapsibleSections";
import { createInitialGameStateForVariant } from "./game/state";
import type { VariantId } from "./variants/variantTypes";
import { getVariantById, rulesBoardLine } from "./variants/variantRegistry";
import { ensureOverlayLayer } from "./render/overlays";
import { HistoryManager } from "./game/historyManager";
import { createDriverAsync } from "./driver/createDriver";
import { GameController } from "./controller/gameController";
import { renderBoardCoords } from "./render/boardCoords";
import { setBoardFlipped } from "./render/boardFlip";
import {
  applyCheckerboardTheme,
  normalizeCheckerboardThemeId,
  type CheckerboardThemeId,
} from "./render/checkerboardTheme";
import { saveGameToFile, loadGameFromFile } from "./game/saveLoad";
import { createSfxManager } from "./ui/sfx";
import type { Stack } from "./types";
import { bindPlaybackControls } from "./ui/playbackControls.ts";
import { ChessBotManager } from "./bot/chessBotManager.ts";
import { Chess } from "chess.js";
import { gameStateToFen, uciSquareToNodeId } from "./bot/fen.ts";
import { applyMove } from "./game/applyMove.ts";
import { nodeIdToA1 } from "./game/coordFormat.ts";
import { createBoardLoadingOverlay } from "./ui/boardLoadingOverlay";
import { nextPaint } from "./ui/nextPaint";
import { bindChessEvaluationPanel } from "./ui/chessEvaluationPanel.ts";
import { installBoardVisualizationTools } from "./ui/boardVisualizationTools";
import { setStackWorksGameTitle } from "./ui/gameTitle";
import { bindTouchAnnotationPalette } from "./ui/touchAnnotationPalette";
import {
  bindAnalysisToggleButton,
  bindFullScreenButton,
  bindGameHotkeys,
  bindKeyboardShortcutsContextMenu,
} from "./ui/gameShortcuts.ts";
import { bindPanelLayoutMenuMode, installPanelLayoutOptionUI } from "./ui/panelLayoutMode";
import { applyBoardViewportModeToSvg, getBoardViewportMetrics } from "./render/boardViewport";
import {
  applyBoardViewportMode,
  BOARD_VIEWPORT_MODE_CHANGED_EVENT,
  installBoardViewportOptionUI,
  readBoardViewportMode,
} from "./ui/boardViewportMode";
import { bindStartPageConfirm } from "./ui/startPageConfirm";
import { bindOfflineNavGuard } from "./ui/offlineNavGuard";

const ACTIVE_VARIANT_ID: VariantId = "chess_classic";

const LS_OPT_KEYS = {
  showResizeIcon: "lasca.opt.showResizeIcon",
  boardCoords: "lasca.opt.boardCoords",
  boardCoordsInSquares: "lasca.opt.boardCoordsInSquares",
  flipBoard: "lasca.opt.flipBoard",
  highlightSquares: "lasca.opt.chess.highlightSquares",
  toasts: "lasca.opt.toasts",
  sfx: "lasca.opt.sfx",
  checkerboardTheme: "lasca.opt.checkerboardTheme",
  lastMoveHighlights: "lasca.opt.lastMoveHighlights",
  moveHints: "lasca.opt.moveHints",
  showPlayerNames: "lasca.opt.chess.showPlayerNames",
} as const;

function readOptionalBoolPref(key: string): boolean | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function writeBoolPref(key: string, value: boolean): void {
  localStorage.setItem(key, value ? "1" : "0");
}

function readOptionalStringPref(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function writeStringPref(key: string, value: string): void {
  localStorage.setItem(key, value);
}

window.addEventListener("DOMContentLoaded", async () => {
  const variant = getVariantById(ACTIVE_VARIANT_ID);

  initSplitLayout();
  initCollapsibleSections();

  // Panel layout: Panels vs Menu (small-screen friendly).
  installPanelLayoutOptionUI();
  bindPanelLayoutMenuMode();

  // Board viewport: Framed vs Playable area.
  installBoardViewportOptionUI();
  let boardViewportMode = readBoardViewportMode();
  applyBoardViewportMode(boardViewportMode);

  const gameTitleEl = document.getElementById("gameTitle");
  if (gameTitleEl) {
    setStackWorksGameTitle(gameTitleEl, variant.displayName);
    gameTitleEl.title = rulesBoardLine(variant.rulesetId, variant.boardSize);
  }

  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const boardLoading = createBoardLoadingOverlay(boardWrap);
  boardLoading.show();

  const svg = await loadSvgFileInto(boardWrap, columnsChessBoardSvgUrl);

  // Apply viewport cropping early so the rest of the SVG overlays (turn indicator,
  // coords, player names) compute positions against the final viewBox.
  applyBoardViewportModeToSvg(svg, boardViewportMode, { boardSize: variant.boardSize });

  // Checkerboard background theme (Classic/Green)
  const checkerboardThemeSelect = document.getElementById(
    "checkerboardThemeSelect",
  ) as HTMLSelectElement | null;

  const readCheckerboardTheme = (): CheckerboardThemeId =>
    normalizeCheckerboardThemeId(readOptionalStringPref(LS_OPT_KEYS.checkerboardTheme));

  const applyCheckerboard = (id: CheckerboardThemeId) => {
    applyCheckerboardTheme(svg, id);
  };

  if (checkerboardThemeSelect) {
    checkerboardThemeSelect.value = readCheckerboardTheme();
    checkerboardThemeSelect.addEventListener("change", () => {
      const picked = normalizeCheckerboardThemeId(checkerboardThemeSelect.value);
      writeStringPref(LS_OPT_KEYS.checkerboardTheme, picked);
      applyCheckerboard(picked);
    });
  }

  applyCheckerboard(readCheckerboardTheme());

  const flipBoardToggle = document.getElementById("flipBoardToggle") as HTMLInputElement | null;
  const savedFlip = (() => {
    const v = readOptionalBoolPref(LS_OPT_KEYS.flipBoard);
    if (v !== null) return v;
    const legacy = readOptionalBoolPref("lasca.opt.chess.flipBoard");
    if (legacy !== null) writeBoolPref(LS_OPT_KEYS.flipBoard, legacy);
    return legacy;
  })();
  if (flipBoardToggle && savedFlip !== null) {
    flipBoardToggle.checked = savedFlip;
  }
  const isFlipped = () => Boolean(flipBoardToggle?.checked);

  // Apply flip early so any subsequently-created layers end up in the rotated view.
  setBoardFlipped(svg, isFlipped());

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const savedBoardCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoords);
  if (boardCoordsToggle && savedBoardCoords !== null) {
    boardCoordsToggle.checked = savedBoardCoords;
  }

  const boardCoordsInSquaresToggle = document.getElementById(
    "boardCoordsInSquaresToggle",
  ) as HTMLInputElement | null;
  const savedBoardCoordsInSquares = readOptionalBoolPref(LS_OPT_KEYS.boardCoordsInSquares);
  if (boardCoordsInSquaresToggle && savedBoardCoordsInSquares !== null) {
    boardCoordsInSquaresToggle.checked = savedBoardCoordsInSquares;
  }

  // Player names are rendered directly inside the SVG, either in the outer border
  // strips (framed mode) or in the reserved top/bottom strips (playable mode).
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PLAYER_NAME_FILL = "#4a3020";
  // Keep this modest so it fits in both framed and playable header/footer strips.
  const PLAYER_NAME_FONT_SIZE = 30;
  const PLAYER_NAME_BOARD_GAP = Math.round(PLAYER_NAME_FONT_SIZE * 0.30);

  const parseViewBox = (s: SVGSVGElement): { x: number; y: number; w: number; h: number } => {
    const raw = s.getAttribute("viewBox") ?? "";
    const parts = raw
      .trim()
      .split(/\s+/)
      .map((p) => Number(p));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [x, y, w, h] = parts;
      return { x, y, w, h };
    }
    return { x: 0, y: 0, w: 1000, h: 1000 };
  };

  const ensurePlayerNameLayer = (): SVGGElement => {
    const existing = svg.querySelector("#playerNameLayer") as SVGGElement | null;
    if (existing) return existing;
    const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
    g.id = "playerNameLayer";
    g.setAttribute("pointer-events", "none");
    svg.appendChild(g);
    return g;
  };

  const renderPlayerNamesOnSvg = (topName: string, bottomName: string, topIsBold: boolean, bottomIsBold: boolean) => {
    const layer = ensurePlayerNameLayer();
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!topName && !bottomName) return;

    const metrics = getBoardViewportMetrics(svg);
    const vb = metrics?.viewBox ?? parseViewBox(svg);
    const cx = vb.x + vb.w / 2;

    let topY = vb.y + 34;
    let bottomY = vb.y + vb.h - 34;
    if (metrics?.mode === "playable" && metrics.squares) {
      // Place names near the board edge with a small, equal gap.
      // We keep dominant-baseline=middle, so offset by half the font-size.
      topY = metrics.squares.y - PLAYER_NAME_BOARD_GAP - PLAYER_NAME_FONT_SIZE / 2;
      bottomY = metrics.squares.y + metrics.squares.h + PLAYER_NAME_BOARD_GAP + PLAYER_NAME_FONT_SIZE / 2;
    }

    const makeText = (label: string, x: number, y: number, bold: boolean): SVGTextElement => {
      const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
      t.textContent = label;
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-size", String(PLAYER_NAME_FONT_SIZE));
      t.setAttribute("font-weight", bold ? "800" : "500");
      t.setAttribute("fill", PLAYER_NAME_FILL);
      t.setAttribute("opacity", bold ? "1" : "0.65");
      // Clip to the board's horizontal span so long names don't overflow into edge coords.
      t.setAttribute("clip-path", "url(#playerNameClip)");
      return t;
    };

    // Ensure a clip rect so long names don't overflow the board viewport.
    let clipEl = svg.querySelector("#playerNameClip") as SVGClipPathElement | null;
    if (!clipEl) {
      const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(SVG_NS, "defs"), svg.firstChild);
      clipEl = document.createElementNS(SVG_NS, "clipPath") as SVGClipPathElement;
      clipEl.id = "playerNameClip";
      const r = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      // In playable mode, the viewBox is already cropped to the squares span.
      // In framed mode, we still clip to the viewBox so names stay inside the board.
      r.setAttribute("x", String(vb.x));
      r.setAttribute("y", String(vb.y));
      r.setAttribute("width", String(vb.w));
      r.setAttribute("height", String(vb.h));
      clipEl.appendChild(r);
      defs.appendChild(clipEl);
    } else {
      const r = clipEl.querySelector("rect") as SVGRectElement | null;
      if (r) {
        r.setAttribute("x", String(vb.x));
        r.setAttribute("y", String(vb.y));
        r.setAttribute("width", String(vb.w));
        r.setAttribute("height", String(vb.h));
      }
    }

    if (topName) layer.appendChild(makeText(topName, cx, topY, topIsBold));
    if (bottomName) layer.appendChild(makeText(bottomName, cx, bottomY, bottomIsBold));
  };

  const showPlayerNamesToggle = document.getElementById("showPlayerNamesToggle") as HTMLInputElement | null;
  const savedShowPlayerNames = readOptionalBoolPref(LS_OPT_KEYS.showPlayerNames);
  // Default: show player names (checked). Only hide if the user has explicitly saved false.
  if (showPlayerNamesToggle && savedShowPlayerNames !== null) {
    showPlayerNamesToggle.checked = savedShowPlayerNames;
  }

  let playerWhiteName = "";
  let playerBlackName = "";
  // Tracks whose turn it is so the active player's name can be rendered bold.
  let playerToMove: "W" | "B" = "W";

  const hasPlayerNames = () =>
    Boolean(playerWhiteName || playerBlackName) && (showPlayerNamesToggle?.checked !== false);

  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), variant.boardSize, {
      flipped: isFlipped(),
      // When player names occupy the border strips the edge-style coordinate
      // labels would collide with them, so force inSquare mode.
      style: (boardViewportMode === "playable" || hasPlayerNames() || boardCoordsInSquaresToggle?.checked) ? "inSquare" : "edge",
    });

  const boardCoordsInSquaresRow = document.getElementById("boardCoordsInSquaresRow") as HTMLElement | null;

  // Disables the "Show player names" toggle (and dims it) when no names are available,
  // since the option has no effect without known player identities.
  const syncShowPlayerNamesUI = () => {
    if (!showPlayerNamesToggle) return;
    const namesKnown = Boolean(playerWhiteName || playerBlackName);
    showPlayerNamesToggle.disabled = !namesKnown;
    const row = showPlayerNamesToggle.closest("div") as HTMLElement | null;
    if (row) row.style.opacity = namesKnown ? "" : "0.45";
  };

  const updatePlayerNameDisplay = () => {
    const flipped = isFlipped();
    const showNames = showPlayerNamesToggle?.checked !== false;
    const namesKnown = Boolean(playerWhiteName || playerBlackName);
    const namesShown = showNames && namesKnown;

    // In playable-area mode, keep whitespace minimal.
    if (boardViewportMode === "playable") {
      applyBoardViewportModeToSvg(svg, boardViewportMode, {
        boardSize: variant.boardSize,
        // Small top strip is OK because the HUD badges are positioned very close
        // to the board edge in playable mode.
        reservedTop: 52,
        // Bottom only needs to be large enough for the bottom name when shown.
        reservedBottom: namesShown ? 44 : 12,
      });
    } else {
      try {
        delete document.body.dataset.boardHud;
      } catch {
        // ignore
      }
    }
    // When not flipped: white plays from the bottom, black from the top.
    const topName = namesShown ? (flipped ? playerWhiteName : playerBlackName) : "";
    const bottomName = namesShown ? (flipped ? playerBlackName : playerWhiteName) : "";
    // Bold the name of the player whose turn it is.
    const topColor: "W" | "B" = flipped ? "W" : "B";
    const topIsBold = namesShown && playerToMove === topColor;
    const bottomIsBold = namesShown && playerToMove !== topColor;
    renderPlayerNamesOnSvg(topName, bottomName, topIsBold, bottomIsBold);

    // In playable-area viewport mode (and when player names occupy the outer
    // frame strips), edge-style coordinate labels would overwrite other HUD/UI.
    // Force the "Inside squares" checkbox on and disable it so the user can't
    // accidentally switch back to edge mode.
    if (boardCoordsInSquaresToggle) {
      if (boardViewportMode === "playable" || hasPlayerNames()) {
        boardCoordsInSquaresToggle.checked = true;
        boardCoordsInSquaresToggle.disabled = true;
        if (boardCoordsInSquaresRow) boardCoordsInSquaresRow.style.opacity = "0.45";
      } else {
        boardCoordsInSquaresToggle.disabled = false;
        if (boardCoordsInSquaresRow) boardCoordsInSquaresRow.style.opacity = "";
        // Restore the user's saved preference.
        const saved = readOptionalBoolPref(LS_OPT_KEYS.boardCoordsInSquares);
        boardCoordsInSquaresToggle.checked = saved ?? false;
      }
    }

    // Re-apply coords: may need to switch to/from inSquare mode.
    applyBoardCoords();
  };

  // React to viewport mode changes (re-crop SVG + reflow overlays).
  window.addEventListener(BOARD_VIEWPORT_MODE_CHANGED_EVENT, () => {
    boardViewportMode = readBoardViewportMode();
    applyBoardViewportMode(boardViewportMode);
    updatePlayerNameDisplay();
  });

  const setPlayerNames = (white: string, black: string) => {
    playerWhiteName = white;
    playerBlackName = black;
    syncShowPlayerNamesUI();
    updatePlayerNameDisplay();
  };

  // Apply initial disabled state (no names known yet at load time).
  syncShowPlayerNamesUI();

  /** Sanitize a player display name for use in a filename (max 24 chars). */
  const toFileSlug = (name: string): string =>
    name.trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 24);

  /** Build the "White vs. Black (result)" portion of a filename. Returns "" when no names are known. */
  const playerNameFilePart = (resultSuffix?: string): string => {
    const w = toFileSlug(playerWhiteName);
    const b = toFileSlug(playerBlackName);
    if (!w && !b) return "";
    const vsStr = w && b ? `${w} vs. ${b}` : (w || b);
    return resultSuffix ? `${vsStr} ${resultSuffix}` : vsStr;
  };

  /** Derive the PGN result suffix from a game state, or "" if still in progress.
   *  Uses standard PGN result notation; "1/2-1/2" is written as "(½-½)" for filename safety. */
  const resultSuffixFromState = (st: unknown): string => {
    const forced = (st as any)?.forcedGameOver;
    if (!forced) return "";
    if (forced.winner === "W") return "(1-0)";
    if (forced.winner === "B") return "(0-1)";
    return "(½-½)";  // PGN "1/2-1/2" — "/" is not valid in filenames
  };

  applyBoardCoords();

  const themeManager = createThemeManager(svg);

  // Classic Chess: allow 2D or 3D raster themes (no discs).
  const THEME_KEY = "lasca.chess.theme";
  const LEGACY_THEME_KEY = "lasca.theme";
  const themeFromQueryRaw = new URLSearchParams(window.location.search).get("theme")?.trim();
  const themeFromQuery = themeFromQueryRaw && themeFromQueryRaw.length > 0 ? themeFromQueryRaw : null;
  const normalizeChessTheme = (raw: string | null | undefined): "raster2d" | "raster3d" | "neo" => {
    const v = String(raw ?? "").trim().toLowerCase();
    if (v === "neo") return "neo";
    if (v === "raster2d" || v === "2d") return "raster2d";
    if (v === "raster3d" || v === "3d") return "raster3d";
    return "raster3d";
  };
  const savedTheme = (() => {
    try {
      return localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    } catch {
      return null;
    }
  })();
  const initialThemeId = normalizeChessTheme(themeFromQuery ?? savedTheme);
  await themeManager.setTheme(initialThemeId);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");

  // Classic Chess: the Piece Inspector panel is not used.
  const inspector = null;

  const state = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
  const history = new HistoryManager();
  history.push(state);

  renderGameState(svg, piecesLayer, inspector as any, state);

  // Board SVG + theme are now loaded; keep spinner until the first paint.
  await nextPaint();
  boardLoading.hide();

  // Theme switching can involve slow raster PNG loads; show spinner while themes apply.
  svg.addEventListener(THEME_WILL_CHANGE_EVENT, () => boardLoading.show());
  svg.addEventListener(THEME_DID_CHANGE_EVENT, () => boardLoading.hide());

  ensureOverlayLayer(svg);
  const driver = await createDriverAsync({
    state,
    history,
    search: window.location.search,
    envMode: import.meta.env.VITE_PLAY_MODE,
    envServerUrl: import.meta.env.VITE_SERVER_URL,
  });

  const controller = new GameController(svg, piecesLayer, inspector as any, state, history, driver);
  controller.bind();

  // Keep playerToMove in sync so the active player's name is always rendered bold.
  controller.addHistoryChangeCallback(() => {
    playerToMove = controller.getState().toMove;
    updatePlayerNameDisplay();
  });

  bindOfflineNavGuard(controller, ACTIVE_VARIANT_ID);

  // Analysis graphics: right-drag (desktop) and touch gestures (analysis mode only).
  const boardVizTools = installBoardVisualizationTools(svg, {
    isTouchInputEnabled: () => controller.isAnalysisMode(),
    getState: () => controller.getState(),
  });
  bindTouchAnnotationPalette(controller, boardVizTools);
  controller.addAnalysisModeChangeCallback((enabled) => {
    if (!enabled) boardVizTools.clear();
  });

  bindStartPageConfirm(controller, ACTIVE_VARIANT_ID);

  bindChessEvaluationPanel(controller);

  // Classic Chess: theme select (2D / 3D / Neo) + Neo PNG availability hint.
  // Note: Neo is SVG-only and does not require external assets.
  {
    const themeSelect = document.getElementById("columnsThemeSelect") as HTMLSelectElement | null;

    if (themeSelect) {
      themeSelect.value = initialThemeId === "neo" ? "neo" : (initialThemeId === "raster2d" ? "2d" : "3d");
      themeSelect.disabled = false;

      themeSelect.addEventListener("change", async () => {
        const picked = themeSelect.value === "neo" ? "neo" : (themeSelect.value === "2d" ? "raster2d" : "raster3d");
        await themeManager.setTheme(picked);
        try {
          localStorage.setItem(THEME_KEY, picked);
        } catch {
          // ignore
        }
      });
    }
  }

  // Offline-only: Bot controls (classic chess only).
  if (driver.mode !== "online") {
    const bot = new ChessBotManager(controller);
    bot.bind();
    controller.addAnalysisModeChangeCallback((enabled) => bot.setAnalysisModeActive(enabled));
  }

  // Left panel status (rules/board is static per variant)
  const elRulesBoard = document.getElementById("statusRulesBoard") as HTMLElement | null;
  if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(variant.rulesetId, variant.boardSize);

  // Options: toasts
  const toastToggle = document.getElementById("toastToggle") as HTMLInputElement | null;
  const savedToasts = readOptionalBoolPref(LS_OPT_KEYS.toasts);
  if (toastToggle && savedToasts !== null) toastToggle.checked = savedToasts;
  if (toastToggle) {
    toastToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.toasts, toastToggle.checked);
    });
  }

  // Options: sound effects
  const sfx = createSfxManager();
  controller.setSfxManager(sfx);
  const soundToggle = document.getElementById("soundToggle") as HTMLInputElement | null;
  const savedSfx = readOptionalBoolPref(LS_OPT_KEYS.sfx);
  if (soundToggle && savedSfx !== null) soundToggle.checked = savedSfx;
  sfx.setEnabled(Boolean(soundToggle?.checked ?? false));
  if (soundToggle) {
    soundToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.sfx, soundToggle.checked);
      sfx.setEnabled(soundToggle.checked);
      sfx.play(soundToggle.checked ? "uiOn" : "uiOff");
    });
  }

  // Options: last move highlight
  const lastMoveHighlightsToggle = document.getElementById("lastMoveHighlightsToggle") as HTMLInputElement | null;
  const savedLastMoveHighlights = readOptionalBoolPref(LS_OPT_KEYS.lastMoveHighlights);
  const initialLastMoveHighlights = savedLastMoveHighlights ?? true;
  if (lastMoveHighlightsToggle) lastMoveHighlightsToggle.checked = initialLastMoveHighlights;
  controller.setLastMoveHighlightsEnabled(lastMoveHighlightsToggle?.checked ?? initialLastMoveHighlights);
  if (lastMoveHighlightsToggle) {
    lastMoveHighlightsToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.lastMoveHighlights, lastMoveHighlightsToggle.checked);
      controller.setLastMoveHighlightsEnabled(lastMoveHighlightsToggle.checked);
    });
  }

  // Options: move preview hints
  const moveHintsToggle = document.getElementById("moveHintsToggle") as HTMLInputElement | null;
  const savedMoveHints = readOptionalBoolPref(LS_OPT_KEYS.moveHints);
  const initialMoveHints = savedMoveHints ?? true;
  if (moveHintsToggle) moveHintsToggle.checked = initialMoveHints;
  controller.setMoveHints(moveHintsToggle?.checked ?? initialMoveHints);
  if (moveHintsToggle) {
    moveHintsToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.moveHints, moveHintsToggle.checked);
      controller.setMoveHints(moveHintsToggle.checked);
    });
  }

  // Options: highlight squares (Chess-only subtle selection/hints)
  const highlightSquaresToggle = document.getElementById("highlightSquaresToggle") as HTMLInputElement | null;
  const savedHighlightSquares = readOptionalBoolPref(LS_OPT_KEYS.highlightSquares);
  const initialHighlightSquares = savedHighlightSquares ?? false;
  if (highlightSquaresToggle) highlightSquaresToggle.checked = initialHighlightSquares;
  controller.setHighlightSquaresEnabled(highlightSquaresToggle?.checked ?? initialHighlightSquares);
  if (highlightSquaresToggle) {
    highlightSquaresToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.highlightSquares, highlightSquaresToggle.checked);
      controller.setHighlightSquaresEnabled(highlightSquaresToggle.checked);
    });
  }

  // Options: show player names
  if (showPlayerNamesToggle) {
    showPlayerNamesToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.showPlayerNames, showPlayerNamesToggle.checked);
      updatePlayerNameDisplay();
    });
  }

  // Options: board coords
  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoords, boardCoordsToggle.checked);
    });
  }

  if (boardCoordsInSquaresToggle) {
    boardCoordsInSquaresToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoordsInSquares, boardCoordsInSquaresToggle.checked);
    });
  }

  // Options: flip board
  if (flipBoardToggle) {
    flipBoardToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.flipBoard, flipBoardToggle.checked);
      setBoardFlipped(svg, flipBoardToggle.checked);
      updatePlayerNameDisplay();
      controller.refreshView();
    });
  }

  // Options: resize icon + board-height toggle
  const showResizeIconToggle = document.getElementById("showResizeIconToggle") as HTMLInputElement | null;
  const savedShowResizeIcon = readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon);
  if (showResizeIconToggle && savedShowResizeIcon !== null) showResizeIconToggle.checked = savedShowResizeIcon;

  const boardHeightToggle = document.getElementById("boardHeightToggle") as HTMLButtonElement | null;
  const centerArea = document.getElementById("centerArea") as HTMLElement | null;
  const HEIGHT_KEY = "lasca.boardHeightReduced";

  const applyResizeIconVisibility = () => {
    if (!boardHeightToggle) return;
    const showResizeIcon = showResizeIconToggle?.checked ?? (readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon) ?? false);
    boardHeightToggle.style.display = showResizeIcon ? "flex" : "none";
    if (!showResizeIcon && centerArea) {
      centerArea.classList.remove("reduced-height");
      localStorage.setItem(HEIGHT_KEY, "false");
      boardHeightToggle.textContent = "↕️";
      boardHeightToggle.title = "Adjust board height for bottom navigation bar";
    }
  };

  applyResizeIconVisibility();

  if (centerArea && boardHeightToggle) {
    const savedReduced = localStorage.getItem(HEIGHT_KEY) === "true";
    if (boardHeightToggle.style.display !== "none" && savedReduced) {
      centerArea.classList.add("reduced-height");
      boardHeightToggle.textContent = "⬆️";
      boardHeightToggle.title = "Restore full board height";
    }

    boardHeightToggle.addEventListener("click", () => {
      const isReduced = centerArea.classList.toggle("reduced-height");
      if (isReduced) {
        boardHeightToggle.textContent = "⬆️";
        boardHeightToggle.title = "Restore full board height";
      } else {
        boardHeightToggle.textContent = "↕️";
        boardHeightToggle.title = "Adjust board height for bottom navigation bar";
      }
      localStorage.setItem(HEIGHT_KEY, isReduced.toString());
    });
  }

  if (showResizeIconToggle) {
    showResizeIconToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.showResizeIcon, showResizeIconToggle.checked);
      applyResizeIconVisibility();
    });
  }

  // Option Actions
  const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      if (!controller.isOver()) {
        const ok = confirm("Start a new Chess game? Current game will be lost.");
        if (!ok) return;
      }
      controller.newGame(createInitialGameStateForVariant(ACTIVE_VARIANT_ID));
      setPlayerNames("", "");
    });
  }

  const resignBtn = document.getElementById("resignBtn") as HTMLButtonElement | null;
  if (resignBtn) {
    resignBtn.addEventListener("click", async () => {
      const ok = confirm("Resign the current game?");
      if (!ok) return;
      await controller.resign();
    });
  }

  const offerDrawBtn = document.getElementById("offerDrawBtn") as HTMLButtonElement | null;
  if (offerDrawBtn) {
    offerDrawBtn.addEventListener("click", () => {
      void controller.offerDraw();
    });
  }

  // Save / Load
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const currentState = controller.getState();
      const ts = new Date().toISOString().replace(/[T:]/g, "-").replace(/\..+/, "");
      const namePart = playerNameFilePart(resultSuffixFromState(currentState));
      const filename = namePart
        ? `chess -- ${namePart} -- ${ts}.json`
        : `chess -- ${ts}.json`;
      saveGameToFile(currentState, history, filename);
    });
  }
  if (loadGameBtn && loadGameInput) {
    loadGameBtn.addEventListener("click", () => loadGameInput.click());
    loadGameInput.addEventListener("change", async () => {
      const file = loadGameInput.files?.[0];
      if (!file) return;
      try {
        const loaded = await loadGameFromFile(file, {
          variantId: "chess_classic",
          rulesetId: "chess",
          boardSize: 8,
        });
        controller.loadGame(loaded.state, loaded.history);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load game:", error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Failed to load game: ${msg}`);
      }
      loadGameInput.value = "";
    });
  }

  // Export Move History
  const exportHistoryBtn = document.getElementById("exportHistoryBtn") as HTMLButtonElement | null;
  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener("click", () => {
      const historyJson = controller.exportMoveHistory();
      const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
      const blob = new Blob([historyJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ACTIVE_VARIANT_ID}-history-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // PGN Import / Export (classic chess)
  const importPgnPasteBtn = document.getElementById("importPgnPasteBtn") as HTMLButtonElement | null;
  const importPgnFileBtn = document.getElementById("importPgnFileBtn") as HTMLButtonElement | null;
  const importPgnInput = document.getElementById("importPgnInput") as HTMLInputElement | null;
  const exportPgnBtn = document.getElementById("exportPgnBtn") as HTMLButtonElement | null;

  const readFileText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Failed to read file"));
      fr.onload = () => resolve(String(fr.result ?? ""));
      fr.readAsText(file);
    });
  };

  const parseSquaresFromNotation = (notation: string): Array<string> => {
    const raw = String(notation ?? "").match(/[A-H][1-8]/gi);
    if (!raw) return [];
    return raw.map((s) => s.toLowerCase());
  };

  const nodeToUci = (nodeId: string): string => {
    // nodeIdToA1 yields A..H + 1..8.
    return nodeIdToA1(nodeId, 8).toLowerCase();
  };

  const inferPromotion = (prev: import("./game/state.ts").GameState, next: import("./game/state.ts").GameState, from: string, to: string): "q" | undefined => {
    try {
      const prevPiece = prev.board.get(from)?.[0];
      const nextPiece = next.board.get(to)?.[0];
      if (!prevPiece || !nextPiece) return undefined;
      if (prevPiece.rank !== "P") return undefined;
      if (nextPiece.owner !== prevPiece.owner) return undefined;
      if (nextPiece.rank === "Q") return "q";
    } catch {
      // ignore
    }
    return undefined;
  };

  const deriveChessJsMovesFromHistory = (): Array<{ from: string; to: string; promotion?: "q" }> => {
    const snap = driver.exportHistorySnapshots();
    const idxMax = Math.max(0, Math.min(snap.currentIndex, snap.states.length - 1));
    const out: Array<{ from: string; to: string; promotion?: "q" }> = [];

    for (let i = 1; i <= idxMax; i++) {
      const prev = snap.states[i - 1];
      const next = snap.states[i];

      // Skip forced-game-over entries (resign, timeout, etc.) — these push a copy
      // of the current state onto history with no actual board move.
      if ((next as any).forcedGameOver) continue;

      let fromNode: string | null = null;
      let toNode: string | null = null;

      // Prefer authoritative last-move hints when present.
      const lm = next.ui?.lastMove;
      if (lm?.from && lm?.to) {
        fromNode = lm.from;
        toNode = lm.to;
      } else {
        // Fallback to parsing the displayed notation (older histories / some imports).
        const squares = parseSquaresFromNotation(snap.notation[i] ?? "");
        if (squares.length >= 2) {
          try {
            fromNode = uciSquareToNodeId(squares[0]!);
            toNode = uciSquareToNodeId(squares[squares.length - 1]!);
          } catch {
            // ignore
          }
        }
      }

      if (!fromNode || !toNode) {
        // Skip entries we can't reconstruct.
        continue;
      }

      const from = nodeToUci(fromNode);
      const to = nodeToUci(toNode);
      const promotion = inferPromotion(prev, next, fromNode, toNode);
      out.push(promotion ? { from, to, promotion } : { from, to });
    }

    return out;
  };

  const exportCurrentLineToPgnText = (includeTiming: boolean): string => {
    const snap = driver.exportHistorySnapshots();
    const moves = deriveChessJsMovesFromHistory();
    const chess = new Chess();

    // Determine if we have any per-move elapsed times to embed.
    const hasTimingData = includeTiming && (snap.emtMs?.some((v) => v !== null) ?? false);

    // Derive PGN result token from the current history position.
    const deriveResultToken = (): string => {
      const st = snap.states[snap.currentIndex];
      const forced = (st as any)?.forcedGameOver;
      if (forced) {
        if (forced.winner === "W") return "1-0";
        if (forced.winner === "B") return "0-1";
        return "1/2-1/2";
      }
      return "*";
    };
    const resultToken = deriveResultToken();
    const whiteHeader = playerWhiteName || "?";
    const blackHeader = playerBlackName || "?";

    if (!hasTimingData) {
      // Fast path: no timing, let chess.js build the standard PGN.
      for (const m of moves) {
        const ok = chess.move(m as any);
        if (!ok) {
          throw new Error(`Failed to convert history to PGN at move ${m.from}-${m.to}`);
        }
      }
      (chess as any).header("White", whiteHeader);
      (chess as any).header("Black", blackHeader);
      (chess as any).header("Result", resultToken);
      return chess.pgn({ newline_char: "\n" } as any);
    }

    // Slow path: build PGN with [%emt H:MM:SS] comments after each move.
    const formatEmtForPgn = (ms: number): string => {
      const total = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(total / 3600);
      const min = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const sanMoves: Array<{ san: string; emtMs: number | null }> = [];
    for (let i = 0; i < moves.length; i++) {
      const result = chess.move(moves[i] as any) as any;
      if (!result) {
        throw new Error(`Failed to convert history to PGN at move ${moves[i]!.from}-${moves[i]!.to}`);
      }
      // History index i+1 corresponds to the state after move i.
      sanMoves.push({ san: result.san as string, emtMs: snap.emtMs?.[i + 1] ?? null });
    }

    const dateStr = new Date().toISOString().split("T")[0]!.replace(/-/g, ".");
    const headers = `[Event "?"]\n[Site "?"]\n[Date "${dateStr}"]\n[Round "?"]\n[White "${whiteHeader}"]\n[Black "${blackHeader}"]\n[Result "${resultToken}"]\n`;

    let movetext = "";
    for (let i = 0; i < sanMoves.length; i++) {
      const { san, emtMs } = sanMoves[i]!;
      if (i % 2 === 0) movetext += `${Math.floor(i / 2) + 1}. `;
      movetext += emtMs !== null ? `${san} { [%emt ${formatEmtForPgn(emtMs)}] } ` : `${san} `;
    }
    movetext += resultToken;

    return headers + "\n" + movetext;
  };

  const internalMoveFromUci = (state: import("./game/state.ts").GameState, fromUci: string, toUci: string): import("./game/moveTypes.ts").Move => {
    const from = uciSquareToNodeId(fromUci);
    const to = uciSquareToNodeId(toUci);

    const moving = state.board.get(from)?.[0] ?? null;
    if (!moving) throw new Error(`No piece at ${fromUci}`);

    const dest = state.board.get(to)?.[0] ?? null;

    // Normal capture: destination occupied by opponent.
    if (dest && dest.owner !== moving.owner) {
      return { kind: "capture", from, over: to, to };
    }

    // En passant capture: destination empty but matches current EP target.
    const epT = state.chess?.enPassantTarget;
    const epP = state.chess?.enPassantPawn;
    if (moving.rank === "P" && epT && epP && epT === to) {
      return { kind: "capture", from, over: epP, to };
    }

    return { kind: "move", from, to };
  };

  /**
   * Split a raw PGN text that may contain multiple games into individual game strings.
   * Each game starts with a header block (`[Tag "Value"]` lines) or, for bare move
   * lists, is treated as a single game.
   */
  const splitPgnGames = (raw: string): string[] => {
    // A new game boundary is a line that starts a header block after at least one
    // blank line (or after the start-of-file). We split on the pattern of a blank
    // line followed by a `[` at the start of a line.
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // Splitting strategy: find positions where a `[` begins a new tag block
    // after a run of non-header lines (i.e., after movetext + blank line(s)).
    const games: string[] = [];
    // Split on one-or-more blank lines that are followed by a `[Tag …` line.
    const parts = trimmed.split(/\n\s*\n(?=\s*\[)/);
    for (const part of parts) {
      const g = part.trim();
      if (g) games.push(g);
    }
    return games.length > 0 ? games : [trimmed];
  };

  /** Extract a human-readable label for a game from its PGN headers. */
  const pgnGameLabel = (gameText: string, index: number): string => {
    const header = (tag: string): string => {
      const m = gameText.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`, "i"));
      return m?.[1]?.trim() ?? "?";
    };
    const white = header("White");
    const black = header("Black");
    const result = header("Result");
    const date = header("Date").replace(/\?/g, "").replace(/\.$/, "").trim() || null;
    const event = header("Event") !== "?" ? header("Event") : null;
    const parts = [`${index + 1}. ${white} vs ${black}`];
    if (result && result !== "*" && result !== "?") parts.push(`(${result})`);
    if (date) parts.push(`— ${date}`);
    if (event) parts.push(`— ${event}`);
    return parts.join(" ");
  };

  const importSinglePgnGame = (gamePgn: string): void => {
    const chess = new Chess();
    let loadedOk = true;
    try {
      const res = (chess as any).loadPgn(gamePgn, { sloppy: true });
      if (res === false) loadedOk = false;
    } catch {
      loadedOk = false;
    }
    if (!loadedOk) {
      controller.toast("Invalid PGN", 2400, { force: true });
      return;
    }

    // Parse per-move timing comments from the raw PGN text.
    // Each move SAN in the movetext may be followed by a { comment }.
    // We extract them in order so they align with chess.js verboseMoves.
    const parsePgnEmtMs = (rawPgn: string): Array<number | null> => {
      // Strip only PGN header lines (lines of the form [Tag "value"]) so that
      // [%emt] and [%clk] annotations inside { } comments are preserved.
      const movetext = rawPgn.replace(/^\[.+\]\s*$/gm, "").replace(/\s+/g, " ").trim();

      type Tok = { type: "move" | "comment" | "num"; text: string };
      const tokens: Tok[] = [];
      let rem = movetext;
      while (rem.length > 0) {
        rem = rem.trimStart();
        if (rem.startsWith("{")) {
          const end = rem.indexOf("}");
          if (end < 0) break;
          tokens.push({ type: "comment", text: rem.slice(1, end) });
          rem = rem.slice(end + 1);
        } else {
          const nextBrace = rem.indexOf("{");
          const nextSpace = rem.search(/\s/);
          const end =
            nextBrace >= 0 && (nextSpace < 0 || nextBrace < nextSpace)
              ? nextBrace
              : nextSpace >= 0
              ? nextSpace
              : rem.length;
          const tok = rem.slice(0, end).trim();
          rem = rem.slice(end);
          if (!tok) continue;
          if (/^\d+\.+$/.test(tok)) {
            tokens.push({ type: "num", text: tok });
          } else if (tok !== "*" && tok !== "1-0" && tok !== "0-1" && tok !== "1/2-1/2") {
            tokens.push({ type: "move", text: tok });
          }
        }
      }

      // For each SAN token, the immediately following comment (if any) belongs to it.
      const extractMs = (comment: string): number | null => {
        // Prefer [%emt H:MM:SS] — directly gives elapsed time.
        const emt = comment.match(/\[%emt\s+(\d+):(\d+):(\d+)\]/i);
        if (emt) return (parseInt(emt[1]!) * 3600 + parseInt(emt[2]!) * 60 + parseInt(emt[3]!)) * 1000;
        // Fall back to [%clk H:MM:SS] — derive elapsed from clock delta.
        // We return a special sentinel object pair; caller resolves deltas.
        return null;
      };

      // Also gather [%clk] for delta computation.
      const extractClkMs = (comment: string): number | null => {
        const clk = comment.match(/\[%clk\s+(\d+):(\d+):(\d+)\]/i);
        if (!clk) return null;
        return (parseInt(clk[1]!) * 3600 + parseInt(clk[2]!) * 60 + parseInt(clk[3]!)) * 1000;
      };

      const result: Array<number | null> = [];
      // Track clock per side for delta computation: [whiteClkMs, blackClkMs]
      const prevClk: [number | null, number | null] = [null, null];

      let moveCount = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i]!.type !== "move") continue;
        const commentText = tokens[i + 1]?.type === "comment" ? tokens[i + 1]!.text : null;
        let ms = commentText ? extractMs(commentText) : null;
        if (ms === null && commentText) {
          // Try deriving from [%clk] delta.
          const clkMs = extractClkMs(commentText);
          if (clkMs !== null) {
            const sideIdx = moveCount % 2 as 0 | 1;
            const prev = prevClk[sideIdx];
            if (prev !== null && prev >= clkMs) ms = prev - clkMs;
            prevClk[sideIdx] = clkMs;
          }
        } else if (commentText) {
          // Update prevClk for any [%clk] also present alongside [%emt].
          const clkMs = extractClkMs(commentText);
          if (clkMs !== null) prevClk[moveCount % 2 as 0 | 1] = clkMs;
        }
        result.push(ms);
        moveCount++;
      }
      return result;
    };

    const emtMsPerMove = parsePgnEmtMs(gamePgn);
    const verboseMoves = chess.history({ verbose: true } as any) as any[];

    // Build an internal history by applying the parsed moves.
    const initial = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
    const hm = new HistoryManager();
    hm.push(initial);
    let s = initial;

    for (let idx = 0; idx < verboseMoves.length; idx++) {
      const mv = verboseMoves[idx];
      const fromUci = String(mv?.from ?? "").toLowerCase();
      const toUci = String(mv?.to ?? "").toLowerCase();
      if (!fromUci || !toUci) continue;

      const internal = internalMoveFromUci(s, fromUci, toUci);
      const next = applyMove(s, internal);
      s = next;
      // Keep imported move history consistent with the app's standard
      // coordinate notation (e.g. E2 → E4, G1 → F3, E5 × D6).
      const sep = internal.kind === "capture" ? " × " : " → ";
      const fromA1 = nodeIdToA1(internal.from, 8);
      const toA1 = nodeIdToA1(internal.to, 8);
      hm.push(s, `${fromA1}${sep}${toA1}`, emtMsPerMove[idx] ?? null);
    }

    // Parse player names and result directly from the raw PGN header lines —
    // more reliable than chess.js's header() API across versions.
    const parsePgnHeader = (tag: string): string => {
      const m = new RegExp(`^\\[${tag}\\s+"([^"]*)"]`, "im").exec(gamePgn);
      return m ? m[1]!.trim() : "";
    };

    // Detect the game result from the PGN and, if it was a resignation or
    // explicit draw, push a final forcedGameOver state so playback can surface
    // the reason (toast + status message) when the user steps to the last slide.
    const pgnResult = parsePgnHeader("Result");
    const lastSan = verboseMoves.length > 0 ? String((verboseMoves[verboseMoves.length - 1] as any)?.san ?? "") : "";
    const wasCheckmate = lastSan.endsWith("#");

    if (!wasCheckmate && (pgnResult === "1-0" || pgnResult === "0-1" || pgnResult === "1/2-1/2")) {
      const winner: "W" | "B" | null =
        pgnResult === "1-0" ? "W" : pgnResult === "0-1" ? "B" : null;

      let reasonCode: string;
      let message: string;

      if (pgnResult === "1/2-1/2") {
        reasonCode = "DRAW_AGREEMENT";
        message = "Draw by agreement";
      } else {
        // Decisive result but not checkmate — resignation.
        reasonCode = "RESIGN";
        const loserColor: "W" | "B" = winner === "W" ? "B" : "W";
        const winnerName = winner === "W" ? "White" : "Black";
        const loserName = loserColor === "W" ? "White" : "Black";
        message = `${loserName} resigned — ${winnerName} wins!`;
      }

      const finalState = {
        ...s,
        forcedGameOver: { winner, reasonCode, message },
      };
      hm.push(finalState, reasonCode === "RESIGN" ? "resign" : "draw");
      s = finalState;
    }

    controller.loadGame(s, hm.exportSnapshots());

    const isGenericName = (n: string) => !n || n === "?" || n === "White" || n === "Black" || n === "-";
    const rawWhite = parsePgnHeader("White");
    const rawBlack = parsePgnHeader("Black");
    setPlayerNames(
      isGenericName(rawWhite) ? "" : rawWhite,
      isGenericName(rawBlack) ? "" : rawBlack,
    );

    controller.toast("PGN imported", 1800, { force: true });
  };

  /**
   * Show a modal listing all games in a multi-game PGN so the user can pick one.
   * Calls `importSinglePgnGame` for the chosen game and closes both modals.
   */
  const showPgnGamePicker = (games: string[], onPick: () => void): void => {
    const styleId = "lasca-pgn-picker-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .pgnPickerBackdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.65);
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pgnPickerCard {
          width: min(92vw, 560px);
          max-height: min(86vh, 640px);
          border-radius: 14px;
          background: rgba(18,18,20,0.97);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 20px 60px rgba(0,0,0,0.7);
          padding: 16px 16px 12px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .pgnPickerTitle {
          font-size: 14px;
          font-weight: 800;
        }
        .pgnPickerHint {
          font-size: 11px;
          opacity: 0.7;
          margin-top: -4px;
        }
        .pgnPickerList {
          overflow-y: auto;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-right: 2px;
        }
        .pgnPickerItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          cursor: default;
        }
        .pgnPickerItem:hover { background: rgba(255,255,255,0.08); }
        .pgnPickerItemLabel {
          font-size: 12px;
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pgnPickerLoadBtn {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.92);
          border-radius: 7px;
          padding: 5px 12px;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .pgnPickerLoadBtn:hover { background: rgba(255,255,255,0.16); }
        .pgnPickerCancel {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.14);
          background: transparent;
          color: rgba(255,255,255,0.6);
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 12px;
          cursor: pointer;
          align-self: flex-end;
        }
        .pgnPickerCancel:hover { color: rgba(255,255,255,0.9); }
      `;
      document.head.appendChild(style);
    }

    const backdrop = document.createElement("div");
    backdrop.className = "pgnPickerBackdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Select a game to import");

    const card = document.createElement("div");
    card.className = "pgnPickerCard";

    const titleEl = document.createElement("div");
    titleEl.className = "pgnPickerTitle";
    titleEl.textContent = `${games.length} games found — choose one to import`;

    const hintEl = document.createElement("div");
    hintEl.className = "pgnPickerHint";
    hintEl.textContent = "Only classic chess (standard starting position) games can be imported.";

    const list = document.createElement("div");
    list.className = "pgnPickerList";

    const close = () => backdrop.remove();

    for (let i = 0; i < games.length; i++) {
      const gameText = games[i]!;
      const item = document.createElement("div");
      item.className = "pgnPickerItem";

      const label = document.createElement("div");
      label.className = "pgnPickerItemLabel";
      label.textContent = pgnGameLabel(gameText, i);
      label.title = label.textContent;

      const loadBtn = document.createElement("button");
      loadBtn.className = "pgnPickerLoadBtn";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", () => {
        close();
        onPick();
        importSinglePgnGame(gameText);
      });

      item.appendChild(label);
      item.appendChild(loadBtn);
      list.appendChild(item);
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "pgnPickerCancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", close);

    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) close(); });
    window.addEventListener("keydown", function onKey(ev) {
      if (ev.key === "Escape") { close(); window.removeEventListener("keydown", onKey); }
    });

    card.appendChild(titleEl);
    card.appendChild(hintEl);
    card.appendChild(list);
    card.appendChild(cancelBtn);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    (list.querySelector(".pgnPickerLoadBtn") as HTMLButtonElement | null)?.focus();
  };

  const importPgnText = (pgn: string, onModalClose?: () => void): void => {
    if (driver.mode === "online") {
      controller.toast("PGN import is offline-only for now", 2400, { force: true });
      return;
    }

    const text = String(pgn ?? "").trim();
    if (!text) {
      controller.toast("No PGN provided", 2000, { force: true });
      return;
    }

    const games = splitPgnGames(text);

    if (games.length > 1) {
      // Show the picker; each Load button calls importSinglePgnGame directly.
      showPgnGamePicker(games, () => onModalClose?.());
      return;
    }

    // Single game — import immediately.
    importSinglePgnGame(games[0] ?? text);
    onModalClose?.();
  };

  type PgnModalHandle = { open: (initialText?: string) => void; close: () => void };
  const ensurePgnPasteModal = (): PgnModalHandle => {
    const existing = document.getElementById("lascaPgnBackdrop") as HTMLDivElement | null;
    if (existing) {
      const ta = document.getElementById("lascaPgnText") as HTMLTextAreaElement | null;
      return {
        open: (t?: string) => {
          if (ta) ta.value = String(t ?? "");
          existing.classList.add("isOpen");
          ta?.focus();
        },
        close: () => existing.classList.remove("isOpen"),
      };
    }

    const styleId = "lasca-pgn-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .lascaPgnBackdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 99999;
          display: none;
        }
        .lascaPgnBackdrop.isOpen { display: block; }
        .lascaPgnCard {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 820px);
          max-height: min(86vh, 760px);
          overflow: hidden;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.90);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          padding: 14px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .lascaPgnTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .lascaPgnTitle { font-size: 14px; font-weight: 800; letter-spacing: 0.2px; }
        .lascaPgnHint { font-size: 12px; opacity: 0.85; }
        .lascaPgnText {
          width: 100%;
          flex: 1;
          min-height: 260px;
          resize: none;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 10px;
          padding: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.35;
          outline: none;
          overflow: auto;
        }
        .lascaPgnActions { display: flex; justify-content: flex-end; gap: 8px; }
        .lascaPgnBtn {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .lascaPgnBtn:hover { background: rgba(255,255,255,0.1); }
      `;
      document.head.appendChild(style);
    }

    const backdrop = document.createElement("div");
    backdrop.id = "lascaPgnBackdrop";
    backdrop.className = "lascaPgnBackdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "lascaPgnCard";

    const top = document.createElement("div");
    top.className = "lascaPgnTop";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "lascaPgnTitle";
    title.textContent = "Import PGN";
    const hint = document.createElement("div");
    hint.className = "lascaPgnHint";
    hint.textContent = "Paste a PGN (move list or full PGN with headers)";
    left.appendChild(title);
    left.appendChild(hint);

    const closeBtn = document.createElement("button");
    closeBtn.className = "lascaPgnBtn";
    closeBtn.textContent = "Close";

    top.appendChild(left);
    top.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.id = "lascaPgnText";
    textarea.className = "lascaPgnText";
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("wrap", "off");

    const actions = document.createElement("div");
    actions.className = "lascaPgnActions";

    const importBtn = document.createElement("button");
    importBtn.className = "lascaPgnBtn";
    importBtn.textContent = "Import";
    importBtn.addEventListener("click", () => {
      backdrop.classList.remove("isOpen");
      importPgnText(textarea.value);
    });

    actions.appendChild(importBtn);

    closeBtn.addEventListener("click", () => backdrop.classList.remove("isOpen"));
    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) backdrop.classList.remove("isOpen");
    });
    window.addEventListener("keydown", (ev) => {
      if (!backdrop.classList.contains("isOpen")) return;
      if (ev.key === "Escape") backdrop.classList.remove("isOpen");
    });

    card.appendChild(top);
    card.appendChild(textarea);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    return {
      open: (t?: string) => {
        textarea.value = String(t ?? "");
        backdrop.classList.add("isOpen");
        textarea.focus();
      },
      close: () => backdrop.classList.remove("isOpen"),
    };
  };

  // Returns true if at least one move has been played in the current game
  // (i.e. there is something to lose on import).
  const hasMovesMade = (): boolean => {
    const snap = driver.exportHistorySnapshots();
    return snap.currentIndex > 0;
  };

  // Returns false if the user cancels, true if they confirm (or there is nothing to lose).
  const confirmPgnImportOverwrite = (): boolean => {
    if (driver.mode === "online") return true; // online import will be rejected anyway
    if (!hasMovesMade()) return true;
    return window.confirm("Importing a PGN will replace the current game. The current game will be lost. Continue?");
  };

  if (importPgnPasteBtn) {
    importPgnPasteBtn.addEventListener("click", () => {
      if (!confirmPgnImportOverwrite()) return;
      const modal = ensurePgnPasteModal();
      modal.open("");
    });
  }

  if (importPgnFileBtn && importPgnInput) {
    importPgnFileBtn.addEventListener("click", () => {
      if (!confirmPgnImportOverwrite()) return;
      importPgnInput.click();
    });
    importPgnInput.addEventListener("change", async () => {
      const file = importPgnInput.files?.[0];
      if (!file) return;
      try {
        const text = await readFileText(file);
        importPgnText(text);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        controller.toast(`Failed to import PGN: ${msg}`, 2600, { force: true });
      }
      importPgnInput.value = "";
    });
  }

  if (exportPgnBtn) {
    exportPgnBtn.addEventListener("click", () => {
      const exportPgnTimingToggle = document.getElementById("exportPgnTimingToggle") as HTMLInputElement | null;
      const includeTiming = exportPgnTimingToggle?.checked ?? false;
      try {
        const pgn = exportCurrentLineToPgnText(includeTiming);
        const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
        const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const pgnNamePart = playerNameFilePart(resultSuffixFromState(controller.getState()));
        a.download = pgnNamePart
          ? `${pgnNamePart} -- ${timestamp}.pgn`
          : `chess -- ${timestamp}.pgn`;
        a.click();
        URL.revokeObjectURL(url);
        controller.toast("PGN exported", 1600);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        controller.toast(`Failed to export PGN: ${msg}`, 2800, { force: true });
      }
    });
  }

  // Undo / Redo
  const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement | null;
  const moveHistoryEl = document.getElementById("moveHistory") as HTMLElement | null;
  const moveHistoryLayoutSel = document.getElementById("moveHistoryLayout") as HTMLSelectElement | null;

  type MoveHistoryLayout = "single" | "two";
  const MOVE_HISTORY_LAYOUT_KEY = "lasca.moveHistoryLayout";
  const readMoveHistoryLayout = (): MoveHistoryLayout => {
    const raw = String(window.localStorage.getItem(MOVE_HISTORY_LAYOUT_KEY) ?? "").trim();
    return raw === "two" || raw === "single" ? (raw as MoveHistoryLayout) : "single";
  };
  const writeMoveHistoryLayout = (layout: MoveHistoryLayout) => {
    try {
      window.localStorage.setItem(MOVE_HISTORY_LAYOUT_KEY, layout);
    } catch {
      // ignore
    }
  };

  let moveHistoryLayout: MoveHistoryLayout = readMoveHistoryLayout();
  if (moveHistoryLayoutSel) {
    moveHistoryLayoutSel.value = moveHistoryLayout;
    moveHistoryLayoutSel.addEventListener("change", () => {
      const v = String(moveHistoryLayoutSel.value);
      moveHistoryLayout = v === "two" ? "two" : "single";
      writeMoveHistoryLayout(moveHistoryLayout);
      updateHistoryUI("jump");
    });
  }

  const inferMovedPieceSymbolId = (
    prev: import("./game/state.ts").GameState | undefined,
    next: import("./game/state.ts").GameState | undefined,
    whoMoved: "W" | "B",
    notation: string
  ): string | null => {
    const promo = /\=([QRBN])/.exec(String(notation ?? ""));
    if (promo?.[1]) return `${whoMoved}_${promo[1]}`;
    if (/^O-O(-O)?/.test(String(notation ?? ""))) return `${whoMoved}_K`;

    const topAt = (s: import("./game/state.ts").GameState | undefined, nodeId: string) => {
      try {
        const stack = s?.board.get(nodeId);
        return stack && stack.length ? stack[stack.length - 1] : null;
      } catch {
        return null;
      }
    };

    // Prefer authoritative last-move hints when present.
    const lm = next?.ui?.lastMove as any;
    const fromHint = lm?.from as string | undefined;
    const toHint = lm?.to as string | undefined;
    if (prev && next && fromHint && toHint) {
      const p = topAt(prev, fromHint);
      if (p && p.owner === whoMoved && p.rank) return `${whoMoved}_${p.rank}`;
      const q = topAt(next, toHint);
      if (q && q.owner === whoMoved && q.rank) return `${whoMoved}_${q.rank}`;
    }

    // Fallback: infer moved piece by diffing consecutive snapshots.
    if (!prev || !next) return null;
    const keys = new Set<string>();
    for (const k of prev.board.keys()) keys.add(k);
    for (const k of next.board.keys()) keys.add(k);

    const fromCandidates: string[] = [];
    const toCandidates: string[] = [];

    for (const k of keys) {
      const a = topAt(prev, k) as any;
      const b = topAt(next, k) as any;
      const aSig = a ? `${a.owner}:${a.rank}` : "";
      const bSig = b ? `${b.owner}:${b.rank}` : "";
      if (aSig === bSig) continue;

      if (a && a.owner === whoMoved) fromCandidates.push(k);
      if (b && b.owner === whoMoved) toCandidates.push(k);
    }

    if (fromCandidates.length === 1) {
      const p = topAt(prev, fromCandidates[0]!) as any;
      if (p?.rank) return `${whoMoved}_${p.rank}`;
    }
    if (toCandidates.length === 1) {
      const p = topAt(next, toCandidates[0]!) as any;
      if (p?.rank) return `${whoMoved}_${p.rank}`;
    }

    // If we can't disambiguate (e.g. missing hints for castling), fall back to SAN prefix.
    const first = String(notation ?? "").trim()[0];
    const rank = first && /[KQRBN]/.test(first) ? first : "P";
    return `${whoMoved}_${rank}`;
  };

  const pieceTooltipFromSymbolId = (symbolId: string, whoMoved: "W" | "B"): string => {
    const color = whoMoved === "W" ? "White" : "Black";
    const rank = symbolId.split("_")[1] ?? "";
    const piece =
      rank === "K" ? "King"
      : rank === "Q" ? "Queen"
      : rank === "R" ? "Rook"
      : rank === "B" ? "Bishop"
      : rank === "N" ? "Knight"
      : rank === "P" ? "Pawn"
      : "Piece";
    return `${color} ${piece}`;
  };

  const escapeHtmlAttr = (raw: string): string =>
    String(raw)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const isTakeMoveNotation = (notation: string | undefined): boolean => {
    const n = String(notation ?? "");
    // SAN captures use "x" (occasionally "×" in some UIs).
    return /x|×/.test(n);
  };

  const inferCapturedPieceSymbolId = (
    prev: import("./game/state.ts").GameState | undefined,
    next: import("./game/state.ts").GameState | undefined,
    whoMoved: "W" | "B"
  ): string | null => {
    if (!prev || !next) return null;
    const opp: "W" | "B" = whoMoved === "W" ? "B" : "W";

    const topAt = (s: import("./game/state.ts").GameState | undefined, nodeId: string) => {
      try {
        const stack = s?.board.get(nodeId);
        return stack && stack.length ? stack[stack.length - 1] : null;
      } catch {
        return null;
      }
    };

    const keys = new Set<string>();
    for (const k of prev.board.keys()) keys.add(k);
    for (const k of next.board.keys()) keys.add(k);

    let bestRank: string | null = null;
    let fallbackRank: string | null = null;

    for (const k of keys) {
      const a = topAt(prev, k) as any;
      const b = topAt(next, k) as any;
      if (!a || a.owner !== opp || !a.rank) continue;

      const changed = !b || b.owner !== a.owner || b.rank !== a.rank;
      if (!changed) continue;

      // Prefer "replaced" captures: opponent on a square becomes mover on that square.
      if (b && b.owner === whoMoved) {
        bestRank = String(a.rank);
        break;
      }
      // Otherwise (e.g. en passant), opponent piece just disappears.
      fallbackRank = String(a.rank);
    }

    const rank = bestRank ?? fallbackRank;
    if (!rank) return null;
    return `${opp}_${rank}`;
  };

  const inferCaptureTooltip = (
    prev: import("./game/state.ts").GameState | undefined,
    next: import("./game/state.ts").GameState | undefined,
    whoMoved: "W" | "B",
    moverSymbolId: string | null,
    notation: string | undefined
  ): string | null => {
    if (!moverSymbolId) return null;
    if (!isTakeMoveNotation(notation)) return null;

    const capturer = pieceTooltipFromSymbolId(moverSymbolId, whoMoved);
    const capturedSym = inferCapturedPieceSymbolId(prev, next, whoMoved);
    if (!capturedSym) return null;
    const opp: "W" | "B" = whoMoved === "W" ? "B" : "W";
    const captured = pieceTooltipFromSymbolId(capturedSym, opp);
    return `${capturer} takes ${captured}`;
  };

  const updateHistoryUI = (reason?: import("./controller/gameController.ts").HistoryChangeReason) => {
    if (undoBtn) undoBtn.disabled = !controller.canUndo();
    if (redoBtn) redoBtn.disabled = !controller.canRedo();

    if (!moveHistoryEl) return;

    const historyData = controller.getHistory();
    if (historyData.length === 0) {
      moveHistoryEl.textContent = "No moves yet";
    } else {
      const snap = driver.exportHistorySnapshots();

      const pawnSvg = (who: "W" | "B") =>
        `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.05em; height: 1.05em; vertical-align: -0.18em; margin-right: 6px;"><use href="#${who}_P"></use></svg>`;

      const renderMoveCell = (entry: (typeof historyData)[number], idx: number) => {
        const whoMoved = entry.toMove === "B" ? "W" : "B";
        const prev = snap.states[idx - 1];
        const next = snap.states[idx];
        const symId = inferMovedPieceSymbolId(prev, next, whoMoved, entry.notation);
        const captureTooltip = inferCaptureTooltip(prev, next, whoMoved, symId, entry.notation);
        const pieceTooltip = symId
          ? pieceTooltipFromSymbolId(symId, whoMoved)
          : (whoMoved === "W" ? "White" : "Black");
        const pieceTooltipEsc = escapeHtmlAttr(pieceTooltip);
        const pieceSvg = symId
          ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.05em; height: 1.05em; vertical-align: -0.18em; margin: 0 4px 0 2px;"><title>${pieceTooltipEsc}</title><use href="#${symId}"></use></svg>`
          : (whoMoved === "B" ? "⚫" : "⚪");
        const pieceIcon = `<span title="${pieceTooltipEsc}" style="display: inline-flex; align-items: center;">${pieceSvg}</span>`;
        let label = `${pieceIcon}`;
        if (entry.notation) label += ` ${entry.notation}`;
        const cls = `cell clickable${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        const titleAttr = captureTooltip ? ` title="${escapeHtmlAttr(captureTooltip)}"` : "";
        return `<div class="${cls}" data-history-index="${entry.index}"${currentAttr}${titleAttr}>${label}</div>`;
      };

      const renderStartCell = (entry: (typeof historyData)[number]) => {
        const cls = `cell clickable start${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        return `<div class="${cls}" data-history-index="${entry.index}"${currentAttr}>Start</div>`;
      };

      if (moveHistoryLayout === "two") {
        const totalMoves = Math.ceil((historyData.length - 1) / 2);
        const parts: string[] = [];
        parts.push('<div class="historyGrid">');
        parts.push('<div class="cell hdr">#</div>');
        parts.push(`<div class="cell hdr">${pawnSvg("W")}White</div>`);
        parts.push(`<div class="cell hdr">${pawnSvg("B")}Black</div>`);

        // Render Start under the header.
        parts.push(renderStartCell(historyData[0]!));

        for (let m = 1; m <= totalMoves; m++) {
          const whiteIdx = 2 * m - 1;
          const blackIdx = 2 * m;
          parts.push(`<div class="cell num">${m}.</div>`);

          const whiteEntry = historyData[whiteIdx];
          const blackEntry = historyData[blackIdx];

          if (whiteEntry) parts.push(renderMoveCell(whiteEntry, whiteIdx));
          else parts.push('<div class="cell"></div>');

          if (blackEntry) parts.push(renderMoveCell(blackEntry, blackIdx));
          else parts.push('<div class="cell"></div>');
        }

        parts.push("</div>");
        moveHistoryEl.innerHTML = parts.join("");
      } else {
        moveHistoryEl.innerHTML = historyData
          .map((entry, idx) => {
            if (idx === 0) {
              const baseStyle = entry.isCurrent
                ? "font-weight: bold; color: rgba(255, 255, 255, 0.95);"
                : "";
              const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
              const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
              return `<div data-history-index=\"${entry.index}\"${currentAttr} style=\"${style}\">Start</div>`;
            }

            // For moves: toMove indicates who's about to move, so invert to get who just moved.
            const whoMoved = entry.toMove === "B" ? "W" : "B";
            const moveNum =
              whoMoved === "B" ? Math.ceil(idx / 2) : Math.floor((idx + 1) / 2);

            const prev = snap.states[idx - 1];
            const next = snap.states[idx];
            const symId = inferMovedPieceSymbolId(prev, next, whoMoved, entry.notation);
            const captureTooltip = inferCaptureTooltip(prev, next, whoMoved, symId, entry.notation);
            const pieceTooltip = symId
              ? pieceTooltipFromSymbolId(symId, whoMoved)
              : (whoMoved === "W" ? "White" : "Black");
            const pieceTooltipEsc = escapeHtmlAttr(pieceTooltip);
            const pieceSvg = symId
              ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.05em; height: 1.05em; vertical-align: -0.18em; margin: 0 4px 0 2px;"><title>${pieceTooltipEsc}</title><use href="#${symId}"></use></svg>`
              : (whoMoved === "B" ? "⚫" : "⚪");
            const pieceIcon = `<span title=\"${pieceTooltipEsc}\" style=\"display: inline-flex; align-items: center;\">${pieceSvg}</span>`;

            let label = `${moveNum}. ${pieceIcon}`;
            if (entry.notation) label += ` ${entry.notation}`;

            const baseStyle = entry.isCurrent
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95);"
              : "";
            const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
            const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
            const titleAttr = captureTooltip ? ` title=\"${escapeHtmlAttr(captureTooltip)}\"` : "";
            return `<div data-history-index=\"${entry.index}\" data-history-who=\"${whoMoved}\"${currentAttr}${titleAttr} style=\"${style}\">${label}</div>`;
          })
          .join("");
      }
    }

    // Keep the latest move visible.
    // Use rAF so layout reflects the updated HTML before scrolling.
    requestAnimationFrame(() => {
      if (reason === "jump" || reason === "undo" || reason === "redo") {
        const currentEl = moveHistoryEl.querySelector('[data-is-current="1"]') as HTMLElement | null;
        if (currentEl) currentEl.scrollIntoView({ block: "nearest" });
        return;
      }
      moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
    });
  };

  if (moveHistoryEl) {
    moveHistoryEl.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      const entryEl = target.closest("[data-history-index]") as HTMLElement | null;
      if (!entryEl) return;
      const index = Number(entryEl.dataset.historyIndex);
      if (!Number.isFinite(index)) return;
      controller.jumpToHistory(index);
    });

    // Right-click context menu: Copy FEN for any history position.
    const ensureHistoryMenu = (): HTMLDivElement => {
      const id = "lascaHistoryContextMenu";
      const existing = document.getElementById(id) as HTMLDivElement | null;
      if (existing) return existing;

      const menu = document.createElement("div");
      menu.id = id;
      menu.style.position = "fixed";
      menu.style.zIndex = "99999";
      menu.style.minWidth = "140px";
      menu.style.padding = "6px";
      menu.style.borderRadius = "10px";
      menu.style.border = "1px solid rgba(255,255,255,0.18)";
      menu.style.background = "rgba(0,0,0,0.92)";
      menu.style.color = "rgba(255,255,255,0.92)";
      menu.style.boxShadow = "0 12px 38px rgba(0,0,0,0.55)";
      menu.style.display = "none";
      menu.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      menu.style.fontSize = "12px";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Copy FEN";
      btn.style.width = "100%";
      btn.style.textAlign = "left";
      btn.style.padding = "8px 10px";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid rgba(255,255,255,0.12)";
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "rgba(255,255,255,0.92)";
      btn.style.cursor = "pointer";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(255,255,255,0.10)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(255,255,255,0.06)";
      });

      menu.appendChild(btn);
      document.body.appendChild(menu);

      const hide = () => {
        menu.style.display = "none";
        delete (menu as any).dataset.historyIndex;
      };

      window.addEventListener("click", () => hide());
      window.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") hide();
      });
      window.addEventListener("scroll", () => hide(), { passive: true });

      btn.addEventListener("click", async () => {
        const raw = (menu as any).dataset.historyIndex;
        const idx = Number(raw);
        hide();
        if (!Number.isFinite(idx)) return;
        try {
          const snap = driver.exportHistorySnapshots();
          const stateAt = snap.states[idx];
          if (!stateAt) return;
          const fen = gameStateToFen(stateAt, { halfmove: 0, fullmove: 1 });
          const ok = await controller.copyText(fen);
          controller.toast(ok ? "Copied FEN" : "Clipboard copy failed", 1800, { force: true });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          controller.toast(`Failed to copy FEN: ${msg}`, 2600, { force: true });
        }
      });

      return menu;
    };

    moveHistoryEl.addEventListener("contextmenu", (ev) => {
      const target = ev.target as HTMLElement;
      const entryEl = target.closest("[data-history-index]") as HTMLElement | null;
      if (!entryEl) return;
      ev.preventDefault();
      const index = Number(entryEl.dataset.historyIndex);
      if (!Number.isFinite(index)) return;

      const menu = ensureHistoryMenu();
      (menu as any).dataset.historyIndex = String(index);

      // Position menu, clamped to viewport.
      const pad = 8;
      const w = 160;
      const h = 44;
      const x = Math.min(window.innerWidth - w - pad, Math.max(pad, ev.clientX));
      const y = Math.min(window.innerHeight - h - pad, Math.max(pad, ev.clientY));
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.display = "block";
    });
  }

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      controller.undo();
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      controller.redo();
    });
  }

  bindAnalysisToggleButton(controller);
  bindFullScreenButton();
  bindGameHotkeys(controller);
  bindKeyboardShortcutsContextMenu(controller);

  controller.addHistoryChangeCallback(updateHistoryUI);
  updateHistoryUI();

  bindPlaybackControls(controller);

  if (import.meta.hot) {
    import.meta.hot.accept(() => {
      applyBoardCoords();
      window.location.reload();
    });
  }
});
