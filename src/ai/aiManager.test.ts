import { describe, it, expect, beforeEach, vi } from "vitest";
import { AIManager } from "./aiManager";

class FakeController {
  private historyCb: ((reason?: any) => void) | null = null;
  public sticky: { key: string | null; text: string | null } = { key: null, text: null };

  constructor(
    private state: any,
    private history: any[]
  ) {}

  addHistoryChangeCallback(cb: (reason?: any) => void): void {
    this.historyCb = cb;
  }

  fire(reason: any): void {
    this.historyCb?.(reason);
  }

  getState(): any {
    return this.state;
  }

  setState(next: any): void {
    this.state = next;
  }

  getHistory(): any[] {
    return this.history;
  }

  setHistory(next: any[]): void {
    this.history = next;
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

  showStickyToast(key: string, text: string, opts?: { force?: boolean }): void {
    if (!opts?.force && localStorage.getItem("lasca.opt.toasts") === "0") return;
    this.sticky.key = key;
    this.sticky.text = text;
  }

  clearStickyToast(key: string): void {
    if (this.sticky.key === key) {
      this.sticky.key = null;
      this.sticky.text = null;
    }
  }
}

describe("AIManager paused-turn sticky toast", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  it("shows sticky tap-to-resume on fresh start for non-chess when AI is to move", () => {
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    vi.runAllTimers();

    expect(controller.sticky.key).toBe("aiPausedTapResume");
    expect(controller.sticky.text).toBe("White to Play. Tap here or press spacebar to resume bot");
  });

  it("forces a paused startup state on refresh even if the previous bot state persisted as running", () => {
    document.body.innerHTML = `
      <select id="aiWhiteSelect">
        <option value="human">human</option>
        <option value="easy">easy</option>
      </select>
      <select id="aiBlackSelect">
        <option value="human">human</option>
        <option value="easy">easy</option>
      </select>
      <input id="aiDelay" />
      <button id="aiDelayReset"></button>
      <span id="aiDelayLabel"></span>
      <button id="aiPauseBtn"></button>
      <button id="aiStepBtn"></button>
      <span id="aiInfo"></span>
    `;

    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "false");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "damasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    vi.runAllTimers();

    expect(localStorage.getItem("lasca.ai.paused")).toBe("true");
    expect((document.getElementById("aiPauseBtn") as HTMLButtonElement).textContent).toBe("Resume bot");
    expect(controller.sticky.text).toBe("White to Play. Tap here or press spacebar to resume bot");
  });

  it("does not show the sticky tap-to-resume toast when toast notifications are disabled", () => {
    localStorage.setItem("lasca.opt.toasts", "0");
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    vi.runAllTimers();

    expect(controller.sticky.key).toBeNull();
    expect(controller.sticky.text).toBeNull();
  });

  it("auto-resumes after the timed turn toast once the game is no longer fresh (human moved first)", () => {
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    // Simulate the human making a move first (history length > 1), returning to an AI turn.
    controller.setHistory([
      { index: 0, toMove: "W", isCurrent: false, notation: "" },
      { index: 1, toMove: "W", isCurrent: true, notation: "" },
    ]);
    controller.fire("move");

    // Allow the deferred toast-sync tick to run and arm the auto-resume timer.
    vi.advanceTimersByTime(0);

    // Immediately: still paused.
    expect(localStorage.getItem("lasca.ai.paused")).toBe("true");

    // After the controller's turn toast duration, AIManager should auto-resume.
    vi.advanceTimersByTime(1600);

    expect(localStorage.getItem("lasca.ai.paused")).toBe("false");
  });

  it("shows sticky tap-to-resume after loadGame for non-chess", () => {
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    // Simulate load-game notification.
    controller.fire("loadGame");

    vi.runAllTimers();

    expect(controller.sticky.key).toBe("aiPausedTapResume");
    expect(controller.sticky.text).toBe("White to Play. Tap here or press spacebar to resume bot");
  });

  it("shows sticky tap-to-resume after newGame for non-chess", () => {
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    controller.fire("newGame");

    vi.runAllTimers();

    expect(controller.sticky.key).toBe("aiPausedTapResume");
    expect(controller.sticky.text).toBe("White to Play. Tap here or press spacebar to resume bot");
  });

  it("does not show the sticky redo-bot toast when jumping to a past move during playback", () => {
    localStorage.setItem("lasca.ai.white", "human");
    localStorage.setItem("lasca.ai.black", "easy");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "B", phase: "idle", board: new Map(), meta: { rulesetId: "checkers_us", boardSize: 8 } },
      [
        { index: 0, toMove: "W", isCurrent: false, notation: "" },
        { index: 1, toMove: "B", isCurrent: true, notation: "" },
        { index: 2, toMove: "W", isCurrent: false, notation: "" },
      ]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    controller.setHistory([
      { index: 0, toMove: "W", isCurrent: true, notation: "" },
      { index: 1, toMove: "B", isCurrent: false, notation: "" },
      { index: 2, toMove: "W", isCurrent: false, notation: "" },
    ]);
    controller.fire("jump");

    vi.runAllTimers();

    expect(controller.sticky.key).toBeNull();
    expect(controller.sticky.text).toBeNull();
  });

  it("shows the sticky resume toast on a fresh US Checkers game when Black bot moves first", () => {
    localStorage.setItem("lasca.ai.white", "human");
    localStorage.setItem("lasca.ai.black", "easy");
    localStorage.setItem("lasca.ai.paused", "true");
    localStorage.setItem("lasca.checkers.theme", "checkers");

    const controller = new FakeController(
      { toMove: "B", phase: "idle", board: new Map(), meta: { rulesetId: "checkers_us", boardSize: 8 } },
      [{ index: 0, toMove: "B", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    vi.runAllTimers();

    expect(controller.sticky.key).toBe("aiPausedTapResume");
    expect(controller.sticky.text).toBe("Black to Play. Tap here or press spacebar to resume bot");
    expect(localStorage.getItem("lasca.ai.paused")).toBe("true");
  });

  it("uses Light/Dark terminology immediately in the sticky resume toast when Checkers pieces are changed", () => {
    localStorage.setItem("lasca.ai.white", "human");
    localStorage.setItem("lasca.ai.black", "easy");
    localStorage.setItem("lasca.ai.paused", "true");
    localStorage.setItem("lasca.checkers.theme", "glass");

    const controller = new FakeController(
      { toMove: "B", phase: "idle", board: new Map(), meta: { rulesetId: "checkers_us", boardSize: 8 } },
      [{ index: 0, toMove: "B", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    vi.runAllTimers();

    expect(controller.sticky.key).toBe("aiPausedTapResume");
    expect(controller.sticky.text).toBe("Dark to Play. Tap here or press spacebar to resume bot");
    expect(localStorage.getItem("lasca.ai.paused")).toBe("true");
  });

  it("forces AI dropdowns to Human during analysis and restores after", () => {
    document.body.innerHTML = `
      <select id="aiWhiteSelect">
        <option value="human">human</option>
        <option value="easy">easy</option>
      </select>
      <select id="aiBlackSelect">
        <option value="human">human</option>
        <option value="easy">easy</option>
      </select>
      <input id="aiDelay" />
      <button id="aiDelayReset"></button>
      <span id="aiDelayLabel"></span>
      <button id="aiPauseBtn"></button>
      <button id="aiStepBtn"></button>
      <span id="aiInfo"></span>
    `;

    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "easy");
    localStorage.setItem("lasca.ai.paused", "false");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

    expect((document.getElementById("aiWhiteSelect") as HTMLSelectElement).value).toBe("easy");
    expect((document.getElementById("aiBlackSelect") as HTMLSelectElement).value).toBe("easy");

    mgr.setAnalysisModeActive(true);
    expect((document.getElementById("aiWhiteSelect") as HTMLSelectElement).value).toBe("human");
    expect((document.getElementById("aiBlackSelect") as HTMLSelectElement).value).toBe("human");
    expect(localStorage.getItem("lasca.ai.paused")).toBe("true");

    mgr.setAnalysisModeActive(false);
    expect((document.getElementById("aiWhiteSelect") as HTMLSelectElement).value).toBe("easy");
    expect((document.getElementById("aiBlackSelect") as HTMLSelectElement).value).toBe("easy");
  });

  it("prepends the signed-in local account name to AI dropdowns", async () => {
    document.body.innerHTML = `
      <select id="aiWhiteSelect">
        <option value="human">Human</option>
        <option value="easy">Beginner</option>
        <option value="medium">Intermediate</option>
        <option value="advanced">Strong</option>
      </select>
      <select id="aiBlackSelect">
        <option value="human">Human</option>
        <option value="easy">Beginner</option>
        <option value="medium">Intermediate</option>
        <option value="advanced">Strong</option>
      </select>
      <input id="aiDelay" />
      <button id="aiDelayReset"></button>
      <span id="aiDelayLabel"></span>
      <button id="aiPauseBtn"></button>
      <button id="aiStepBtn"></button>
      <span id="aiInfo"></span>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "EdB" } }),
    })));

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const whiteOptions = Array.from((document.getElementById("aiWhiteSelect") as HTMLSelectElement).options).map((option) => option.textContent);
    expect(whiteOptions).toEqual(["EdB", "Human", "Beginner", "Intermediate", "Strong"]);
  });
});
