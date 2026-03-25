import { renderStackAtNode } from "./renderStackAtNode.ts";
import { ensureStackCountsLayer, clearStackCounts } from "./stackCountsLayer.ts";
import type { GameState } from "../game/state.ts";
import type { createStackInspector } from "../ui/stackInspector";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderGameState(
  svgRoot: SVGSVGElement,
  piecesLayer: SVGGElement,
  inspector: ReturnType<typeof createStackInspector> | null,
  state: GameState,
  options?: { getCoordLabel?: ((nodeId: string) => string | null) | null }
): void {
  piecesLayer.textContent = "";

  // Keep stack preview spines above all pieces (within #pieces) by rendering them
  // into a dedicated group appended after the main piece groups.
  const pieceStacksLayer = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieceStacksLayer.setAttribute("data-layer", "pieceStacks");

  const miniSpinesLayer = document.createElementNS(SVG_NS, "g") as SVGGElement;
  miniSpinesLayer.setAttribute("data-layer", "miniSpines");

  piecesLayer.appendChild(pieceStacksLayer);
  piecesLayer.appendChild(miniSpinesLayer);

  const countsLayer = ensureStackCountsLayer(svgRoot);
  clearStackCounts(countsLayer);

  const rulesetId = state.meta?.rulesetId ?? "lasca";
  const boardSize = state.meta?.boardSize ?? 7;

  for (const [nodeId, stack] of state.board.entries()) {
    renderStackAtNode(svgRoot, pieceStacksLayer, inspector, nodeId, stack, {
      rulesetId,
      boardSize,
      countsLayer,
      spinesLayer: miniSpinesLayer,
      getCoordLabel: options?.getCoordLabel ?? null,
    });
  }
}
