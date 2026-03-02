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
import {
  bindAnalysisToggleButton,
  bindFullScreenButton,
  bindGameHotkeys,
  bindKeyboardShortcutsContextMenu,
} from "./ui/gameShortcuts.ts";

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

  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), variant.boardSize, {
      flipped: isFlipped(),
      style: boardCoordsInSquaresToggle?.checked ? "inSquare" : "edge",
    });
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
  installBoardVisualizationTools(svg);
  const driver = await createDriverAsync({
    state,
    history,
    search: window.location.search,
    envMode: import.meta.env.VITE_PLAY_MODE,
    envServerUrl: import.meta.env.VITE_SERVER_URL,
  });

  const controller = new GameController(svg, piecesLayer, inspector as any, state, history, driver);
  controller.bind();

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
      applyBoardCoords();
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
      const ok = confirm("Start a new Chess game? Current game will be lost.");
      if (!ok) return;
      controller.newGame(createInitialGameStateForVariant(ACTIVE_VARIANT_ID));
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

  // Save / Load
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const currentState = controller.getState();
      saveGameToFile(currentState, history, variant.defaultSaveName ?? "chess-save.json");
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

  const exportCurrentLineToPgnText = (): string => {
    const moves = deriveChessJsMovesFromHistory();
    const chess = new Chess();

    for (const m of moves) {
      const ok = chess.move(m as any);
      if (!ok) {
        throw new Error(`Failed to convert history to PGN at move ${m.from}-${m.to}`);
      }
    }

    return chess.pgn({ newline_char: "\n" } as any);
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

  const importPgnText = (pgn: string): void => {
    if (driver.mode === "online") {
      controller.toast("PGN import is offline-only for now", 2400, { force: true });
      return;
    }

    const text = String(pgn ?? "").trim();
    if (!text) {
      controller.toast("No PGN provided", 2000, { force: true });
      return;
    }

    const chess = new Chess();
    let loadedOk = true;
    try {
      const res = (chess as any).loadPgn(text, { sloppy: true });
      if (res === false) loadedOk = false;
    } catch {
      loadedOk = false;
    }
    if (!loadedOk) {
      controller.toast("Invalid PGN", 2400, { force: true });
      return;
    }

    const verboseMoves = chess.history({ verbose: true } as any) as any[];

    // Build an internal history by applying the parsed moves.
    const initial = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
    const hm = new HistoryManager();
    hm.push(initial);
    let s = initial;

    for (const mv of verboseMoves) {
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
      hm.push(s, `${fromA1}${sep}${toA1}`);
    }

    controller.loadGame(s, hm.exportSnapshots());
    controller.toast("PGN imported", 1800, { force: true });
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
      importPgnText(textarea.value);
      backdrop.classList.remove("isOpen");
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

  if (importPgnPasteBtn) {
    importPgnPasteBtn.addEventListener("click", () => {
      const modal = ensurePgnPasteModal();
      modal.open("");
    });
  }

  if (importPgnFileBtn && importPgnInput) {
    importPgnFileBtn.addEventListener("click", () => importPgnInput.click());
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
      try {
        const pgn = exportCurrentLineToPgnText();
        const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
        const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chess-${timestamp}.pgn`;
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
