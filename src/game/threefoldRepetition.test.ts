import { describe, it, expect, beforeEach } from "vitest";
import { GameController } from "../controller/gameController";
import { HistoryManager } from "./historyManager";
import type { GameState } from "./state";
import { RULES } from "./ruleset";

describe("Threefold Repetition Draw", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;
  let history: HistoryManager;

  beforeEach(() => {
    // Create minimal mock SVG elements
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    
    // Add mock methods
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
    
    // Ensure rule is enabled
    RULES.drawByThreefold = true;
    
    history = new HistoryManager();
  });

  it("should detect draw when same position occurs 3 times", () => {
    // Create a position that will be repeated exactly 3 times
    // Two officers moving back and forth in a 4-move cycle
    
    // Position A (initial): W@r3c3, B@r5c5, White to move
    const positionA: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, positionA, history);
    history.push(positionA); // Occurrence 1 of position A

    // White moves: r3c3 -> r4c4
    const position2: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position2);

    // Black moves: r5c5 -> r4c6
    const position3: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    history.push(position3);

    // White moves back: r4c4 -> r3c3
    const position4: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position4);

    // Black moves back: r4c6 -> r5c5 (BACK TO POSITION A)
    const positionA2: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    history.push(positionA2); // Occurrence 2 of position A

    // Repeat the cycle again...
    
    // White moves: r3c3 -> r4c4
    const position6: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position6);

    // Black moves: r5c5 -> r4c6
    const position7: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    history.push(position7);

    // White moves back: r4c4 -> r3c3
    const position8: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position8);

    // Black moves back: r4c6 -> r5c5 (BACK TO POSITION A AGAIN - 3rd time!)
    const positionA3: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    history.push(positionA3); // Occurrence 3 of position A
    controller.setState(positionA3);

    // Now check if threefold repetition is detected
    const isThreefold = (controller as any).checkThreefoldRepetition();
    
    expect(isThreefold).toBe(true);
  });

  it("should not detect draw when same position occurs only 2 times", () => {
    const initialState: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initialState, history);
    history.push(initialState);

    // Move and come back once (2 occurrences of initial position)
    const position2: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position2);

    const position3: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    history.push(position3);

    // Back to initial position (2nd occurrence)
    const position4: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r4c6", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };
    history.push(position4);
    controller.setState(position4);

    const isThreefold = (controller as any).checkThreefoldRepetition();
    
    expect(isThreefold).toBe(false);
  });

  it("should not detect draw when rule is disabled", () => {
    RULES.drawByThreefold = false;

    const initialState: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, initialState, history);
    
    // Add same position 3 times
    history.push(initialState);
    history.push(initialState);
    history.push(initialState);
    controller.setState(initialState);

    const isThreefold = (controller as any).checkThreefoldRepetition();
    
    expect(isThreefold).toBe(false);
  });

  it("should distinguish positions with different player to move", () => {
    const stateWhiteToMove: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const stateBlackToMove: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, stateWhiteToMove, history);
    
    // Add positions alternating between white and black to move
    history.push(stateWhiteToMove);
    history.push(stateBlackToMove);
    history.push(stateWhiteToMove);
    history.push(stateBlackToMove);
    history.push(stateWhiteToMove); // 3rd occurrence of white to move
    
    controller.setState(stateWhiteToMove);

    const isThreefold = (controller as any).checkThreefoldRepetition();
    
    // Should detect threefold for white-to-move position
    expect(isThreefold).toBe(true);
  });

  it("should reuse threefold repetition detection for International Draughts", () => {
    const positionA: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };

    const controller = new GameController(mockSvg, mockPiecesLayer, null, positionA, history);
    history.push(positionA);

    const position2: GameState = {
      board: new Map([
        ["r5c4", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };
    history.push(position2);

    const position3: GameState = {
      board: new Map([
        ["r5c4", [{ owner: "W", rank: "O" }]],
        ["r7c4", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };
    history.push(position3);

    const position4: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r7c4", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };
    history.push(position4);

    const positionA2: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };
    history.push(positionA2);

    history.push(position2);
    history.push(position3);
    history.push(position4);

    const positionA3: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };
    history.push(positionA3);
    controller.setState(positionA3);

    const isThreefold = (controller as any).checkThreefoldRepetition();

    expect(isThreefold).toBe(true);
  });
});
