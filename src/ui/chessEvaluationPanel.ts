import type { GameController } from "../controller/gameController";
import type { GameState } from "../game/state";
import type { Player, Piece } from "../types";
import { generateLegalMoves } from "../game/movegen";
import { isKingInCheckChess, isSquareAttackedChess } from "../game/movegenChess";
import { checkCurrentPlayerLost } from "../game/gameOver";
import type { ChessBotManager, EvalScore } from "../bot/chessBotManager";
import { gameStateToFen } from "../bot/fen";

type ChessEvaluationMode = "material" | "mobility" | "center" | "threats" | "engine";

const LS_KEY_MODE = "lasca.chessEvaluation.mode";
const LS_KEY_EVAL_BAR = "lasca.chessEvaluation.showEvalBar";

function clampMode(v: string | null): ChessEvaluationMode {
  if (v === "material" || v === "mobility" || v === "center" || v === "threats" || v === "engine") return v;
  return "material";
}

/** Maps centipawns (White-perspective) to a 0–1 win-probability for the eval bar. */
function cpToWinPct(cp: number): number {
  return 1 / (1 + Math.exp(-0.004 * cp));
}

/**
 * All score values stored in cachedEvalScore are already White-perspective
 * (normalized in chessBotManager.runEval before being passed to listeners).
 * cp > 0 → White ahead; mate > 0 → White wins.
 */
function fmtEvalScore(score: EvalScore): string {
  if ("mate" in score) {
    if (score.mate > 0) return `White M${score.mate}`;
    if (score.mate < 0) return `Black M${Math.abs(score.mate)}`;
    return "Mate";
  }
  const pawns = (score.cp / 100).toFixed(1);
  if (score.cp > 0) return `+${pawns}`;
  if (score.cp < 0) return `${pawns}`;
  return "0.0";
}

/** Short numeric label for a specific player, already White-perspective. */
function fmtLabelForPlayer(score: EvalScore, player: "W" | "B"): string {
  if ("mate" in score) {
    // mate > 0 → White wins; flip sign for Black's label.
    const pm = player === "W" ? score.mate : -score.mate;
    if (pm > 0) return `+M${pm}`;
    if (pm < 0) return `-M${Math.abs(pm)}`;
    return "M?";
  }
  const pcp = player === "W" ? score.cp : -score.cp;
  const pawns = (pcp / 100).toFixed(1);
  return pcp >= 0 ? `+${pawns}` : `${pawns}`;
}

function whitePerspectiveCp(score: EvalScore): number {
  if ("mate" in score) {
    return score.mate > 0 ? 3000 : -3000;
  }
  return score.cp;
}

/** Short label for the vertical eval bar: +1.5, -1.5, 0.0, M3, -M3 */
function fmtEvalBarLabel(score: EvalScore): string {
  if ("mate" in score) {
    if (score.mate > 0) return `M${score.mate}`;
    if (score.mate < 0) return `-M${Math.abs(score.mate)}`;
    return "M?";
  }
  const pawns = (score.cp / 100).toFixed(1);
  if (score.cp > 0) return `+${pawns}`;
  if (score.cp < 0) return `${pawns}`;
  return "0.0";
}

function scoreToGraphUnit(score: EvalScore): number {
  if ("mate" in score) {
    if (score.mate > 0) return 1;
    if (score.mate < 0) return -1;
    return 0;
  }
  return Math.max(-1, Math.min(1, Math.tanh(score.cp / 500)));
}

function terminalEvalScoreForState(state: GameState): EvalScore | null {
  try {
    const forced = (state as any)?.forcedGameOver;
    if (forced) {
      if (forced.winner === "W") return { mate: 1 };
      if (forced.winner === "B") return { mate: -1 };
      return { cp: 0 };
    }

    const rulesetId = state.meta?.rulesetId ?? "";
    if (rulesetId !== "chess" && rulesetId !== "columns_chess") return null;

    const terminal = checkCurrentPlayerLost(state);
    if (!terminal.reason) return null;
    if (terminal.winner === "W") return { mate: 1 };
    if (terminal.winner === "B") return { mate: -1 };
    return { cp: 0 };
  } catch {
    return null;
  }
}

function graphScoreForState(state: GameState, importedScore?: EvalScore | null, bot?: ChessBotManager | null): EvalScore | null {
  const terminal = terminalEvalScoreForState(state);
  if (terminal) return terminal;

  if (importedScore) return importedScore;

  if (!bot) return null;
  try {
    return bot.getCachedEvalForFen(gameStateToFen(state));
  } catch {
    return null;
  }
}

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function sideLabel(p: Player): string {
  return p === "W" ? "White" : "Black";
}

function pieceValue(rank: string): number {
  const r = String(rank).toUpperCase();
  if (r === "P") return 1;
  if (r === "N") return 3;
  if (r === "B") return 3;
  if (r === "R") return 5;
  if (r === "Q") return 9;
  return 0;
}

function isChessClassic(state: GameState): boolean {
  return (state.meta?.rulesetId ?? "") === "chess";
}

function iterPieces(state: GameState): Array<{ nodeId: string; piece: Piece }> {
  const out: Array<{ nodeId: string; piece: Piece }> = [];
  for (const [nodeId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;
    // Classic chess should have exactly one piece per square, but be tolerant.
    for (const piece of stack) {
      if (!piece) continue;
      out.push({ nodeId, piece });
    }
  }
  return out;
}

function computeMaterial(state: GameState): {
  total: Record<Player, number>;
  counts: Record<Player, Record<string, number>>;
} {
  const totals: Record<Player, number> = { W: 0, B: 0 };
  const counts: Record<Player, Record<string, number>> = {
    W: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
    B: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
  };

  for (const { piece } of iterPieces(state)) {
    const owner = piece.owner;
    const r = String(piece.rank).toUpperCase();
    if (owner !== "W" && owner !== "B") continue;
    if (!(r in counts[owner])) continue;
    counts[owner][r] += 1;
    totals[owner] += pieceValue(r);
  }

  return { total: totals, counts };
}

function fmtDiff(a: number, b: number, labelA: string, labelB: string): string {
  const d = a - b;
  if (d === 0) return "even";
  const leader = d > 0 ? labelA : labelB;
  return `${leader} +${Math.abs(d)}`;
}

function formatMaterial(state: GameState): string {
  const { total, counts } = computeMaterial(state);
  const w = total.W;
  const b = total.B;

  const header = `Material: White ${w} / Black ${b} (${fmtDiff(w, b, "White", "Black")})`;

  const fmtCounts = (p: Player): string => {
    const c = counts[p];
    return `Q${c.Q} R${c.R} B${c.B} N${c.N} P${c.P}`;
  };

  return `${header}\nPieces: W ${fmtCounts("W")} | B ${fmtCounts("B")}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function setBar(fillEl: HTMLElement, pct: number, title: string): void {
  const p = Math.max(0, Math.min(100, pct));
  fillEl.style.width = `${p.toFixed(1)}%`;
  fillEl.title = title;
  fillEl.setAttribute("aria-label", title);
}

function setTrackHint(fillEl: HTMLElement, hint: string): void {
  const track = fillEl.parentElement as HTMLElement | null;
  if (!track) return;
  track.dataset.hint = hint;
}

function bindTouchHint(trackEl: HTMLElement): void {
  let timer: number | null = null;
  const show = (ev: Event) => {
    // On touch devices, hover is unavailable; briefly show the hint.
    ev.preventDefault();
    ev.stopPropagation();
    trackEl.classList.add("showHint");
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      trackEl.classList.remove("showHint");
    }, 1400);
  };

  // Capture so we don't accidentally trigger underlying board interactions.
  trackEl.addEventListener("pointerdown", show, { capture: true });
  trackEl.addEventListener("click", show, { capture: true });
}

function computePrimaryMetricForBars(
  mode: ChessEvaluationMode,
  state: GameState
): { label: string; white: number; black: number; maxExpected: number } {
  if (mode === "material") {
    const { total } = computeMaterial(state);
    // Standard chess material (excluding kings): 8P+2N+2B+2R+Q = 39.
    return { label: "Material", white: total.W, black: total.B, maxExpected: 39 };
  }

  if (mode === "mobility") {
    const w = countLegalMovesFor(state, "W");
    const b = countLegalMovesFor(state, "B");
    // Typical mobility is well under 60; clamp to keep bars readable.
    return { label: "Mobility", white: w, black: b, maxExpected: 60 };
  }

  if (mode === "center") {
    const centerSquares = ["d4", "e4", "d5", "e5"].map(algebraicToNodeId).filter((v): v is string => Boolean(v));
    const attackedBy = (by: Player): number => {
      let n = 0;
      for (const sq of centerSquares) {
        if (isSquareAttackedChess(state, sq, by)) n++;
      }
      return n;
    };
    const w = attackedBy("W");
    const b = attackedBy("B");
    return { label: "Center", white: w, black: b, maxExpected: 4 };
  }

  // threats: use attacked-piece count as the primary quantity bar.
  const countAttackedPieces = (p: Player): number => {
    const enemy = other(p);
    let attacked = 0;
    for (const { nodeId, piece } of iterPieces(state)) {
      if (piece.owner !== p) continue;
      if (String(piece.rank).toUpperCase() === "K") continue;
      if (isSquareAttackedChess(state, nodeId, enemy)) attacked++;
    }
    return attacked;
  };
  const w = countAttackedPieces("W");
  const b = countAttackedPieces("B");
  return { label: "Threats", white: w, black: b, maxExpected: 15 };
}

function countLegalMovesFor(state: GameState, p: Player): number {
  // generateLegalMoves uses state.toMove.
  const s: GameState = { ...state, toMove: p, phase: "idle" } as GameState;
  try {
    return generateLegalMoves(s).length;
  } catch {
    return 0;
  }
}

function formatMobility(state: GameState): string {
  const w = countLegalMovesFor(state, "W");
  const b = countLegalMovesFor(state, "B");

  const mobility = `Mobility: White ${w} / Black ${b} (${fmtDiff(w, b, "White", "Black")})`;

  const inCheckW = isKingInCheckChess({ ...state, toMove: "W" } as GameState, "W");
  const inCheckB = isKingInCheckChess({ ...state, toMove: "B" } as GameState, "B");
  const checkLine = inCheckW
    ? "Check: White in check"
    : inCheckB
      ? "Check: Black in check"
      : "Check: —";

  return `${mobility}\n${checkLine}`;
}

function algebraicToNodeId(sq: string): string | null {
  const s = String(sq).trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(s)) return null;
  const file = s.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(s[1]);
  const row = 8 - rank;
  const col = file;
  return `r${row}c${col}`;
}

function formatCenter(state: GameState): string {
  const centerSquares = ["d4", "e4", "d5", "e5"]
    .map(algebraicToNodeId)
    .filter((v): v is string => Boolean(v));

  const attacked = (by: Player): number => {
    let n = 0;
    for (const sq of centerSquares) {
      if (isSquareAttackedChess(state, sq, by)) n++;
    }
    return n;
  };

  const w = attacked("W");
  const b = attacked("B");

  const occupiedBy = (p: Player): number => {
    let n = 0;
    for (const sq of centerSquares) {
      const stack = state.board.get(sq);
      const top = stack?.[0];
      if (top && top.owner === p) n++;
    }
    return n;
  };

  const occW = occupiedBy("W");
  const occB = occupiedBy("B");

  const line1 = `Center control (d4/e4/d5/e5): White ${w} / Black ${b} (${fmtDiff(w, b, "White", "Black")})`;
  const line2 = `Center occupancy: White ${occW} / Black ${occB} (${fmtDiff(occW, occB, "White", "Black")})`;
  return `${line1}\n${line2}`;
}

function formatThreats(state: GameState): string {
  const count = (p: Player): { attacked: number; hanging: number } => {
    const enemy = other(p);
    let attacked = 0;
    let hanging = 0;

    for (const { nodeId, piece } of iterPieces(state)) {
      if (piece.owner !== p) continue;
      if (String(piece.rank).toUpperCase() === "K") continue;

      const isAttacked = isSquareAttackedChess(state, nodeId, enemy);
      if (isAttacked) attacked++;

      const isDefended = isSquareAttackedChess(state, nodeId, p);
      if (isAttacked && !isDefended) hanging++;
    }

    return { attacked, hanging };
  };

  const w = count("W");
  const b = count("B");

  const inCheckW = isKingInCheckChess(state, "W");
  const inCheckB = isKingInCheckChess(state, "B");

  const line1 = `Attacked pieces: White ${w.attacked} / Black ${b.attacked} (${fmtDiff(
    w.attacked,
    b.attacked,
    "White",
    "Black"
  )})`;
  const line2 = `Hanging pieces: White ${w.hanging} / Black ${b.hanging} (${fmtDiff(
    w.hanging,
    b.hanging,
    "White",
    "Black"
  )})`;
  const line3 = inCheckW ? "Check: White in check" : inCheckB ? "Check: Black in check" : "Check: —";

  return `${line1}\n${line2}\n${line3}`;
}

export function bindChessEvaluationPanel(controller: GameController, bot?: ChessBotManager | null): void {
  const modeRootEl = document.getElementById("evaluationMode") as HTMLElement | null;
  const valueEl = document.getElementById("evaluationValue") as HTMLElement | null;
  const barWhiteEl = document.getElementById("evaluationBarWhite") as HTMLElement | null;
  const barBlackEl = document.getElementById("evaluationBarBlack") as HTMLElement | null;
  const engNumsEl = document.getElementById("engineEvalNumbers") as HTMLElement | null;
  const engNumWEl = document.getElementById("engineEvalNumW") as HTMLElement | null;
  const engNumBEl = document.getElementById("engineEvalNumB") as HTMLElement | null;
  // evalBarVerticalEl points to the *outer* wrapper so that toggling evalBarVisible
  // on it also controls the flex-column width (display: none collapses the space).
  const evalBarVerticalEl = document.getElementById("evalBarOuter") as HTMLElement | null;
  const evalBarBlackFillEl = document.getElementById("evalBarBlackFill") as HTMLElement | null;
  const evalBarLabelEl = document.getElementById("evalBarLabel") as HTMLElement | null;
  const showEvalBarToggleEl = document.getElementById("showEvalBarToggle") as HTMLInputElement | null;
  const evalBarToggleLabelEl = document.getElementById("evalBarToggleLabel") as HTMLElement | null;
  const evalBarToggleRowEl = document.getElementById("evalBarToggleRow") as HTMLElement | null;
  const graphSectionEl = document.getElementById("evaluationGraphSection") as HTMLElement | null;
  const graphStatusEl = document.getElementById("evaluationGraphStatus") as HTMLElement | null;
  const graphSvgEl = document.getElementById("evaluationGraphSvg") as SVGSVGElement | null;
  const graphPathEl = document.getElementById("evaluationGraphPath") as SVGPathElement | null;
  const graphCurrentEl = document.getElementById("evaluationGraphCurrent") as SVGCircleElement | null;
  if (!modeRootEl || !valueEl) return;

  if (barWhiteEl?.parentElement) bindTouchHint(barWhiteEl.parentElement as HTMLElement);
  if (barBlackEl?.parentElement) bindTouchHint(barBlackEl.parentElement as HTMLElement);

  const btnEls = Array.from(modeRootEl.querySelectorAll<HTMLButtonElement>(".evalModeBtn"));
  if (btnEls.length === 0) return;

  let mode: ChessEvaluationMode = clampMode(localStorage.getItem(LS_KEY_MODE));
  let graphStateCount = 0;
  let graphEvalJobToken = 0;
  let graphRetryTimer: number | null = null;
  const useLocalEngine = () => Boolean(bot) && !controller.isOnlineSpectator();
  const engineAvailable = () => Boolean(bot) || controller.isOnlineSpectator();

  // Restore eval bar toggle from localStorage.
  const savedShowEvalBar = localStorage.getItem(LS_KEY_EVAL_BAR);
  if (showEvalBarToggleEl && savedShowEvalBar !== null) {
    showEvalBarToggleEl.checked = savedShowEvalBar === "1";
  }

  const clearGraphRetry = () => {
    if (graphRetryTimer !== null) {
      window.clearTimeout(graphRetryTimer);
      graphRetryTimer = null;
    }
  };

  const graphVisible = () => mode === "engine" && useLocalEngine();

  const renderGraph = () => {
    if (!graphSectionEl || !graphStatusEl || !graphPathEl || !graphCurrentEl) return;

    const visible = graphVisible();
    graphSectionEl.style.display = visible ? "" : "none";
    if (!visible || !bot) return;

    const snap = controller.getHistorySnapshots();
    const states = snap.states ?? [];
    const importedEvals = snap.evals ?? [];
    graphStateCount = states.length;

    if (states.length === 0) {
      graphStatusEl.textContent = "—";
      graphPathEl.setAttribute("d", "");
      graphCurrentEl.style.display = "none";
      return;
    }

    const left = 8;
    const right = 312;
    const midY = 60;
    const amplitude = 46;
    const scores = states.map((state, index) => graphScoreForState(state as GameState, importedEvals[index] ?? null, bot));
    const ready = scores.filter((score) => score !== null).length;

    if (ready >= states.length) graphStatusEl.textContent = `${states.length} positions`;
    else if (!bot.isEngineReady()) graphStatusEl.textContent = "Starting engine…";
    else graphStatusEl.textContent = `Evaluating ${ready}/${states.length}…`;

    let d = "";
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      if (!score) continue;
      const x = states.length <= 1 ? (left + right) / 2 : left + (i / (states.length - 1)) * (right - left);
      const y = midY - scoreToGraphUnit(score) * amplitude;
      d += d ? ` L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    graphPathEl.setAttribute("d", d);

    const currentIndex = Math.max(0, Math.min(snap.currentIndex, states.length - 1));
    const currentScore = scores[currentIndex];
    if (!currentScore) {
      graphCurrentEl.style.display = "none";
    } else {
      const x = states.length <= 1 ? (left + right) / 2 : left + (currentIndex / (states.length - 1)) * (right - left);
      const y = midY - scoreToGraphUnit(currentScore) * amplitude;
      graphCurrentEl.setAttribute("cx", x.toFixed(2));
      graphCurrentEl.setAttribute("cy", y.toFixed(2));
      graphCurrentEl.style.display = "";
    }
  };

  const queueGraphRetry = (token: number, delayMs: number) => {
    clearGraphRetry();
    graphRetryTimer = window.setTimeout(() => {
      graphRetryTimer = null;
      if (token !== graphEvalJobToken) return;
      scheduleGraphEvaluation();
    }, delayMs);
  };

  const scheduleGraphEvaluation = () => {
    clearGraphRetry();
    graphEvalJobToken += 1;
    const token = graphEvalJobToken;
    renderGraph();
    if (!graphVisible() || !bot) return;

    void (async () => {
      const snap = controller.getHistorySnapshots();
      const states = snap.states ?? [];
      const importedEvals = snap.evals ?? [];
      if (states.length === 0) return;

      const missingCount = states.filter(
        (state, index) => !graphScoreForState(state as GameState, importedEvals[index] ?? null, bot)
      ).length;
      if (missingCount === 0) {
        renderGraph();
        return;
      }

      if (!bot.isEngineReady()) {
        bot.activateForEvaluation();
        queueGraphRetry(token, 700);
        return;
      }

      for (let index = 0; index < states.length; index++) {
        const state = states[index]!;
        if (token !== graphEvalJobToken || !graphVisible()) return;

        let fen = "";
        try {
          fen = gameStateToFen(state as GameState);
        } catch {
          continue;
        }

        if (graphScoreForState(state as GameState, importedEvals[index] ?? null, bot)) continue;

        const score = await bot.evaluateFen(fen, { movetimeMs: 120, timeoutMs: 3000 });
        if (token !== graphEvalJobToken) return;
        renderGraph();
        if (score === null) {
          queueGraphRetry(token, 700);
          return;
        }
      }

      renderGraph();
    })();
  };

  if (graphSvgEl) {
    graphSvgEl.addEventListener("click", (ev) => {
      if (!graphVisible() || graphStateCount <= 0) return;
      const rect = graphSvgEl.getBoundingClientRect();
      if (!rect.width) return;
      const left = 8;
      const right = 312;
      const x = ((ev.clientX - rect.left) / rect.width) * 320;
      const clamped = Math.max(left, Math.min(right, x));
      const ratio = graphStateCount <= 1 ? 0 : (clamped - left) / (right - left);
      const targetIndex = graphStateCount <= 1 ? 0 : Math.round(ratio * (graphStateCount - 1));
      controller.jumpToHistory(targetIndex);
    });
  }

  const applyEvalBarVisibility = () => {
    const visible = mode === "engine" && Boolean(showEvalBarToggleEl?.checked);
    if (evalBarVerticalEl) {
      evalBarVerticalEl.classList.toggle("evalBarVisible", visible);
      evalBarVerticalEl.setAttribute("aria-hidden", String(!visible));
    }
    try {
      if (visible) {
        document.body?.setAttribute("data-eval-bar-visible", "1");
      } else {
        document.body?.removeAttribute("data-eval-bar-visible");
      }
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(new Event("chessEvalBarVisibilityChanged"));
    } catch {
      // ignore
    }
  };

  const updateEvalBarToggleRow = () => {
    const isEngine = mode === "engine";
    const displayVal = isEngine ? "" : "none";
    if (evalBarToggleLabelEl) evalBarToggleLabelEl.style.display = displayVal;
    if (evalBarToggleRowEl) evalBarToggleRowEl.style.display = isEngine ? "flex" : "none";
    applyEvalBarVisibility();
    renderGraph();
  };

  const updateVerticalEvalBar = (score: EvalScore | null, pending: boolean) => {
    if (!evalBarVerticalEl) return;
    if (score !== null) {
      const cp = whitePerspectiveCp(score);
      const winPct = cpToWinPct(cp);
      const blackPct = (1 - winPct) * 100;
      // Clamp so label never goes fully off the bar edge.
      const clampedPct = Math.max(2, Math.min(98, blackPct));
      if (evalBarBlackFillEl) evalBarBlackFillEl.style.height = `${blackPct.toFixed(1)}%`;
      if (evalBarLabelEl) {
        evalBarLabelEl.style.top = `${clampedPct.toFixed(1)}%`;
        evalBarLabelEl.textContent = fmtEvalBarLabel(score);
      }
    } else {
      if (evalBarBlackFillEl) evalBarBlackFillEl.style.height = "50%";
      if (evalBarLabelEl) {
        evalBarLabelEl.style.top = "50%";
        evalBarLabelEl.textContent = pending ? "\u2026" : "\u2014";
      }
    }
  };

  if (showEvalBarToggleEl) {
    showEvalBarToggleEl.addEventListener("change", () => {
      localStorage.setItem(LS_KEY_EVAL_BAR, showEvalBarToggleEl.checked ? "1" : "0");
      applyEvalBarVisibility();
    });
  }

  // Cached engine eval state — persists across re-renders triggered by history changes.
  let cachedEvalScore: EvalScore | null = null;
  let cachedEvalPending = false;

  // Sync engine-button enabled state whenever availability changes.
  const updateEngineButtonState = () => {
    for (const btn of btnEls) {
      if (btn.getAttribute("data-mode") === "engine") {
        const available = engineAvailable();
        btn.disabled = !available;
        btn.title = available
          ? controller.isOnlineSpectator()
            ? "Published player engine evaluation"
            : "Engine evaluation (Stockfish)"
          : "Engine evaluation unavailable";
      }
    }
  };

  const setMode = (next: ChessEvaluationMode) => {
    mode = next;
    localStorage.setItem(LS_KEY_MODE, mode);
    for (const btn of btnEls) {
      const m = clampMode(btn.getAttribute("data-mode"));
      btn.setAttribute("aria-pressed", String(m === mode));
    }
    if (next === "engine" && useLocalEngine() && bot) {
      cachedEvalPending = true;
      bot.activateForEvaluation();
      scheduleGraphEvaluation();
    }
    updateEvalBarToggleRow();
  };

  const render = () => {
    const state = controller.getState();
    if (!isChessClassic(state)) return;
    const snap = controller.getHistorySnapshots();
    const importedCurrentScore = snap.evals?.[snap.currentIndex] ?? null;
    const publishedCurrentScore = controller.getOnlinePublishedEvalScore();
    const localEngineActive = useLocalEngine();
    const spectatorPublishedOnly = controller.isOnlineSpectator();

    const currentMode = mode;

    if (currentMode === "engine") {
      // Show the numeric score labels above bars.
      if (engNumsEl) engNumsEl.style.visibility = "visible";
      const terminalScore = terminalEvalScoreForState(state);
      const score = terminalScore ?? importedCurrentScore ?? publishedCurrentScore ?? (localEngineActive ? cachedEvalScore : null);
      const pending = terminalScore || importedCurrentScore || publishedCurrentScore ? false : (localEngineActive ? cachedEvalPending : false);

      // Engine mode: render a single sigmoid eval bar spanning White/Black.
      if (barWhiteEl && barBlackEl) {
        if (score !== null) {
          const cp = whitePerspectiveCp(score);
          const winPct = cpToWinPct(cp);
          const wPct = winPct * 100;
          const bPct = (1 - winPct) * 100;
          const wLabel = fmtLabelForPlayer(score, "W");
          const bLabel = fmtLabelForPlayer(score, "B");
          setBar(barWhiteEl, wPct, `White ${wLabel}`);
          setBar(barBlackEl, bPct, `Black ${bLabel}`);
          setTrackHint(barWhiteEl, `White win% ${(winPct * 100).toFixed(0)}%`);
          setTrackHint(barBlackEl, `Black win% ${((1 - winPct) * 100).toFixed(0)}%`);

          if (engNumWEl) engNumWEl.textContent = `W ${wLabel}`;
          if (engNumBEl) engNumBEl.textContent = `B ${bLabel}`;
        } else {
          const placeholder = pending ? "Evaluating\u2026" : "\u2014";
          setBar(barWhiteEl, 50, placeholder);
          setBar(barBlackEl, 50, placeholder);
          setTrackHint(barWhiteEl, placeholder);
          setTrackHint(barBlackEl, placeholder);
          if (engNumWEl) engNumWEl.textContent = "W \u2014";
          if (engNumBEl) engNumBEl.textContent = "B \u2014";
        }

      }

      // Update the vertical eval bar (independent of horizontal bars).
      updateVerticalEvalBar(score, pending);

      if (terminalScore && "mate" in terminalScore) {
        valueEl.textContent = `Engine eval: ${fmtEvalScore(terminalScore)}`;
      } else if (score !== null && !pending) {
        valueEl.textContent = `Engine eval: ${fmtEvalScore(score)}`;
      } else if (spectatorPublishedOnly) {
        valueEl.textContent = "Waiting for player eval…";
      } else if (bot && !bot.isEngineReady()) {
        valueEl.textContent = "Starting engine\u2026";
      } else if (pending) {
        valueEl.textContent = score !== null
          ? `Calculating\u2026 (last: ${fmtEvalScore(score)})`
          : "Calculating\u2026";
      } else {
        valueEl.textContent = "Engine eval: —";
      }
      renderGraph();
      return;
    }

    // Non-engine modes: hide the numeric score row and vertical bar.
    if (engNumsEl) engNumsEl.style.visibility = "hidden";
    updateVerticalEvalBar(null, false);

    // Quantity bars reflect the primary value for the selected mode.
    if (barWhiteEl && barBlackEl) {
      const metric = computePrimaryMetricForBars(currentMode, state);
      const denom = Math.max(1, metric.maxExpected);
      const wPct = clamp01(metric.white / denom) * 100;
      const bPct = clamp01(metric.black / denom) * 100;
      setBar(barWhiteEl, wPct, `${metric.label}: White ${metric.white}`);
      setBar(barBlackEl, bPct, `${metric.label}: Black ${metric.black}`);
      setTrackHint(barWhiteEl, `White: ${metric.white}`);
      setTrackHint(barBlackEl, `Black: ${metric.black}`);
    }

    if (controller.isOver()) {
      const prefix = "Final: ";
      if (currentMode === "material") valueEl.textContent = `${prefix}${formatMaterial(state)}`;
      else if (currentMode === "mobility") valueEl.textContent = `${prefix}${formatMobility(state)}`;
      else if (currentMode === "center") valueEl.textContent = `${prefix}${formatCenter(state)}`;
      else valueEl.textContent = `${prefix}${formatThreats(state)}`;
      return;
    }

    if (currentMode === "material") valueEl.textContent = formatMaterial(state);
    else if (currentMode === "mobility") valueEl.textContent = formatMobility(state);
    else if (currentMode === "center") valueEl.textContent = formatCenter(state);
    else valueEl.textContent = formatThreats(state);
    renderGraph();
  };

  for (const btn of btnEls) {
    btn.addEventListener("click", () => {
      const next = clampMode(btn.getAttribute("data-mode"));
      if (next === "engine" && !engineAvailable()) return;
      setMode(next);
      render();
    });
  }

  // Register eval change listener so engine-mode renders update live.
  if (bot) {
    bot.addEvalChangeListener((score, pending) => {
      cachedEvalScore = score;
      cachedEvalPending = pending;
      if (score && !pending) controller.publishOnlineEvalScore(score);
      if (mode === "engine") scheduleGraphEvaluation();
      if (mode === "engine") render();
    });
  }

  // Clear cached eval score when the position changes, so we don't show a stale score.
  controller.addHistoryChangeCallback(() => {
    if (mode === "engine") {
      cachedEvalPending = true; // position changed; score is now stale until engine responds
      scheduleGraphEvaluation();
    }
    render();
  });
  updateEngineButtonState();
  // Fall back from "engine" to "material" when no bot is present.
  if (mode === "engine" && !engineAvailable()) setMode("material");
  setMode(mode);
  updateEvalBarToggleRow();
  render();
}
