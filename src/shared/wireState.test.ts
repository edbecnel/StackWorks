import { describe, expect, it } from "vitest";
import { deserializeWireGameState, serializeWireGameState } from "./wireState.ts";
import type { GameState } from "../game/state.ts";

// This test guards against losing chess aux state over the wire,
// which would break castling/en-passant legality and state hashing.
describe("wireState", () => {
  it("round-trips Columns Chess chess aux state (castling + en passant)", () => {
    const state: GameState = {
      board: new Map([
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r7c7", [{ owner: "W", rank: "R" }]],
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: true, queenSide: false },
          B: { kingSide: false, queenSide: true },
        },
        enPassantTarget: "r2c3",
        enPassantPawn: "r3c3",
      },
    };

    const wire = serializeWireGameState(state as any);
    const back = deserializeWireGameState(wire) as GameState;

    expect(back.meta?.rulesetId).toBe("columns_chess");
    expect(back.chess?.castling.W.kingSide).toBe(true);
    expect(back.chess?.castling.W.queenSide).toBe(false);
    expect(back.chess?.castling.B.kingSide).toBe(false);
    expect(back.chess?.castling.B.queenSide).toBe(true);
    expect(back.chess?.enPassantTarget).toBe("r2c3");
    expect(back.chess?.enPassantPawn).toBe("r3c3");
  });

  it("round-trips pending draw offers for non-checkers online games", () => {
    const state: GameState = {
      board: new Map([["r7c4", [{ owner: "W", rank: "K" }]]]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      pendingDrawOffer: { offeredBy: "W", nonce: 12345 },
    };

    const wire = serializeWireGameState(state as any);
    const back = deserializeWireGameState(wire) as GameState;

    expect(back.pendingDrawOffer).toEqual({ offeredBy: "W", nonce: 12345 });
  });

  it("round-trips ui.lastMove for authoritative online highlights", () => {
    const state: GameState = {
      board: new Map([["r7c4", [{ owner: "W", rank: "K" }]]]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      ui: {
        lastMove: { from: "r6c4", to: "r4c4" },
      },
    };

    const wire = serializeWireGameState(state as any);
    const back = deserializeWireGameState(wire) as GameState;

    expect(back.ui?.lastMove).toEqual({ from: "r6c4", to: "r4c4" });
  });
});
