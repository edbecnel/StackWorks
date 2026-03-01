// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

import { GameController } from "./gameController.ts";
import { HistoryManager } from "../game/historyManager.ts";
import { createInitialGameStateForVariant } from "../game/state.ts";
import { LocalDriver } from "../driver/localDriver.ts";

describe("GameController analysis mode", () => {
  it("can enable analysis mode for non-chess rulesets", () => {
    const { controller } = makeControllerForTest("lasca_7_classic");
    controller.setAnalysisMode(true);
    expect(controller.isAnalysisMode()).toBe(true);
  });

  it("applies moves locally and never calls driver.submitMove", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    const piecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as unknown as SVGGElement;
    piecesLayer.setAttribute("id", "pieces");
    svg.appendChild(piecesLayer);
    document.body.appendChild(svg);

    const initial = createInitialGameStateForVariant("chess_classic");
    const history = new HistoryManager();
    history.push(initial);

    const driver = new LocalDriver(initial as any, history);

    let submitCalls = 0;
    (driver as any).submitMove = async () => {
      submitCalls++;
      throw new Error("submitMove should not be called in analysis mode");
    };

    const controller = new GameController(svg, piecesLayer, null as any, initial as any, history, driver);

    // Avoid full SVG rendering in unit tests.
    (controller as any).renderAuthoritative = () => {};
    (controller as any).updatePanel = () => {};
    (controller as any).refreshSelectableCursors = () => {};
    (controller as any).playSfx = () => {};
    (controller as any).showBanner = () => {};
    (controller as any).showGameOverToast = () => {};
    (controller as any).maybeToastTurnChange = () => {};

    controller.setAnalysisMode(true);

    const beforeToMove = controller.getState().toMove;
    const legal = controller.getLegalMovesForTurn();
    expect(legal.length).toBeGreaterThan(0);

    await controller.playMove(legal[0] as any);

    expect(submitCalls).toBe(0);
    expect(controller.isAnalysisMode()).toBe(true);
    expect(controller.getState().toMove).not.toBe(beforeToMove);

    logSpy.mockRestore();
  });
  
  it("fires analysis change callbacks (usable to disable bots)", () => {
    // This test intentionally avoids depending on bot managers; it just verifies
    // that analysis mode can drive a local-only side effect such as forcing
    // bot prefs to 'human'.
    const { controller } = makeControllerForTest();
    
    localStorage.setItem("lasca.chessbot.white", "strong");
    localStorage.setItem("lasca.chessbot.black", "beginner");
    
    controller.addAnalysisModeChangeCallback((enabled: boolean) => {
      if (!enabled) return;
      localStorage.setItem("lasca.chessbot.white", "human");
      localStorage.setItem("lasca.chessbot.black", "human");
    });
    
    controller.setAnalysisMode(true);
    expect(localStorage.getItem("lasca.chessbot.white")).toBe("human");
    expect(localStorage.getItem("lasca.chessbot.black")).toBe("human");
  });

  it("sandboxes Move History navigation during analysis", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    const piecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as unknown as SVGGElement;
    piecesLayer.setAttribute("id", "pieces");
    svg.appendChild(piecesLayer);
    document.body.appendChild(svg);

    const initial = createInitialGameStateForVariant("chess_classic");
    const history = new HistoryManager();
    history.push(initial);
    const driver = new LocalDriver(initial as any, history);
    const controller = new GameController(svg, piecesLayer, null as any, initial as any, history, driver);

    (controller as any).renderAuthoritative = () => {};
    (controller as any).updatePanel = () => {};
    (controller as any).refreshSelectableCursors = () => {};
    (controller as any).playSfx = () => {};
    (controller as any).showBanner = () => {};
    (controller as any).showGameOverToast = () => {};
    (controller as any).maybeToastTurnChange = () => {};

    // Make one real move (normal mode) so the driver's real history advances.
    {
      const legal = controller.getLegalMovesForTurn();
      expect(legal.length).toBeGreaterThan(0);
      await controller.playMove(legal[0] as any);
      expect(driver.getHistory().length).toBe(2);
    }

    const realBefore = driver.exportHistorySnapshots();

    // Enter analysis: history should start as a clone of the real history.
    controller.setAnalysisMode(true);
    expect(controller.isAnalysisMode()).toBe(true);
    expect(controller.getHistory().length).toBe(driver.getHistory().length);

    // Play an analysis-only move: should extend ONLY the analysis history.
    {
      const legal = controller.getLegalMovesForTurn();
      expect(legal.length).toBeGreaterThan(0);
      await controller.playMove(legal[0] as any);
      expect(controller.getHistory().length).toBe(driver.getHistory().length + 1);
      expect(driver.getHistory().length).toBe(2);
    }

    // Undo inside analysis: should NOT change the driver's real history index.
    controller.undo();
    const realAfterUndo = driver.exportHistorySnapshots();
    expect(realAfterUndo.currentIndex).toBe(realBefore.currentIndex);
    expect(driver.getHistory().length).toBe(2);

    // Exit analysis: restore real driver state/history.
    controller.setAnalysisMode(false);
    expect(controller.isAnalysisMode()).toBe(false);
    expect(controller.getHistory().length).toBe(driver.getHistory().length);
    expect(controller.getState()).toEqual(driver.getState());

    logSpy.mockRestore();
  });
  
  function makeControllerForTest(variantId: any = "chess_classic"): { controller: any } {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    const piecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as unknown as SVGGElement;
    piecesLayer.setAttribute("id", "pieces");
    svg.appendChild(piecesLayer);
    document.body.appendChild(svg);

    const initial = createInitialGameStateForVariant(variantId);
    const history = new HistoryManager();
    history.push(initial);
    const driver = new LocalDriver(initial as any, history);
    const controller = new GameController(svg, piecesLayer, null as any, initial as any, history, driver);

    // Keep it light-weight.
    (controller as any).renderAuthoritative = () => {};
    (controller as any).updatePanel = () => {};
    (controller as any).refreshSelectableCursors = () => {};
    (controller as any).playSfx = () => {};
    (controller as any).showBanner = () => {};
    (controller as any).showGameOverToast = () => {};
    (controller as any).maybeToastTurnChange = () => {};

    return { controller };
  }
});
