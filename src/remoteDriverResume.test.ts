// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteDriver } from "./driver/remoteDriver.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";

describe("RemoteDriver page resume handling", () => {
  const originalWebSocket = (globalThis as any).WebSocket;
  const originalEventSource = (globalThis as any).EventSource;
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof originalWebSocket === "undefined") {
      delete (globalThis as any).WebSocket;
      delete (window as any).WebSocket;
    } else {
      (globalThis as any).WebSocket = originalWebSocket;
      (window as any).WebSocket = originalWebSocket;
    }
    if (typeof originalEventSource === "undefined") {
      delete (globalThis as any).EventSource;
      delete (window as any).EventSource;
    } else {
      (globalThis as any).EventSource = originalEventSource;
      (window as any).EventSource = originalEventSource;
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

    class FakeWebSocket {
      addEventListener(): void {}
    }
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
    class FakeWebSocket {
      addEventListener(): void {}
    }
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

  it("prefers EventSource over WebSocket when both are available", async () => {
    const sockets: Array<{ close: ReturnType<typeof vi.fn> }> = [];

    class FakeWebSocket {
      public close = vi.fn();

      constructor(_url: string) {
        sockets.push({ close: this.close });
      }

      addEventListener(_type: string, _cb: () => void): void {}
    }

    const eventSources: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    class FakeEventSource {
      public close = vi.fn();
      constructor(_url: string) {
        eventSources.push({ close: this.close });
      }
      addEventListener(_type: string, _cb: (...args: any[]) => void): void {}
    }

    (globalThis as any).WebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket;
    (globalThis as any).EventSource = FakeEventSource;
    (window as any).EventSource = FakeEventSource;

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });

    expect(driver.startRealtime(() => void 0)).toBe(true);
    expect(eventSources).toHaveLength(1);
    expect(sockets).toHaveLength(0);

    driver.stopRealtime();
  });

  it("forces a second recovery attempt when resume stays stale", async () => {
    vi.useFakeTimers();

    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    class FakeWebSocket {
      addEventListener(): void {}
    }
    (globalThis as any).WebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket;

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });

    const fetchLatest = vi.spyOn(driver as any, "fetchLatest")
      .mockRejectedValueOnce(new Error("resume fetch failed"))
      .mockResolvedValue(false);
    const startWebSocketRealtime = vi.spyOn(driver as any, "startWebSocketRealtime").mockImplementation(() => {
      (driver as any).ws = { close: vi.fn() };
    });

    expect(driver.startRealtime(() => void 0)).toBe(true);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchLatest).toHaveBeenCalledTimes(2);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(3);

    driver.stopRealtime();
  });

  it("does not force a second recovery attempt after fresh activity resumes", async () => {
    vi.useFakeTimers();

    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    class FakeWebSocket {
      addEventListener(): void {}
    }
    (globalThis as any).WebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket;

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });

    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockImplementation(async () => {
      (driver as any).markRealtimeActivity();
      return false;
    });
    const startWebSocketRealtime = vi.spyOn(driver as any, "startWebSocketRealtime").mockImplementation(() => {
      (driver as any).ws = { close: vi.fn() };
    });

    expect(driver.startRealtime(() => void 0)).toBe(true);

    visibilityState = "visible";
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(startWebSocketRealtime).toHaveBeenCalledTimes(2);

    driver.stopRealtime();
  });

  it("forces authoritative recovery when a move acknowledgement stalls", async () => {
    vi.useFakeTimers();

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });
    driver.setPlayerColor("W");

    const authorityStatuses: string[] = [];
    driver.onSseEvent("authority_status", (payload) => {
      authorityStatuses.push(String(payload?.status ?? ""));
    });
    (driver as any).onRealtimeUpdate = () => void 0;

    vi.spyOn(driver as any, "postJson").mockImplementation(() => new Promise(() => void 0));
    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockResolvedValue(false);

    void driver.submitMove({ kind: "move", from: "r1c1", to: "r2c2" } as any);
    await vi.advanceTimersByTimeAsync(1200);
    await Promise.resolve();

    expect(authorityStatuses).toContain("stale");
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    driver.stopRealtime();
  });

  it("does not force authoritative recovery when a move acknowledgement returns promptly", async () => {
    vi.useFakeTimers();

    const initial = createInitialGameStateForVariant("chess_classic" as any);
    const driver = new RemoteDriver(initial);
    driver.setRemoteIds({ serverUrl: "http://example.invalid", roomId: "room-1", playerId: "p1" });
    driver.setPlayerColor("W");
    (driver as any).onRealtimeUpdate = () => void 0;

    const authorityStatuses: string[] = [];
    driver.onSseEvent("authority_status", (payload) => {
      authorityStatuses.push(String(payload?.status ?? ""));
    });

    vi.spyOn(driver as any, "postJson").mockResolvedValue({ snapshot: {} });
    vi.spyOn(driver as any, "applySnapshot").mockReturnValue({ next: initial as any, changed: false });
    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockResolvedValue(false);

    await driver.submitMove({ kind: "move", from: "r1c1", to: "r2c2" } as any);
    await vi.advanceTimersByTimeAsync(1200);
    await Promise.resolve();

    expect(authorityStatuses).not.toContain("stale");
    expect(fetchLatest).not.toHaveBeenCalled();

    driver.stopRealtime();
  });
});