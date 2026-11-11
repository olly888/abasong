import { describe, expect, it } from "vitest";
import {
  hasUnsubmittedImportWork as dirty,
  savedImportDestination,
} from "./exit-policy";

describe("single-session import exit", () => {
  it("leaves empty selection or fully submitted work without a warning", () => {
    expect(dirty([], [], "private_only")).toBe(false);
    expect(dirty([], [{ state: "restricted" }], "private_and_share")).toBe(
      false,
    );
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

describe("screenshot import library destination", () => {
  const privateSave = { privateId: "private", privateEntryId: "one" };
  const sharedSave = {
    privateId: "shared",
    privateEntryId: "one",
    shared: true,
  };
  it("opens the saved apartment for either save mode, including multiple entrances", () => {
    for (const rows of [[privateSave], [sharedSave], [privateSave, sharedSave]])
      expect(savedImportDestination(rows, "1")).toEqual({
        tab: "saved",
        revision: "1",
        entry_id: "one",
      });
  });
  it("clears any previous apartment when there are multiple or unknown destinations", () => {
    for (const second of [
      { ...sharedSave, privateEntryId: "two" },
      { privateId: "legacy" },
    ])
      expect(savedImportDestination([privateSave, second], "2")).toEqual({
        tab: "saved",
        revision: "2",
        entry_id: "",
      });
  });
  it("leaves without a library destination when no record was saved", () => {
    expect(savedImportDestination([{}, { privateEntryId: "one" }], "3")).toBe(
      null,
    );
  });
});
