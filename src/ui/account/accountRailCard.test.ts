import { describe, expect, it } from "vitest";
import { createAccountRailCard } from "./accountRailCard";

describe("createAccountRailCard", () => {
  it("renders signed-out actions", () => {
    const card = createAccountRailCard({ status: "signed-out" });

    const buttons = Array.from(card.element.querySelectorAll("button")).map((button) => button.textContent);
    expect(buttons).toEqual(["Sign Up", "Log In"]);
  });

  it("renders signed-in identity and updates metadata", () => {
    const card = createAccountRailCard({ status: "loading" });

    card.update({
      status: "signed-in",
      displayName: "Casey",
      email: "casey@example.com",
      countryName: "Canada",
      timeZone: "America/Toronto",
    });

    expect(card.element.textContent).toContain("Casey");
    expect(card.element.textContent).toContain("casey@example.com");
    expect(card.element.textContent).toContain("Canada");
    expect(card.element.textContent).toContain("America/Toronto");
  });

  it("requires the camera button click on desktop pointers", () => {
    let uploads = 0;
    const card = createAccountRailCard(
      {
        status: "signed-in",
        displayName: "Casey",
        email: "casey@example.com",
        avatarUrl: "https://example.com/casey.png",
      },
      {
        onAvatarUpload: () => {
          uploads += 1;
        },
      },
    );

    const avatar = card.element.querySelector(".accountRailCardAvatar") as HTMLElement | null;
    const cameraButton = card.element.querySelector('[aria-label="Upload avatar"]') as HTMLButtonElement | null;
    expect(avatar).not.toBeNull();
    expect(cameraButton).not.toBeNull();

    avatar?.click();
    expect(uploads).toBe(0);

    cameraButton?.click();
    expect(uploads).toBe(1);
  });

  it("allows touching the avatar to upload on coarse pointers", () => {
    let uploads = 0;
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(hover: none), (pointer: coarse)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      const card = createAccountRailCard(
        {
          status: "signed-in",
          displayName: "Casey",
          email: "casey@example.com",
        },
        {
          onAvatarUpload: () => {
            uploads += 1;
          },
        },
      );

      const avatar = card.element.querySelector(".accountRailCardAvatar") as HTMLElement | null;
      avatar?.click();
      expect(uploads).toBe(1);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});