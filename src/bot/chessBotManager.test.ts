import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../game/state.ts";
import { ChessBotManager } from "./chessBotManager.ts";

class FakeController {
  private historyCb: ((reason: any) => void) | null = null;
  private state: GameState;
  private history: any[];

  public sticky: { key: string | null; text: string | null } = { key: null, text: null };
  public stickyActionKeys: string[] = [];
  public inputEnabled: boolean | null = null;

  constructor(state: GameState, history: any[]) {
    this.state = state;
    this.history = history;
  }

  addHistoryChangeCallback(cb: (reason: any) => void): void {
    this.historyCb = cb;
  }

  fire(reason: any): void {
    this.historyCb?.(reason);
  }

  getState(): GameState {
    return this.state;
  }

  setState(s: GameState): void {
    this.state = s;
  }

  getHistory(): any[] {
    return this.history;
  }

  setHistory(h: any[]): void {
    this.history = h;
  }

  isOver(): boolean {
    return false;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
  }

  toast(_text: string, _durationMs?: number): void {
    // ignore
  }

  showStickyToast(key: string, text: string): void {
    this.sticky.key = key;
    this.sticky.text = text;
  }

  clearStickyToast(key: string): void {
    if (this.sticky.key === key) {
      this.sticky.key = null;
      this.sticky.text = null;
    }
  }

  setStickyToastAction(key: string, action: (() => void) | null): void {
    if (action) this.stickyActionKeys.push(key);
  }
}

function mkChessState(toMove: "W" | "B"): GameState {
  return {
    board: new Map(),
    toMove,
    phase: "idle",
    meta: { variantId: "chess_classic" as any, rulesetId: "chess", boardSize: 8 },
  };
}

describe("ChessBotManager loadGame paused toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    // Enable a bot for Black.
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "beginner");
    localStorage.setItem("lasca.chessbot.paused", "false");
  });

  it("shows the sticky resume-bot toast after load even when viewing past in history", () => {
    const state = mkChessState("B");

    // Simulate a loaded history with redo states: current is not the last.
    const history = [
      { index: 0, isCurrent: false },
      { index: 1, isCurrent: true },
      { index: 2, isCurrent: false },
    ];

    const controller = new FakeController(state, history);
    // Cast: ChessBotManager only uses a subset of GameController.
    const mgr = new ChessBotManager(controller as any);

    controller.fire("loadGame");

    // Allow kick() + toast sync timers to run.
    vi.runAllTimers();

    expect(controller.sticky.key).toBe("chessbot_paused_turn");
    expect(controller.sticky.text).toContain("Black");
    expect(controller.sticky.text).toContain("Tap here to resume bot");
    expect(controller.stickyActionKeys).toContain("chessbot_paused_turn");
  });
});
