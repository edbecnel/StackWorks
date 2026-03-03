// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { ensureTurnIndicatorLayer, renderTurnIndicator } from "./turnIndicator.ts";

describe("renderTurnIndicator", () => {
  it("adds an 'Analysis mode' tooltip to the eye decorator", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    svg.setAttribute("viewBox", "0 0 1000 1000");

    const layer = ensureTurnIndicatorLayer(svg);

    renderTurnIndicator(svg, layer, "W", {
      tooltipText: "White to play",
      icon: "pawn",
      labels: { W: "White", B: "Black" },
      decorator: "analysis",
    });

    const titles = Array.from(layer.querySelectorAll("title")).map((t) => t.textContent);
    expect(titles).toContain("White to play");
    expect(titles).toContain("Analysis mode");

    const badge = Array.from(layer.querySelectorAll("circle")).find((c) => c.getAttribute("r") === "9");
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute("pointer-events")).toBe("all");
  });
});
