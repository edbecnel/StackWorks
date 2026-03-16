import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameController } from "./gameController";
import { HistoryManager } from "../game/historyManager";
import type { GameState } from "../game/state";

describe("GameController undo/redo after game over", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    // Minimal stubs used by existing controller tests.
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("allows undoing out of a terminal position", () => {
    const history = new HistoryManager();

    const nonTerminal: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    // Terminal because White to move has no pieces.
    const terminal: GameState = {
      board: new Map([["r2c2", [{ owner: "B", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };

    history.push(nonTerminal);
    history.push(terminal);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, terminal, history);
    controller.setState(terminal);

    expect(controller.isOver()).toBe(true);

    controller.undo();

    expect(controller.isOver()).toBe(false);
    expect(controller.getState().board.has("r1c1")).toBe(true);
    expect(controller.getState().toMove).toBe("W");
  });

  it("allows redoing back into a terminal position", () => {
    const history = new HistoryManager();

    const nonTerminal: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const terminal: GameState = {
      board: new Map([["r2c2", [{ owner: "B", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };

    history.push(nonTerminal);
    history.push(terminal);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, terminal, history);
    controller.setState(terminal);

    controller.undo();
    expect(controller.isOver()).toBe(false);

    controller.redo();
    expect(controller.isOver()).toBe(true);
    expect(controller.getState().board.has("r1c1")).toBe(false);
  });
});

describe("GameController input lock preserves capture chain", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("does not clear jumpedSquares/lockedCaptureFrom when disabling input", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "dama_8_classic_international" as any,
        rulesetId: "dama" as any,
        boardSize: 8 as any,
        damaCaptureRemoval: "end_of_sequence" as any,
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).lockedCaptureFrom = "r4c4";
    (controller as any).jumpedSquares.add("r3c3");

    controller.setInputEnabled(false);

    const constraints = controller.getCaptureChainConstraints();
    expect(constraints.lockedCaptureFrom).toBe("r4c4");
    expect(constraints.jumpedSquares).toEqual(["r3c3"]);
  });

  it("Lasca: does not allow re-jumping the same square during a capture chain", () => {
    const history = new HistoryManager();
    const s: GameState = {
      // Position represents a post-capture continuation where the only possible
      // follow-up capture would be re-jumping the same square back.
      board: new Map([
        ["r5c3", [{ owner: "B", rank: "O" }]],
        ["r4c2", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "lasca_8_dama_board" as any,
        rulesetId: "lasca" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    controller.setState(s);
    (controller as any).lockedCaptureFrom = "r5c3";
    (controller as any).jumpedSquares.add("r4c2");

    // Without anti-loop constraints, Lasca would allow: r5c3 x r4c2 -> r3c1.
    // With anti-loop, no further capture is legal.
    const legal = controller.getLegalMovesForTurn();
    expect(legal).toEqual([]);
  });

  it("jumpToHistory restores snapshot and clears capture-chain constraints", () => {
    const history = new HistoryManager();

    const s0: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const s1: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r3c3", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    history.push(s0);
    history.push(s1);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s1, history);
    controller.setState(s1);

    (controller as any).lockedCaptureFrom = "r5c5";
    (controller as any).lockedCaptureDir = { dr: 1, dc: 1 };
    (controller as any).jumpedSquares.add("r4c4");

    controller.jumpToHistory(0);

    const after = controller.getState();
    expect(after.toMove).toBe("W");
    expect(after.board.has("r2c2")).toBe(true);
    expect(after.board.has("r3c3")).toBe(false);

    const constraints = controller.getCaptureChainConstraints();
    expect(constraints.lockedCaptureFrom).toBe(null);
    expect(constraints.lockedCaptureDir).toBe(null);
    expect(constraints.jumpedSquares).toEqual([]);
  });
});

describe("GameController game-over detection", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    // Keep these tests isolated from earlier suites that may have created toast UI,
    // modified toast preferences, or left DOM nodes around.
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    try {
      localStorage.removeItem("lasca.opt.toasts");
      localStorage.removeItem("lasca.ai.white");
      localStorage.removeItem("lasca.ai.black");
    } catch {
      // ignore
    }

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  afterEach(() => {
    // Clean up any toast UI between tests.
    document.querySelectorAll(".lascaToastWrap").forEach((el) => el.remove());
  });

  it("shows game-over sticky toast when no legal moves (e.g. AI-vs-AI)", () => {
    // Minimal status panel nodes used by updatePanel() to compute/render terminal messaging.
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="statusTurn"></div><div id="statusPhase"></div><div id="statusMessage"></div>'
    );

    const history = new HistoryManager();

    // Black man stuck on last row with no legal quiet moves/captures.
    const terminalByNoMoves: GameState = {
      board: new Map([["r7c0", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "checkers_8_us" as any, rulesetId: "checkers_us" as any, boardSize: 8 as any },
    };

    history.push(terminalByNoMoves);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, terminalByNoMoves, history);
    expect(controller.isOver()).toBe(false);

    const legal = controller.getLegalMovesForTurn();
    expect(Array.isArray(legal)).toBe(true);
    expect(legal.length).toBe(0);
    expect(controller.isOver()).toBe(true);

    const toast = document.querySelector(".lascaToastWrap.isVisible .lascaToast") as HTMLElement | null;
    expect(toast).not.toBeNull();
    expect((toast?.textContent ?? "").toLowerCase()).toContain("wins");
  });
});

describe("GameController turn toast indicates capture", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("shows 'to capture' when a capture is available", () => {
    vi.useFakeTimers();
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(s);
    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);

    (controller as any).maybeToastTurnChange();
    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Dark to capture");

    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("shows 'to move' when no capture is available", () => {
    vi.useFakeTimers();
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r2c2", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };
    history.push(s);
    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);

    (controller as any).maybeToastTurnChange();
    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Dark to move");

    vi.runAllTimers();
    vi.useRealTimers();
  });
});

describe("GameController forced game-over toasts", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  afterEach(() => {
    try {
      localStorage.removeItem("lasca.opt.toasts");
    } catch {
      // ignore
    }
  });

  it("shows checkmate toast even when toast notifications are disabled", () => {
    localStorage.setItem("lasca.opt.toasts", "0");

    const history = new HistoryManager();
    const s: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).playSfx = vi.fn();

    (controller as any).showGameOverToast("Checkmate! White Wins");
    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Checkmate! White Wins");
  });

  it("does not show non-checkmate game-over toast when toast notifications are disabled", () => {
    localStorage.setItem("lasca.opt.toasts", "0");

    const history = new HistoryManager();
    const s: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).playSfx = vi.fn();

    (controller as any).showGameOverToast("Stalemate — draw");
    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast).toBe(null);
  });

  it("shows a sticky game-over toast matching Status Message", () => {
    // Sticky game-over reason should always be shown, even if timed toasts are disabled.
    localStorage.setItem("lasca.opt.toasts", "0");

    // Minimal status panel nodes used by updatePanel().
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="statusTurn"></div><div id="statusPhase"></div><div id="statusMessage"></div>'
    );

    const history = new HistoryManager();
    const s: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
      meta: { rulesetId: "damasca_classic" as any, boardSize: 8, variantId: "damasca_classic" as any },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).playSfx = vi.fn();

    // Trigger game-over check: with an empty board, the player to move has no pieces.
    (controller as any).checkAndHandleCurrentPlayerLost();

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Dark wins — Light has no pieces");
  });
});

describe("GameController forced check toasts", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  afterEach(() => {
    try {
      localStorage.removeItem("lasca.opt.toasts");
    } catch {
      // ignore
    }
  });

  it("shows check toast even when toast notifications are disabled", () => {
    localStorage.setItem("lasca.opt.toasts", "0");

    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([
        ["r7c4", [{ owner: "W", rank: "K" }]], // e1 white king
        ["r0c4", [{ owner: "B", rank: "R" }]], // e8 black rook giving check
        ["r0c0", [{ owner: "B", rank: "K" }]], // a8 black king
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).maybeToastTurnChange();

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Check! White to Play");
  });

  it("shows check toast during Move History playback even when side-to-move does not change", () => {
    localStorage.setItem("lasca.opt.toasts", "0");

    // Start on a non-check position with White to move.
    const sCurrent: GameState = {
      board: new Map([
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r0c5", [{ owner: "B", rank: "R" }]], // rook not giving check
        ["r0c0", [{ owner: "B", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    // Earlier history position: still White to move, but now in check.
    const sPastInCheck: GameState = {
      board: new Map([
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r0c4", [{ owner: "B", rank: "R" }]], // rook gives check
        ["r0c0", [{ owner: "B", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const history = new HistoryManager();
    history.push(sPastInCheck);
    history.push(sCurrent);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, sCurrent, history);

    // Establish lastToastToMove = "W" (this would normally suppress turn-change toasts).
    (controller as any).maybeToastTurnChange();

    // Jump back to a different position where White is in check.
    controller.jumpToHistory(0);

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Check! White to Play");
  });
});

describe("GameController loadGame reconstructs last-move hints", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("populates ui.lastMove for history snapshots loaded from a save", () => {
    const s0: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r8c8", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const s1: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "W", rank: "S" }]],
        ["r8c8", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s0, new HistoryManager());
    controller.loadGame(s1, { states: [s0, s1], notation: ["", ""], currentIndex: 1 });

    controller.jumpToHistory(1);
    expect(controller.getState().ui?.lastMove).toEqual({ from: "r1c1", to: "r2c2" });
  });

  it("does not flash a timed turn toast when a sticky resume-bot toast is active after load", () => {
    const s0: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r8c8", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const loaded: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r8c8", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic" as any, rulesetId: "chess", boardSize: 8 },
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s0, new HistoryManager());
    controller.addHistoryChangeCallback((reason) => {
      if (reason !== "loadGame") return;
      controller.showStickyToast(
        "chessbot_paused_turn",
        "Black to Play. Tap here ore press spacebar to resume bot",
        { force: true }
      );
    });

    controller.loadGame(loaded, { states: [s0, loaded], notation: ["", ""], currentIndex: 1 });

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Black to Play. Tap here ore press spacebar to resume bot");
  });
});

describe("GameController online opponent presence toasts", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  class FakeOnlineDriver {
    public mode = "online" as const;
    private presence: any = null;
    private identity: any = null;

    setPresence(p: any): void {
      this.presence = p;
    }

    setIdentity(i: any): void {
      this.identity = i;
    }

    getPlayerId(): string {
      return "p1";
    }

    getPlayerColor(): any {
      return "W";
    }

    getPresence(): any {
      return this.presence;
    }

    getIdentity(): any {
      return this.identity;
    }
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="onlineInfoPanel"></div>
      <div id="onlineOpponentStatus">—</div>
    `;
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("shows sticky toast on disconnect and timed toast on rejoin", () => {
    vi.useFakeTimers();

    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };
    history.push(s);

    const driver = new FakeOnlineDriver();
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
      p2: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);

    // Prime internal presence state (no toast on first observation).
    (controller as any).updatePanel();
    expect(document.querySelector(".lascaToast")).toBeNull();

    // Opponent disconnects.
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:01.000Z" },
      p2: {
        connected: false,
        lastSeenAt: "2026-01-25T00:00:01.000Z",
        inGrace: true,
        graceUntil: "2026-01-25T00:10:00.000Z",
      },
    });
    (controller as any).updatePanel();
    const toast1 = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast1?.textContent ?? "").toContain("Opponent disconnected");

    // Opponent rejoins.
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:02.000Z" },
      p2: { connected: true, lastSeenAt: "2026-01-25T00:00:02.000Z" },
    });
    (controller as any).updatePanel();
    const toast2 = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast2?.textContent).toBe("Opponent rejoined");

    // Opponent leaves room entirely (seat missing) -> sticky.
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:03.000Z" },
    });
    (controller as any).updatePanel();
    const toast3 = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast3?.textContent).toBe("Opponent left the room");

    // Opponent returns to the room; should auto-close sticky and show rejoined toast.
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:04.000Z" },
      p2: { connected: true, lastSeenAt: "2026-01-25T00:00:04.000Z" },
    });
    (controller as any).updatePanel();
    const toast4 = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast4?.textContent).toBe("Opponent rejoined");

    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("renders opponent displayName in the online panel", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };
    history.push(s);

    const driver = new FakeOnlineDriver();
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
      p2: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
    });
    driver.setIdentity({
      p1: { displayName: "Alice" },
      p2: { displayName: "Bob" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    (controller as any).updatePanel();

    expect((document.getElementById("onlineOpponentStatus") as HTMLElement | null)?.textContent).toBe(
      "Bob — Connected"
    );
  });
});

describe("GameController online debug copy", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  class FakeOnlineDriver {
    public mode = "online" as const;
    getServerUrl(): string | null {
      return "http://localhost:9999";
    }
    getRoomId(): string | null {
      return "room123";
    }
    getPlayerId(): string | null {
      return "p1";
    }
    getPlayerColor(): any {
      return "W";
    }
    getPresence(): any {
      return null;
    }

    getIdentity(): any {
      return null;
    }
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="onlineInfoPanel"></div>
      <div id="infoRoomId">—</div>
      <button id="copyRoomIdBtn"></button>
      <button id="copyDebugBtn"></button>
    `;
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;

    // Force clipboard fallback path.
    (navigator as any).clipboard = undefined;
    (document as any).execCommand = () => true;
  });

  it("copies a JSON debug blob and shows a toast", async () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };
    history.push(s);

    const driver = new FakeOnlineDriver();
    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);

    // Only bind the debug copy handler; full bind() expects a complete OnlineGameDriver.
    (controller as any).bindDebugCopyButton();

    const btn = document.getElementById("copyDebugBtn") as HTMLButtonElement;
    btn.click();

    // Allow the async click handler to complete.
    await Promise.resolve();
    await Promise.resolve();

    // Toast appears synchronously (clipboard fallback returns true).
    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Copied debug info");
  });
});
