import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAuthSessionUserId,
  readAuthSessionUserId,
  writeAuthSessionUserId,
} from "./authSessionClient";

describe("authSessionClient user id storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores user ids per server origin", () => {
    writeAuthSessionUserId("http://localhost:8788", "0123456789abcdef0123456789abcdef");

    expect(readAuthSessionUserId("http://localhost:8788")).toBe("0123456789abcdef0123456789abcdef");
    expect(readAuthSessionUserId("http://localhost:9999")).toBeNull();
  });

  it("clears stored user ids", () => {
    writeAuthSessionUserId("http://localhost:8788", "0123456789abcdef0123456789abcdef");
    clearAuthSessionUserId("http://localhost:8788");

    expect(readAuthSessionUserId("http://localhost:8788")).toBeNull();
  });
});