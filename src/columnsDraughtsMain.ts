import { createInitialGameStateForVariant } from "./game/state.ts";
import type { GameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { createStackInspector } from "./ui/stackInspector";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { initCollapsibleSections } from "./ui/layout/collapsibleSections";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager, THEME_CHANGE_EVENT, THEME_DID_CHANGE_EVENT, THEME_WILL_CHANGE_EVENT } from "./theme/themeManager";
import checkerboardClassic10x10SvgUrl from "./assets/checkerboard_classic_10x10.svg?url";
import checkerboardGreen10x10SvgUrl from "./assets/checkerboard_green_10x10.svg?url";
import checkerboardBlue10x10SvgUrl from "./assets/checkerboard_blue_10x10.svg?url";
import checkersBoard10x10SvgUrl from "./assets/checkers_board_10x10.svg?url";
import type { Player } from "./types";
import { GameController } from "./controller/gameController.ts";
import { ensureOverlayLayer } from "./render/overlays.ts";
import { ALL_NODES } from "./game/board.ts";
import { buildPlayerNamedSaveFilename, saveGameToFile, loadGameFromFile } from "./game/saveLoad.ts";
import {
  applySaveFilePlayerNamesToSession,
  commitShellThenApplySavePlayerNames,
  hasSaveFilePlayerNames,
} from "./ui/applySaveFilePlayerSession";
import { HistoryManager } from "./game/historyManager.ts";
import { RULES } from "./game/ruleset.ts";
import { renderBoardCoords } from "./render/boardCoords";
import { AIManager } from "./ai/aiManager.ts";
import { bindEvaluationPanel } from "./ui/evaluationPanel";
import { bindPlaybackControls } from "./ui/playbackControls.ts";
import {
  bindFullScreenButton,
  bindGameHotkeys,
  bindKeyboardShortcutsContextMenu,
} from "./ui/gameShortcuts.ts";
import { installHoldDrag } from "./ui/holdDrag";
import { getVariantById, rulesBoardLine } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import { createDriverAsync, consumeStartupMessage } from "./driver/createDriver.ts";
import type { OnlineGameDriver } from "./driver/gameDriver.ts";
import { createSfxManager } from "./ui/sfx";
import { createPrng } from "./shared/prng.ts";
import { hasConfiguredOnlineLocalBot } from "./shared/onlineLocalSeats.ts";
import { resolveConfiguredLocalPlayerName } from "./shared/localPlayerNames";
import {
  applyCheckerboardTheme,
  normalizeCheckerboardThemeId,
  type CheckerboardThemeId,
} from "./render/checkerboardTheme";
import { getPairedCheckerboardTheme } from "./theme/themePresets";
import { normalizeLastMoveHighlightStyle, normalizeMoveHintStyle, normalizeSelectionStyle } from "./render/highlightStyles";
import { createBoardLoadingOverlay } from "./ui/boardLoadingOverlay";
import { nextPaint } from "./ui/nextPaint";
import { setBoardFlipped } from "./render/boardFlip";
import { setStackWorksGameTitle } from "./ui/gameTitle";
import { getSideLabelsForRuleset } from "./shared/sideTerminology";
import { nodeIdToA1, convertNotationToInternationalDraughts } from "./game/coordFormat";
import { isShellNewGameConfirmSuppressed, markShellNewGameConfirmCancelled } from "./ui/shell/shellNewGameBypass";
import { registerNewGameDiscardConfirmQuery, shouldConfirmDiscardCurrentGame } from "./ui/newGameDiscardConfirm";
import { bindStartPageConfirm } from "./ui/startPageConfirm";
import { bindOfflineNavGuard } from "./ui/offlineNavGuard";
import { bindLeaveRoomButton } from "./ui/leaveRoomButton";
import { initGameShell } from "./ui/shell/gameShell";
import { GameSection } from "./config/shellState";
import { consumeShellBotPlayState } from "./shared/consumeShellBotPlayState";
import { installPlayerBotSelector, syncPlayerBotSelector } from "./ui/bot/playerBotSelector";
import { bindPanelLayoutMenuMode, installPanelLayoutOptionUI } from "./ui/panelLayoutMode";
import { ensureBoardCoordsInSquaresOption } from "./ui/boardCoordsInSquaresOption";
import { applyBoardViewportModeToSvg } from "./render/boardViewport";
import { bindBoardPlayerNameOverlay } from "./render/boardPlayerNames";
import {
  applyBoardViewportMode,
  BOARD_VIEWPORT_MODE_CHANGED_EVENT,
  installBoardViewportOptionUI,
  readBoardViewportMode,
} from "./ui/boardViewportMode";

const ACTIVE_VARIANT_ID = "columns_draughts_10" as const;

function saveLabelForColumnsDraughtsVariant(): string {
  return "columns_draughts";
}

const LS_OPT_KEYS = {
  moveHints: `lasca.opt.${ACTIVE_VARIANT_ID}.moveHints`,
  moveHintStyle: `lasca.opt.${ACTIVE_VARIANT_ID}.moveHintStyle`,
  animations: `lasca.opt.${ACTIVE_VARIANT_ID}.animations`,
  lastMoveHighlights: `lasca.opt.${ACTIVE_VARIANT_ID}.lastMoveHighlights`,
  lastMoveHighlightStyle: `lasca.opt.${ACTIVE_VARIANT_ID}.lastMoveHighlightStyle`,
  showResizeIcon: `lasca.opt.${ACTIVE_VARIANT_ID}.showResizeIcon`,
  boardCoords: `lasca.opt.${ACTIVE_VARIANT_ID}.boardCoords`,
  boardCoordsInSquares: `lasca.opt.${ACTIVE_VARIANT_ID}.boardCoordsInSquares`,
  boardCoordsInternationalNumbers: `lasca.opt.${ACTIVE_VARIANT_ID}.boardCoordsInternationalNumbers`,
  flipBoard: `lasca.opt.${ACTIVE_VARIANT_ID}.flipBoard`,
  checkerboardTheme: `lasca.opt.${ACTIVE_VARIANT_ID}.checkerboardTheme`,
  threefold: `lasca.opt.${ACTIVE_VARIANT_ID}.threefold`,
  toasts: "lasca.opt.toasts",
  sfx: "lasca.opt.sfx",
  selectionStyle: `lasca.opt.${ACTIVE_VARIANT_ID}.selectionStyle`,
};

type NcMoveHintStyle = "classic" | "chesscom" | "classic-squares";
function normalizeNcMoveHintStyle(v: string | null | undefined): NcMoveHintStyle {
  if (v === "classic" || v === "chesscom" || v === "classic-squares") return v;
  return "chesscom";
}

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

function resolvePlayerLabelForSave(args: {
  side: "W" | "B";
  controller: GameController;
}): string {
  const configuredName = resolveConfiguredLocalPlayerName(args.side);
  if (configuredName) return configuredName;
  const displayName = args.controller.getPlayerShellSnapshot().players[args.side].displayName?.trim() ?? "";
  const selectId = args.side === "W" ? "aiWhiteSelect" : "aiBlackSelect";
  const botSetting = (document.getElementById(selectId) as HTMLSelectElement | null)?.value ?? "human";
  if (botSetting !== "human") return args.side === "W" ? "white" : "black";
  return displayName || "human";
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

type BoardCoordsToggleUI = {
  toggle: HTMLInputElement | null;
  row: HTMLElement | null;
  hint: HTMLElement | null;
};

function insertOptionAfter(anchor: HTMLElement, element: HTMLElement): void {
  const parent = anchor.parentElement;
  if (!parent) return;
  const next = anchor.nextElementSibling;
  if (next) parent.insertBefore(element, next);
  else parent.appendChild(element);
}

function ensureInternationalDraughtsCoordsOption(anchor: HTMLElement | null): BoardCoordsToggleUI {
  const existingToggle = document.getElementById("boardCoordsInternationalNumbersToggle") as HTMLInputElement | null;
  if (existingToggle) {
    const row = existingToggle.closest("div") as HTMLElement | null;
    const hint = (row?.nextElementSibling as HTMLElement | null) ?? null;
    return { toggle: existingToggle, row, hint };
  }

  if (!anchor) return { toggle: null, row: null, hint: null };

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;margin-left:24px;";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = "boardCoordsInternationalNumbersToggle";
  toggle.style.cssText = "width:16px;height:16px;cursor:pointer";

  const label = document.createElement("label");
  label.htmlFor = toggle.id;
  label.textContent = "International square numbering";
  label.style.cssText = "font-size:13px;cursor:pointer;user-select:none";

  row.append(toggle, label);

  const hint = document.createElement("div");
  hint.textContent = "Show 1-50 perimeter numbering on dark squares; forces inside-square placement";
  hint.style.cssText = "font-size:11px;color:rgba(255,255,255,0.6);margin-top:6px;margin-left:48px;";

  insertOptionAfter(anchor, row);
  insertOptionAfter(row, hint);
  return { toggle, row, hint };
}

window.addEventListener("DOMContentLoaded", async () => {
  const activeVariant = getVariantById(ACTIVE_VARIANT_ID);
  const appRoot = document.getElementById("appRoot") as HTMLElement | null;
  if (!appRoot) throw new Error("Missing game root: #appRoot");

  const shell = initGameShell({
    appRoot,
    variantId: activeVariant.variantId,
    breadcrumb: "Play / Columns Draughts",
    title: activeVariant.displayName,
    subtitle: activeVariant.subtitle,
    gameSection: GameSection.Play,
    meta: [rulesBoardLine(activeVariant.rulesetId, activeVariant.boardSize)],
    backHref: "./",
    helpHref: "./columnsDraughts-help.html",
    activeSectionId: "play",
    navItems: [
      { id: "play", label: "Play", targetSelector: "#boardWrap" },
      { id: "status", label: "Status", targetSelector: '#leftSidebar .panelSection[data-section="status"]' },
      { id: "tools", label: "Tools", targetSelector: '#leftSidebar .panelSection[data-section="optionsActions"]' },
      { id: "history", label: "History", targetSelector: '#rightSidebar .panelSection[data-section="moveHistory"]' },
    ],
  });

  // Board viewport: Framed vs Playable area.
  installBoardViewportOptionUI();
  let boardViewportMode = readBoardViewportMode();
  applyBoardViewportMode(boardViewportMode);
  let hudController: GameController | null = null;
  let boardPlayerNames: ReturnType<typeof bindBoardPlayerNameOverlay> | null = null;

  const getCurrentSideLabels = () =>
    getSideLabelsForRuleset(activeVariant.rulesetId, { boardSize: activeVariant.boardSize });
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
  let updateHistoryUIForSync: (() => void) | null = null;

  const syncBotSideLabels = () => {
    const elAiWhiteLabel = (document.querySelector('label[for="aiWhiteRoleSelect"]') as HTMLElement | null) ?? null;
    const elAiBlackLabel = (document.querySelector('label[for="aiBlackRoleSelect"]') as HTMLElement | null) ?? null;
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
    if (updateHistoryUIForSync) updateHistoryUIForSync();
  };

  syncBotSideLabels();

  const gameTitleEl = document.getElementById("gameTitle");
  if (gameTitleEl) setStackWorksGameTitle(gameTitleEl, activeVariant.displayName);

  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const boardLoading = createBoardLoadingOverlay(boardWrap);
  boardLoading.show();

  // Columns Draughts is always on a 10×10 checkerboard. Select the color family based on stored pref.
  type TenByTenCheckerboardFamily = "classic" | "green" | "blue";
  const get10x10CheckerboardFamily = (): TenByTenCheckerboardFamily => {
    const themeId = normalizeCheckerboardThemeId(readOptionalStringPref(LS_OPT_KEYS.checkerboardTheme));
    if (themeId === "green") return "green";
    if (themeId === "blue") return "blue";
    return "classic";
  };
  const get10x10SvgByFamily = (family: TenByTenCheckerboardFamily): string => {
    if (family === "green") return checkerboardGreen10x10SvgUrl;
    if (family === "blue") return checkerboardBlue10x10SvgUrl;
    return checkerboardClassic10x10SvgUrl;
  };
  const svgAsset = get10x10SvgByFamily(get10x10CheckerboardFamily());
  const svg = await loadSvgFileInto(boardWrap, svgAsset !== "" ? svgAsset : (checkersBoard10x10SvgUrl));

  applyBoardViewportModeToSvg(svg, boardViewportMode, { boardSize: activeVariant.boardSize });

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

  // Columns Draughts always uses a built-in 10×10 checkerboard; theme select is always enabled.
  if (checkerboardThemeRow) checkerboardThemeRow.style.display = "flex";
  if (checkerboardThemeHelp) {
    checkerboardThemeHelp.style.display = "block";
    checkerboardThemeHelp.textContent = "Checkerboard background colors";
  }
  if (checkerboardThemeSelect) checkerboardThemeSelect.disabled = false;

  const readCheckerboardTheme = (): CheckerboardThemeId =>
    normalizeCheckerboardThemeId(readOptionalStringPref(LS_OPT_KEYS.checkerboardTheme));
  const applyCheckerboard = (id: CheckerboardThemeId) => {
    applyCheckerboardTheme(svg, id);
  };
  const syncPairedTheme = (themeId: string | null | undefined): void => {
    const pairedTheme = getPairedCheckerboardTheme(themeId);
    if (!pairedTheme) return;
    if (checkerboardThemeSelect) {
      checkerboardThemeSelect.value = pairedTheme;
    }
    writeStringPref(LS_OPT_KEYS.checkerboardTheme, pairedTheme);
    applyCheckerboard(pairedTheme);
    applyBoardCoords();
    syncTerminologyUI();
  };

  if (checkerboardThemeSelect) {
    checkerboardThemeSelect.value = readCheckerboardTheme();
    checkerboardThemeSelect.addEventListener("change", () => {
      const picked = normalizeCheckerboardThemeId(checkerboardThemeSelect.value);
      writeStringPref(LS_OPT_KEYS.checkerboardTheme, picked);
      applyCheckerboard(picked);
      applyBoardCoords();
      syncTerminologyUI();
    });
  }

  applyCheckerboard(readCheckerboardTheme());

  // No "Checkered 8×8 board" toggle for Columns Draughts (always 10×10 checkerboard).
  const board8x8CheckeredToggle = document.getElementById("board8x8CheckeredToggle") as HTMLInputElement | null;
  if (board8x8CheckeredToggle) {
    const row = board8x8CheckeredToggle.parentElement as HTMLElement | null;
    const hint = row?.nextElementSibling as HTMLElement | null;
    if (row) row.style.display = "none";
    if (hint) hint.style.display = "none";
    board8x8CheckeredToggle.disabled = true;
  }

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const savedBoardCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoords);
  if (boardCoordsToggle && savedBoardCoords !== null) {
    boardCoordsToggle.checked = savedBoardCoords;
  }

  // Columns Draughts always uses a 10×10 checkerboard; in-square coords are always available.
  const canUseInSquareCoords = true;
  const inSquaresUI = ensureBoardCoordsInSquaresOption(boardCoordsToggle);
  const savedBoardCoordsInSquares = readOptionalBoolPref(LS_OPT_KEYS.boardCoordsInSquares);
  if (inSquaresUI.toggle && savedBoardCoordsInSquares !== null) {
    inSquaresUI.toggle.checked = savedBoardCoordsInSquares;
  }
  const internationalCoordsUI = ensureInternationalDraughtsCoordsOption(inSquaresUI.hint ?? inSquaresUI.row);
  const savedInternationalCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoordsInternationalNumbers);
  if (internationalCoordsUI.toggle && savedInternationalCoords !== null) {
    internationalCoordsUI.toggle.checked = savedInternationalCoords;
  }
  const syncInSquaresUI = () => {
    const forceInSquares = boardViewportMode === "playable" || Boolean(internationalCoordsUI.toggle?.checked);
    if (inSquaresUI.row) inSquaresUI.row.style.display = "flex";
    if (inSquaresUI.hint) inSquaresUI.hint.style.display = "block";
    if (inSquaresUI.toggle) {
      if (forceInSquares) inSquaresUI.toggle.checked = true;
      inSquaresUI.toggle.disabled = forceInSquares || !Boolean(boardCoordsToggle?.checked);
      if (inSquaresUI.row) inSquaresUI.row.style.opacity = forceInSquares ? "0.45" : "";
      if (!forceInSquares) {
        const saved = readOptionalBoolPref(LS_OPT_KEYS.boardCoordsInSquares);
        inSquaresUI.toggle.checked = saved ?? false;
      }
    }
    if (internationalCoordsUI.row) internationalCoordsUI.row.style.display = "flex";
    if (internationalCoordsUI.hint) internationalCoordsUI.hint.style.display = "block";
    if (internationalCoordsUI.toggle) {
      internationalCoordsUI.toggle.disabled = !Boolean(boardCoordsToggle?.checked);
    }
  };

  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), activeVariant.boardSize, {
      flipped: isFlipped(),
      style:
        internationalCoordsUI.toggle?.checked
          ? "inSquareInternationalDraughts"
          : (boardViewportMode === "playable" || inSquaresUI.toggle?.checked)
            ? "inSquare"
            : "edge",
    });
  applyBoardCoords();
  syncInSquaresUI();

  window.addEventListener(BOARD_VIEWPORT_MODE_CHANGED_EVENT, () => {
    boardViewportMode = readBoardViewportMode();
    applyBoardViewportMode(boardViewportMode);
    applyBoardViewportModeToSvg(svg, boardViewportMode, { boardSize: activeVariant.boardSize });
    applyBoardCoords();
    syncInSquaresUI();
    hudController?.refreshView();
    boardPlayerNames?.sync();
  });

  const showResizeIconToggle = document.getElementById("showResizeIconToggle") as HTMLInputElement | null;
  const savedShowResizeIcon = readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon);
  if (showResizeIconToggle && savedShowResizeIcon !== null) {
    showResizeIconToggle.checked = savedShowResizeIcon;
  }

  const zoomTitle = document.getElementById("zoomTitle") as HTMLElement | null;
  const zoomHint = document.getElementById("zoomHint") as HTMLElement | null;
  const zoomBody = document.getElementById("zoomBody") as HTMLElement | null;
  if (!zoomBody) throw new Error("Missing inspector container: #zoomBody");

  const zoomSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  zoomSvg.id = "zoomSvg";
  zoomSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  zoomSvg.setAttribute("viewBox", "0 0 120 200");
  zoomSvg.setAttribute("role", "img");
  zoomSvg.setAttribute("aria-label", "Stack column");
  zoomBody.replaceChildren(zoomSvg);

  initSplitLayout();

  const themeDropdown = document.getElementById("themeDropdown") as HTMLElement | null;
  const themeManager = createThemeManager(svg, { themeStorageKey: `lasca.opt.${ACTIVE_VARIANT_ID}.theme` });
  await themeManager.bindThemeDropdown(themeDropdown, async (themeId) => {
    syncPairedTheme(themeId);
  });

  const glassPieceColorsRow = document.getElementById("glassPieceColorsRow") as HTMLElement | null;
  const glassPieceColorsSelect = document.getElementById("glassPieceColorsSelect") as HTMLSelectElement | null;
  themeManager.bindGlassPieceColorsSelect(glassPieceColorsRow, glassPieceColorsSelect);

  const glassBgRow = document.getElementById("glassBgRow") as HTMLElement | null;
  const glassBgSelect = document.getElementById("glassBgSelect") as HTMLSelectElement | null;
  themeManager.bindGlassBackgroundSelect(glassBgRow, glassBgSelect);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");
  if (!zoomTitle || !zoomHint) throw new Error("Missing inspector DOM nodes (zoomTitle/zoomHint)");

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg, {
    getThemeId: () => svg.getAttribute("data-theme-id"),
    getSourceSvg: () => svg,
  });

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
  if (elTurn) elTurn.textContent = sideLabel(state.toMove);
  if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(activeVariant.rulesetId, activeVariant.boardSize);
  if (elPhase) elPhase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  if (elMsg) elMsg.textContent = "—";

  renderGameState(svg, piecesLayer, inspector, state);
  // Overlay groups must exist before the first paint so that the initial
  // play-area zoom getBBox() sees the same DOM structure as subsequent frames,
  // preventing a visible zoom jump on the first move.
  ensureOverlayLayer(svg);

  // Board SVG + theme are now loaded; wait one paint before further setup.
  await nextPaint();

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
  hudController = controller;
  controller.bind();
  controller.setCoordLabelProvider((nodeId: string): string | null => {
    if (!boardCoordsToggle?.checked) return null;
    const a1 = nodeIdToA1(nodeId, activeVariant.boardSize);
    if (Boolean(internationalCoordsUI.toggle?.checked)) {
      const intl = convertNotationToInternationalDraughts(a1, activeVariant.boardSize);
      return intl !== a1 ? intl : a1;
    }
    return a1;
  });
  shell.bindController(controller);
  controller.setThemeVisualRefreshCallback(() => {
    syncPairedTheme(svg.getAttribute("data-theme-id"));
  });
  // Reveal the board only after the shell has placed player panels and fitted
  // the board width, so it appears at its final size rather than flashing large.
  await nextPaint();
  boardLoading.hide();
  boardPlayerNames = bindBoardPlayerNameOverlay({ svg, controller, isFlipped });

  bindOfflineNavGuard(controller, ACTIVE_VARIANT_ID);

  bindStartPageConfirm(controller, ACTIVE_VARIANT_ID);
  registerNewGameDiscardConfirmQuery(() => shouldConfirmDiscardCurrentGame(controller, ACTIVE_VARIANT_ID));

  controllerForSync = controller;
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
  const lastMoveHighlightStyleRow = document.getElementById("lastMoveHighlightStyleRow") as HTMLElement | null;
  const lastMoveHighlightStyleSelect = document.getElementById("lastMoveHighlightStyleSelect") as HTMLSelectElement | null;
  const savedLastMoveHighlights = readOptionalBoolPref(LS_OPT_KEYS.lastMoveHighlights);
  const initialLastMoveHighlights = savedLastMoveHighlights ?? true;
  const initialLastMoveHighlightStyle = normalizeLastMoveHighlightStyle(
    readOptionalStringPref(LS_OPT_KEYS.lastMoveHighlightStyle),
  );
  if (lastMoveHighlightsToggle) lastMoveHighlightsToggle.checked = initialLastMoveHighlights;
  if (lastMoveHighlightStyleRow) lastMoveHighlightStyleRow.style.display = initialLastMoveHighlights ? "flex" : "none";
  controller.setLastMoveHighlightStyle(initialLastMoveHighlightStyle);
  controller.setLastMoveHighlightsEnabled(lastMoveHighlightsToggle?.checked ?? initialLastMoveHighlights);
  if (lastMoveHighlightStyleSelect) {
    lastMoveHighlightStyleSelect.value = initialLastMoveHighlightStyle;
    lastMoveHighlightStyleSelect.addEventListener("change", () => {
      const next = normalizeLastMoveHighlightStyle(lastMoveHighlightStyleSelect.value);
      writeStringPref(LS_OPT_KEYS.lastMoveHighlightStyle, next);
      controller.setLastMoveHighlightStyle(next);
    });
  }
  if (lastMoveHighlightsToggle) {
    lastMoveHighlightsToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.lastMoveHighlights, lastMoveHighlightsToggle.checked);
      controller.setLastMoveHighlightsEnabled(lastMoveHighlightsToggle.checked);
      if (lastMoveHighlightStyleRow) lastMoveHighlightStyleRow.style.display = lastMoveHighlightsToggle.checked ? "flex" : "none";
    });
  }

  // Theme switching can change piece symbol IDs (Wooden variants), so re-render on change.
  svg.addEventListener(THEME_CHANGE_EVENT, () => controller.refreshForThemeChange());
  svg.addEventListener(THEME_DID_CHANGE_EVENT, () => controller.refreshForThemeChange());

  const startupMsg = consumeStartupMessage();
  if (startupMsg) controller.showStartupMessage(startupMsg);

  // Options: move preview hints
  const moveHintsToggle = document.getElementById("moveHintsToggle") as HTMLInputElement | null;
  const moveHintStyleRow = document.getElementById("moveHintStyleRow") as HTMLElement | null;
  const moveHintStyleSelect = document.getElementById("moveHintStyleSelect") as HTMLSelectElement | null;
  const savedMoveHints = readOptionalBoolPref(LS_OPT_KEYS.moveHints);
  const savedMoveHintStyle = normalizeMoveHintStyle(readOptionalStringPref(LS_OPT_KEYS.moveHintStyle));
  const initialMoveHints = savedMoveHints ?? true;
  const savedNcStyle: NcMoveHintStyle = readOptionalStringPref(LS_OPT_KEYS.moveHintStyle) === "classic-squares"
    ? "classic-squares" : savedMoveHintStyle;
  const applyNcMoveHintStyle = (style: NcMoveHintStyle): void => {
    if (style === "classic-squares") {
      controller.setMoveHintStyle("classic");
      controller.setHighlightSquaresEnabled(true);
    } else {
      controller.setMoveHintStyle(style);
      controller.setHighlightSquaresEnabled(false);
    }
  };
  if (moveHintsToggle) moveHintsToggle.checked = initialMoveHints;
  if (moveHintStyleSelect) moveHintStyleSelect.value = savedNcStyle;
  if (moveHintStyleRow) moveHintStyleRow.style.display = initialMoveHints ? "flex" : "none";
  controller.setMoveHints(moveHintsToggle?.checked ?? initialMoveHints);
  applyNcMoveHintStyle(moveHintStyleSelect ? normalizeNcMoveHintStyle(moveHintStyleSelect.value) : savedNcStyle);
  // Options: selection style (shown when move hints are off)
  const selectionStyleRow = document.getElementById("selectionStyleRow") as HTMLElement | null;
  const selectionStyleSelect = document.getElementById("selectionStyleSelect") as HTMLSelectElement | null;
  const selectionStyleHint = document.getElementById("selectionStyleHint") as HTMLElement | null;
  const initialSelectionStyle = normalizeSelectionStyle(readOptionalStringPref(LS_OPT_KEYS.selectionStyle));
  if (selectionStyleSelect) selectionStyleSelect.value = initialSelectionStyle;
  if (selectionStyleRow) selectionStyleRow.style.display = initialMoveHints ? "none" : "flex";
  if (selectionStyleHint) selectionStyleHint.style.display = initialMoveHints ? "none" : "";
  controller.setSelectionStyle(initialSelectionStyle);
  if (moveHintsToggle) {
    moveHintsToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.moveHints, moveHintsToggle.checked);
      controller.setMoveHints(moveHintsToggle.checked);
      if (moveHintStyleRow) moveHintStyleRow.style.display = moveHintsToggle.checked ? "flex" : "none";
      if (selectionStyleRow) selectionStyleRow.style.display = moveHintsToggle.checked ? "none" : "flex";
      if (selectionStyleHint) selectionStyleHint.style.display = moveHintsToggle.checked ? "none" : "";
    });
  }
  if (moveHintStyleSelect) {
    moveHintStyleSelect.addEventListener("change", () => {
      const nextStyle = normalizeNcMoveHintStyle(moveHintStyleSelect.value);
      writeStringPref(LS_OPT_KEYS.moveHintStyle, nextStyle);
      applyNcMoveHintStyle(nextStyle);
    });
  }
  if (selectionStyleSelect) {
    selectionStyleSelect.addEventListener("change", () => {
      const nextStyle = normalizeSelectionStyle(selectionStyleSelect.value);
      writeStringPref(LS_OPT_KEYS.selectionStyle, nextStyle);
      controller.setSelectionStyle(nextStyle);
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

  installPlayerBotSelector({
    storageSelectId: "aiWhiteSelect",
    roleSelectId: "aiWhiteRoleSelect",
    levelSelectId: "aiWhiteLevelSelect",
    levelWrapId: "aiWhiteLevelWrap",
  });
  installPlayerBotSelector({
    storageSelectId: "aiBlackSelect",
    roleSelectId: "aiBlackRoleSelect",
    levelSelectId: "aiBlackLevelSelect",
    levelWrapId: "aiBlackLevelWrap",
  });

  const onlineLocalBotEnabled =
    driver.mode === "online" && hasConfiguredOnlineLocalBot({ driver: driver as OnlineGameDriver, variantId: ACTIVE_VARIANT_ID });

  // Online (2 players): disable in-game AI controls unless this client owns a configured local bot seat.
  if (driver.mode === "online" && !onlineLocalBotEnabled) {
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
    syncPlayerBotSelector("aiWhiteSelect");
    syncPlayerBotSelector("aiBlackSelect");
  } else {
    // AI (human vs AI / AI vs AI)
    const aiManager = new AIManager(controller);
    aiManager.bind();
    controller.addAnalysisModeChangeCallback((enabled) => aiManager.setAnalysisModeActive(enabled));
    if (driver.mode === "online") {
      const elW = document.getElementById("aiWhiteSelect") as HTMLSelectElement | null;
      const elB = document.getElementById("aiBlackSelect") as HTMLSelectElement | null;
      if (elW) elW.disabled = true;
      if (elB) elB.disabled = true;
      syncPlayerBotSelector("aiWhiteSelect");
      syncPlayerBotSelector("aiBlackSelect");
    }
    consumeShellBotPlayState();
  }


  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoords, boardCoordsToggle.checked);
      syncInSquaresUI();
      controller.refreshView();
    });
  }

  if (inSquaresUI.toggle) {
    inSquaresUI.toggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.boardCoordsInSquares, inSquaresUI.toggle!.checked);
      applyBoardCoords();
      controller.refreshView();
    });
  }

  if (internationalCoordsUI.toggle) {
    internationalCoordsUI.toggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.boardCoordsInternationalNumbers, internationalCoordsUI.toggle!.checked);
      syncInSquaresUI();
      applyBoardCoords();
      updateHistoryUI();
      controller.refreshView();
    });
  }
  if (flipBoardToggle) {
    flipBoardToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.flipBoard, flipBoardToggle.checked);
      setBoardFlipped(svg, flipBoardToggle.checked);
      applyBoardCoords();
      boardPlayerNames?.sync();
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
      if (
        !isShellNewGameConfirmSuppressed() &&
        shouldConfirmDiscardCurrentGame(controller, ACTIVE_VARIANT_ID)
      ) {
        const confirmed = confirm("Start a new game? This will clear the current game and undo history.");
        if (!confirmed) {
          markShellNewGameConfirmCancelled();
          return;
        }
      }
      const freshState = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
      controller.newGame(freshState);
    });
  }

  // Wire up save/load game buttons
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  const exportHistoryBtn = document.getElementById("exportHistoryBtn") as HTMLButtonElement | null;

  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const gameLabel = saveLabelForColumnsDraughtsVariant();
      // In online mode, the authoritative history comes from server snapshots
      // (stored on the RemoteDriver), not the page-level HistoryManager.
      if (driver.mode === "online") {
        const snap = driver.exportHistorySnapshots();
        const hm = new HistoryManager();
        hm.replaceAll(snap.states as any, snap.notation, snap.currentIndex);
        const stateFromHistory = driver.getHistoryCurrent();
        const currentState = stateFromHistory ?? driver.getState();
        const filename = buildPlayerNamedSaveFilename({
          gameLabel,
          state: currentState,
          resolvePlayerLabel: (side) => resolvePlayerLabelForSave({ side, controller }),
        });
        saveGameToFile(currentState, hm, filename, {
          playerNames: {
            W: resolvePlayerLabelForSave({ side: "W", controller }),
            B: resolvePlayerLabelForSave({ side: "B", controller }),
          },
        });
        return;
      }

      const currentState = controller.getState();
      const filename = buildPlayerNamedSaveFilename({
        gameLabel,
        state: currentState,
        resolvePlayerLabel: (side) => resolvePlayerLabelForSave({ side, controller }),
      });
      saveGameToFile(currentState, history, filename, {
        playerNames: {
          W: resolvePlayerLabelForSave({ side: "W", controller }),
          B: resolvePlayerLabelForSave({ side: "B", controller }),
        },
      });
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
        commitShellThenApplySavePlayerNames(shell, controller, loaded.playerNames);
        controller.loadGame(loaded.state, loaded.history);
        if (hasSaveFilePlayerNames(loaded.playerNames)) {
          applySaveFilePlayerNamesToSession(controller, loaded.playerNames);
        }
        boardPlayerNames?.sync();
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

      const useInternationalNotation = Boolean(internationalCoordsUI.toggle?.checked);
      const formatNotation = (raw: string): string =>
        useInternationalNotation
          ? convertNotationToInternationalDraughts(raw, activeVariant.boardSize)
          : raw;

      const renderMoveCell = (entry: (typeof historyData)[number]) => {
        const whoMoved: Player = entry.toMove === "B" ? "W" : "B";
        const playerIcon = sideIcon(whoMoved);
        let label = `${playerIcon}`;
        if (entry.notation) label += ` ${formatNotation(entry.notation)}`;
        const cls = `cell clickable${entry.isCurrent ? " current" : ""}`;
        const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
        return `<div class="${cls}" data-history-index="${entry.index}" data-history-who="${whoMoved}"${currentAttr}>${label}</div>`;
      };

      if (moveHistoryLayout === "two") {
        const totalMoves = Math.ceil((historyData.length - 1) / 2);
        const parts: string[] = [];
        parts.push('<div class="historyGrid">');
        parts.push('<div class="cell hdr">#</div>');
        parts.push(`<div class="cell hdr">${sideIcon("W")} ${sideLabel("W")}</div>`);
        parts.push(`<div class="cell hdr">${sideIcon("B")} ${sideLabel("B")}</div>`);

        parts.push(renderStartCell(historyData[0]!));

        for (let m = 1; m <= totalMoves; m++) {
          const lightIdx = 2 * m - 1;
          const darkIdx = 2 * m;
          parts.push(`<div class="cell num">${m}.</div>`);

          const lightEntry = historyData[lightIdx];
          const darkEntry = historyData[darkIdx];

          if (lightEntry) parts.push(renderMoveCell(lightEntry));
          else parts.push('<div class="cell"></div>');

          if (darkEntry) parts.push(renderMoveCell(darkEntry));
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
              const currentAttr = entry.isCurrent ? " data-is-current=\"1\"" : "";
              return `<div data-history-index=\"${entry.index}\"${currentAttr} style=\"${style}\">Start</div>`;
            }

            // For moves: toMove indicates who's about to move, so invert to get who just moved
            // If toMove is "B", White just moved. If toMove is "W", Black just moved.
            const whoMoved: Player = entry.toMove === "B" ? "W" : "B";
            const playerIcon = sideIcon(whoMoved);

            // Calculate move number: each player's move increments the counter
            const moveNum = whoMoved === "B"
              ? Math.ceil(idx / 2)  // Black: moves 1, 3, 5... → move# 1, 2, 3...
              : Math.floor((idx + 1) / 2); // White: moves 2, 4, 6... → move# 1, 2, 3...

            let label = `${moveNum}. ${playerIcon}`;
            if (entry.notation) {
              label += ` ${formatNotation(entry.notation)}`;
            }
            const baseStyle = entry.isCurrent
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95);"
              : "";
            const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
            const currentAttr = entry.isCurrent ? " data-is-current=\"1\"" : "";
            return `<div data-history-index=\"${entry.index}\" data-history-who=\"${whoMoved}\"${currentAttr} style=\"${style}\">${label}</div>`;
          })
          .join("");
      }
    }

    // Keep the latest move visible.
    // Use rAF so layout reflects the updated HTML before scrolling.
    requestAnimationFrame(() => {
      if (reason === "jump" || reason === "undo" || reason === "redo") {
        const currentEl = moveHistoryEl.querySelector("[data-is-current=\"1\"]") as HTMLElement | null;
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

  // Wire up offer draw button.
  const offerDrawBtn = document.getElementById("offerDrawBtn") as HTMLButtonElement | null;
  if (offerDrawBtn) {
    offerDrawBtn.addEventListener("click", () => {
      void controller.offerDraw();
    });
  }

  bindLeaveRoomButton({
    button: document.getElementById("leaveRoomBtn") as HTMLButtonElement | null,
    driverMode: driver.mode,
    onlineDriver: driver.mode === "online" ? (driver as OnlineGameDriver) : null,
  });

  controller.addHistoryChangeCallback(updateHistoryUI);
  updateHistoryUI(); // Initial update

  updateHistoryUIForSync = () => updateHistoryUI("jump");

  bindPlaybackControls(controller);

  // If the SVG is hot-reloaded in dev, re-render coordinate labels.
  if (import.meta.hot) {
    import.meta.hot.accept(() => applyBoardCoords());
  }

  initCollapsibleSections();

  // Panel layout: Panels vs Menu (small-screen friendly).
  installPanelLayoutOptionUI();
  bindPanelLayoutMenuMode();

  // (safe to call again; injection is idempotent)
  installBoardViewportOptionUI();

  // Board height adjustment toggle (for Android tablets with bottom nav bar)
  const boardHeightToggle = document.getElementById('boardHeightToggle') as HTMLButtonElement | null;
  const centerArea = document.getElementById('centerArea') as HTMLElement | null;
  
  if (boardHeightToggle && centerArea) {
    const STORAGE_KEY = 'lasca.boardHeightReduced';
    const POS_KEY = 'lasca.boardHeightTogglePos';

    const applyResizeIconVisibility = () => {
      const showResizeIcon = showResizeIconToggle?.checked ?? (readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon) ?? false);
      boardHeightToggle.style.display = showResizeIcon ? 'flex' : 'none';

      if (!showResizeIcon) {
        centerArea.classList.remove('reduced-height');
        boardHeightToggle.textContent = '↕️';
        boardHeightToggle.title = 'Adjust board height for bottom navigation bar';
        localStorage.setItem(STORAGE_KEY, 'false');
      }
    };

    applyResizeIconVisibility();

    const isToggleVisible = () => window.getComputedStyle(boardHeightToggle).display !== 'none';

    const drag = installHoldDrag(boardHeightToggle, {
      storageKey: POS_KEY,
      holdDelayMs: 250,
    });
    
    // Restore saved state
    const savedReduced = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isToggleVisible() && savedReduced) {
      centerArea.classList.add('reduced-height');
      boardHeightToggle.textContent = '⬆️';
      boardHeightToggle.title = 'Restore full board height';
    } else {
      centerArea.classList.remove('reduced-height');
      boardHeightToggle.textContent = '↕️';
      boardHeightToggle.title = 'Adjust board height for bottom navigation bar';
    }
    
    boardHeightToggle.addEventListener('click', (e) => {
      if (drag.wasDraggedRecently()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const isReduced = centerArea.classList.toggle('reduced-height');
      
      // Update button appearance
      if (isReduced) {
        boardHeightToggle.textContent = '⬆️';
        boardHeightToggle.title = 'Restore full board height';
      } else {
        boardHeightToggle.textContent = '↕️';
        boardHeightToggle.title = 'Adjust board height for bottom navigation bar';
      }
      
      // Save state
      localStorage.setItem(STORAGE_KEY, isReduced.toString());
    });

    // Dev helper: expose to console for testing on desktop
    (window as any).toggleBoardHeightButtonVisibility = () => {
      const currentDisplay = window.getComputedStyle(boardHeightToggle).display;
      if (currentDisplay === 'none') {
        boardHeightToggle.style.display = 'flex';
        console.log('Board height button is now visible');
      } else {
        boardHeightToggle.style.display = '';
        console.log('Board height button visibility reset to CSS default');
      }

      if (window.getComputedStyle(boardHeightToggle).display === 'none') {
        centerArea.classList.remove('reduced-height');
      }
    };
  }

  if (showResizeIconToggle) {
    showResizeIconToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.showResizeIcon, showResizeIconToggle.checked);
      const boardHeightToggle = document.getElementById('boardHeightToggle') as HTMLButtonElement | null;
      if (boardHeightToggle) {
        boardHeightToggle.style.display = showResizeIconToggle.checked ? 'flex' : 'none';
      }
      const centerArea = document.getElementById('centerArea') as HTMLElement | null;
      if (!showResizeIconToggle.checked && centerArea) {
        centerArea.classList.remove('reduced-height');
        localStorage.setItem('lasca.boardHeightReduced', 'false');
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
      if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(activeVariant.rulesetId, activeVariant.boardSize);
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
      
      const rng = createPrng(`debug.__random:columns_draughts:${totalPerSide}:${toMove}:${testMode ?? ""}`);
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
