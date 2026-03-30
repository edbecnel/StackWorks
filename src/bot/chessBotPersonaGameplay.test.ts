import { describe, expect, it } from "vitest";
import {
  applyChessBotPersonaToMoveSearch,
  countChessPiecesFromFen,
  isLikelyEndgameRichPosition,
} from "./chessBotPersonaGameplay.ts";

describe("countChessPiecesFromFen", () => {
  it("counts pieces on the board field", () => {
    expect(countChessPiecesFromFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(0);
    expect(countChessPiecesFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(32);
    expect(countChessPiecesFromFen("4k3/8/8/8/8/8/4K3/8 w - - 0 1")).toBe(2);
  });
});

describe("isLikelyEndgameRichPosition", () => {
  it("treats sparse positions as endgame-rich", () => {
    expect(isLikelyEndgameRichPosition("4k3/8/8/8/8/8/4K3/8 w - - 0 1")).toBe(true);
    const sparse = "8/8/4k3/8/3P4/2K5/8/8 w - - 0 1";
    expect(countChessPiecesFromFen(sparse)).toBe(3);
    expect(isLikelyEndgameRichPosition(sparse)).toBe(true);
  });

  it("treats starting position as not endgame-rich", () => {
    expect(isLikelyEndgameRichPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(false);
  });
});

describe("applyChessBotPersonaToMoveSearch", () => {
  const fenStart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fenSparse = "4k3/8/8/8/8/8/4K3/8 w - - 0 1";

  it("balanced leaves base values", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "balanced",
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenStart,
      }),
    ).toEqual({ skill: 10, movetimeMs: 100 });
  });

  it("null persona acts like balanced", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: null,
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenStart,
      }),
    ).toEqual({ skill: 10, movetimeMs: 100 });
  });

  it("teacher softens skill and shortens movetime", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "teacher",
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenStart,
      }),
    ).toEqual({ skill: 8, movetimeMs: 90 });
  });

  it("teacher clamps skill at 0", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "teacher",
        baseSkill: 1,
        baseMovetimeMs: 20,
        fen: fenStart,
      }),
    ).toEqual({ skill: 0, movetimeMs: 18 });
  });

  it("trickster extends movetime", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "trickster",
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenStart,
      }),
    ).toEqual({ skill: 10, movetimeMs: 114 });
  });

  it("endgame persona boosts in sparse positions", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "endgame",
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenSparse,
      }),
    ).toEqual({ skill: 11, movetimeMs: 110 });
  });

  it("endgame persona is milder in opening", () => {
    expect(
      applyChessBotPersonaToMoveSearch({
        persona: "endgame",
        baseSkill: 10,
        baseMovetimeMs: 100,
        fen: fenStart,
      }),
    ).toEqual({ skill: 9, movetimeMs: 93 });
  });
});
