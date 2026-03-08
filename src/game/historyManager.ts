import type { GameState } from "./state.ts";

/**
 * Manages game history for undo/redo functionality.
 * Stores snapshots at turn boundaries only (after complete moves/capture chains).
 */
export class HistoryManager {
  private history: GameState[] = [];
  private moveNotation: string[] = []; // Parallel array storing move notation
  /** Elapsed move time in ms per entry (null = not recorded). */
  private moveEmtMs: Array<number | null> = [];
  private currentIndex: number = -1;

  exportSnapshots(): { states: GameState[]; notation: string[]; currentIndex: number; emtMs: Array<number | null> } {
    return {
      states: this.history.map((s) => this.cloneState(s)),
      notation: [...this.moveNotation],
      currentIndex: this.currentIndex,
      emtMs: [...this.moveEmtMs],
    };
  }

  replaceAll(states: GameState[], notation: string[], currentIndex: number, emtMs?: Array<number | null>): void {
    const clonedStates = states.map((s) => this.cloneState(s));
    const clonedNotation = [...notation];
    const clonedEmtMs: Array<number | null> = emtMs ? [...emtMs] : clonedStates.map(() => null);

    // Keep arrays aligned.
    while (clonedNotation.length < clonedStates.length) clonedNotation.push("");
    if (clonedNotation.length > clonedStates.length) clonedNotation.length = clonedStates.length;
    while (clonedEmtMs.length < clonedStates.length) clonedEmtMs.push(null);
    if (clonedEmtMs.length > clonedStates.length) clonedEmtMs.length = clonedStates.length;

    const nextIndex = Number.isInteger(currentIndex)
      ? Math.max(-1, Math.min(currentIndex, clonedStates.length - 1))
      : clonedStates.length - 1;

    this.history = clonedStates;
    this.moveNotation = clonedNotation;
    this.moveEmtMs = clonedEmtMs;
    this.currentIndex = nextIndex;
  }

  /**
   * Record a new state (called after a complete turn).
   * This clears any future history if we're not at the end.
   */
  push(state: GameState, notation?: string, emtMs?: number | null): void {
    // Remove any states after current index (user made a new move after undoing)
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.moveNotation = this.moveNotation.slice(0, this.currentIndex + 1);
    this.moveEmtMs = this.moveEmtMs.slice(0, this.currentIndex + 1);

    // Add the new state, notation, and elapsed time
    this.history.push(this.cloneState(state));
    this.moveNotation.push(notation || "");
    this.moveEmtMs.push(emtMs ?? null);
    this.currentIndex = this.history.length - 1;
  }

  /**
   * Go back one move in history.
   * Returns the previous state, or null if at the beginning.
   */
  undo(): GameState | null {
    if (!this.canUndo()) {
      return null;
    }
    
    this.currentIndex--;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Go forward one move in history.
   * Returns the next state, or null if at the end.
   */
  redo(): GameState | null {
    if (!this.canRedo()) {
      return null;
    }
    
    this.currentIndex++;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Jump directly to a specific history index.
   * Returns the target state, or null if the index is out of bounds.
   */
  jumpTo(index: number): GameState | null {
    if (!Number.isInteger(index)) return null;
    if (index < 0 || index >= this.history.length) return null;
    this.currentIndex = index;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Check if we can undo.
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if we can redo.
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get the current state without modifying history.
   */
  getCurrent(): GameState | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
      return null;
    }
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Get all history states for display (e.g., move list).
   * Returns array with move information including notation.
   */
  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string; emtMs: number | null }> {
    return this.history.map((state, idx) => ({
      index: idx,
      toMove: state.toMove,
      isCurrent: idx === this.currentIndex,
      notation: this.moveNotation[idx] || "",
      emtMs: this.moveEmtMs[idx] ?? null,
    }));
  }

  /**
   * Get the number of moves in history.
   */
  size(): number {
    return this.history.length;
  }

  /**
   * Get the current position in history (0-based).
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Reset history to empty.
   */
  clear(): void {
    this.history = [];
    this.moveNotation = [];
    this.moveEmtMs = [];
    this.currentIndex = -1;
  }

  /**
   * Deep clone a game state to prevent mutations.
   */
  private cloneState(state: GameState): GameState {
    return {
      board: new Map(
        Array.from(state.board.entries()).map(([nodeId, stack]) => [
          nodeId,
          stack.map((piece) => ({ ...piece })),
        ])
      ),
      toMove: state.toMove,
      phase: state.phase,
      meta: state.meta ? { ...state.meta } : undefined,
      ui: state.ui ? { ...state.ui, lastMove: state.ui.lastMove ? { ...state.ui.lastMove } : undefined } : undefined,
      chess: state.chess
        ? {
            castling: {
              W: { ...state.chess.castling.W },
              B: { ...state.chess.castling.B },
            },
            enPassantTarget: state.chess.enPassantTarget,
            enPassantPawn: state.chess.enPassantPawn,
          }
        : undefined,
      forcedGameOver: (state as any).forcedGameOver ? { ...(state as any).forcedGameOver } : undefined,
      damascaDeadPlay: (state as any).damascaDeadPlay ? { ...(state as any).damascaDeadPlay } : undefined,
      captureChain: state.captureChain ? { ...state.captureChain } : undefined,
    };
  }
}
