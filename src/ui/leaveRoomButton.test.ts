import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlineGameDriver } from "../driver/gameDriver.ts";
import { bindLeaveRoomButton, ONLINE_SUSPEND_TO_START_PAGE_MESSAGE } from "./leaveRoomButton";

function createOnlineDriver(playerId: string | null): OnlineGameDriver {
  return {
    mode: "online",
    getState: () => ({}) as any,
    setState: () => {},
    submitMove: async () => ({}) as any,
    finalizeCaptureChain: () => ({}) as any,
    canUndo: () => false,
    canRedo: () => false,
    undo: () => null,
    redo: () => null,
    jumpToHistory: () => null,
    clearHistory: () => {},
    pushHistory: () => {},
    replaceHistory: () => {},
    exportHistorySnapshots: () => ({ states: [], notation: [], currentIndex: 0 }),
    getHistory: () => [],
    getHistoryCurrent: () => null,
    getServerUrl: () => "http://localhost:8788",
    getRoomId: () => "room-1",
    getPlayerId: () => playerId,
    getPlayerColor: () => "W",
    getPublishedEval: () => null,
    controlsColor: () => false,
    getPresence: () => null,
    getIdentity: () => null,
    getIdentityByColor: () => null,
    getRoomRules: () => null,
    startRealtime: () => false,
    onSseEvent: () => () => {},
    fetchLatest: async () => false,
    finalizeCaptureChainRemote: async () => ({}) as any,
    endTurnRemote: async () => ({}) as any,
    resignRemote: async () => ({}) as any,
    claimDrawRemote: async () => ({}) as any,
    offerDrawRemote: async () => ({}) as any,
    respondDrawOfferRemote: async () => ({}) as any,
    fetchReplayEvents: async () => [],
    fetchReplay: async () => ({ events: [] }) as any,
    publishEvalRemote: async () => {},
  } as OnlineGameDriver;
}

describe("bindLeaveRoomButton", () => {
  beforeEach(() => {
    document.body.innerHTML = "<button id=\"leaveRoomBtn\" type=\"button\">Return to Start Page</button>";
  });

  it("suspends seated online games instead of resigning", () => {
    const confirmLeave = vi.fn(() => true);
    const navigate = vi.fn();
    const onlineDriver = createOnlineDriver("player-1");
    const resignSpy = vi.spyOn(onlineDriver, "resignRemote");

    bindLeaveRoomButton({
      button: document.getElementById("leaveRoomBtn") as HTMLButtonElement,
      driverMode: "online",
      onlineDriver,
      confirmLeave,
      navigate,
    });

    document.getElementById("leaveRoomBtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(confirmLeave).toHaveBeenCalledWith(ONLINE_SUSPEND_TO_START_PAGE_MESSAGE);
    expect(navigate).toHaveBeenCalledWith("./");
    expect(resignSpy).not.toHaveBeenCalled();
  });

  it("does not navigate when the suspend confirmation is declined", () => {
    const confirmLeave = vi.fn(() => false);
    const navigate = vi.fn();

    bindLeaveRoomButton({
      button: document.getElementById("leaveRoomBtn") as HTMLButtonElement,
      driverMode: "online",
      onlineDriver: createOnlineDriver("player-1"),
      confirmLeave,
      navigate,
    });

    document.getElementById("leaveRoomBtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("returns immediately without prompting for spectators", () => {
    const confirmLeave = vi.fn(() => true);
    const navigate = vi.fn();

    bindLeaveRoomButton({
      button: document.getElementById("leaveRoomBtn") as HTMLButtonElement,
      driverMode: "online",
      onlineDriver: createOnlineDriver("spectator"),
      confirmLeave,
      navigate,
    });

    document.getElementById("leaveRoomBtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(confirmLeave).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("./");
  });
});