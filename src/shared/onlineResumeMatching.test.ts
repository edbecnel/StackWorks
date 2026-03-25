import { describe, expect, it } from "vitest";

import { resumeRecordMatchesSignedInAccount } from "./onlineResumeMatching";

describe("resumeRecordMatchesSignedInAccount", () => {
  it("matches by authenticated user id when one is available", () => {
    expect(
      resumeRecordMatchesSignedInAccount({
        record: { userId: "user-123", displayName: "EdB" },
        signedInUserId: "user-123",
        signedInDisplayName: "Someone Else",
      }),
    ).toBe(true);
  });

  it("does not fall back to display name matching when signed in without a matching user id", () => {
    expect(
      resumeRecordMatchesSignedInAccount({
        record: { displayName: "EdB" },
        signedInUserId: "user-123",
        signedInDisplayName: "EdB",
      }),
    ).toBe(false);
  });

  it("falls back to display name only when no signed-in user id is available", () => {
    expect(
      resumeRecordMatchesSignedInAccount({
        record: { displayName: "EdB" },
        signedInUserId: "",
        signedInDisplayName: "edb",
      }),
    ).toBe(true);
  });
});