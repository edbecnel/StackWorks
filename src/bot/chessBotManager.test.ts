import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../game/state.ts";
import { ChessBotManager } from "./chessBotManager.ts";

class FakeController {
  private historyCb: ((reason: any) => void) | null = null;
  private state: GameState;
  private history: any[];
  private over = false;

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

  setOver(v: boolean): void {
    this.over = v;
  }

  isOver(): boolean {
    return this.over;
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
    expect(controller.sticky.text).toContain("Tap here ore press spacebar to resume bot");
    expect(controller.stickyActionKeys).toContain("chessbot_paused_turn");
  });

  it("re-enables Resume bot and shows the paused toast on a fresh new game after game over", () => {
    localStorage.setItem("lasca.chessbot.white", "beginner");
    localStorage.setItem("lasca.chessbot.black", "beginner");

    document.body.innerHTML = `
      <select id="botWhiteSelect"><option value="human">human</option><option value="beginner">beginner</option></select>
      <select id="botBlackSelect"><option value="human">human</option><option value="beginner">beginner</option></select>
      <input id="botDelay" />
      <button id="botDelayReset"></button>
      <span id="botDelayLabel"></span>
      <button id="botPauseBtn"></button>
      <button id="botResetLearningBtn"></button>
      <span id="botStatus"></span>
      <div id="boardWrap"></div>
    `;

    const controller = new FakeController(mkChessState("W"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => ({
        init: async () => {},
        terminate: () => {},
        bestMove: async () => "",
        evaluate: async () => null,
      } as any),
    });

    mgr.bind();
    vi.runAllTimers();

    const pauseBtn = document.getElementById("botPauseBtn") as HTMLButtonElement;
    expect(pauseBtn.disabled).toBe(false);

    controller.setOver(true);
    controller.fire("gameOver");
    expect(pauseBtn.disabled).toBe(true);

    controller.setOver(false);
    controller.setState(mkChessState("W"));
    controller.setHistory([{ index: 0, isCurrent: true }]);
    controller.sticky = { key: null, text: null };
    controller.fire("newGame");
    vi.runAllTimers();

    expect(pauseBtn.disabled).toBe(false);
    expect(pauseBtn.textContent).toBe("Resume bot");
    expect(controller.sticky.key).toBe("chessbot_paused_turn");
    expect(controller.sticky.text).toContain("White to Play");
  });
});
