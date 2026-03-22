import { describe, expect, it } from "vitest";

import { renderStackAtNode } from "../render/renderStackAtNode";
import { createStackInspector } from "./stackInspector";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

function makeSourceSvg(themeId: string): SVGSVGElement {
  const svg = makeSvg("svg") as SVGSVGElement;
  svg.setAttribute("data-theme-id", themeId);

  const defs = makeSvg("defs") as SVGDefsElement;
  const themeDefs = makeSvg("g") as SVGGElement;
  themeDefs.setAttribute("id", "lascaThemeDefs");
  const runtimeDefs = makeSvg("g") as SVGGElement;
  runtimeDefs.setAttribute("id", "lascaRuntimeDefs");

  const base = makeSvg("symbol") as SVGSymbolElement;
  base.setAttribute("id", "W_S");
  base.setAttribute("viewBox", "0 0 100 100");
  const baseCircle = makeSvg("circle");
  baseCircle.setAttribute("cx", "50");
  baseCircle.setAttribute("cy", "50");
  baseCircle.setAttribute("r", "40");
  baseCircle.setAttribute("fill", "url(#marbleVeins_v0)");
  base.appendChild(baseCircle);

  const stoneVariant = makeSvg("symbol") as SVGSymbolElement;
  stoneVariant.setAttribute("id", "W_S_v0");
  stoneVariant.setAttribute("viewBox", "0 0 100 100");
  const variantCircle = makeSvg("circle");
  variantCircle.setAttribute("cx", "50");
  variantCircle.setAttribute("cy", "50");
  variantCircle.setAttribute("r", "40");
  variantCircle.setAttribute("fill", "url(#marbleVeins_v0)");
  stoneVariant.appendChild(variantCircle);

  themeDefs.append(base, stoneVariant);
  defs.append(themeDefs, runtimeDefs);
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return svg;
}

function addPieceSymbol(themeDefs: SVGGElement, id: string): void {
  const symbol = makeSvg("symbol") as SVGSymbolElement;
  symbol.setAttribute("id", id);
  symbol.setAttribute("viewBox", "0 0 100 100");

  const circle = makeSvg("circle");
  circle.setAttribute("cx", "50");
  circle.setAttribute("cy", "50");
  circle.setAttribute("r", "40");
  circle.setAttribute("fill", id.startsWith("W_") ? "url(#marbleVeins_v0)" : "url(#graniteSpeckles_v0)");
  symbol.appendChild(circle);

  const variant = makeSvg("symbol") as SVGSymbolElement;
  variant.setAttribute("id", `${id}_v0`);
  variant.setAttribute("viewBox", "0 0 100 100");
  variant.appendChild(circle.cloneNode(true));

  themeDefs.append(symbol, variant);
}

function makeBoardSvg(themeId: string): SVGSVGElement {
  const svg = makeSvg("svg") as SVGSVGElement;
  svg.setAttribute("data-theme-id", themeId);

  const defs = makeSvg("defs") as SVGDefsElement;
  const themeDefs = makeSvg("g") as SVGGElement;
  themeDefs.setAttribute("id", "lascaThemeDefs");
  const runtimeDefs = makeSvg("g") as SVGGElement;
  runtimeDefs.setAttribute("id", "lascaRuntimeDefs");

  addPieceSymbol(themeDefs, "W_S");
  addPieceSymbol(themeDefs, "W_O");
  addPieceSymbol(themeDefs, "B_S");

  defs.append(themeDefs, runtimeDefs);
  svg.appendChild(defs);

  const node = makeSvg("circle") as SVGCircleElement;
  node.setAttribute("id", "r0c0");
  node.setAttribute("cx", "50");
  node.setAttribute("cy", "50");
  node.setAttribute("r", "20");
  svg.appendChild(node);

  document.body.appendChild(svg);
  return svg;
}

describe("stackInspector", () => {
  it("uses the active board theme defs and variant piece hrefs", () => {
    document.body.innerHTML = "";

    const zoomTitle = document.createElement("div");
    const zoomHint = document.createElement("div");
    const zoomSvg = makeSvg("svg") as SVGSVGElement;
    document.body.append(zoomTitle, zoomHint, zoomSvg);

    const sourceSvg = makeSourceSvg("semiprecious");
    const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg, {
      getThemeId: () => "semiprecious",
      getSourceSvg: () => sourceSvg,
    });

    inspector.show("r0c0", [{ owner: "W", rank: "S" }], { rulesetId: "lasca", boardSize: 7 });

    expect(zoomSvg.getAttribute("data-theme-id")).toBe("semiprecious");
    expect(zoomSvg.querySelector("#lascaThemeDefs")).not.toBeNull();
    expect(zoomSvg.querySelector("#lascaRuntimeDefs")).not.toBeNull();

    const use = zoomSvg.querySelector("use") as SVGUseElement | null;
    expect(use).not.toBeNull();
    const href = use?.getAttribute("href") ?? "";
    expect(href).not.toBe("#W_S");
    expect(href).toContain("__");
  });

  it("keeps the semiprecious top-piece variant consistent across board, mini spine, and inspector", () => {
    document.body.innerHTML = "";

    const boardSvg = makeBoardSvg("semiprecious");
    const piecesLayer = makeSvg("g") as SVGGElement;
    const spinesLayer = makeSvg("g") as SVGGElement;
    boardSvg.append(piecesLayer, spinesLayer);

    renderStackAtNode(
      boardSvg,
      piecesLayer,
      null,
      "r0c0",
      [
        { owner: "B", rank: "S" },
        { owner: "W", rank: "O" },
        { owner: "W", rank: "S" },
      ],
      { rulesetId: "lasca", spinesLayer }
    );

    const boardHref = piecesLayer.querySelector("use")?.getAttribute("href");
    const spineUses = Array.from(spinesLayer.querySelectorAll("use"));
    const spineHref = spineUses.at(-1)?.getAttribute("href");

    const zoomTitle = document.createElement("div");
    const zoomHint = document.createElement("div");
    const zoomSvg = makeSvg("svg") as SVGSVGElement;
    document.body.append(zoomTitle, zoomHint, zoomSvg);

    const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg, {
      getThemeId: () => "semiprecious",
      getSourceSvg: () => boardSvg,
    });

    inspector.show(
      "r0c0",
      [
        { owner: "B", rank: "S" },
        { owner: "W", rank: "O" },
        { owner: "W", rank: "S" },
      ],
      { rulesetId: "lasca", boardSize: 7 }
    );

    const inspectorUses = Array.from(zoomSvg.querySelectorAll("use"));
    const inspectorHref = inspectorUses.at(-1)?.getAttribute("href");

    expect(boardHref).toBeTruthy();
    expect(boardHref).toContain("__");
    expect(spineHref).toBe(boardHref);
    expect(inspectorHref).toBe(boardHref);
  });
});