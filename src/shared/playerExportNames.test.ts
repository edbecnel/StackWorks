import { describe, expect, it } from "vitest";

import { resolveExportPlayerName } from "./playerExportNames";

describe("resolveExportPlayerName", () => {
  it("uses online seat identities when explicit board names are missing", () => {
    expect(resolveExportPlayerName({
      side: "W",
      explicitName: "",
      botSetting: "human",
      identityByColor: {
        W: { displayName: "Alice" },
        B: { displayName: "Bob" },
      },
    })).toBe("Alice");

    expect(resolveExportPlayerName({
      side: "B",
      explicitName: "",
      botSetting: "human",
      identityByColor: {
        W: { displayName: "Alice" },
        B: { displayName: "Bob" },
      },
    })).toBe("Bob");
  });

  it("prefers explicit names over online identities", () => {
    expect(resolveExportPlayerName({
      side: "W",
      explicitName: "Local White",
      botSetting: "human",
      identityByColor: {
        W: { displayName: "Alice" },
      },
    })).toBe("Local White");
  });

  it("uses color labels for bot-controlled seats", () => {
    expect(resolveExportPlayerName({
      side: "W",
      explicitName: "",
      botSetting: "bot",
      identityByColor: {
        W: { displayName: "Alice" },
      },
    })).toBe("white");
  });
});