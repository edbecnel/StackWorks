import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameController } from "./gameController";
import { HistoryManager } from "../game/historyManager";
import type { GameState } from "../game/state";

const SVG_NS = "http://www.w3.org/2000/svg";

function createBoardFixture(opts: { clientWidth?: number; clientHeight?: number } = {}): { svg: SVGSVGElement; piecesLayer: SVGGElement } {
  document.body.innerHTML = "";

  const clientWidth = opts.clientWidth ?? 1000;
  const clientHeight = opts.clientHeight ?? 1000;

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1000 1000");
  (svg as any).setPointerCapture = () => {};
  (svg as any).releasePointerCapture = () => {};
  (svg as any).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: clientWidth,
    height: clientHeight,
    right: clientWidth,
    bottom: clientHeight,
  });

  const defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
  for (const id of ["W_K", "B_K"]) {
    const symbol = document.createElementNS(SVG_NS, "symbol") as SVGSymbolElement;
    symbol.setAttribute("id", id);
    symbol.setAttribute("viewBox", "0 0 100 100");
    const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    rect.setAttribute("x", "25");
    rect.setAttribute("y", "15");
    rect.setAttribute("width", "50");
    rect.setAttribute("height", "70");
    rect.setAttribute("fill", id === "W_K" ? "#fff" : "#111");
    symbol.appendChild(rect);
    defs.appendChild(symbol);
  }
  svg.appendChild(defs);

  const pieces = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieces.id = "pieces";
  svg.appendChild(pieces);

  const squares = document.createElementNS(SVG_NS, "g") as SVGGElement;
  squares.id = "squares";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
      rect.setAttribute("x", String(100 + c * 100));
      rect.setAttribute("y", String(100 + r * 100));
      rect.setAttribute("width", "100");
      rect.setAttribute("height", "100");
      rect.setAttribute("fill", (r + c) % 2 === 0 ? "#f0d9b5" : "#b58863");
      squares.appendChild(rect);
    }
  }
  svg.appendChild(squares);

  const nodes = document.createElementNS(SVG_NS, "g") as SVGGElement;
  nodes.id = "nodes";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const node = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      node.id = `r${r}c${c}`;
      node.setAttribute("cx", String(150 + c * 100));
      node.setAttribute("cy", String(150 + r * 100));
      node.setAttribute("r", "18");
      nodes.appendChild(node);
    }
  }
  svg.appendChild(nodes);
  document.body.appendChild(svg);

  return { svg, piecesLayer: pieces };
}

function makePointerEvent(
  target: EventTarget | null,
  args: { pointerId?: number; clientX?: number; clientY?: number; pointerType?: string; button?: number } = {},
): PointerEvent {
  return {
    target,
    pointerId: args.pointerId ?? 1,
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
    pointerType: args.pointerType ?? "mouse",
    button: args.button ?? 0,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
}

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
    document.body.innerHTML = '<div id="boardWrap" style="position: relative;"></div>';
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

describe("GameController move hint styles", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  function createNode(id: string, cx: number, cy: number): SVGCircleElement {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle") as SVGCircleElement;
    node.id = id;
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("r", "18");
    return node;
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="statusTurn"></div><div id="statusPhase"></div><div id="statusMessage"></div>';
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    mockPiecesLayer.id = "pieces";

    mockSvg.appendChild(createNode("r2c2", 20, 20));
    mockSvg.appendChild(createNode("r3c3", 40, 40));
    mockSvg.appendChild(createNode("r4c4", 60, 60));
    mockSvg.appendChild(mockPiecesLayer);
    document.body.appendChild(mockSvg);

    (mockSvg as any).addEventListener = () => {};
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps capture preview treatment in StackWorks style", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(true);
    controller.setMoveHintStyle("classic");

    (controller as any).showSelection("r2c2");

    expect(mockSvg.querySelectorAll(".halo--target").length).toBe(1);
    expect(mockSvg.querySelectorAll(".halo--highlight").length).toBe(2);
  });

  it("uses destination-only hints in Chess.com-style mode", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(true);
    controller.setMoveHintStyle("chesscom");

    (controller as any).showSelection("r2c2");

    expect(mockSvg.querySelectorAll(".target-dot--chesscom").length).toBe(1);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection-chesscom").length).toBe(1);
    expect(mockSvg.querySelectorAll(".halo--target").length).toBe(0);
    expect(mockSvg.querySelectorAll(".halo--highlight").length).toBe(0);
  });

  it("uses a ring for occupied capture targets in Modern mode", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r7c4", [{ owner: "W", rank: "R" }]],
        ["r7c0", [{ owner: "W", rank: "K" }]],
        ["r0c4", [{ owner: "B", rank: "R" }]],
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
    history.push(state);

    mockSvg.appendChild(createNode("r7c4", 120, 120));
    mockSvg.appendChild(createNode("r0c4", 120, 40));
    mockSvg.appendChild(createNode("r7c0", 40, 120));
    mockSvg.appendChild(createNode("r0c0", 40, 40));

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(true);
    controller.setMoveHintStyle("chesscom");

    (controller as any).showSelection("r7c4");

    expect(mockSvg.querySelectorAll(".target-ring--chesscom").length).toBeGreaterThan(0);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection-chesscom").length).toBe(1);
  });

  it("uses classic circle selection when previews are off and selection style is Classic", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(false);
    controller.setSelectionStyle("classic");

    (controller as any).showSelection("r2c2");

    expect(mockSvg.querySelectorAll(".halo--selection").length).toBe(1);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection").length).toBe(0);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection-chesscom").length).toBe(0);
  });

  it("uses square selection when previews are off and selection style is Classic square", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(false);
    controller.setSelectionStyle("classic-squares");

    (controller as any).showSelection("r2c2");

    expect(mockSvg.querySelectorAll(".halo--selection").length).toBe(0);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection").length).toBe(1);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection-chesscom").length).toBe(0);
  });

  it("uses modern square selection when previews are off and selection style is Modern", () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history);
    controller.setMoveHints(false);
    controller.setSelectionStyle("chesscom");

    (controller as any).showSelection("r2c2");

    expect(mockSvg.querySelectorAll(".halo--selection").length).toBe(0);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection").length).toBe(0);
    expect(mockSvg.querySelectorAll(".squareHighlight--selection-chesscom").length).toBe(1);
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

describe("GameController board interaction", () => {
  it("renders the checkmate badge through the controller render path without replacing the running badge on redraw", () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "B", rank: "K" }]],
        ["r1c1", [{ owner: "W", rank: "Q" }]],
        ["r2c2", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic" as any, rulesetId: "chess" as any, boardSize: 8 as any },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);

    controller.refreshView();
    expect(svg.querySelector(".checkmateBadge")?.getAttribute("data-node")).toBe("r0c0");
    expect(svg.querySelector(".checkmateBadge__king use")?.getAttribute("href")).toBe("#B_K");
    expect(svg.querySelector(".checkmateBadge__king animateTransform")).not.toBeNull();

    const firstBadge = svg.querySelector(".checkmateBadge");
    controller.refreshView();
    expect(svg.querySelector(".checkmateBadge")).toBe(firstBadge);
    expect(svg.querySelectorAll(".checkmateBadge")).toHaveLength(1);
  });

  it("shows legal targets immediately on pointer down for a movable piece", () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    controller.setMoveHints(true);

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    (controller as any).onPointerDown(makePointerEvent(source, { pointerType: "touch", clientX: 350, clientY: 350 }));

    expect((controller as any).selected).toBe("r2c2");
    expect((controller as any).currentTargets).toContain("r4c4");
  });

  it("submits a move on drag-to-target and keeps selection on invalid drops", async () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    const applyChosenMove = vi.spyOn(controller as any, "applyChosenMove").mockResolvedValue(undefined);

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    const invalid = svg.querySelector("#r2c3") as SVGCircleElement;
    const target = svg.querySelector("#r4c4") as SVGCircleElement;

    (controller as any).onPointerDown(makePointerEvent(source, { clientX: 350, clientY: 350 }));
    (controller as any).onPointerMove(makePointerEvent(source, { clientX: 410, clientY: 410 }));
    await (controller as any).onPointerUp(makePointerEvent(invalid, { clientX: 450, clientY: 350 }));

    expect(applyChosenMove).not.toHaveBeenCalled();
    expect((controller as any).selected).toBe("r2c2");

    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 2, clientX: 350, clientY: 350 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 2, clientX: 520, clientY: 520 }));
    await (controller as any).onPointerUp(makePointerEvent(target, { pointerId: 2, clientX: 550, clientY: 550 }));

    expect(applyChosenMove).toHaveBeenCalledTimes(1);
    expect(applyChosenMove.mock.calls[0][0]).toMatchObject({ from: "r2c2", to: "r4c4" });
  });

  it("treats dropping on the occupied capture square as the intended capture", async () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    const applyChosenMove = vi.spyOn(controller as any, "applyChosenMove").mockResolvedValue(undefined);

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    const occupiedCaptureSquare = svg.querySelector("#r3c3") as SVGCircleElement;

    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 4, clientX: 350, clientY: 350 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 4, clientX: 430, clientY: 430 }));
    await (controller as any).onPointerUp(
      makePointerEvent(occupiedCaptureSquare, { pointerId: 4, clientX: 450, clientY: 450 }),
    );

    expect(applyChosenMove).toHaveBeenCalledTimes(1);
    expect(applyChosenMove.mock.calls[0][0]).toMatchObject({ kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" });
  });

  it("resolves a capture landing when the pointer is inside the destination square but outside the node circle", () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    (controller as any).selected = "r3c3";
    (controller as any).currentMoves = [
      { kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" },
      { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
      { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
    ];
    (controller as any).currentTargets = ["r5c5", "r6c6", "r7c7"];

    const resolved = (controller as any).resolveMoveAtClientPoint("r3c3", 720, 720);

    expect(resolved).toMatchObject({ kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" });
  });

  it("moves a preview piece with the pointer while dragging", () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    controller.refreshView();

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 3, clientX: 350, clientY: 350 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 3, clientX: 395, clientY: 420 }));

    const preview = svg.querySelector("#previewStacks .dragPreviewStack") as SVGGElement | null;
    const sourceGroup = svg.querySelector('g.stack[data-node="r2c2"]') as SVGGElement | null;

    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("transform")).toBe("translate(45 70)");
    expect(sourceGroup?.style.visibility).toBe("hidden");
  });

  it("keeps the drag preview aligned on scaled boards", () => {
    const { svg, piecesLayer } = createBoardFixture({ clientWidth: 500, clientHeight: 500 });
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    controller.refreshView();

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 7, clientX: 175, clientY: 175 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 7, clientX: 225, clientY: 260 }));

    const preview = svg.querySelector("#previewStacks .dragPreviewStack") as SVGGElement | null;

    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("transform")).toBe("translate(100 170)");
  });

  it("suppresses document text selection during board drag and restores it after release", async () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    document.body.style.userSelect = "text";
    document.documentElement.style.userSelect = "text";

    const controller = new GameController(svg, piecesLayer, null, state, history);
    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    const invalid = svg.querySelector("#r2c3") as SVGCircleElement;

    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 5, clientX: 350, clientY: 350 }));
    expect(document.body.style.userSelect).toBe("none");
    expect(document.documentElement.style.userSelect).toBe("none");

    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 5, clientX: 395, clientY: 420 }));
    await (controller as any).onPointerUp(makePointerEvent(invalid, { pointerId: 5, clientX: 450, clientY: 350 }));

    expect(document.body.style.userSelect).toBe("text");
    expect(document.documentElement.style.userSelect).toBe("text");
  });

  it("prevents native mouse text selection anywhere on the board surface", () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const coord = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    coord.textContent = "A";
    svg.appendChild(coord);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    controller.bind();

    const mousedown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    coord.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
  });

  it("requests no local travel animation for drag-drop moves", async () => {
    const { svg, piecesLayer } = createBoardFixture();
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    const applyChosenMove = vi.spyOn(controller as any, "applyChosenMove").mockResolvedValue(undefined);

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    const target = svg.querySelector("#r4c4") as SVGCircleElement;

    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 6, clientX: 350, clientY: 350 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 6, clientX: 520, clientY: 520 }));
    await (controller as any).onPointerUp(makePointerEvent(target, { pointerId: 6, clientX: 550, clientY: 550 }));

    expect(applyChosenMove).toHaveBeenCalledTimes(1);
    expect(applyChosenMove.mock.calls[0][0]).toMatchObject({ from: "r2c2", to: "r4c4" });
    expect(applyChosenMove.mock.calls[0][1]).toMatchObject({ animateLocalTravel: false });
  });

  it("drops on the intended square on scaled boards", async () => {
    const { svg, piecesLayer } = createBoardFixture({ clientWidth: 500, clientHeight: 500 });
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(state);

    const controller = new GameController(svg, piecesLayer, null, state, history);
    const applyChosenMove = vi.spyOn(controller as any, "applyChosenMove").mockResolvedValue(undefined);

    const source = svg.querySelector("#r2c2") as SVGCircleElement;
    const target = svg.querySelector("#r4c4") as SVGCircleElement;

    (controller as any).onPointerDown(makePointerEvent(source, { pointerId: 8, clientX: 175, clientY: 175 }));
    (controller as any).onPointerMove(makePointerEvent(source, { pointerId: 8, clientX: 260, clientY: 260 }));
    await (controller as any).onPointerUp(makePointerEvent(target, { pointerId: 8, clientX: 275, clientY: 275 }));

    expect(applyChosenMove).toHaveBeenCalledTimes(1);
    expect(applyChosenMove.mock.calls[0][0]).toMatchObject({ from: "r2c2", to: "r4c4" });
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

  it("starts loaded games at the beginning of restored history", () => {
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

    expect(controller.getState().board.get("r1c1")).toEqual([{ owner: "W", rank: "S" }]);
    expect(controller.getState().board.get("r2c2")).toBeUndefined();
    expect(controller.getState().toMove).toBe("W");
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
        "Black to Play. Tap here or press spacebar to resume bot",
        { force: true }
      );
    });

    controller.loadGame(loaded, { states: [s0, loaded], notation: ["", ""], currentIndex: 1 });

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Black to Play. Tap here or press spacebar to resume bot");
  });

  it("suppresses gameplay toasts while playback toast suppression is active", () => {
    const s0: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s0, new HistoryManager());

    controller.setPlaybackToastSuppressed(true);
    controller.showStickyToast("playback_test", "Black to Play. Tap here or press spacebar to resume bot", { force: true });

    expect(document.querySelector(".lascaToast.isVisible")).toBeNull();

    controller.toast("Playback paused - Press the Play button or spacebar to continue", 3000, {
      force: true,
      allowDuringPlayback: true,
    });

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Playback paused - Press the Play button or spacebar to continue");
  });

  it("shows terminal sticky toasts even while playback toast suppression is active", () => {
    const s0: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
      forcedGameOver: {
        winner: null,
        reasonCode: "DRAW_BY_AGREEMENT",
        message: "Draw by mutual agreement",
      },
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s0, new HistoryManager());

    controller.setPlaybackToastSuppressed(true);
    (controller as any).showGameOverStickyToast("Draw by mutual agreement");

    const toast = document.querySelector(".lascaToastWrap.isVisible .lascaToast") as HTMLElement | null;
    expect(toast?.textContent).toBe("Draw by mutual agreement");
  });

});

describe("GameController playback sound effects", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockSvg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "defs"));
    const pieces = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    pieces.setAttribute("id", "pieces");
    mockSvg.appendChild(pieces);
    mockPiecesLayer = pieces;

    const from = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    from.setAttribute("id", "r1c1");
    from.setAttribute("cx", "40");
    from.setAttribute("cy", "40");
    from.setAttribute("r", "18");
    mockSvg.appendChild(from);

    const to = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    to.setAttribute("id", "r2c2");
    to.setAttribute("cx", "80");
    to.setAttribute("cy", "80");
    to.setAttribute("r", "18");
    mockSvg.appendChild(to);

    document.body.appendChild(mockSvg);
  });

  it("plays the inferred move sound during animated history playback", async () => {
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
      ui: { lastMove: { from: "r1c1", to: "r2c2" } },
    };

    const history = new HistoryManager();
    history.push(s0);
    history.push(s1);
    history.jumpTo(0);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s0, history);
    controller.setAnimations(false);
    vi.spyOn(controller as any, "checkAndHandleCurrentPlayerLost").mockImplementation(() => {});
    const playSfxSpy = vi.spyOn(controller as any, "playSfx");

    await controller.jumpToHistoryAnimated(1, 0);

    expect(playSfxSpy).toHaveBeenCalledWith("move");
  });
});

describe("GameController online opponent presence toasts", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  class FakeOnlineDriver {
    public mode = "online" as const;
    private presence: any = null;
    private identity: any = null;
      private identityByColor: any = null;
    private localControlledColors = new Set<string>();

    setPresence(p: any): void {
      this.presence = p;
    }

    setIdentity(i: any): void {
      this.identity = i;
    }

    setIdentityByColor(i: any): void {
      this.identityByColor = i;
    }

    setLocalControlledColors(colors: string[]): void {
      this.localControlledColors = new Set(colors);
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

    getIdentityByColor(): any {
      return this.identityByColor;
    }

    controlsColor = (color: "W" | "B"): boolean => {
      return this.localControlledColors.has(color);
    };
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

  it("shows a local bot as connected in opponent connection details", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineDriver();
    driver.setLocalControlledColors(["W", "B"]);
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-03-19T14:27:40.000Z" },
      p2: { connected: false, lastSeenAt: "2026-03-19T14:27:39.000Z" },
    });
    driver.setIdentity({
      p1: { displayName: "EdB" },
      p2: { displayName: "Delaila Bot" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    (controller as any).showOpponentConnectionDetailsToast();

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent ?? "").toContain("Opponent (Delaila Bot) status: Connected (local bot)");
    expect(toast?.textContent ?? "").not.toContain("Disconnected");
  });

  it("does not block local clicks when a local bot seat has stale disconnected presence", async () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([
        ["r6c0", [{ owner: "W", rank: "P" }]],
        ["r1c0", [{ owner: "B", rank: "P" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineDriver();
    driver.setLocalControlledColors(["W", "B"]);
    driver.setPresence({
      p1: { connected: true, lastSeenAt: "2026-03-19T14:27:40.000Z" },
      p2: { connected: false, lastSeenAt: "2026-03-19T14:27:39.000Z" },
    });
    driver.setIdentity({
      p1: { displayName: "EdB" },
      p2: { displayName: "Delaila Bot" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    (controller as any).resolveClickedNode = () => "r6c0";
    (controller as any).showSelection = () => {};
    (controller as any).playSfx = () => {};

    await (controller as any).onClick({ target: null } as MouseEvent);

    expect((controller as any).selected).toBe("r6c0");
  });
});

describe("GameController online transport toasts", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  function createNode(id: string, cx: number, cy: number): SVGCircleElement {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle") as SVGCircleElement;
    node.id = id;
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("r", "18");
    return node;
  }

  function createRenderedStack(nodeId: string): SVGGElement {
    const stack = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    stack.setAttribute("class", "stack");
    stack.setAttribute("data-node", nodeId);
    const piece = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    piece.setAttribute("r", "12");
    stack.appendChild(piece);
    return stack;
  }

  function createStackCount(nodeId: string): SVGGElement {
    const count = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    count.setAttribute("class", "stackCount");
    count.setAttribute("data-node", nodeId);
    return count;
  }

  class FakeOnlineTransportDriver {
    public mode = "online" as const;
    private listeners = new Map<string, Array<(payload: any) => void>>();
    private state: GameState;
    private realtimeUpdated: (() => void) | null = null;

    constructor(state: GameState) {
      this.state = state;
    }

    getState(): GameState {
      return this.state;
    }

    setState(state: GameState): void {
      this.state = state;
    }

    exportHistorySnapshots() {
      return { states: [this.state], notation: [], currentIndex: 0, emtMs: [], evals: [] };
    }

    onSseEvent(eventName: string, cb: (payload: any) => void): () => void {
      const next = this.listeners.get(eventName) ?? [];
      next.push(cb);
      this.listeners.set(eventName, next);
      return () => {
        const current = this.listeners.get(eventName) ?? [];
        this.listeners.set(eventName, current.filter((item) => item !== cb));
      };
    }

    emit(eventName: string, payload: any): void {
      for (const cb of this.listeners.get(eventName) ?? []) cb(payload);
    }

    startRealtime(onUpdated: () => void): boolean {
      this.realtimeUpdated = onUpdated;
      return true;
    }

    triggerRealtimeUpdate(): void {
      this.realtimeUpdated?.();
    }

    getPlayerId(): string {
      return "p1";
    }

    getPlayerColor(): "W" | "B" {
      return "W";
    }

    getPresence(): any {
      return {
        p1: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
        p2: { connected: true, lastSeenAt: "2026-01-25T00:00:00.000Z" },
      };
    }

    getIdentity(): any {
      return null;
    }

    getIdentityByColor(): any {
      return null;
    }

    controlsColor = (color: "W" | "B"): boolean => color === "W";
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="onlineInfoPanel"></div>
      <div id="onlineOpponentStatus">—</div>
      <div id="onlineMsg">—</div>
    `;
    document.head.innerHTML = "";

    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    (mockSvg as any).addEventListener = () => {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show the disconnect toast for transient reconnect churn", async () => {
    const state: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    controller.bind();

    driver.emit("transport_status", { status: "reconnecting" });
    driver.emit("authority_status", { status: "stale" });
    await Promise.resolve();

    expect(document.querySelector(".lascaToast")?.textContent ?? "").not.toContain("Connection to server was lost");

    await vi.advanceTimersByTimeAsync(600);
    driver.emit("transport_status", { status: "connected" });
    driver.emit("authority_status", { status: "fresh" });
    await Promise.resolve();

    const toast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(toast?.textContent ?? "").not.toContain("Connection to server was lost");
    expect(toast?.textContent ?? "").not.toContain("Reconnected");
  });

  it("shows the disconnect toast only after reconnecting persists", async () => {
    const state: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    controller.bind();

    driver.emit("transport_status", { status: "reconnecting" });
    driver.emit("authority_status", { status: "stale" });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1200);
    await Promise.resolve();

    const reconnectToast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(reconnectToast?.textContent ?? "").toContain("Connection to server was lost");

    driver.emit("transport_status", { status: "connected" });
    driver.emit("authority_status", { status: "fresh" });
    await Promise.resolve();

    const reconnectedToast = document.querySelector(".lascaToast") as HTMLElement | null;
    expect(reconnectedToast?.textContent).toBe("Reconnected");
  });

  it("preserves the selected piece across same-position online refreshes", async () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    controller.bind();

    (controller as any).selected = "r1c1";
    (controller as any).showSelection("r1c1");

    driver.setState({
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    });
    driver.triggerRealtimeUpdate();
    await Promise.resolve();

    expect((controller as any).selected).toBe("r1c1");
    expect(((controller as any).currentTargets as string[]).length).toBeGreaterThan(0);
  });

  it("animates an opponent move when an authoritative online update arrives", async () => {
    const state: GameState = {
      board: new Map([
        ["r0c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    const animateRemoteOnlineTransition = vi
      .spyOn(controller as any, "animateRemoteOnlineTransition")
      .mockResolvedValue(undefined);
    controller.bind();

    driver.setState({
      board: new Map([
        ["r1c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
    });
    driver.triggerRealtimeUpdate();
    await Promise.resolve();
    await Promise.resolve();

    expect(animateRemoteOnlineTransition).toHaveBeenCalledTimes(1);
  });

  it("hides the captured destination stack while an opponent capture animates", async () => {
    mockPiecesLayer.id = "pieces";
    mockSvg.appendChild(createNode("r4c4", 40, 40));
    mockSvg.appendChild(createNode("r6c6", 60, 60));
    mockSvg.appendChild(mockPiecesLayer);
    document.body.appendChild(mockSvg);

    const countsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    countsLayer.setAttribute("id", "stackCounts");
    countsLayer.appendChild(createStackCount("r4c4"));
    countsLayer.appendChild(createStackCount("r6c6"));
    mockSvg.appendChild(countsLayer);

    const movingStack = createRenderedStack("r4c4");
    const capturedStack = createRenderedStack("r6c6");
    mockPiecesLayer.appendChild(movingStack);
    mockPiecesLayer.appendChild(capturedStack);

    const state: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "B", rank: "Q" }]],
        ["r6c6", [{ owner: "W", rank: "B" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    const next: GameState = {
      board: new Map([["r6c6", [{ owner: "B", rank: "Q" }]]]),
      toMove: "W",
      phase: "idle",
      meta: state.meta,
      ui: { lastMove: { from: "r4c4", to: "r6c6" } as any },
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);
    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);

    const animationPromise = (controller as any).animateRemoteOnlineTransition(state, next);
    await Promise.resolve();

    expect(capturedStack.style.visibility).toBe("hidden");
    expect((countsLayer.querySelector('g.stackCount[data-node="r6c6"]') as SVGGElement | null)?.style.visibility).toBe(
      "hidden"
    );

    await vi.advanceTimersByTimeAsync(500);
    await animationPromise;
  });

  it("removes kept animation clones after applying an authoritative online state", async () => {
    mockPiecesLayer.id = "pieces";
    mockSvg.appendChild(createNode("r0c4", 20, 20));
    mockSvg.appendChild(createNode("r1c4", 20, 40));
    mockSvg.appendChild(mockPiecesLayer);
    document.body.appendChild(mockSvg);

    const state: GameState = {
      board: new Map([
        ["r0c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    const next: GameState = {
      board: new Map([
        ["r1c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: state.meta,
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);
    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    const overlayLayer = (controller as any).overlayLayer as SVGGElement;
    const keptWrapper = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    keptWrapper.setAttribute("data-animating", "true");
    overlayLayer.appendChild(keptWrapper);

    vi.spyOn(controller as any, "animateRemoteOnlineTransition").mockResolvedValue(undefined);

    await (controller as any).applyRemoteOnlineState(next);

    expect(overlayLayer.querySelector('[data-animating="true"]')).toBeNull();
  });

  it("shows the online turn toast only after the opponent move render completes", async () => {
    const state: GameState = {
      board: new Map([
        ["r0c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    const history = new HistoryManager();
    history.push(state);
    const driver = new FakeOnlineTransportDriver(state);
    let releaseAnimation: (() => void) | null = null;
    const animationGate = new Promise<void>((resolve) => {
      releaseAnimation = resolve;
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    vi.spyOn(controller as any, "animateRemoteOnlineTransition").mockImplementation(() => animationGate);
    const showToast = vi.spyOn(controller as any, "showToast");
    controller.bind();
    (controller as any).onlineDidShowConnectedToast = true;
    showToast.mockClear();
    document.querySelector(".lascaToast")?.remove();

    driver.setState({
      board: new Map([
        ["r1c4", [{ owner: "B", rank: "K" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: state.meta,
    });
    driver.triggerRealtimeUpdate();
    await Promise.resolve();
    await Promise.resolve();

    expect(showToast).not.toHaveBeenCalled();

    releaseAnimation?.();
    await (controller as any).remoteOnlineApplyChain;

    expect(showToast).toHaveBeenCalled();
    expect(showToast.mock.calls.at(-1)?.[0]).toBe("White to Play");
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

describe("GameController local shell identities", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("uses imported local names in the shell snapshot and can clear them", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([[
        "r1c1",
        [{ owner: "W", rank: "P" }],
      ]]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    const onShellSnapshotChange = vi.fn();
    controller.addShellSnapshotChangeCallback(onShellSnapshotChange);

    controller.setLocalPlayerDisplayNames({ W: "Magnus Carlsen", B: "  Hikaru Nakamura  " });

    let snapshot = controller.getPlayerShellSnapshot();
    expect(snapshot.mode).toBe("local");
    expect(snapshot.players.W.displayName).toBe("Magnus Carlsen");
    expect(snapshot.players.B.displayName).toBe("Hikaru Nakamura");
    expect(onShellSnapshotChange).toHaveBeenCalledTimes(1);

    controller.setLocalPlayerDisplayNames({ W: "", B: null });

    snapshot = controller.getPlayerShellSnapshot();
    expect(snapshot.players.W.displayName).toBe("White");
    expect(snapshot.players.B.displayName).toBe("Black");
    expect(onShellSnapshotChange).toHaveBeenCalledTimes(2);
  });

  it("fires a shell snapshot update when a move flips the turn", async () => {
    const history = new HistoryManager();
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "P" }]],
        ["r6c6", [{ owner: "B", rank: "P" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(state);

    const nextState: GameState = {
      board: new Map([
        ["r2c1", [{ owner: "W", rank: "P" }]],
        ["r6c6", [{ owner: "B", rank: "P" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: state.meta,
    };

    const driver = {
      mode: "local" as const,
      submitMove: vi.fn(async () => nextState),
      pushHistory: vi.fn(),
      setState: vi.fn(),
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, state, history, driver as any);
    const onShellSnapshotChange = vi.fn();
    controller.addShellSnapshotChangeCallback(onShellSnapshotChange);

    await (controller as any).applyChosenMove({ kind: "move", from: "r1c1", to: "r2c1" });

    const snapshot = controller.getState();
    expect(snapshot.toMove).toBe("B");
    expect(onShellSnapshotChange).toHaveBeenCalled();
  });
});

describe("GameController online shell identities", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  class FakeOnlineShellDriver {
    public mode = "online" as const;
    private playerId: string | null = "p1";
    private playerColor: "W" | "B" | null = "W";
    private presence: any = null;
    private identity: any = null;
    private identityByColor: any = null;

    setViewer(playerId: string | null, playerColor: "W" | "B" | null): void {
      this.playerId = playerId;
      this.playerColor = playerColor;
    }

    setPresence(presence: any): void {
      this.presence = presence;
    }

    setIdentity(identity: any): void {
      this.identity = identity;
    }

    setIdentityByColor(identityByColor: any): void {
      this.identityByColor = identityByColor;
    }

    getPlayerId(): string | null {
      return this.playerId;
    }

    getPlayerColor(): "W" | "B" | null {
      return this.playerColor;
    }

    getPresence(): any {
      return this.presence;
    }

    getIdentity(): any {
      return this.identity;
    }

    getIdentityByColor(): any {
      return this.identityByColor;
    }

    getServerUrl(): string | null {
      return "http://localhost:9999";
    }
  }

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("includes live online names and country metadata for both players", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setPresence({
      p1: { connected: true },
      p2: { connected: true },
    });
    driver.setIdentity({
      p1: { displayName: "Alice", countryCode: "us", countryName: "United States" },
      p2: { displayName: "Bob", countryCode: "ca", countryName: "Canada" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.mode).toBe("online");
    expect(snapshot.viewerRole).toBe("player");
    expect(snapshot.players.W.displayName).toBe("Alice");
    expect(snapshot.players.W.countryCode).toBe("us");
    expect(snapshot.players.W.countryName).toBe("United States");
    expect(snapshot.players.W.roleLabel).toBe("You · White");
    expect(snapshot.players.W.detailText).toBe("Your turn.");
    expect(snapshot.players.B.displayName).toBe("Bob");
    expect(snapshot.players.B.countryCode).toBe("ca");
    expect(snapshot.players.B.countryName).toBe("Canada");
    expect(snapshot.players.B.detailText).toBe("Watching for the next move.");
  });

  it("shows waiting-for-opponent details when the remote seat has not joined", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setPresence({
      p1: { connected: true },
    });
    driver.setIdentity({
      p1: { displayName: "Alice" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.players.W.displayName).toBe("Alice");
    expect(snapshot.players.B.displayName).toBe("Black");
    expect(snapshot.players.B.status).toBe("waiting");
    expect(snapshot.players.B.statusText).toBe("Waiting");
    expect(snapshot.players.B.detailText).toBe("Waiting for opponent to join.");
  });

  it("falls back to seat identity when the per-player identity map is incomplete", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setPresence({
      p1: { connected: true },
      p2: { connected: true },
    });
    driver.setIdentity({
      p1: { displayName: "Alice" },
    });
    driver.setIdentityByColor({
      W: { displayName: "Alice" },
      B: { displayName: "Bob" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.players.W.displayName).toBe("Alice");
    expect(snapshot.players.B.displayName).toBe("Bob");
  });

  it("shows spectator view labels when the viewer is a spectator", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setViewer("spectator", null);
    driver.setPresence({
      p1: { connected: true },
      p2: { connected: true },
    });
    driver.setIdentityByColor({
      W: { displayName: "Alice" },
      B: { displayName: "Bob" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.viewerRole).toBe("spectator");
    expect(snapshot.viewerColor).toBe(null);
    expect(snapshot.players.W.displayName).toBe("Alice");
    expect(snapshot.players.B.displayName).toBe("Bob");
    expect(snapshot.players.W.roleLabel).toBe("Spectator view");
    expect(snapshot.players.B.roleLabel).toBe("Spectator view");
    expect(snapshot.players.W.status).toBe("spectating");
    expect(snapshot.players.B.status).toBe("spectating");
    expect(snapshot.players.W.detailText).toBe("Watching the live game.");
    expect(snapshot.players.B.detailText).toBe("Watching the live game.");
  });

  it("reports terminal outcomes in the local shell snapshot", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
      forcedGameOver: {
        winner: null,
        reasonCode: "DRAW_BY_AGREEMENT",
        message: "Draw by mutual agreement",
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.players.W.statusText).toBe("Game over");
    expect(snapshot.players.W.detailText).toBe("Draw by mutual agreement");
    expect(snapshot.players.W.isActiveTurn).toBe(false);
    expect(snapshot.players.B.statusText).toBe("Game over");
    expect(snapshot.players.B.detailText).toBe("Draw by mutual agreement");
    expect(snapshot.players.B.isActiveTurn).toBe(false);
  });

  it("prefers the terminal outcome over pending draw status in the online shell snapshot", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
      pendingDrawOffer: { offeredBy: "W", nonce: 33 },
      forcedGameOver: {
        winner: null,
        reasonCode: "DRAW_BY_AGREEMENT",
        message: "Draw by mutual agreement",
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setPresence({
      p1: { connected: true },
      p2: { connected: true },
    });
    driver.setIdentity({
      p1: { displayName: "Alice" },
      p2: { displayName: "Bob" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.players.W.statusText).toBe("Game over");
    expect(snapshot.players.W.detailText).toBe("Draw by mutual agreement");
    expect(snapshot.players.W.isActiveTurn).toBe(false);
    expect(snapshot.players.B.statusText).toBe("Game over");
    expect(snapshot.players.B.detailText).toBe("Draw by mutual agreement");
    expect(snapshot.players.B.isActiveTurn).toBe(false);
  });

  it("uses authority-first reconnect status in the online shell snapshot", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([["r1c1", [{ owner: "W", rank: "P" }]]]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "chess_classic" as any,
        rulesetId: "chess" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const driver = new FakeOnlineShellDriver();
    driver.setPresence({
      p1: { connected: true },
      p2: { connected: true },
    });
    driver.setIdentity({
      p1: { displayName: "Alice" },
      p2: { displayName: "Bob" },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history, driver as any);
    (controller as any).onlineTransportStatus = "connected";
    (controller as any).onlineAuthorityStatus = "stale";

    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.transportStatus).toBe("reconnecting");
    expect(snapshot.players.W.detailText).toBe("Re-establishing the room connection.");
  });
});

describe("GameController online draw offers", () => {
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
    document.querySelectorAll(".lascaToastWrap").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  function makeState(overrides?: Partial<GameState>): GameState {
    return {
      board: new Map([["r7c4", [{ owner: "W", rank: "K" }]], ["r0c4", [{ owner: "B", rank: "K" }]]]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic" as any, rulesetId: "chess" as any, boardSize: 8 as any },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
      ...overrides,
    };
  }

  function makeOnlineDriver(args: {
    playerId: string;
    playerColor: "W" | "B";
    history: HistoryManager;
    controlsColor?: (color: "W" | "B") => boolean;
    state?: GameState;
    presence?: Record<string, { connected?: boolean; inGrace?: boolean; graceUntil?: string }> | null;
    identity?: Record<string, { displayName?: string; avatarUrl?: string; countryCode?: string; countryName?: string }> | null;
    startRealtime?: (onUpdated: () => void) => boolean;
    offerDrawRemote?: () => Promise<GameState>;
    respondDrawOfferRemote?: (args: { accept: boolean }) => Promise<GameState>;
  }): any {
    return {
      mode: "online" as const,
      getState: () => args.state ?? makeState(),
      setState: vi.fn(),
      getPlayerId: () => args.playerId,
      getPlayerColor: () => args.playerColor,
      getRoomId: () => "room-1",
      getServerUrl: () => "http://localhost:9999",
      getPresence: () => args.presence ?? null,
      getIdentity: () => args.identity ?? null,
      getIdentityByColor: () => null,
      getRoomRules: () => null,
      controlsColor: args.controlsColor ?? (() => false),
      startRealtime: args.startRealtime ?? (() => true),
      onSseEvent: vi.fn(() => () => {}),
      fetchLatest: vi.fn(async () => false),
      exportHistorySnapshots: () => args.history.exportSnapshots(),
      offerDrawRemote: args.offerDrawRemote ?? vi.fn(async () => makeState()),
      respondDrawOfferRemote: args.respondDrawOfferRemote ?? vi.fn(async () => makeState()),
    };
  }

  it("disables the draw button for a local bot game", () => {
    document.body.innerHTML = `
      <div id="statusTurn"></div>
      <div id="statusPhase"></div>
      <div id="statusMessage"></div>
      <select id="botWhiteSelect"><option value="human">Human</option></select>
      <select id="botBlackSelect"><option value="beginner" selected>Beginner</option></select>
      <button id="offerDrawBtn"></button>
    `;

    const history = new HistoryManager();
    const initial = makeState();
    history.push(initial);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history);
    (controller as any).updatePanel();

    const button = document.getElementById("offerDrawBtn") as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.title).toBe("Draw offers are disabled when playing a bot");
  });

  it("blocks offering a draw against an online local bot", async () => {
    const history = new HistoryManager();
    const initial = makeState();
    history.push(initial);

    const offerDrawRemote = vi.fn(async () => makeState());
    const driver = makeOnlineDriver({
      playerId: "p1",
      playerColor: "W",
      history,
      controlsColor: (color) => color === "B",
      offerDrawRemote,
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history, driver as any);
    const showToast = vi.fn();
    (controller as any).showToast = showToast;

    await controller.offerDraw();

    expect(offerDrawRemote).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Draw offers are disabled when playing a bot", 1600);
  });

  it("prompts the online opponent when a chess draw offer arrives", async () => {
    const history = new HistoryManager();
    const initial = makeState();
    history.push(initial);

    const driver = makeOnlineDriver({
      playerId: "p2",
      playerColor: "B",
      history,
      respondDrawOfferRemote: vi.fn(async () => makeState()),
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history, driver as any);
    const showStickyToast = vi.fn();
    const setStickyToastAction = vi.fn();
    (controller as any).showStickyToast = showStickyToast;
    (controller as any).setStickyToastAction = setStickyToastAction;

    controller.setState(makeState({ pendingDrawOffer: { offeredBy: "W", nonce: 77 } }));
    await Promise.resolve();

    expect(showStickyToast).toHaveBeenCalledWith("online_draw_offer_pending", "White offers a draw — tap to respond", { force: true });
    expect(setStickyToastAction).toHaveBeenCalled();
    expect(driver.respondDrawOfferRemote).not.toHaveBeenCalled();
  });

  it("projects pending draw offers into the shell player snapshot", () => {
    const history = new HistoryManager();
    const initial = makeState({ pendingDrawOffer: { offeredBy: "W", nonce: 94 } });
    history.push(initial);

    const driver = makeOnlineDriver({
      playerId: "p2",
      playerColor: "B",
      history,
      state: initial,
      presence: {
        p1: { connected: true },
        p2: { connected: true },
      },
      identity: {
        p1: { displayName: "Alice" },
        p2: { displayName: "Bob" },
      },
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history, driver as any);
    const snapshot = controller.getPlayerShellSnapshot();

    expect(snapshot.players.B.statusText).toBe("Offer draw");
    expect(snapshot.players.B.detailText).toBe("White offered a draw. Respond to continue.");
    expect(snapshot.players.W.statusText).toBe("Offer sent");
    expect(snapshot.players.W.detailText).toBe("Waiting for your response to the draw offer.");
  });

  it("shows the offering player when a draw offer is declined online", () => {
    const history = new HistoryManager();
    const initial = makeState({ pendingDrawOffer: { offeredBy: "W", nonce: 91 } });
    history.push(initial);

    const driver = makeOnlineDriver({
      playerId: "p1",
      playerColor: "W",
      history,
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history, driver as any);
    const showStickyToast = vi.fn();
    (controller as any).showStickyToast = showStickyToast;

    controller.setState(makeState());

    expect(showStickyToast).toHaveBeenCalledWith("online_draw_offer_resolution", "Draw offer declined", { force: true });
  });

  it("shows the offering player when a draw offer is accepted online", () => {
    const history = new HistoryManager();
    const initial = makeState({ pendingDrawOffer: { offeredBy: "W", nonce: 92 } });
    history.push(initial);

    const driver = makeOnlineDriver({
      playerId: "p1",
      playerColor: "W",
      history,
    });

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initial, history, driver as any);
    const showStickyToast = vi.fn();
    (controller as any).showStickyToast = showStickyToast;

    controller.setState(makeState({
      forcedGameOver: {
        winner: null,
        reasonCode: "DRAW_BY_AGREEMENT",
        message: "Draw by mutual agreement",
      },
    }));

    expect(showStickyToast).toHaveBeenCalledWith("online_draw_offer_resolution", "Draw offer accepted", { force: true });
  });
});
