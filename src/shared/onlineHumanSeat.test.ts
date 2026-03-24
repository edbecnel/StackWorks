import { describe, expect, it } from "vitest";

import { deriveOnlineLaunchIdentity, resolveOnlineHumanSeat } from "./onlineHumanSeat.ts";

describe("onlineHumanSeat", () => {
  it("resolves the signed-in player's owned human seat", () => {
    expect(
      resolveOnlineHumanSeat({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "local",
        blackOwner: "remote",
        preferredColor: "auto",
      }),
    ).toBe("W");
    expect(
      resolveOnlineHumanSeat({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "remote",
        blackOwner: "local",
        preferredColor: "auto",
      }),
    ).toBe("B");
  });

  it("uses the preferred color when both human seats are incorrectly marked local", () => {
    expect(
      resolveOnlineHumanSeat({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "local",
        blackOwner: "local",
        preferredColor: "B",
      }),
    ).toBe("B");
    expect(
      resolveOnlineHumanSeat({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "local",
        blackOwner: "local",
        preferredColor: "auto",
      }),
    ).toBe("W");
  });

  it("derives launch identity from the signed-in account for the owned online human seat", () => {
    expect(
      deriveOnlineLaunchIdentity({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "remote",
        blackOwner: "local",
        preferredColor: "auto",
        signedInDisplayName: "Account User",
        lightName: "Light Bot",
        darkName: "Dark Bot",
      }),
    ).toEqual({
      guestName: "Account User",
      prefColor: "B",
    });
  });

  it("uses the sole human seat as creator color for human-vs-bot online games", () => {
    expect(
      deriveOnlineLaunchIdentity({
        whiteRole: "human",
        blackRole: "bot",
        whiteOwner: "remote",
        blackOwner: "remote",
        preferredColor: "auto",
        signedInDisplayName: "Account User",
        lightName: "Light Bot",
        darkName: "Dark Bot",
      }),
    ).toEqual({
      guestName: "Account User",
      prefColor: "W",
    });

    expect(
      deriveOnlineLaunchIdentity({
        whiteRole: "bot",
        blackRole: "human",
        whiteOwner: "remote",
        blackOwner: "remote",
        preferredColor: "auto",
        signedInDisplayName: "Account User",
        lightName: "Light Bot",
        darkName: "Dark Bot",
      }),
    ).toEqual({
      guestName: "Account User",
      prefColor: "B",
    });
  });

  it("requires an explicit local seat assignment when both human seats are online players", () => {
    expect(
      deriveOnlineLaunchIdentity({
        whiteRole: "human",
        blackRole: "human",
        whiteOwner: "remote",
        blackOwner: "remote",
        preferredColor: "auto",
        signedInDisplayName: "Account User",
        lightName: "White",
        darkName: "Black",
      }),
    ).toEqual({
      guestName: "Account User",
      prefColor: "auto",
    });
  });
});