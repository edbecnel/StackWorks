import { describe, expect, it, vi } from "vitest";
import { resetChessBotSelectorsToHuman } from "./chessBotSelectors";

describe("resetChessBotSelectorsToHuman", () => {
  it("resets both bot selectors to human and dispatches change events", () => {
    document.body.innerHTML = `
      <select id="botWhiteSelect">
        <option value="human">human</option>
        <option value="beginner">beginner</option>
      </select>
      <select id="botBlackSelect">
        <option value="human">human</option>
        <option value="master">master</option>
      </select>
    `;

    const white = document.getElementById("botWhiteSelect") as HTMLSelectElement;
    const black = document.getElementById("botBlackSelect") as HTMLSelectElement;
    white.value = "beginner";
    black.value = "master";

    const whiteChange = vi.fn();
    const blackChange = vi.fn();
    white.addEventListener("change", whiteChange);
    black.addEventListener("change", blackChange);

    const didReset = resetChessBotSelectorsToHuman();

    expect(didReset).toBe(true);
    expect(white.value).toBe("human");
    expect(black.value).toBe("human");
    expect(whiteChange).toHaveBeenCalledTimes(1);
    expect(blackChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing when both selectors are already human or absent", () => {
    document.body.innerHTML = `
      <select id="botWhiteSelect">
        <option value="human">human</option>
      </select>
    `;

    const white = document.getElementById("botWhiteSelect") as HTMLSelectElement;
    const whiteChange = vi.fn();
    white.addEventListener("change", whiteChange);

    const didReset = resetChessBotSelectorsToHuman();

    expect(didReset).toBe(false);
    expect(white.value).toBe("human");
    expect(whiteChange).not.toHaveBeenCalled();
  });
});