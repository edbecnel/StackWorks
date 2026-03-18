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
});