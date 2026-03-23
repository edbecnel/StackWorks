import { describe, expect, it } from "vitest";
import { createLogoImage, renderLogo, resolveLogoVariant } from "./logo";

describe("logo", () => {
  it("maps placement defaults to the correct variants", () => {
    expect(resolveLogoVariant("desktop-header")).toBe("horizontal");
    expect(resolveLogoVariant("mobile-header")).toBe("icon");
    expect(resolveLogoVariant("compact-nav")).toBe("icon");
    expect(resolveLogoVariant("footer")).toBe("wordmark");
    expect(resolveLogoVariant("fallback")).toBe("mono");
    expect(resolveLogoVariant()).toBe("horizontal");
  });

  it("creates logos without hardcoded dimensions and tags them with placement metadata", () => {
    const img = createLogoImage({ placement: "desktop-header" });

    expect(img.getAttribute("src")).toContain("stackworks-logo-horizontal.svg");
    expect(img.alt).toBe("StackWorks");
    expect(img.draggable).toBe(false);
    expect(img.dataset.logoVariant).toBe("horizontal");
    expect(img.dataset.logoPlacement).toBe("desktop-header");
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
  });

  it("lets explicit variants override placement defaults", () => {
    const host = document.createElement("div");
    const img = renderLogo(host, { placement: "desktop-header", variant: "mono", ariaHidden: true });

    expect(host.firstElementChild).toBe(img);
    expect(img.getAttribute("src")).toContain("stackworks-logo-mono.svg");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.dataset.logoVariant).toBe("mono");
    expect(img.dataset.logoPlacement).toBe("desktop-header");
  });
});