// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

import { RemoteDriver } from "./driver/remoteDriver.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

describe("MP6 hardening (client)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps controlsColor callable after method extraction", () => {
    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);

    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });
    driver.setPlayerColor("W");

    const controlsColor = driver.controlsColor;

    expect(controlsColor("W")).toBe(true);
    expect(controlsColor("B")).toBe(false);
  });

  it("detects snapshot version gaps and triggers a resync", async () => {
    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const driver = new RemoteDriver(initial);
    await driver.connectFromSnapshot(
      { serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" },
      {
        state: serializeWireGameState(initial),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 1,
      } as any,
      null
    );

    const getJson = vi.fn(async () => {
      return {
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 3,
        },
      };
    });

    (driver as any).getJson = getJson;

    // Inject a version gap: 1 -> 3
    (driver as any).applySnapshot({
      state: serializeWireGameState(initial),
      history: serializeWireHistory(history.exportSnapshots()),
      stateVersion: 3,
    });

    // allow triggerResync() to schedule + run
    await new Promise((r) => setTimeout(r, 0));

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson.mock.calls[0][0]).toBe("/api/room/room-1?playerId=p1");
  });

  it("coalesces realtime snapshot bursts and drops to resync", async () => {
    vi.useFakeTimers();

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const driver = new RemoteDriver(initial);
    await driver.connectFromSnapshot(
      { serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" },
      {
        state: serializeWireGameState(initial),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 1,
      } as any,
      null
    );

    const getJson = vi.fn(async () => {
      return {
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 999,
        },
      };
    });
    (driver as any).getJson = getJson;

    // Simulate a burst that exceeds the threshold.
    for (let i = 0; i < 30; i++) {
      (driver as any).enqueueRealtimeSnapshot({
        state: serializeWireGameState(initial),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 2 + i,
      });
    }

    // allow scheduled resync to run
    await vi.runAllTimersAsync();

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson.mock.calls[0][0]).toBe("/api/room/room-1?playerId=p1");
  });

  it("stores published eval metadata independently from duplicate snapshot versions", async () => {
    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const driver = new RemoteDriver(initial);
    await driver.connectFromSnapshot(
      { serverUrl: "http://example.invalid", roomId: "room-1", playerId: "spectator" },
      {
        state: serializeWireGameState(initial),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 4,
      } as any,
      null,
      null,
      null,
      null,
      null
    );

    expect(driver.getPublishedEval()).toBeNull();

    (driver as any).applyPublishedEval({ stateVersion: 4, score: { cp: 42 } });
    (driver as any).applySnapshot({
      state: serializeWireGameState(initial),
      history: serializeWireHistory(history.exportSnapshots()),
      stateVersion: 4,
    });

    expect(driver.getPublishedEval()).toEqual({ stateVersion: 4, score: { cp: 42 } });
  });

  it("allows local history review after an online game is finished", async () => {
    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const terminal = {
      ...initial,
      forcedGameOver: {
        winner: null,
        reasonCode: "DRAW_BY_AGREEMENT",
        message: "Draw by agreement",
      },
    };
    const history = new HistoryManager();
    history.push(initial);
    history.push(terminal as any, "1/2-1/2");

    const driver = new RemoteDriver(initial);
    await driver.connectFromSnapshot(
      { serverUrl: "http://example.invalid", roomId: "room-1", playerId: "spectator" },
      {
        state: serializeWireGameState(terminal as any),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 2,
      } as any,
      null,
      null,
      null,
      null,
      null
    );

    expect(driver.canUndo()).toBe(true);
    expect(driver.canRedo()).toBe(false);

    const rewound = driver.jumpToHistory(0);
    expect(rewound?.forcedGameOver).toBeUndefined();
    expect(driver.getState().forcedGameOver).toBeUndefined();
    expect(driver.canRedo()).toBe(true);

    const replayed = driver.redo();
    expect(replayed?.forcedGameOver?.message).toBe("Draw by agreement");
    expect(driver.getState().forcedGameOver?.message).toBe("Draw by agreement");
  });

  it("preserves recorded move times across online snapshot reconnects", async () => {
    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const next = {
      ...initial,
      toMove: "B" as const,
    };
    const history = new HistoryManager();
    history.push(initial);
    history.push(next as any, "e4", 12_345, { cp: 34 });

    const driver = new RemoteDriver(initial);
    await driver.connectFromSnapshot(
      { serverUrl: "http://example.invalid", roomId: "room-1", playerId: "spectator" },
      {
        state: serializeWireGameState(next as any),
        history: serializeWireHistory(history.exportSnapshots()),
        stateVersion: 1,
      } as any,
      null,
      null,
      null,
      null,
      null
    );

    const snap = driver.exportHistorySnapshots();
    expect(snap.emtMs).toEqual([null, 12_345]);
    expect(snap.evals).toEqual([null, { cp: 34 }]);
  });
});
