import { afterEach, describe, expect, it } from "vitest";
import { isLocalBotSide, resolveConfiguredLocalPlayerName, resolveConfiguredLocalPlayerNames } from "./localPlayerNames";

describe("localPlayerNames", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("adds -bot when a stored name belongs to a bot side", () => {
    document.body.innerHTML = '<select id="aiWhiteSelect"><option value="human">Human</option><option value="random" selected>Bot</option></select>';
    localStorage.setItem("lasca.local.nameLight", "Ada");

    expect(isLocalBotSide("W")).toBe(true);
    expect(resolveConfiguredLocalPlayerName("W")).toBe("Ada-bot");
  });

  it("keeps the stored name unchanged for human sides", () => {
    document.body.innerHTML = '<select id="botBlackSelect"><option value="human" selected>Human</option><option value="greedy">Bot</option></select>';
    localStorage.setItem("lasca.local.nameDark", "Byron");

    expect(isLocalBotSide("B")).toBe(false);
    expect(resolveConfiguredLocalPlayerName("B")).toBe("Byron");
  });

  it("returns both configured side names using the current page controls", () => {
    document.body.innerHTML = [
      '<select id="aiWhiteSelect"><option value="human">Human</option><option value="random" selected>Bot</option></select>',
      '<select id="aiBlackSelect"><option value="human" selected>Human</option><option value="random">Bot</option></select>',
    ].join("");
    localStorage.setItem("lasca.local.nameLight", "Ada");
    localStorage.setItem("lasca.local.nameDark", "Byron");

    expect(resolveConfiguredLocalPlayerNames()).toEqual({ W: "Ada-bot", B: "Byron" });
  });
});