// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

import { GameController } from "./gameController.ts";
import { HistoryManager } from "../game/historyManager.ts";
import { createInitialGameStateForVariant } from "../game/state.ts";
import { LocalDriver } from "../driver/localDriver.ts";

describe("GameController analysis mode", () => {
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
});
