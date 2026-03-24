import { beforeEach, describe, expect, it } from "vitest";
import { bindChessEvaluationPanel } from "./chessEvaluationPanel";

describe("bindChessEvaluationPanel material mode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="evaluationMode">
        <button type="button" class="evalModeBtn" data-mode="material" aria-pressed="false"></button>
      </div>
      <div id="evaluationValue"></div>
      <div id="evaluationBarWhite"></div>
      <div id="evaluationBarBlack"></div>
    `;
  });

  it("counts only the top pieces of Columns Chess stacks for material", () => {
    const controller = {
      getState: () => ({
        board: new Map([
          ["r7c4", [{ owner: "W", rank: "K" }]],
          ["r0c4", [{ owner: "B", rank: "K" }]],
          ["r6c0", [{ owner: "B", rank: "Q" }, { owner: "W", rank: "R" }]],
          ["r1c7", [{ owner: "W", rank: "B" }, { owner: "B", rank: "P" }]],
        ]),
        toMove: "W",
        phase: "select",
        meta: { rulesetId: "columns_chess", boardSize: 8 },
      }),
      getHistorySnapshots: () => ({ states: [], evals: [], currentIndex: 0 }),
      getOnlinePublishedEvalScore: () => null,
      publishOnlineEvalScore: () => {},
      addHistoryChangeCallback: () => {},
      isOnlineSpectator: () => false,
      isOver: () => false,
    } as any;

    bindChessEvaluationPanel(controller, null);

    expect((document.getElementById("evaluationValue")?.textContent ?? "").trim()).toBe(
      "Material: White 5 / Black 1 (White +4)\nPieces: W Q0 R1 B0 N0 P0 | B Q0 R0 B0 N0 P1"
    );
  });
});