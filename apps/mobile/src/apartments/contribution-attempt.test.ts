import { expect, it } from "vitest";
import { createContributionAttempt } from "./contribution-attempt";

function attempt() {
  let n = 0;
  return createContributionAttempt(() => `TEST-${++n}`);
}
it("rejects rapid duplicate submissions and keeps both keys after an uncertain transport result", () => {
  const a = attempt(),
    first = a.begin("TEST address", "TEST code");
  expect(first).not.toBeNull();
  expect(a.begin("TEST address", "TEST code")).toBeNull();
  a.finish();
  expect(a.begin("TEST address", "TEST code")).toEqual(first);
});
it("reuses an already-created private entry when editing a failed record, but scopes both keys to a changed address", () => {
  const a = attempt(),
    first = a.begin("TEST address", "TEST code")!;
  a.finish();
  const edited = a.begin("TEST address", "TEST corrected code")!;
  expect(edited.entryKey).toBe(first.entryKey);
  expect(edited.recordKey).not.toBe(first.recordKey);
  a.finish();
  const moved = a.begin("TEST different address", "TEST corrected code")!;
  expect(moved.entryKey).not.toBe(first.entryKey);
  expect(moved.recordKey).not.toBe(edited.recordKey);
});
it("retires a successful form and prevents late retries after sensitive form disposal", () => {
  const a = attempt();
  a.begin("TEST address", "TEST code");
  a.finish(true);
  expect(a.begin("TEST address", "TEST code")).toBeNull();
  const disposed = attempt();
  disposed.begin("TEST address", "TEST code");
  disposed.dispose();
  disposed.finish();
  expect(disposed.begin("TEST address", "TEST code")).toBeNull();
});
