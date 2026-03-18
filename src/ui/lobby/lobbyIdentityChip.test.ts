import { describe, expect, it } from "vitest";
import { createLobbyIdentityChip, resolveLobbyAvatarUrl } from "./lobbyIdentityChip";

describe("createLobbyIdentityChip", () => {
  it("renders a seat chip with flag metadata and resolved avatar URL", () => {
    const chip = createLobbyIdentityChip({
      serverUrl: "https://stackworks.games",
      seatLabel: "White",
      color: "W",
      identity: {
        displayName: "Casey",
        avatarUrl: "/api/auth/avatar/casey.png",
        countryCode: "CA",
        countryName: "Canada",
      },
    });

    expect(chip).not.toBeNull();
    const image = chip?.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://stackworks.games/api/auth/avatar/casey.png");
    expect(chip?.textContent).toContain("White: Casey");
    expect(chip?.textContent).toContain("Canada");
    expect(chip?.textContent).toContain("🇨🇦");
  });

  it("uses seat initials as fallback and omits empty metadata", () => {
    const chip = createLobbyIdentityChip({
      serverUrl: "https://stackworks.games",
      seatLabel: "Black",
      color: "B",
      identity: {
        avatarUrl: "/api/auth/avatar/ghost.png",
      },
    });

    expect(chip).not.toBeNull();
    expect(chip?.querySelector(".lobbyIdentityAvatarFallback")?.textContent).toBe("B");
    expect(chip?.querySelector(".lobbyIdentityMeta")).toBeNull();
  });

  it("returns null when the identity contributes no public display data", () => {
    const chip = createLobbyIdentityChip({
      serverUrl: "https://stackworks.games",
      seatLabel: "White",
      color: "W",
      identity: {},
    });

    expect(chip).toBeNull();
  });
});

describe("resolveLobbyAvatarUrl", () => {
  it("keeps absolute avatar URLs unchanged", () => {
    expect(resolveLobbyAvatarUrl("https://stackworks.games", "https://cdn.stackworks.games/avatar.png")).toBe(
      "https://cdn.stackworks.games/avatar.png"
    );
  });

  it("returns null for invalid relative URLs without a server", () => {
    expect(resolveLobbyAvatarUrl("", "/api/auth/avatar/casey.png")).toBeNull();
  });
});