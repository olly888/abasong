import { describe, expect, it } from "vitest";
import { hasUnsubmittedImportWork as dirty } from "./exit-policy";

describe("single-session import exit", () => {
  it("leaves empty selection or fully submitted work without a warning", () => {
    expect(dirty([], [], "private_only")).toBe(false);
    expect(
      dirty(
        [{ privateId: "TEST-record" }],
        [{ state: "recognized" }],
        "private_only",
      ),
    ).toBe(false);
    expect(
      dirty(
        [{ privateId: "TEST-record", shared: true }],
        [{ state: "recognized" }],
        "private_and_share",
      ),
    ).toBe(false);
  });
  it("warns for selected pictures, unsaved rows and incomplete sharing", () => {
    expect(dirty([], [{ state: "selected" }], "private_only")).toBe(true);
    expect(dirty([{}], [{ state: "recognized" }], "private_only")).toBe(true);
    expect(dirty([{ privateId: "TEST-record" }], [], "private_and_share")).toBe(
      true,
    );
  });
  it("does not forget failed or unprocessed pictures when other rows succeeded", () => {
    for (const state of ["selected", "processing", "failed"] as const)
      expect(
        dirty(
          [{ privateId: "TEST-record", shared: true }],
          [{ state }],
          "private_and_share",
        ),
      ).toBe(true);
  });
});
