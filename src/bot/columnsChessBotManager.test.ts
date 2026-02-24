import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColumnsChessBotManager } from "./columnsChessBotManager";

class FakeController {
  private historyCb: ((reason?: any) => void) | null = null;

  addHistoryChangeCallback(cb: (reason?: any) => void): void {
    this.historyCb = cb;
  }

  getState(): any {
    return { toMove: "W", phase: "select", board: new Map(), meta: { rulesetId: "columns_chess" } };
  }

  isOver(): boolean {
    return false;
  }

  setStickyToastAction(_key: string, _fn: () => void): void {
    // ignore
  }

  showStickyToast(_key: string, _text: string): void {
    // ignore
  }

  clearStickyToast(_key: string): void {
    // ignore
  }

  getLegalMovesForTurn(): any[] {
    return [];
  }

  async playMove(_m: any): Promise<void> {
    // ignore
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
});
