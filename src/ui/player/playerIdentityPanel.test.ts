import { describe, expect, it } from "vitest";
import { createPlayerIdentityPanel } from "./playerIdentityPanel";
import type { PlayerIdentity } from "../../types";

function makeIdentity(overrides: Partial<PlayerIdentity> = {}): PlayerIdentity {
  return {
    color: "W",
    displayName: "Alex",
    sideLabel: "Light",
    roleLabel: "You · Light",
    detailText: "Your turn.",
    status: "connected",
    statusText: "Connected",
    avatarUrl: null,
    countryCode: null,
    countryName: null,
    isLocal: true,
    isActiveTurn: true,
    ...overrides,
  };
}

describe("createPlayerIdentityPanel", () => {
  it("renders the provided ruleset-aware side label", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({ sideLabel: "Red", roleLabel: "You · Red" }),
    });

    const chips = panel.element.querySelectorAll(".gameShellPlayerMetaChip");
    expect(chips[0]?.textContent).toBe("Red");
  });

  it("updates the side chip when the identity changes", () => {
    const panel = createPlayerIdentityPanel({ identity: makeIdentity() });

    panel.update(makeIdentity({ color: "B", sideLabel: "Black", roleLabel: "Opponent · Black", isLocal: false, isActiveTurn: false }));

    const chips = panel.element.querySelectorAll(".gameShellPlayerMetaChip");
    expect(chips[0]?.textContent).toBe("Black");
  });

  it("uses the side label when the active detail is the generic local turn text", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({
        sideLabel: "White",
        detailText: "To move.",
      }),
    });

    const chips = panel.element.querySelectorAll(".gameShellPlayerMetaChip");
    expect(chips[2]?.textContent).toBe("White to move");
  });

  it("keeps the specific active detail text for non-generic turn states", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({
        sideLabel: "Black",
        detailText: "Opponent to move.",
      }),
    });

    const chips = panel.element.querySelectorAll(".gameShellPlayerMetaChip");
    expect(chips[2]?.textContent).toBe("Opponent to move");
  });

  it("shows a Bot chip when the identity carries a bot viewer tag", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({ roleLabel: "Bot · Light", isLocal: false, viewerTag: "Bot" }),
    });

    const chips = panel.element.querySelectorAll(".gameShellPlayerMetaChip");
    expect(chips[1]?.textContent).toBe("Bot");
    expect((chips[1] as HTMLElement | undefined)?.hidden).toBe(false);
  });

  it("renders a country flag with an accessible label when country metadata is present", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({
        countryCode: "ca",
        countryName: "Canada",
      }),
    });

    const flag = panel.element.querySelector(".gameShellPlayerFlag") as HTMLElement | null;
    expect(flag?.hidden).toBe(false);
    expect(flag?.textContent).toBe("🇨🇦");
    expect(flag?.getAttribute("aria-label")).toBe("Canada");
    expect(flag?.getAttribute("title")).toBe("Canada");
  });

  it("hides the flag cleanly when country metadata is missing or invalid", () => {
    const panel = createPlayerIdentityPanel({
      identity: makeIdentity({
        countryCode: null,
        countryName: null,
      }),
    });

    let flag = panel.element.querySelector(".gameShellPlayerFlag") as HTMLElement | null;
    expect(flag?.hidden).toBe(true);
    expect(flag?.textContent).toBe("");

    panel.update(makeIdentity({ countryCode: "???", countryName: "Nowhere" }));

    flag = panel.element.querySelector(".gameShellPlayerFlag") as HTMLElement | null;
    expect(flag?.hidden).toBe(true);
    expect(flag?.textContent).toBe("");
    expect(flag?.hasAttribute("aria-label")).toBe(false);
    expect(flag?.hasAttribute("title")).toBe(false);
  });
});
