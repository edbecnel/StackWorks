import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager, THEME_DID_CHANGE_EVENT, THEME_WILL_CHANGE_EVENT } from "./theme/themeManager";
import columnsChessBoardSvgUrl from "./assets/columns_chess_board.svg?url";
import { renderGameState } from "./render/renderGameState";
import { createStackInspector } from "./ui/stackInspector";
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
import { createBoardLoadingOverlay } from "./ui/boardLoadingOverlay";
import { nextPaint } from "./ui/nextPaint";
import { ColumnsChessBotManager } from "./bot/columnsChessBotManager.ts";
import { installBoardVisualizationTools } from "./ui/boardVisualizationTools";

const ACTIVE_VARIANT_ID: VariantId = "columns_chess";

const LS_OPT_KEYS = {
  showResizeIcon: "lasca.opt.showResizeIcon",
  boardCoords: "lasca.opt.boardCoords",
  boardCoordsInSquares: "lasca.opt.boardCoordsInSquares",
  flipBoard: "lasca.opt.columnsChess.flipBoard",
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
    gameTitleEl.textContent = `${variant.displayName}`;
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
  const savedFlip = readOptionalBoolPref(LS_OPT_KEYS.flipBoard);
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
  const THEME_KEY = "lasca.columnsChess.theme";
  const themeFromQueryRaw = new URLSearchParams(window.location.search).get("theme")?.trim();
  const themeFromQuery = themeFromQueryRaw && themeFromQueryRaw.length > 0 ? themeFromQueryRaw : null;

  const normalizeColumnsTheme = (raw: string | null | undefined): "columns_classic" | "raster2d" | "raster3d" | "neo" => {
    const v = (raw ?? "").toLowerCase().trim();
    if (v === "neo") return "neo";
    if (v === "raster3d" || v === "3d") return "raster3d";
    if (v === "raster2d" || v === "2d") return "raster2d";
    if (v === "columns_classic" || v === "classic" || v === "discs" || v === "disc") return "columns_classic";
    return "columns_classic";
  };

  const savedTheme = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();

  const initialThemeId = normalizeColumnsTheme(themeFromQuery ?? savedTheme);
  await themeManager.setTheme(initialThemeId);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");

  const zoomTitle = document.getElementById("zoomTitle") as HTMLElement | null;
  const zoomHint = document.getElementById("zoomHint") as HTMLElement | null;
  const zoomBody = document.getElementById("zoomBody") as HTMLElement | null;
  if (!zoomTitle || !zoomHint || !zoomBody) throw new Error("Missing inspector DOM nodes (zoomTitle/zoomHint/zoomBody)");

  const zoomSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  zoomSvg.id = "zoomSvg";
  zoomSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  zoomSvg.setAttribute("viewBox", "0 0 120 200");
  zoomSvg.setAttribute("role", "img");
  zoomSvg.setAttribute("aria-label", "Stack column");
  zoomBody.replaceChildren(zoomSvg);

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg);

  // Wrap the inspector so it can display coords matching the current board orientation.
  const orientedInspector = {
    ...inspector,
    show: (nodeId: string, stack: Stack, opts: { rulesetId?: string; boardSize?: number } = {}) =>
      inspector.show(nodeId, stack, { ...opts, flipCoords: isFlipped() }),
  };

  const state = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
  const history = new HistoryManager();
  history.push(state);

  renderGameState(svg, piecesLayer, orientedInspector as any, state);

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

  const controller = new GameController(svg, piecesLayer, orientedInspector as any, state, history, driver);
  controller.bind();

  // Offline-only: Bot controls (Columns Chess fallback bot).
  if (driver.mode !== "online") {
    const bot = new ColumnsChessBotManager(controller);
    bot.bind();
  } else {
    // Hide bot panel in online mode.
    const botSection = document.querySelector('[data-section="bot"]') as HTMLElement | null;
    if (botSection) botSection.style.display = "none";
  }

  // Columns Chess: theme select (Discs / 2D / 3D / Neo) + Neo PNG availability hint.
  {
    const themeSelect = document.getElementById("columnsThemeSelect") as HTMLSelectElement | null;

    const setSelectValueForThemeId = (themeId: "columns_classic" | "raster2d" | "raster3d" | "neo") => {
      if (!themeSelect) return;
      themeSelect.value = themeId === "neo" ? "neo" : (themeId === "raster3d" ? "3d" : themeId === "raster2d" ? "2d" : "discs");
    };

    setSelectValueForThemeId(initialThemeId);

    if (themeSelect) {
      themeSelect.addEventListener("change", async () => {
        const picked =
          themeSelect.value === "neo"
            ? "neo"
            : (themeSelect.value === "3d" ? "raster3d" : themeSelect.value === "2d" ? "raster2d" : "columns_classic");
        await themeManager.setTheme(picked);
        try {
          localStorage.setItem(THEME_KEY, picked);
        } catch {
          // ignore
        }
      });
    }
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
      const ok = confirm("Start a new Columns Chess game? Current game will be lost.");
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

  // Save / Load (offline only for Columns Chess today, but works regardless).
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const currentState = controller.getState();
      saveGameToFile(currentState, history, "columns_chess-save.json");
    });
  }
  if (loadGameBtn && loadGameInput) {
    loadGameBtn.addEventListener("click", () => loadGameInput.click());
    loadGameInput.addEventListener("change", async () => {
      const file = loadGameInput.files?.[0];
      if (!file) return;
      try {
        const loaded = await loadGameFromFile(file, {
          variantId: "columns_chess",
          rulesetId: "columns_chess",
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

    const lm = next?.ui?.lastMove as any;
    const fromHint = lm?.from as string | undefined;
    const toHint = lm?.to as string | undefined;
    if (prev && next && fromHint && toHint) {
      const p = topAt(prev, fromHint) as any;
      if (p && p.owner === whoMoved && p.rank) return `${whoMoved}_${p.rank}`;
      const q = topAt(next, toHint) as any;
      if (q && q.owner === whoMoved && q.rank) return `${whoMoved}_${q.rank}`;
    }

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

  const pawnHeaderSvg = (who: "W" | "B") =>
    `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.1em; height: 1.1em; vertical-align: -0.18em; margin-right: 6px;"><use href="#${who}_P"></use></svg>`;

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
        const tooltip = symId
          ? pieceTooltipFromSymbolId(symId, whoMoved)
          : (whoMoved === "W" ? "White" : "Black");
        const pieceSvg = symId
          ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.05em; height: 1.05em; vertical-align: -0.18em; margin: 0 4px 0 2px;"><use href="#${symId}"></use></svg>`
          : (whoMoved === "B" ? "⚫" : "⚪");
        const pieceIcon = `<span title="${tooltip}" style="display: inline-flex; align-items: center;">${pieceSvg}</span>`;
        let label = `${pieceIcon}`;
        if (entry.notation) label += ` ${entry.notation}`;
        const cls = `cell clickable${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        return `<div class="${cls}" data-history-index="${entry.index}"${currentAttr}>${label}</div>`;
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

        // Header above Start.
        parts.push('<div class="cell hdr">#</div>');
        parts.push(`<div class="cell hdr">${pawnSvg("W")}White</div>`);
        parts.push(`<div class="cell hdr">${pawnSvg("B")}Black</div>`);

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

            const whoMoved = entry.toMove === "B" ? "W" : "B";
            const moveNum =
              whoMoved === "B" ? Math.ceil(idx / 2) : Math.floor((idx + 1) / 2);

            const prev = snap.states[idx - 1];
            const next = snap.states[idx];
            const symId = inferMovedPieceSymbolId(prev, next, whoMoved, entry.notation);
            const tooltip = symId
              ? pieceTooltipFromSymbolId(symId, whoMoved)
              : (whoMoved === "W" ? "White" : "Black");
            const pieceSvg = symId
              ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" style="width: 1.05em; height: 1.05em; vertical-align: -0.18em; margin: 0 4px 0 2px;"><use href="#${symId}"></use></svg>`
              : (whoMoved === "B" ? "⚫" : "⚪");
            const pieceIcon = `<span title=\"${tooltip}\" style=\"display: inline-flex; align-items: center;\">${pieceSvg}</span>`;

            let label = `${moveNum}. ${pieceIcon}`;
            if (entry.notation) label += ` ${entry.notation}`;

            const baseStyle = entry.isCurrent
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95);"
              : "";
            const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
            const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
            return `<div data-history-index=\"${entry.index}\" data-history-who=\"${whoMoved}\"${currentAttr} style=\"${style}\">${label}</div>`;
          })
          .join("");
      }
    }

    // Keep the latest move visible.
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

  // Analysis mode (local-only sandbox; does not submit moves).
  const analysisToggleBtn = document.getElementById("analysisToggleBtn") as HTMLButtonElement | null;
  const syncAnalysisToggleBtn = () => {
    if (!analysisToggleBtn) return;
    const on = controller.isAnalysisMode();
    analysisToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    analysisToggleBtn.textContent = on ? "Analysis Mode: On" : "Analysis Mode: Off";
  };
  if (analysisToggleBtn) {
    syncAnalysisToggleBtn();
    analysisToggleBtn.addEventListener("click", () => {
      controller.setAnalysisMode(!controller.isAnalysisMode());
      syncAnalysisToggleBtn();
    });
  }

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
