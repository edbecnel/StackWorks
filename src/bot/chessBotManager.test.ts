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
  public stickyShowCounts: Record<string, number> = {};
  public inputEnabled: boolean | null = null;
  public playedMoves: any[] = [];
  public driverMode: "local" | "online" = "local";

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

  getDriverMode(): "local" | "online" {
    return this.driverMode;
  }

  getLegalMovesForTurn(): any[] {
    return [{ kind: "move", from: "r6c0", to: "r5c0" }];
  }

  async playMove(move: any): Promise<void> {
    this.playedMoves.push(move);
    this.state = { ...this.state, toMove: "W" };
  }

  toast(_text: string, _durationMs?: number): void {
    // ignore
  }

  showStickyToast(key: string, text: string): void {
    this.stickyShowCounts[key] = (this.stickyShowCounts[key] ?? 0) + 1;
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
    localStorage.setItem("lasca.chessbot.delayMs", "0");
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
    expect(controller.sticky.text).toContain("Tap here or press spacebar to resume bot");
    expect(controller.stickyActionKeys).toContain("chessbot_paused_turn");
  });

  it("does not show the paused bot sticky toast when jumping to a past move during playback", () => {
    const state = mkChessState("B");
    const history = [
      { index: 0, isCurrent: false },
      { index: 1, isCurrent: false },
      { index: 2, isCurrent: true },
    ];

    const controller = new FakeController(state, history);
    const mgr = new ChessBotManager(controller as any);

    controller.fire("loadGame");
    vi.runAllTimers();
    expect(controller.sticky.key).toBe("chessbot_paused_turn");

    controller.setHistory([
      { index: 0, isCurrent: true },
      { index: 1, isCurrent: false },
      { index: 2, isCurrent: false },
    ]);
    controller.fire("jump");
    vi.runAllTimers();

    expect(controller.sticky.key).toBeNull();
    expect(controller.sticky.text).toBeNull();
  });

  it("does not auto-pause an online human-vs-bot game at launch", async () => {
    document.body.innerHTML = `
      <select id="botWhiteSelect"><option value="human">Human</option><option value="beginner">Beginner</option></select>
      <select id="botBlackSelect"><option value="human">Human</option><option value="beginner">Beginner</option></select>
      <input id="botDelay" />
      <button id="botDelayReset"></button>
      <span id="botDelayLabel"></span>
      <button id="botPauseBtn"></button>
      <button id="botResetLearningBtn"></button>
      <span id="botStatus"></span>
      <div id="boardWrap"></div>
    `;

    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "beginner");
    localStorage.setItem("lasca.chessbot.paused", "true");
    localStorage.setItem("lasca.chessbot.delayMs", "0");

    const controller = new FakeController(mkChessState("W"), [{ index: 0, isCurrent: true }]);
    controller.driverMode = "online";
    const mgr = new ChessBotManager(controller as any, {
      skipAutoPauseAtStart: true,
      engineFactory: () => ({
        init: async () => {},
        terminate: () => {},
        bestMove: async () => "",
        evaluate: async () => null,
      } as any),
    });

    mgr.bind();
    await vi.runAllTimersAsync();

    expect(localStorage.getItem("lasca.chessbot.paused")).toBe("false");
    expect(controller.inputEnabled).toBe(true);
    expect(controller.sticky.key).not.toBe("chessbot_paused_turn");
  });

  it("prepends the signed-in local account name to bot dropdowns", async () => {
    document.body.innerHTML = `
      <select id="botWhiteSelect"><option value="human">Human</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="master">Master</option></select>
      <select id="botBlackSelect"><option value="human">Human</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="master">Master</option></select>
      <input id="botDelay" />
      <button id="botDelayReset"></button>
      <span id="botDelayLabel"></span>
      <button id="botPauseBtn"></button>
      <button id="botResetLearningBtn"></button>
      <span id="botStatus"></span>
      <div id="boardWrap"></div>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "EdB" } }),
    })));

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const whiteOptions = Array.from((document.getElementById("botWhiteSelect") as HTMLSelectElement).options).map((option) => ({
      text: option.textContent,
      disabled: option.disabled,
      value: option.value,
    }));

    expect(whiteOptions.slice(0, 6)).toEqual([
      { text: "EdB", disabled: true, value: "" },
      { text: "Human", disabled: false, value: "human" },
      { text: "Beginner", disabled: false, value: "beginner" },
      { text: "Intermediate", disabled: false, value: "intermediate" },
      { text: "Advanced", disabled: false, value: "advanced" },
      { text: "Master", disabled: false, value: "master" },
    ]);
  });

  it("re-enables Resume bot and shows the paused toast on a fresh new game after game over", async () => {
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
    await vi.runAllTimersAsync();

    expect(pauseBtn.disabled).toBe(false);
    expect(pauseBtn.textContent).toBe("Resume bot");
    expect(controller.sticky.key).toBe("chessbot_paused_turn");
    expect(controller.sticky.text).toContain("White to Play");
  });

  it("falls back to a legal move after a Stockfish bestmove timeout", async () => {
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

    const terminate = vi.fn();
    let engineCreates = 0;
    const controller = new FakeController(mkChessState("B"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => {
        engineCreates++;
        return {
          init: async () => {},
          terminate,
          bestMove: async () => {
            throw new Error("Stockfish timeout: bestmove");
          },
          evaluate: async () => null,
        } as any;
      },
    });

    mgr.bind();
    await vi.runAllTimersAsync();

    const pauseBtn = document.getElementById("botPauseBtn") as HTMLButtonElement;
    pauseBtn.click();
    await vi.runAllTimersAsync();

    expect(controller.playedMoves.length).toBe(1);
    expect(terminate).toHaveBeenCalled();
    expect(engineCreates).toBeGreaterThanOrEqual(2);
  });

  it("shows the existing Stockfish sticky toast even when toast notifications are disabled", async () => {
    localStorage.setItem("lasca.opt.toasts", "0");

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

    const controller = new FakeController(mkChessState("B"), [{ index: 0, isCurrent: true }]);
    let engineCreates = 0;
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => {
        engineCreates += 1;
        if (engineCreates === 1) {
          return {
            init: async () => {},
            terminate: () => {},
            bestMove: async () => {
              throw new Error("Stockfish worker failed: crashed");
            },
            evaluate: async () => null,
          } as any;
        }

        return {
          init: async () => {
            throw new Error("Stockfish worker failed: still down");
          },
          terminate: () => {},
          bestMove: async () => "",
          evaluate: async () => null,
        } as any;
      },
    });

    mgr.bind();
    await vi.runAllTimersAsync();

    const pauseBtn = document.getElementById("botPauseBtn") as HTMLButtonElement;
    pauseBtn.click();
    await vi.runAllTimersAsync();

    expect(controller.sticky.key).toBe("chessbot_warmup");
    expect(controller.sticky.text).toContain("failed to start");
    expect(controller.stickyActionKeys).toContain("chessbot_warmup");
  });

  it("keeps the Stockfish failure toast visible when paused-turn toast sync runs afterward", async () => {
    const controller = new FakeController(mkChessState("B"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => ({
        init: async () => {
          throw new Error("Stockfish timeout: uciok");
        },
        terminate: () => {},
        bestMove: async () => "",
        evaluate: async () => null,
      } as any),
    });

    (mgr as any).showWarmupToast(true);
    expect(controller.sticky.key).toBe("chessbot_warmup");

    (mgr as any).syncPausedTurnToastNow();
    expect(controller.sticky.key).toBe("chessbot_warmup");
    expect(controller.sticky.text).toContain("failed to start");
  });

  it("shows the Stockfish failure toast only once across retry attempts until recovery", () => {
    const controller = new FakeController(mkChessState("B"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => ({
        init: async () => {
          throw new Error("Stockfish timeout: uciok");
        },
        terminate: () => {},
        bestMove: async () => "",
        evaluate: async () => null,
      } as any),
    });

    (mgr as any).showWarmupToast(true);
    expect(controller.stickyShowCounts.chessbot_warmup).toBe(1);

    (mgr as any).recoverEngineForRetry();
    (mgr as any).showWarmupToast(true);
    expect(controller.stickyShowCounts.chessbot_warmup).toBe(1);
  });

  it("re-runs evaluation for the latest playback position after an in-flight eval finishes", async () => {
    let evalCallCount = 0;
    const evalResolvers: Array<(score: any) => void> = [];
    const observed: Array<{ score: any; pending: boolean }> = [];

    const controller = new FakeController(mkChessState("W"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => ({
        init: async () => {},
        terminate: () => {},
        bestMove: async () => "",
        evaluate: vi.fn(
          () =>
            new Promise((resolve) => {
              evalCallCount += 1;
              evalResolvers.push(resolve);
            })
        ),
      } as any),
    });

    mgr.addEvalChangeListener((score, pending) => {
      observed.push({ score, pending });
    });

    mgr.activateForEvaluation();
    await vi.runAllTimersAsync();
    expect(evalCallCount).toBe(1);

    controller.setState(mkChessState("B"));
    controller.fire("jump");
    await vi.runAllTimersAsync();
    expect(evalCallCount).toBe(1);
    expect(observed.at(-1)?.pending).toBe(true);

    evalResolvers.shift()?.({ cp: 25 });
    await vi.runAllTimersAsync();
    expect(evalCallCount).toBe(2);
    expect(observed.at(-1)?.pending).toBe(true);

    evalResolvers.shift()?.({ cp: 60 });
    await vi.runAllTimersAsync();

    expect(evalCallCount).toBe(2);
    expect(observed.at(-1)?.pending).toBe(false);
    expect(observed.at(-1)?.score).toEqual({ cp: -60 });
  });

  it("uses an imported cached eval immediately even before the engine is ready", async () => {
    const observed: Array<{ score: any; pending: boolean }> = [];
    const evaluate = vi.fn(async () => ({ cp: 10 }));
    const controller = new FakeController(mkChessState("W"), [{ index: 0, isCurrent: true }]);
    const mgr = new ChessBotManager(controller as any, {
      engineFactory: () => ({
        init: async () => new Promise(() => {}),
        terminate: () => {},
        bestMove: async () => "",
        evaluate,
      } as any),
    });

    mgr.addEvalChangeListener((score, pending) => {
      observed.push({ score, pending });
    });

    mgr.setCachedEvalForFen("8/8/8/8/8/8/8/8 w - - 0 1", { cp: 55 });
    mgr.activateForEvaluation();
    await vi.runAllTimersAsync();

    expect(observed.at(-1)).toEqual({ score: { cp: 55 }, pending: false });
    expect(evaluate).not.toHaveBeenCalled();
  });
});
