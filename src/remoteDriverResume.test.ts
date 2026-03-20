// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteDriver } from "./driver/remoteDriver.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";

describe("RemoteDriver page resume handling", () => {
  const originalWebSocket = (globalThis as any).WebSocket;
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalWebSocket === "undefined") {
      delete (globalThis as any).WebSocket;
      delete (window as any).WebSocket;
    } else {
      (globalThis as any).WebSocket = originalWebSocket;
      (window as any).WebSocket = originalWebSocket;
    }
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
    }
  });

  it("restarts realtime and resyncs when the page becomes visible again", async () => {
    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    class FakeWebSocket {}
    (globalThis as any).WebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket;

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });

    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockResolvedValue(true);
    const startWebSocketRealtime = vi.spyOn(driver as any, "startWebSocketRealtime").mockImplementation(() => {
      (driver as any).ws = { close: vi.fn() };
    });
    const onUpdated = vi.fn();

    expect(driver.startRealtime(onUpdated)).toBe(true);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    expect(fetchLatest).not.toHaveBeenCalled();

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(startWebSocketRealtime).toHaveBeenCalledTimes(2);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledTimes(1);

    driver.stopRealtime();
  });

  it("stops reacting to page resume after realtime is stopped", async () => {
    class FakeWebSocket {}
    (globalThis as any).WebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket;

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });

    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockResolvedValue(true);
    const startWebSocketRealtime = vi.spyOn(driver as any, "startWebSocketRealtime").mockImplementation(() => {
      (driver as any).ws = { close: vi.fn() };
    });

    driver.startRealtime(() => void 0);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(1);

    driver.stopRealtime();
    window.dispatchEvent(new Event("pageshow"));
    await Promise.resolve();

    expect(startWebSocketRealtime).toHaveBeenCalledTimes(1);
    expect(fetchLatest).not.toHaveBeenCalled();

    driver.stopRealtime();
  });
});