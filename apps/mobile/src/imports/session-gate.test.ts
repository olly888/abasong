import { describe, expect, it } from "vitest";
import { keepImportSession } from "./session-gate";

describe("import work during account revalidation", () => {
  const session = { user: { id: "TEST-owner" } };
  it.each([408, 429, 500, 502, 503, 504])(
    "keeps same-session work behind the error cover after HTTP %i",
    (accountErrorStatus) => {
      expect(
        keepImportSession({ session, phase: "error", accountErrorStatus }),
      ).toBe(true);
    },
  );
  it.each([400, 401, 403, 404, undefined])(
    "does not keep work after access/identity or unknown failure %s",
    (accountErrorStatus) => {
      expect(
        keepImportSession({ session, phase: "error", accountErrorStatus }),
      ).toBe(false);
    },
  );
  it("cannot retain work after sign-out even if the prior failure was transient", () => {
    expect(
      keepImportSession({
        session: null,
        phase: "error",
        accountErrorStatus: 503,
      }),
    ).toBe(false);
  });
  it("retains revalidation but disposes when the account needs a new profile or signs out", () => {
    expect(keepImportSession({ session, phase: "loading-account" })).toBe(true);
    expect(keepImportSession({ session, phase: "ready" })).toBe(true);
    expect(keepImportSession({ session, phase: "needs-profile" })).toBe(false);
    expect(keepImportSession({ session, phase: "signing-out" })).toBe(false);
  });
});
