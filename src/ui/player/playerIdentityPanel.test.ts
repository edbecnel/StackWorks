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
});
