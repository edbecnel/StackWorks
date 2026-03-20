// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ensureOpponentPresenceIndicatorLayer, renderOpponentPresenceIndicator } from "./opponentPresenceIndicator.ts";

describe("renderOpponentPresenceIndicator", () => {
  it("renders a built-in vector token instead of a theme piece use", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    svg.setAttribute("viewBox", "0 0 1000 1000");

    const layer = ensureOpponentPresenceIndicatorLayer(svg);
    renderOpponentPresenceIndicator(svg, layer, {
      opponentColor: "B",
      status: "connected",
      hidden: false,
    });

    expect(layer.querySelector("use")).toBeNull();
    expect(layer.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);

    const statusDot = Array.from(layer.querySelectorAll("circle")).find((el) => el.getAttribute("r") === "7");
    expect(statusDot?.getAttribute("fill")).toBe("#22c55e");

    const titles = Array.from(layer.querySelectorAll("title")).map((el) => el.textContent);
    expect(titles).toContain("Opponent connected");
  });

  it("positions the framed-mode badge to the right of the turn-indicator row", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
    svg.setAttribute("viewBox", "0 0 1000 1000");

    const layer = ensureOpponentPresenceIndicatorLayer(svg);
    renderOpponentPresenceIndicator(svg, layer, {
      opponentColor: "B",
      status: "connected",
      hidden: false,
    });

    const backing = layer.querySelector("rect");
    expect(backing?.getAttribute("x")).toBe("65");
    expect(backing?.getAttribute("y")).toBe("12");
  });
});
