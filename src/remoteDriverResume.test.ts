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

  it("falls back to EventSource after repeated websocket handshake failures", async () => {
    const sockets: Array<{ dispatch: (type: string) => void; close: ReturnType<typeof vi.fn> }> = [];

    class FakeWebSocket {
      private listeners = new Map<string, Array<() => void>>();
      public close = vi.fn();

      constructor(_url: string) {
        sockets.push({
          dispatch: (type: string) => {
            for (const cb of this.listeners.get(type) ?? []) cb();
          },
          close: this.close,
        });
      }

      addEventListener(type: string, cb: () => void): void {
        const list = this.listeners.get(type) ?? [];
        list.push(cb);
        this.listeners.set(type, list);
      }
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

    const fetchLatest = vi.spyOn(driver as any, "fetchLatest").mockResolvedValue(false);

    expect(driver.startRealtime(() => void 0)).toBe(true);
    expect(sockets).toHaveLength(1);

    sockets[0].dispatch("error");
    sockets[0].dispatch("close");
    await Promise.resolve();

    (driver as any).startWebSocketRealtime();

    expect(sockets).toHaveLength(2);
    sockets[1].dispatch("error");
    sockets[1].dispatch("close");
    await Promise.resolve();
    await Promise.resolve();

    expect(eventSources).toHaveLength(1);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    driver.stopRealtime();
  });
});