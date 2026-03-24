import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColumnsChessBotManager } from "./columnsChessBotManager";
import { createInitialGameStateForVariant } from "../game/state";

class FakeController {
  private historyCb: ((reason?: any) => void) | null = null;
  private history: Array<{ index: number; isCurrent: boolean }> = [{ index: 0, isCurrent: true }];
  public sticky: { key: string | null; text: string | null } = { key: null, text: null };
  public playedMove: any = null;
  public state: any = { toMove: "W", phase: "select", board: new Map(), meta: { rulesetId: "columns_chess" } };
  public legalMoves: any[] = [];

  addHistoryChangeCallback(cb: (reason?: any) => void): void {
    this.historyCb = cb;
  }

  fire(reason?: any): void {
    this.historyCb?.(reason);
  }

  getHistory(): Array<{ index: number; isCurrent: boolean }> {
    return this.history;
  }

  setHistory(next: Array<{ index: number; isCurrent: boolean }>): void {
    this.history = next;
  }

  getState(): any {
    return this.state;
  }

  isOver(): boolean {
    return false;
  }

  setInputEnabled(_enabled: boolean): void {
    // ignore
  }

  setStickyToastAction(_key: string, _fn: () => void): void {
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

  getLegalMovesForTurn(): any[] {
    return this.legalMoves;
  }

  async playMove(_m: any): Promise<void> {
    this.playedMove = _m;
    this.state = { ...this.state, toMove: "B" };
    this.legalMoves = [];
  }
}

describe("ColumnsChessBotManager board tap", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  it("pauses bot-vs-bot when tapping the board", () => {
    localStorage.setItem("lasca.columnsChessBot.white", "bot");
    localStorage.setItem("lasca.columnsChessBot.black", "bot");
    localStorage.setItem("lasca.columnsChessBot.paused", "false");

    const boardWrap = document.createElement("div");
    boardWrap.id = "boardWrap";
    document.body.appendChild(boardWrap);

    const mgr = new ColumnsChessBotManager(new FakeController() as any);
    mgr.bind();

    // bind() forces paused=true for any-bot; simulate running bots.
    (mgr as any).settings.paused = false;
    localStorage.setItem("lasca.columnsChessBot.paused", "false");

    boardWrap.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(localStorage.getItem("lasca.columnsChessBot.paused")).toBe("true");
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

    const mgr = new ColumnsChessBotManager(new FakeController() as any);
    mgr.bind();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const whiteOptions = Array.from((document.getElementById("botWhiteSelect") as HTMLSelectElement).options).map((option) => option.textContent);
    expect(whiteOptions).toEqual(["EdB", "Human", "Beginner", "Intermediate", "Advanced", "Master"]);
  });

  it("does not show the paused bot sticky toast when jumping to a past move during playback", () => {
    localStorage.setItem("lasca.columnsChessBot.white", "bot");
    localStorage.setItem("lasca.columnsChessBot.black", "human");
    localStorage.setItem("lasca.columnsChessBot.paused", "true");

    const controller = new FakeController();
    const mgr = new ColumnsChessBotManager(controller as any);
    mgr.bind();

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

  it("does not keep the startup pause when a fresh game starts with a human turn", () => {
    localStorage.setItem("lasca.columnsChessBot.white", "human");
    localStorage.setItem("lasca.columnsChessBot.black", "intermediate");
    localStorage.setItem("lasca.columnsChessBot.paused", "true");

    const controller = new FakeController();
    controller.state = createInitialGameStateForVariant("columns_chess" as any);

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

    const mgr = new ColumnsChessBotManager(controller as any);
    mgr.bind();

    expect(localStorage.getItem("lasca.columnsChessBot.paused")).toBe("false");
    vi.runAllTimers();
    expect(controller.sticky.key).toBeNull();
    expect(controller.sticky.text).toBeNull();
  });

  it("consults Stockfish for Columns Chess bot moves when the engine is ready", async () => {
    const controller = new FakeController();
    controller.state = createInitialGameStateForVariant("columns_chess" as any);
    controller.legalMoves = [
      { kind: "move", from: "r6c4", to: "r5c4" },
      { kind: "move", from: "r6c4", to: "r4c4" },
    ];

    localStorage.setItem("lasca.columnsChessBot.white", "intermediate");
    localStorage.setItem("lasca.columnsChessBot.black", "human");
    localStorage.setItem("lasca.columnsChessBot.paused", "false");
    localStorage.setItem("lasca.columnsChessBot.delayMs", "0");

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

    const bestMove = vi.fn(async () => "e2e4");
    const engineFactory = () => ({
      init: async () => {},
      bestMove,
      evaluate: async () => ({ cp: 30 }),
      terminate: () => {},
    });

    const mgr = new ColumnsChessBotManager(controller as any, { engineFactory: engineFactory as any });
    mgr.bind();
    await Promise.resolve();
    await Promise.resolve();
    (mgr as any).settings.paused = false;
    ;(mgr as any).kick();
    await Promise.resolve();
    await Promise.resolve();

    expect(bestMove).toHaveBeenCalledTimes(1);
    expect(controller.playedMove).toEqual(expect.objectContaining({ from: "r6c4", to: "r4c4" }));
  });

  it("pauses instead of replaying immediately after undo returns to a bot turn", async () => {
    const controller = new FakeController();
    controller.state = {
      ...createInitialGameStateForVariant("columns_chess" as any),
      toMove: "W",
    };
    controller.legalMoves = [{ kind: "move", from: "r6c4", to: "r5c4" }];

    localStorage.setItem("lasca.columnsChessBot.white", "intermediate");
    localStorage.setItem("lasca.columnsChessBot.black", "human");
    localStorage.setItem("lasca.columnsChessBot.paused", "false");
    localStorage.setItem("lasca.columnsChessBot.delayMs", "0");

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

    const mgr = new ColumnsChessBotManager(controller as any, {
      engineFactory: (() => ({
        init: async () => {},
        bestMove: async () => "e2e3",
        evaluate: async () => ({ cp: 15 }),
        terminate: () => {},
      })) as any,
    });
    mgr.bind();

    controller.fire("undo");
    await Promise.resolve();
    vi.runAllTimers();
    await Promise.resolve();

    expect(localStorage.getItem("lasca.columnsChessBot.paused")).toBe("true");
    expect(controller.playedMove).toBeNull();
    expect(controller.sticky.text).toContain("White's turn");
  });
});
