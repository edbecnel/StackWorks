import { describe, expect, test } from "vitest";
import { adaptAfterGame, normalizeAdaptState } from "./adaptive.ts";

describe("adaptive", () => {
  test("normalizes defaults", () => {
    expect(normalizeAdaptState(null)).toEqual({ subFloat: 4, applied: 4 });
    expect(normalizeAdaptState({ subFloat: 100, applied: -5 })).toEqual({ subFloat: 9, applied: 0 });
  });

  test("win nudges up, loss nudges down", () => {
    const s0 = { subFloat: 4, applied: 4 };
    const win = adaptAfterGame({ tier: "beginner", prev: s0, score: 1 });
    const loss = adaptAfterGame({ tier: "beginner", prev: s0, score: 0 });
    expect(win.subFloat).toBeGreaterThan(s0.subFloat);
    expect(loss.subFloat).toBeLessThan(s0.subFloat);
  });

  test("hysteresis limits applied to one step", () => {
    const s0 = { subFloat: 8.99, applied: 0 };
    const s1 = adaptAfterGame({ tier: "advanced", prev: s0, score: 1 });
    expect(s1.applied).toBe(1);
  });
});
