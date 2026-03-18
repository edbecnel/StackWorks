import { describe, expect, it } from "vitest";
import { setStackWorksGameTitle } from "./gameTitle";

describe("setStackWorksGameTitle", () => {
  it("renders a clickable horizontal logo for the Panels layout", () => {
    document.body.dataset.panelLayout = "panels";
    const element = document.createElement("div");

    setStackWorksGameTitle(element, "Classic Chess");

    const link = element.querySelector("a.stackworksGameTitleBrandLink");
    expect(link?.getAttribute("href")).toBe("./");
    expect(link?.getAttribute("aria-label")).toBe("Start Page");
    expect(link?.querySelector("img")?.getAttribute("src")).toContain("stackworks-wordmark.svg");
    expect(element.textContent).toContain("Classic Chess");
  });

  it("uses a custom Start Page href when provided", () => {
    const element = document.createElement("div");

    setStackWorksGameTitle(element, "Lasca", "../");

    expect(element.querySelector("a.stackworksGameTitleBrandLink")?.getAttribute("href")).toBe("../");
  });
});