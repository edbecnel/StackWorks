import type { GameController } from "../controller/gameController";
import type { GameState } from "../game/state";
import type { Player, Piece } from "../types";
import { generateLegalMoves } from "../game/movegen";
import { isKingInCheckChess, isSquareAttackedChess } from "../game/movegenChess";

type ChessEvaluationMode = "material" | "mobility" | "center" | "threats";

const LS_KEY_MODE = "lasca.chessEvaluation.mode";

function clampMode(v: string | null): ChessEvaluationMode {
  if (v === "material" || v === "mobility" || v === "center" || v === "threats") return v;
  return "material";
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

export function bindChessEvaluationPanel(controller: GameController): void {
  const modeRootEl = document.getElementById("evaluationMode") as HTMLElement | null;
  const valueEl = document.getElementById("evaluationValue") as HTMLElement | null;
  const barWhiteEl = document.getElementById("evaluationBarWhite") as HTMLElement | null;
  const barBlackEl = document.getElementById("evaluationBarBlack") as HTMLElement | null;
  if (!modeRootEl || !valueEl) return;

  if (barWhiteEl?.parentElement) bindTouchHint(barWhiteEl.parentElement as HTMLElement);
  if (barBlackEl?.parentElement) bindTouchHint(barBlackEl.parentElement as HTMLElement);

  const btnEls = Array.from(modeRootEl.querySelectorAll<HTMLButtonElement>(".evalModeBtn"));
  if (btnEls.length === 0) return;

  let mode: ChessEvaluationMode = clampMode(localStorage.getItem(LS_KEY_MODE));

  const setMode = (next: ChessEvaluationMode) => {
    mode = next;
    localStorage.setItem(LS_KEY_MODE, mode);
    for (const btn of btnEls) {
      const m = clampMode(btn.getAttribute("data-mode"));
      btn.setAttribute("aria-pressed", String(m === mode));
    }
  };

  const render = () => {
    const state = controller.getState();
    if (!isChessClassic(state)) return;

    const currentMode = mode;

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
  };

  for (const btn of btnEls) {
    btn.addEventListener("click", () => {
      const next = clampMode(btn.getAttribute("data-mode"));
      setMode(next);
      render();
    });
  }

  controller.addHistoryChangeCallback(render);
  setMode(mode);
  render();
}
