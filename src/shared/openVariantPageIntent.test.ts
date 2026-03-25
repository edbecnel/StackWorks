import { beforeEach, describe, expect, it, vi } from "vitest";

import { readOpenVariantPageOnlinePreview, saveOpenVariantPageIntent } from "./openVariantPageIntent";

describe("readOpenVariantPageOnlinePreview", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00Z"));
  });

  it("uses the local online human seat and a generic remote placeholder", () => {
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "human");
    localStorage.setItem("lasca.local.nameLight", "EdB");
    localStorage.setItem("lasca.local.nameDark", "Twinkle");
    localStorage.setItem("lasca.online.seatOwnerLight", "local");
    localStorage.setItem("lasca.online.seatOwnerDark", "remote");
    saveOpenVariantPageIntent({ variantId: "chess_classic", playMode: "online" });

    expect(readOpenVariantPageOnlinePreview("chess_classic")).toEqual({
      localColor: "W",
      names: {
        W: "EdB",
        B: "Online player",
      },
      roles: {
        W: "human",
        B: "human",
      },
    });
  });

  it("uses the configured bot persona for the remote preview bot seat", () => {
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "easy");
    localStorage.setItem("stackworks.bot.blackPersona", "teacher");
    localStorage.setItem("lasca.local.nameLight", "EdB");
    localStorage.setItem("lasca.online.seatOwnerLight", "local");
    localStorage.setItem("lasca.online.seatOwnerDark", "remote");
    saveOpenVariantPageIntent({ variantId: "chess_classic", playMode: "online" });

    expect(readOpenVariantPageOnlinePreview("chess_classic")).toEqual({
      localColor: "W",
      names: {
        W: "EdB",
        B: "Teacher bot",
      },
      roles: {
        W: "human",
        B: "bot",
      },
    });
  });

  it("ignores stale or mismatched variant intents", () => {
    saveOpenVariantPageIntent({ variantId: "chess_classic", playMode: "online" });
    vi.setSystemTime(new Date("2026-03-25T12:02:00Z"));

    expect(readOpenVariantPageOnlinePreview("chess_classic")).toBeNull();
    expect(readOpenVariantPageOnlinePreview("lasca")).toBeNull();
  });
});