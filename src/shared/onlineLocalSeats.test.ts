import { beforeEach, describe, expect, it } from "vitest";

import type { OnlineGameDriver } from "../driver/gameDriver.ts";
import { buildOnlineBotSeatRequests, hasConfiguredOnlineLocalBot } from "./onlineLocalSeats.ts";

function createOnlineDriver(args: {
  playerColor?: "W" | "B" | null;
  controls?: Partial<Record<"W" | "B", boolean>>;
  localBotColors?: Partial<Record<"W" | "B", boolean>>;
}): OnlineGameDriver {
  return {
    mode: "online",
    getState: () => { throw new Error("not implemented"); },
    setState: () => {},
    canUndo: () => false,
    canRedo: () => false,
    undo: () => null,
    redo: () => null,
    exportHistorySnapshots: () => ({ states: [], currentIndex: 0 }),
    replaceHistory: () => {},
    submitMove: async () => { throw new Error("not implemented"); },
    finalizeCaptureChain: async () => { throw new Error("not implemented"); },
    endTurn: async () => { throw new Error("not implemented"); },
    resign: async () => { throw new Error("not implemented"); },
    claimDraw: async () => { throw new Error("not implemented"); },
    offerDraw: async () => { throw new Error("not implemented"); },
    respondDrawOffer: async () => { throw new Error("not implemented"); },
    getServerUrl: () => "http://localhost:8788",
    getRoomId: () => "room-1",
    getPlayerId: () => "player-1",
    getPlayerColor: () => args.playerColor ?? null,
    controlsColor: (color) => Boolean(args.controls?.[color]),
    isLocalBotColor: (color: "W" | "B") => Boolean(args.localBotColors?.[color]),
    getPresence: () => null,
    getIdentity: () => null,
    getRoomRules: () => null,
    fetchLatest: async () => ({ next: {} as any, changed: false }),
    startRealtime: () => false,
    stopRealtime: () => {},
    addRealtimeListener: () => () => {},
  } as OnlineGameDriver;
}

describe("onlineLocalSeats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("detects a configured local online bot only when the client controls that color", () => {
    localStorage.setItem("lasca.chessbot.white", "strong");
    localStorage.setItem("lasca.chessbot.black", "human");

    expect(
      hasConfiguredOnlineLocalBot({
        driver: createOnlineDriver({ playerColor: "B", controls: { W: true, B: true }, localBotColors: { W: true } }),
        variantId: "chess_classic",
      }),
    ).toBe(true);

    expect(
      hasConfiguredOnlineLocalBot({
        driver: createOnlineDriver({ playerColor: "B", controls: { B: true } }),
        variantId: "chess_classic",
      }),
    ).toBe(false);
  });

  it("does not treat a human-controlled online seat as a local bot when only offline bot prefs are set", () => {
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "strong");

    expect(
      hasConfiguredOnlineLocalBot({
        driver: createOnlineDriver({ playerColor: "B", controls: { B: true } }),
        variantId: "chess_classic",
      }),
    ).toBe(false);
  });

  it("builds create-room bot seat requests for non-creator configured bot seats", () => {
    localStorage.setItem("lasca.ai.white", "human");
    localStorage.setItem("lasca.ai.black", "advanced");
    localStorage.setItem("lasca.local.nameDark", "Night Bot");

    expect(
      buildOnlineBotSeatRequests({
        variantId: "lasca_10",
        creatorColor: "W",
      }),
    ).toEqual([
      {
        color: "B",
        displayName: "Night Bot",
      },
    ]);
  });
});