import { describe, expect, it } from "vitest";

import { resolveChessBotUiMode } from "./chessBotUiMode.ts";

describe("resolveChessBotUiMode", () => {
  it("keeps bot controls available offline", () => {
    expect(resolveChessBotUiMode({ driverMode: "local", onlineLocalBotEnabled: false })).toEqual({
      createBotManager: true,
      showBotSection: true,
      disableBotSelectors: false,
      resetSelectorsToHuman: false,
    });
  });

  it("keeps engine evaluation available for online human clients while hiding bot controls", () => {
    expect(resolveChessBotUiMode({ driverMode: "online", onlineLocalBotEnabled: false })).toEqual({
      createBotManager: true,
      showBotSection: false,
      disableBotSelectors: true,
      resetSelectorsToHuman: true,
    });
  });

  it("keeps bot controls visible for online local-bot seats", () => {
    expect(resolveChessBotUiMode({ driverMode: "online", onlineLocalBotEnabled: true })).toEqual({
      createBotManager: true,
      showBotSection: true,
      disableBotSelectors: true,
      resetSelectorsToHuman: false,
    });
  });
});