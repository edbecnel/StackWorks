import type { GameDriver, HistorySnapshots } from "./gameDriver.ts";
import type { GameState, Move } from "../core/index.ts";
import { applyMove, finalizeDamaCaptureChain, finalizeDamascaCaptureChain } from "../core/index.ts";
import { HistoryManager } from "../game/historyManager.ts";

export class LocalDriver implements GameDriver {
  readonly mode = "local" as const;

  private state: GameState;
  private history: HistoryManager;

  constructor(state: GameState, history: HistoryManager) {
    this.state = state;
    this.history = history;
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  async submitMove(move: Move): Promise<GameState & { didPromote?: boolean }> {
    const next = applyMove(this.state, move);
    this.state = next;
    return next;
  }

  finalizeCaptureChain(
    args:
      | { rulesetId: "dama" | "draughts_international"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca" | "damasca_classic"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean } {
    if (args.rulesetId === "dama" || args.rulesetId === "draughts_international") {
      const next = finalizeDamaCaptureChain(args.state, args.landing, args.jumpedSquares);
      this.state = next;
      return next;
    }
    const next = finalizeDamascaCaptureChain(args.state, args.landing);
    this.state = next;
    return next;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  undo(): GameState | null {
    const s = this.history.undo();
    if (s) this.state = s;
    return s;
  }

  redo(): GameState | null {
    const s = this.history.redo();
    if (s) this.state = s;
    return s;
  }

  jumpToHistory(index: number): GameState | null {
    const s = this.history.jumpTo(index);
    if (s) this.state = s;
    return s;
  }

  clearHistory(): void {
    this.history.clear();
  }

  pushHistory(state: GameState, notation?: string, emtMs?: number | null): void {
    this.history.push(state, notation, emtMs);
    this.state = state;
  }

  replaceHistory(snap: HistorySnapshots): void {
    this.history.replaceAll(snap.states, snap.notation, snap.currentIndex, snap.emtMs, snap.evals);
    const current = this.history.getCurrent();
    if (current) this.state = current;
  }

  exportHistorySnapshots(): HistorySnapshots {
    return this.history.exportSnapshots();
  }

  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string; emtMs: number | null }> {
    return this.history.getHistory();
  }

  getHistoryCurrent(): GameState | null {
    return this.history.getCurrent();
  }
}
