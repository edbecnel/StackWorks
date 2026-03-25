import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryManager } from "../game/historyManager";
import { createInitialGameStateForVariant } from "../game/state";
import { createDriverAsync, selectDriverMode } from "./createDriver";

describe("selectDriverMode", () => {
  it("defaults to local", () => {
    expect(selectDriverMode({ search: "" })).toBe("local");
    expect(selectDriverMode({ search: "?" })).toBe("local");
  });

  it("uses query string mode", () => {
    expect(selectDriverMode({ search: "?mode=online" })).toBe("online");
    expect(selectDriverMode({ search: "mode=online" })).toBe("online");
    expect(selectDriverMode({ search: "?mode=local" })).toBe("local");
  });

  it("falls back to env var", () => {
    expect(selectDriverMode({ search: "", envMode: "online" })).toBe("online");
    expect(selectDriverMode({ search: "", envMode: "LOCAL" })).toBe("local");
  });

  it("query string overrides env", () => {
    expect(selectDriverMode({ search: "?mode=local", envMode: "online" })).toBe("local");
    expect(selectDriverMode({ search: "?mode=online", envMode: "local" })).toBe("online");
  });
});

describe("createDriverAsync", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not send bot seats for human-only direct online create links", async () => {
    localStorage.setItem("lasca.chessbot.black", "medium");

    let createRequestBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      createRequestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          roomId: "abcd1234",
          playerId: "efgh5678",
          color: "W",
          snapshot: createRequestBody?.snapshot ?? null,
          localSeatPlayerIdsByColor: { W: "efgh5678" },
          visibility: "public",
        }),
      };
    }));

    const connectFromSnapshot = vi.spyOn((await import("./remoteDriver")).RemoteDriver.prototype, "connectFromSnapshot").mockResolvedValue();

    await createDriverAsync({
      state: createInitialGameStateForVariant("chess_classic"),
      history: new HistoryManager(),
      search: "?mode=online&server=http%3A%2F%2Flocalhost%3A8788&create=1&visibility=public&botSeats=off",
    });

    expect(createRequestBody).toBeTruthy();
    expect(createRequestBody?.botSeats).toBeUndefined();
    expect(connectFromSnapshot).toHaveBeenCalled();
  });
});
