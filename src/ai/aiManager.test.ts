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
}

describe("AIManager paused-turn sticky toast", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  it("suppresses sticky tap-to-resume on fresh start for non-chess", () => {
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

    expect(controller.sticky.key).toBe(null);
    expect(controller.sticky.text).toBe(null);
  });

  it("auto-resumes after the timed turn toast on fresh start for non-chess human-vs-AI", () => {
    localStorage.setItem("lasca.ai.white", "easy");
    localStorage.setItem("lasca.ai.black", "human");
    localStorage.setItem("lasca.ai.paused", "true");

    const controller = new FakeController(
      { toMove: "W", phase: "idle", board: new Map(), meta: { rulesetId: "lasca" } },
      [{ index: 0, toMove: "W", isCurrent: true, notation: "" }]
    ) as any;

    const mgr = new AIManager(controller);
    mgr.bind();

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
    expect(controller.sticky.text).toContain("Tap here to resume bot");
  });

  it("suppresses sticky tap-to-resume after newGame for non-chess", () => {
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

    expect(controller.sticky.key).toBe(null);
    expect(controller.sticky.text).toBe(null);
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
});
