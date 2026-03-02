import { createInitialGameStateForVariant } from "./game/state.ts";
import type { GameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { initCollapsibleSections } from "./ui/layout/collapsibleSections";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager, THEME_CHANGE_EVENT, THEME_DID_CHANGE_EVENT, THEME_WILL_CHANGE_EVENT } from "./theme/themeManager";
import chessBoardSvgUrl from "./assets/chess_board.svg?url";
import graphBoard8x8SvgUrl from "./assets/graph_board_8x8.svg?url";
import type { Player } from "./types";
import { GameController } from "./controller/gameController.ts";
import { ensureOverlayLayer } from "./render/overlays.ts";
import { ALL_NODES } from "./game/board.ts";
import { saveGameToFile, loadGameFromFile } from "./game/saveLoad.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { RULES } from "./game/ruleset.ts";
import { renderBoardCoords } from "./render/boardCoords";
import { AIManager } from "./ai/aiManager.ts";
import { bindEvaluationPanel } from "./ui/evaluationPanel";
import { bindPlaybackControls } from "./ui/playbackControls.ts";
import {
  bindAnalysisToggleButton,
  bindFullScreenButton,
  bindGameHotkeys,
  bindKeyboardShortcutsContextMenu,
} from "./ui/gameShortcuts.ts";
import { installHoldDrag } from "./ui/holdDrag";
import { getVariantById, isVariantId, rulesBoardLine } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import { createDriverAsync, consumeStartupMessage } from "./driver/createDriver.ts";
import type { OnlineGameDriver } from "./driver/gameDriver.ts";
import { createSfxManager } from "./ui/sfx";
import { createPrng } from "./shared/prng.ts";
import {
  applyCheckerboardTheme,
  normalizeCheckerboardThemeId,
  type CheckerboardThemeId,
} from "./render/checkerboardTheme";
import { createBoardLoadingOverlay } from "./ui/boardLoadingOverlay";
import { nextPaint } from "./ui/nextPaint";
import { setBoardFlipped } from "./render/boardFlip";
import { setStackWorksGameTitle } from "./ui/gameTitle";
import { getSideLabelsForRuleset } from "./shared/sideTerminology";

const FALLBACK_VARIANT_ID: VariantId = "dama_8_classic_standard";

function getActiveDamaVariantId(): VariantId {
  const raw = window.localStorage.getItem("lasca.variantId");
  if (raw && isVariantId(raw)) {
    const v = getVariantById(raw);
    if (v.rulesetId === "dama" || v.rulesetId === "checkers_us") return v.variantId;
  }
  return FALLBACK_VARIANT_ID;
}

const ACTIVE_VARIANT_ID: VariantId = getActiveDamaVariantId();

const LS_OPT_KEYS = {
  moveHints: "lasca.opt.moveHints",
  animations: "lasca.opt.animations",
  lastMoveHighlights: "lasca.opt.lastMoveHighlights",
  showResizeIcon: "lasca.opt.showResizeIcon",
  boardCoords: "lasca.opt.boardCoords",
  flipBoard: "lasca.opt.flipBoard",
  board8x8Checkered: "lasca.opt.board8x8Checkered",
  checkerboardTheme: "lasca.opt.checkerboardTheme",
  threefold: "lasca.opt.threefold",
  toasts: "lasca.opt.toasts",
  sfx: "lasca.opt.sfx",
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

function setSvgFavicon(svgMarkup: string): void {
  try {
    const link =
      (document.querySelector('link[rel="icon"]') as HTMLLinkElement | null) ??
      (document.querySelector('link[rel="shortcut icon"]') as HTMLLinkElement | null);

    const next = link ?? document.createElement("link");
    next.rel = "icon";
    next.type = "image/svg+xml";
    next.sizes = "any";
    next.href = `data:image/svg+xml,${encodeURIComponent(svgMarkup)}`;
    if (!link) document.head.appendChild(next);
  } catch {
    // ignore
  }
}

function updatePlayerColorBadge(driver: unknown, rulesetId: string, boardSize: number): void {
  const el = document.getElementById("playerColorBadge") as HTMLElement | null;
  if (!el) return;
  const anyDriver = driver as any;
  if (!anyDriver || anyDriver.mode !== "online" || typeof anyDriver.getPlayerColor !== "function") return;

  const color = (anyDriver as OnlineGameDriver).getPlayerColor();
  if (color !== "W" && color !== "B") return;

  const labels = getSideLabelsForRuleset(rulesetId, { boardSize });
  const wIcon = labels.W === "Red" ? "🔴" : "⚪";
  el.textContent = color === "W" ? wIcon : "⚫";
  el.style.display = "inline-flex";
  const label = `Playing as ${color === "W" ? labels.W : labels.B}`;
  el.title = label;
  el.setAttribute("aria-label", label);
}

window.addEventListener("DOMContentLoaded", async () => {
  const activeVariant = getVariantById(ACTIVE_VARIANT_ID);
  const isCheckers = activeVariant.rulesetId === "checkers_us";
  const getCurrentSideLabels = () =>
    getSideLabelsForRuleset(activeVariant.rulesetId, { boardSize: activeVariant.boardSize });

  // dama.html is also used as the entry page for US Checkers.
  // Ensure the browser tab title matches the actual game.
  document.title = activeVariant.displayName;

  const elHelpLink = (document.getElementById("helpLink") as HTMLAnchorElement | null) ?? null;
  if (elHelpLink && isCheckers) {
    elHelpLink.href = "./checkers-help.html";
  }

  if (isCheckers) {
    setSvgFavicon(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>" +
        "<rect width='16' height='16' rx='3' ry='3' fill='#1b1b1b'/>" +
        "<circle cx='6.1' cy='9.9' r='5.1' fill='#111111' stroke='#f5f5f5' stroke-width='0.9'/>" +
        "<circle cx='9.9' cy='6.1' r='5.1' fill='#d21f1f' stroke='#250404' stroke-width='0.9'/>" +
        "</svg>"
    );
  }

  const sideLabel = (player: Player): string => {
    const labels = getCurrentSideLabels();
    return player === "W" ? labels.W : labels.B;
  };

  const sideIcon = (player: Player): string => {
    if (player === "B") return "⚫";
    const labels = getCurrentSideLabels();
    return labels.W === "Red" ? "🔴" : "⚪";
  };

  let driverForBadge: unknown | null = null;
  let controllerForSync: GameController | null = null;

  const syncBotSideLabels = () => {
    const elAiWhiteLabel = (document.querySelector('label[for="aiWhiteSelect"]') as HTMLElement | null) ?? null;
    const elAiBlackLabel = (document.querySelector('label[for="aiBlackSelect"]') as HTMLElement | null) ?? null;
    if (elAiWhiteLabel) elAiWhiteLabel.textContent = sideLabel("W");
    if (elAiBlackLabel) elAiBlackLabel.textContent = sideLabel("B");
  };

  const syncTerminologyUI = () => {
    syncBotSideLabels();
    if (controllerForSync) {
      const elTurn = document.getElementById("statusTurn");
      if (elTurn) elTurn.textContent = sideLabel(controllerForSync.getState().toMove);
    }
    if (driverForBadge) {
      updatePlayerColorBadge(driverForBadge, activeVariant.rulesetId, activeVariant.boardSize);
    }
  };

  // In-game Bot panel: replace the generic Light/Dark labels with the
  // variant's terminology (may be Red/Black when Classic Checkers board is used).
  syncBotSideLabels();

  const gameTitleEl = document.getElementById("gameTitle");
  if (gameTitleEl) setStackWorksGameTitle(gameTitleEl, activeVariant.displayName);

  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const boardLoading = createBoardLoadingOverlay(boardWrap);
  boardLoading.show();

  const useCheckered8x8 = !isCheckers && (readOptionalBoolPref(LS_OPT_KEYS.board8x8Checkered) ?? false);
  const svgAsset = (() => {
    if (isCheckers) return activeVariant.svgAsset ?? graphBoard8x8SvgUrl;
    if (activeVariant.boardSize === 8 && useCheckered8x8) return chessBoardSvgUrl;
    return activeVariant.svgAsset ?? graphBoard8x8SvgUrl;
  })();
  const svg = await loadSvgFileInto(boardWrap, svgAsset);

  const flipBoardToggle = document.getElementById("flipBoardToggle") as HTMLInputElement | null;
  const savedFlip = readOptionalBoolPref(LS_OPT_KEYS.flipBoard);
  if (flipBoardToggle && savedFlip !== null) {
    flipBoardToggle.checked = savedFlip;
  }
  const isFlipped = () => Boolean(flipBoardToggle?.checked);

  // Apply flip early so any subsequently-created layers end up in the rotated view.
  setBoardFlipped(svg, isFlipped());

  // Checkerboard theme (only relevant when using the chess-style 8x8 board)
  const checkerboardThemeRow = document.getElementById("checkerboardThemeRow") as HTMLElement | null;
  const checkerboardThemeHelp = document.getElementById("checkerboardThemeHelp") as HTMLElement | null;
  const checkerboardThemeSelect = document.getElementById("checkerboardThemeSelect") as HTMLSelectElement | null;

  const shouldShowCheckerboardTheme = activeVariant.boardSize === 8;
  const canUseCheckerboardTheme = shouldShowCheckerboardTheme && (useCheckered8x8 || isCheckers);
  if (checkerboardThemeRow) checkerboardThemeRow.style.display = shouldShowCheckerboardTheme ? "flex" : "none";
  if (checkerboardThemeHelp) {
    checkerboardThemeHelp.style.display = shouldShowCheckerboardTheme ? "block" : "none";
    checkerboardThemeHelp.textContent = canUseCheckerboardTheme
      ? "Checkerboard background colors"
      : "Enable \"Checkered 8×8 board\" in Options to customize board colors";
  }
  if (checkerboardThemeSelect) checkerboardThemeSelect.disabled = !canUseCheckerboardTheme;

  const readCheckerboardTheme = (): CheckerboardThemeId =>
    normalizeCheckerboardThemeId(readOptionalStringPref(LS_OPT_KEYS.checkerboardTheme));
  const applyCheckerboard = (id: CheckerboardThemeId) => {
    applyCheckerboardTheme(svg, id);
  };

  if (checkerboardThemeSelect) {
    checkerboardThemeSelect.value = readCheckerboardTheme();
  }

  if (canUseCheckerboardTheme) {
    if (checkerboardThemeSelect) {
      checkerboardThemeSelect.addEventListener("change", () => {
        const picked = normalizeCheckerboardThemeId(checkerboardThemeSelect.value);
        writeStringPref(LS_OPT_KEYS.checkerboardTheme, picked);
        applyCheckerboard(picked);
        syncTerminologyUI();
      });
    }

    applyCheckerboard(readCheckerboardTheme());
  }

  const board8x8CheckeredToggle = document.getElementById("board8x8CheckeredToggle") as HTMLInputElement | null;
  if (board8x8CheckeredToggle) {
    const row = (board8x8CheckeredToggle.parentElement as HTMLElement | null) ?? null;
    const hint = (row?.nextElementSibling as HTMLElement | null) ?? null;

    if (isCheckers) {
      if (row) row.style.display = "none";
      if (hint) hint.style.display = "none";
      board8x8CheckeredToggle.disabled = true;
    } else {
      board8x8CheckeredToggle.checked = useCheckered8x8;
      board8x8CheckeredToggle.addEventListener("change", () => {
        writeBoolPref(LS_OPT_KEYS.board8x8Checkered, board8x8CheckeredToggle.checked);
        window.location.reload();
      });
    }
  }

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const savedBoardCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoords);
  if (boardCoordsToggle && savedBoardCoords !== null) {
    boardCoordsToggle.checked = savedBoardCoords;
  }
  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), activeVariant.boardSize, { flipped: isFlipped() });
  applyBoardCoords();

  const showResizeIconToggle = document.getElementById("showResizeIconToggle") as HTMLInputElement | null;
  const savedShowResizeIcon = readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon);
  if (showResizeIconToggle && savedShowResizeIcon !== null) {
    showResizeIconToggle.checked = savedShowResizeIcon;
  }

  initSplitLayout();

  if (isCheckers) {
    // Use Checkers-specific defaults so a previously-saved global theme from other games
    // does not prevent Checkers from using the classic Checkers look.
    const CHECKERS_KEYS = {
      theme: "lasca.checkers.theme",
      checkerboardTheme: "lasca.checkers.checkerboardTheme",
    } as const;

    try {
      const pieces = localStorage.getItem(CHECKERS_KEYS.theme) || "checkers";
      const board = localStorage.getItem(CHECKERS_KEYS.checkerboardTheme) || "checkers";

      if (!localStorage.getItem(CHECKERS_KEYS.theme)) localStorage.setItem(CHECKERS_KEYS.theme, pieces);
      if (!localStorage.getItem(CHECKERS_KEYS.checkerboardTheme)) {
        localStorage.setItem(CHECKERS_KEYS.checkerboardTheme, board);
      }

      localStorage.setItem("lasca.theme", pieces);
      localStorage.setItem(LS_OPT_KEYS.checkerboardTheme, board);
    } catch {
      // ignore
    }
  }

  const themeDropdown = document.getElementById("themeDropdown") as HTMLElement | null;
  const themeManager = createThemeManager(svg);
  await themeManager.bindThemeDropdown(themeDropdown);

  const glassPieceColorsRow = document.getElementById("glassPieceColorsRow") as HTMLElement | null;
  const glassPieceColorsSelect = document.getElementById("glassPieceColorsSelect") as HTMLSelectElement | null;
  themeManager.bindGlassPieceColorsSelect(glassPieceColorsRow, glassPieceColorsSelect);

  const glassBgRow = document.getElementById("glassBgRow") as HTMLElement | null;
  const glassBgSelect = document.getElementById("glassBgSelect") as HTMLSelectElement | null;
  themeManager.bindGlassBackgroundSelect(glassBgRow, glassBgSelect);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");

  // Dama has no stacks, so there is no stack inspector.
  const inspector = null;

  // Create initial game state and render once
  const state = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);

  // Create history manager and record initial state
  const history = new HistoryManager();
  history.push(state);

  // Update left panel status
  const elTurn = document.getElementById("statusTurn");
  const elRulesBoard = document.getElementById("statusRulesBoard");
  const elPhase = document.getElementById("statusPhase");
  const elMsg = document.getElementById("statusMessage");
  if (elTurn) {
    elTurn.textContent = sideLabel(state.toMove);
  }
  if (elRulesBoard) elRulesBoard.textContent = `${activeVariant.displayName} Rules • ${activeVariant.boardSize}×${activeVariant.boardSize} Board`;
  if (elPhase) elPhase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  if (elMsg) elMsg.textContent = "—";

  renderGameState(svg, piecesLayer, inspector, state);

  // Board SVG + theme are now loaded; keep spinner until the first paint.
  await nextPaint();
  boardLoading.hide();

  // Theme switching can involve slow raster PNG loads; show spinner while themes apply.
  svg.addEventListener(THEME_WILL_CHANGE_EVENT, () => boardLoading.show());
  svg.addEventListener(THEME_DID_CHANGE_EVENT, () => {
    boardLoading.hide();
    syncTerminologyUI();
  });

  // In dev, force a full reload when modules (like state) change
  if (import.meta.hot) {
    import.meta.hot.accept(() => window.location.reload());
  }

  // PR 4+5: interaction — controller binds selection and applies quiet moves
  ensureOverlayLayer(svg);
  const driver = await createDriverAsync({
    state,
    history,
    search: window.location.search,
    envMode: import.meta.env.VITE_PLAY_MODE,
    envServerUrl: import.meta.env.VITE_SERVER_URL,
  });

  driverForBadge = driver;

  updatePlayerColorBadge(driver, activeVariant.rulesetId, activeVariant.boardSize);

  // Threefold repetition: local toggle for offline; creator-locked for online.
  const savedThreefold = readOptionalBoolPref(LS_OPT_KEYS.threefold);
  const threefoldToggle = document.getElementById("threefoldToggle") as HTMLInputElement | null;
  const onlineRules =
    driver.mode === "online" && typeof (driver as any)?.getRoomRules === "function"
      ? ((driver as any) as OnlineGameDriver).getRoomRules()
      : null;
  const lockedThreefold = typeof onlineRules?.drawByThreefold === "boolean" ? onlineRules.drawByThreefold : null;
  const effectiveThreefold = lockedThreefold ?? (savedThreefold ?? true);
  RULES.drawByThreefold = effectiveThreefold;
  if (threefoldToggle) {
    threefoldToggle.checked = effectiveThreefold;
    if (driver.mode === "online") {
      // Remove from Options in online mode (creator-locked at create).
      threefoldToggle.disabled = true;
      const row = threefoldToggle.closest("div") as HTMLElement | null;
      if (row) {
        row.style.display = "none";
        const desc = row.nextElementSibling as HTMLElement | null;
        if (desc && desc.tagName.toLowerCase() === "div") desc.style.display = "none";
      }
    }
  }

  const controller = new GameController(svg, piecesLayer, inspector, state, history, driver);
  controller.bind();

  controllerForSync = controller;

  bindAnalysisToggleButton(controller);
  bindFullScreenButton();
  bindGameHotkeys(controller);
  bindKeyboardShortcutsContextMenu(controller);

  // Sound effects (optional)
  const sfx = createSfxManager();
  controller.setSfxManager(sfx);
  const soundToggle = document.getElementById("soundToggle") as HTMLInputElement | null;
  const savedSfx = readOptionalBoolPref(LS_OPT_KEYS.sfx);
  if (soundToggle && savedSfx !== null) {
    soundToggle.checked = savedSfx;
  }
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

  // Theme switching can change piece symbol IDs (Wooden variants), so re-render on change.
  svg.addEventListener(THEME_CHANGE_EVENT, () => controller.refreshForThemeChange());

  const startupMsg = consumeStartupMessage();
  if (startupMsg) controller.showStartupMessage(startupMsg);

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

  // Force these display prefs.
  controller.setAnimations(true);
  writeBoolPref(LS_OPT_KEYS.animations, true);

  // RULES.drawByThreefold initialized earlier (before controller.bind()).

  const toastToggle = document.getElementById("toastToggle") as HTMLInputElement | null;
  const savedToasts = readOptionalBoolPref(LS_OPT_KEYS.toasts);
  if (toastToggle && savedToasts !== null) {
    toastToggle.checked = savedToasts;
  }
  if (toastToggle && savedToasts === null) {
    try {
      const w = localStorage.getItem("lasca.ai.white") ?? "human";
      const b = localStorage.getItem("lasca.ai.black") ?? "human";
      const bothAI = w !== "human" && b !== "human";
      if (bothAI) toastToggle.checked = false;
    } catch {
      // ignore (no localStorage)
    }
  }
  if (toastToggle) {
    toastToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.toasts, toastToggle.checked);
    });
  }

  bindEvaluationPanel(controller);

  // Online (2 players): disable in-game AI controls entirely.
  if (driver.mode === "online") {
    const aiSection = document.querySelector(
      '.panelSection[data-section="ai"]',
    ) as HTMLElement | null;
    if (aiSection) {
      aiSection.style.display = "none";
    }

    const elW = document.getElementById("aiWhiteSelect") as HTMLSelectElement | null;
    const elB = document.getElementById("aiBlackSelect") as HTMLSelectElement | null;
    if (elW) {
      elW.value = "human";
      elW.disabled = true;
    }
    if (elB) {
      elB.value = "human";
      elB.disabled = true;
    }
    const elDelay = document.getElementById("aiDelay") as HTMLInputElement | null;
    const elDelayReset = document.getElementById("aiDelayReset") as HTMLButtonElement | null;
    const elPause = document.getElementById("aiPauseBtn") as HTMLButtonElement | null;
    const elStep = document.getElementById("aiStepBtn") as HTMLButtonElement | null;
    if (elDelay) elDelay.disabled = true;
    if (elDelayReset) elDelayReset.disabled = true;
    if (elPause) elPause.disabled = true;
    if (elStep) elStep.disabled = true;
  } else {
    // AI (human vs AI / AI vs AI)
    const aiManager = new AIManager(controller);
    aiManager.bind();
    controller.addAnalysisModeChangeCallback((enabled) => aiManager.setAnalysisModeActive(enabled));
  }

  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoords, boardCoordsToggle.checked);
    });
  }

  if (flipBoardToggle) {
    flipBoardToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.flipBoard, flipBoardToggle.checked);
      setBoardFlipped(svg, flipBoardToggle.checked);
      applyBoardCoords();
    });
  }

  // Wire up threefold repetition toggle (offline only)
  if (threefoldToggle && driver.mode !== "online") {
    threefoldToggle.addEventListener("change", () => {
      RULES.drawByThreefold = threefoldToggle.checked;
      writeBoolPref(LS_OPT_KEYS.threefold, threefoldToggle.checked);
    });
  }

  // Wire up new game button
  const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      const confirmed = confirm("Start a new game? This will clear the current game and undo history.");
      if (confirmed) {
        const freshState = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
        controller.newGame(freshState);
      }
    });
  }

  // Wire up save/load game buttons
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  const exportHistoryBtn = document.getElementById("exportHistoryBtn") as HTMLButtonElement | null;

  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      // In online mode, the authoritative history comes from server snapshots
      // (stored on the RemoteDriver), not the page-level HistoryManager.
      if (driver.mode === "online") {
        const snap = driver.exportHistorySnapshots();
        const hm = new HistoryManager();
        hm.replaceAll(snap.states as any, snap.notation, snap.currentIndex);
        const stateFromHistory = driver.getHistoryCurrent();
        const currentState = stateFromHistory ?? driver.getState();
        saveGameToFile(currentState, hm, activeVariant.defaultSaveName);
        return;
      }

      const currentState = controller.getState();
      saveGameToFile(currentState, history, activeVariant.defaultSaveName);
    });
  }

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

  if (loadGameBtn && loadGameInput) {
    loadGameBtn.addEventListener("click", () => {
      loadGameInput.click();
    });

    loadGameInput.addEventListener("change", async () => {
      const file = loadGameInput.files?.[0];
      if (!file) return;

      try {
        const loaded = await loadGameFromFile(file, {
          variantId: activeVariant.variantId,
          rulesetId: activeVariant.rulesetId,
          boardSize: activeVariant.boardSize,
        });
        controller.loadGame(loaded.state, loaded.history);
      } catch (error) {
        console.error("Failed to load game:", error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Failed to load game: ${msg}`);
      }

      // Reset file input so the same file can be loaded again
      loadGameInput.value = "";
    });
  }

  // Wire up undo/redo buttons
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

  const updateHistoryUI = (reason?: import("./controller/gameController.ts").HistoryChangeReason) => {
    if (undoBtn) undoBtn.disabled = !controller.canUndo();
    if (redoBtn) redoBtn.disabled = !controller.canRedo();

    if (!moveHistoryEl) return;

    const historyData = controller.getHistory();
    if (historyData.length === 0) {
      moveHistoryEl.textContent = "No moves yet";
    } else {
      const renderStartCell = (entry: (typeof historyData)[number]) => {
        const cls = `cell clickable start${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        return `<div class="${cls}" data-history-index="${entry.index}"${currentAttr}>Start</div>`;
      };

      const renderMoveCell = (entry: (typeof historyData)[number]) => {
        const whoMoved = entry.toMove === "B" ? "W" : "B";
        const playerIcon = sideIcon(whoMoved);
        let label = `${playerIcon}`;
        if (entry.notation) label += ` ${entry.notation}`;
        const cls = `cell clickable${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        return `<div class="${cls}" data-history-index="${entry.index}" data-history-who="${whoMoved}"${currentAttr}>${label}</div>`;
      };

      if (moveHistoryLayout === "two") {
        const firstMover = historyData[0]!.toMove;
        const secondMover = firstMover === "W" ? "B" : "W";
        const totalMoves = Math.ceil((historyData.length - 1) / 2);
        const parts: string[] = [];
        parts.push('<div class="historyGrid">');
        parts.push('<div class="cell hdr">#</div>');
        parts.push(`<div class="cell hdr">${sideIcon(firstMover)} ${sideLabel(firstMover)}</div>`);
        parts.push(`<div class="cell hdr">${sideIcon(secondMover)} ${sideLabel(secondMover)}</div>`);

        parts.push(renderStartCell(historyData[0]!));

        for (let m = 1; m <= totalMoves; m++) {
          const firstIdx = 2 * m - 1;
          const secondIdx = 2 * m;
          parts.push(`<div class="cell num">${m}.</div>`);

          const firstEntry = historyData[firstIdx];
          const secondEntry = historyData[secondIdx];

          if (firstEntry) parts.push(renderMoveCell(firstEntry));
          else parts.push('<div class="cell"></div>');

          if (secondEntry) parts.push(renderMoveCell(secondEntry));
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
              return `<div data-history-index="${entry.index}"${currentAttr} style="${style}">Start</div>`;
            }

            // For moves: toMove indicates who's about to move, so invert to get who just moved
            // If toMove is "B", White just moved. If toMove is "W", Black just moved.
            const whoMoved = entry.toMove === "B" ? "W" : "B";
            const playerIcon = sideIcon(whoMoved);

            // Calculate move number: each player's move increments the counter
            const moveNum = whoMoved === "B"
              ? Math.ceil(idx / 2) // Black: moves 1, 3, 5... → move# 1, 2, 3...
              : Math.floor((idx + 1) / 2); // Red/Light: moves 2, 4, 6... → move# 1, 2, 3...

            let label = `${moveNum}. ${playerIcon}`;
            if (entry.notation) {
              label += ` ${entry.notation}`;
            }
            const baseStyle = entry.isCurrent
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95);"
              : "";
            const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
            const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
            return `<div data-history-index="${entry.index}" data-history-who="${whoMoved}"${currentAttr} style="${style}">${label}</div>`;
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

  // Wire up resign button
  const resignBtn = document.getElementById("resignBtn") as HTMLButtonElement | null;
  if (resignBtn) {
    resignBtn.addEventListener("click", () => {
      const localColor =
        driver.mode === "online"
          ? (driver as OnlineGameDriver).getPlayerColor()
          : controller.getState().toMove;
      const currentPlayer = localColor === "B" ? sideLabel("B") : localColor === "W" ? sideLabel("W") : "—";
      const confirmed = confirm(`Are you sure you want to resign as ${currentPlayer}?`);
      if (confirmed) {
        void controller.resign();
      }
    });
  }

  // Wire up leave-room button (online only: forfeits; local/spectator: just return).
  const leaveRoomBtn = document.getElementById("leaveRoomBtn") as HTMLButtonElement | null;
  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener("click", async () => {
      if (driver.mode !== "online") {
        window.location.assign("./index.html");
        return;
      }

      const online = driver as OnlineGameDriver;
      const playerId = online.getPlayerId();
      if (!playerId) {
        window.location.assign("./index.html");
        return;
      }

      const localColor = online.getPlayerColor();
      const currentPlayer = localColor === "B" ? sideLabel("B") : localColor === "W" ? sideLabel("W") : "your";
      const confirmed = confirm(
        `Leave room? This forfeits the game (counts as resign). ${currentPlayer} will lose. Continue?`
      );
      if (!confirmed) return;

      try {
        await online.resignRemote();
        window.location.assign("./index.html");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ui] leave room failed", err);
        const msg = err instanceof Error ? err.message : "Leave room failed";
        alert(msg);
      }
    });
  }

  controller.addHistoryChangeCallback(updateHistoryUI);
  updateHistoryUI(); // Initial update

  bindPlaybackControls(controller);

  // If the SVG is hot-reloaded in dev, re-render coordinate labels.
  if (import.meta.hot) {
    import.meta.hot.accept(() => applyBoardCoords());
  }

  initCollapsibleSections();

  // Board height adjustment toggle (for Android tablets with bottom nav bar)
  const boardHeightToggle = document.getElementById("boardHeightToggle") as HTMLButtonElement | null;
  const centerArea = document.getElementById("centerArea") as HTMLElement | null;

  if (boardHeightToggle && centerArea) {
    const STORAGE_KEY = "lasca.boardHeightReduced";
    const POS_KEY = "lasca.boardHeightTogglePos";

    const applyResizeIconVisibility = () => {
      const showResizeIcon = showResizeIconToggle?.checked ?? (readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon) ?? false);
      boardHeightToggle.style.display = showResizeIcon ? "flex" : "none";

      if (!showResizeIcon) {
        centerArea.classList.remove("reduced-height");
        boardHeightToggle.textContent = "↕️";
        boardHeightToggle.title = "Adjust board height for bottom navigation bar";
        localStorage.setItem(STORAGE_KEY, "false");
      }
    };

    applyResizeIconVisibility();

    const isToggleVisible = () => window.getComputedStyle(boardHeightToggle).display !== "none";

    const drag = installHoldDrag(boardHeightToggle, {
      storageKey: POS_KEY,
      holdDelayMs: 250,
    });

    // Restore saved state
    const savedReduced = localStorage.getItem(STORAGE_KEY) === "true";
    if (isToggleVisible() && savedReduced) {
      centerArea.classList.add("reduced-height");
      boardHeightToggle.textContent = "⬆️";
      boardHeightToggle.title = "Restore full board height";
    } else {
      centerArea.classList.remove("reduced-height");
      boardHeightToggle.textContent = "↕️";
      boardHeightToggle.title = "Adjust board height for bottom navigation bar";
    }

    boardHeightToggle.addEventListener("click", (e) => {
      if (drag.wasDraggedRecently()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const isReduced = centerArea.classList.toggle("reduced-height");

      // Update button appearance
      if (isReduced) {
        boardHeightToggle.textContent = "⬆️";
        boardHeightToggle.title = "Restore full board height";
      } else {
        boardHeightToggle.textContent = "↕️";
        boardHeightToggle.title = "Adjust board height for bottom navigation bar";
      }

      // Save state
      localStorage.setItem(STORAGE_KEY, isReduced.toString());
    });

    // Dev helper: expose to console for testing on desktop
    (window as any).toggleBoardHeightButtonVisibility = () => {
      const currentDisplay = window.getComputedStyle(boardHeightToggle).display;
      if (currentDisplay === "none") {
        boardHeightToggle.style.display = "flex";
        console.log("Board height button is now visible");
      } else {
        boardHeightToggle.style.display = "";
        console.log("Board height button visibility reset to CSS default");
      }

      if (window.getComputedStyle(boardHeightToggle).display === "none") {
        centerArea.classList.remove("reduced-height");
      }
    };
  }

  if (showResizeIconToggle) {
    showResizeIconToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.showResizeIcon, showResizeIconToggle.checked);
      const boardHeightToggle = document.getElementById("boardHeightToggle") as HTMLButtonElement | null;
      if (boardHeightToggle) {
        boardHeightToggle.style.display = showResizeIconToggle.checked ? "flex" : "none";
      }
      const centerArea = document.getElementById("centerArea") as HTMLElement | null;
      if (!showResizeIconToggle.checked && centerArea) {
        centerArea.classList.remove("reduced-height");
        localStorage.setItem("lasca.boardHeightReduced", "false");
      }
    });
  }

  // Dev-only: expose rerender/random that also sync controller state
  // Note: boardDebug is disabled since we now have the move hints feature
  if (import.meta.env && import.meta.env.DEV) {
    // const mod = await import("./dev/boardDebug.ts");
    let currentState = state;
    // mod.installBoardDebug(svg, () => currentState);

    const randomMod = await import("./game/randomState.ts");

    const w = window as any;
    w.__state = currentState;
    w.__rerender = (next: typeof state) => {
      // Clear any dev debug highlights and overlay rings before re-rendering
      if ((w.__board as any)?.clear) {
        try { (w.__board as any).clear(); } catch {}
      }
      try {
        const overlays = ensureOverlayLayer(svg);
        // overlays exists even if empty; clear any lingering rings
        const g = overlays as SVGGElement;
        while (g.firstChild) g.removeChild(g.firstChild);
      } catch {}
      renderGameState(svg, piecesLayer, inspector, next);
      const elTurn = document.getElementById("statusTurn");
      const elRulesBoard = document.getElementById("statusRulesBoard");
      const elPhase = document.getElementById("statusPhase");
      const elMsg = document.getElementById("statusMessage");
      if (elTurn) elTurn.textContent = sideLabel(next.toMove);
      if (elRulesBoard) elRulesBoard.textContent = `${activeVariant.displayName} Rules • ${activeVariant.boardSize}×${activeVariant.boardSize} Board`;
      if (elPhase) elPhase.textContent = next.phase.charAt(0).toUpperCase() + next.phase.slice(1);
      if (elMsg) elMsg.textContent = "—";
      currentState = next;
      controller.setState(currentState);
      w.__state = currentState;
    };
    w.__random = (totalPerSide: number = 11, toMove: Player = "B", testMode?: string) => {
      // Special test mode for repeat-capture rule
      if (testMode === "R") {
        // Create a scenario where a White officer can potentially loop
        // Multiple Black stacks with Black pieces underneath (same color)
        // Arranged to create potential capture loops
        const s: GameState = {
          board: new Map([
            // White officer starting position
            ["r1c1", [{ owner: "W", rank: "O" }]],

            // Black stacks with Black pieces underneath (same color stacks)
            // Arranged to create potential capture loops
            ["r2c2", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black-Black officer
            ["r2c4", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black officer
            ["r4c2", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }, { owner: "B", rank: "S" }]], // Black-Black-Black soldier
            ["r4c4", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black officer
            ["r3c5", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }]], // Black-Black soldier

            // Additional pieces to prevent immediate game over
            ["r5c0", [{ owner: "B", rank: "S" }]],
            ["r6c6", [{ owner: "B", rank: "O" }]], // Officer on promotion row is OK
            ["r5c1", [{ owner: "B", rank: "S" }]],
          ]),
          toMove: "W",
          phase: "idle",
        };
        w.__rerender(s);
        return s;
      }

      const rng = createPrng(`debug.__random:dama:${totalPerSide}:${toMove}:${testMode ?? ""}`);
      const s = randomMod.createRandomGameState({ totalPerSide, toMove, seed: rng.nextUint32() });

      // Add one random white and one random black multi-piece stack at empty nodes
      const empty = ALL_NODES.filter((n) => !s.board.has(n));
      const pickIndex = (max: number) => rng.int(0, max);
      const randInt = (min: number, max: number) => rng.int(min, max + 1);
      const makeStack = (topOwner: Player) => {
        const total = randInt(2, 5); // 2..5 pieces in the stack
        const other = topOwner === "W" ? "B" : "W";
        const otherOf = (p: Player): Player => (p === "W" ? "B" : "W");
        const bottomOwner: Player = (total % 2 === 1) ? topOwner : other;
        const pieces: Array<{ owner: Player; rank: "S" | "O" }> = [];
        for (let k = 0; k < total; k++) {
          const owner = (k % 2 === 0) ? bottomOwner : otherOf(bottomOwner);
          const rank = (k === total - 1) ? "O" : "S"; // officer at top
          pieces.push({ owner, rank });
        }
        return pieces;
      };

      // Place stacks if there is space
      if (empty.length > 0) {
        const wIdx = pickIndex(empty.length);
        const wNode = empty[wIdx];
        s.board.set(wNode, makeStack("W"));
        empty.splice(wIdx, 1);
      }
      if (empty.length > 0) {
        const bIdx = pickIndex(empty.length);
        const bNode = empty[bIdx];
        s.board.set(bNode, makeStack("B"));
        empty.splice(bIdx, 1);
      }

      w.__rerender(s);
      return s;
    };
  }
});
