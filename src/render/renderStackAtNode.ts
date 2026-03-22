import { pieceToHref } from "../pieces/pieceToHref";
import { makeUseWithTitle } from "./svgUse";
import { drawMiniStackSpine } from "./miniSpine";
import { maybeVariantStonePieceHref } from "./stonePieceVariant";
import { maybeVariantWoodenPieceHref } from "./woodenPieceVariant";
import type { Stack } from "../types";
import { pieceTooltip } from "../pieces/pieceLabel";
import { isBoardFlipped } from "./boardFlip";

type Inspector = {
  cancelHide: () => void;
  show: (nodeId: string, stack: Stack, opts?: { rulesetId?: string; boardSize?: number }) => void;
  hideSoon: () => void;
  pin?: () => void;
  unpin?: () => void;
};

export function renderStackAtNode(
  svgRoot: SVGSVGElement,
  piecesLayer: SVGGElement,
  inspector: Inspector | null,
  nodeId: string,
  stack: Stack,
  opts: {
    pieceSize?: number;
    rulesetId?: string;
    boardSize?: number;
    countsLayer?: SVGGElement | null;
    spinesLayer?: SVGGElement | null;
  } = {}
): void {
  const { pieceSize, rulesetId, boardSize, countsLayer, spinesLayer } = opts;

  const node = svgRoot.querySelector(`#${nodeId}`) as SVGCircleElement | null;
  if (!node || !stack.length) return;

  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const nodeRadius = parseFloat(node.getAttribute("r") || "0");
  const resolvedPieceSize = Number.isFinite(pieceSize)
    ? (pieceSize as number)
    : nodeRadius > 0
      ? Math.max(46, nodeRadius * 2.15)
      : 86;

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
  g.setAttribute("data-node", nodeId);
  g.setAttribute("class", "stack");

  const top = stack[stack.length - 1];
  const half = resolvedPieceSize / 2;

  const baseHref = pieceToHref(top, { rulesetId });
  const href = maybeVariantStonePieceHref(svgRoot, maybeVariantWoodenPieceHref(svgRoot, baseHref, nodeId), nodeId);
  const use = makeUseWithTitle(href, cx - half, cy - half, resolvedPieceSize, pieceTooltip(top, { rulesetId }));
  if (isBoardFlipped(svgRoot)) {
    use.setAttribute("transform", `rotate(180 ${cx} ${cy})`);
  }
  g.appendChild(use);

  const bindInspectorHover = (el: SVGGElement): void => {
    if (!inspector || stack.length <= 1) return;
    el.style.cursor = "pointer";
    el.addEventListener("pointerover", (ev) => {
      const rt = (ev as PointerEvent).relatedTarget as Node | null;
      if (rt && el.contains(rt)) return;
      inspector.cancelHide();
      inspector.show(nodeId, stack, { rulesetId, boardSize });
    });
    // Intentionally do not hide the inspector on hover-out.
    // UX: the Stack Inspector should keep showing the last hovered stack
    // until another stack/mini-spine is hovered (or the user pins it on touch).
  };

  const bindInspectorTouchPin = (el: SVGGElement): void => {
    if (!inspector || stack.length <= 1) return;
    const pinAndStop = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();
      // Clicking/tapping a mini spine should keep the inspector visible
      // so the user can scroll/inspect the full stack.
      inspector.cancelHide();
      inspector.pin?.();
      inspector.show(nodeId, stack, { rulesetId, boardSize });
    };

    // Stop both pointerdown and click: controller selection is bound to SVG click.
    el.addEventListener("pointerdown", pinAndStop, { capture: true });
    el.addEventListener("click", pinAndStop, { capture: true });
  };

  const spineTarget = spinesLayer ?? g;
  const spineG =
    spineTarget === g
      ? g
      : (document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement);

  if (spineG !== g) {
    spineG.setAttribute("data-node", nodeId);
    spineG.setAttribute("class", "miniSpine");
    spineTarget.appendChild(spineG);
  }

  drawMiniStackSpine(svgRoot, spineG, cx, cy, stack, {
    pieceSize: resolvedPieceSize,
    miniSize: 18,
    rulesetId,
    seedKey: nodeId,
    countLayer: countsLayer ?? undefined,
  });

  bindInspectorHover(g);
  if (spineG !== g) bindInspectorHover(spineG);

  // Only the mini spine should be pinnable by touch.
  if (spineG !== g) bindInspectorTouchPin(spineG);

  piecesLayer.appendChild(g);
}
