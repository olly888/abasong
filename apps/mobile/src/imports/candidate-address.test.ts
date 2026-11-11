import { it, expect } from "vitest";
import {
  canShareCandidate,
  canRepairImportResult,
  groupImportCandidates,
  importAddressLabel,
} from "./candidate-address";
import { appliesToEntrance, unconfirmedEntrance } from "@abasong/contracts";
import { importCommitPatch } from "./commit-patch";
import type { Candidate } from "./types";
import type { components } from "@abasong/contracts";
const row: Candidate = {
  id: "TEST-row",
  sourceId: "TEST-image",
  address: "200 TEST Ave, TEST City, CA 90000",
  value: "*0012#",
  scope: "行人门",
  issues: [],
  target: null,
  selected: false,
  revision: 1,
};
const result: components["schemas"]["ImportCommitResult"] = {
  candidate_id: "TEST-row",
  confirmed_revision: 1,
  client_commit_id: "TEST-intent",
  private_status: "failed",
  private_record_id: null,
  share_status: "not_started",
  contribution_id: null,
  error_code: "ADDRESS_CONFIRMATION_REQUIRED",
  retryable: false,
};

it("groups entrance rows without merging the address next door or losing source IDs", () => {
  const groups = groupImportCandidates([
    { ...row, id: "building", scope: "楼栋门" },
    { ...row, id: "neighbor", address: "202 TEST Ave, TEST City, CA 90000" },
    { ...row, id: "garage", scope: "车库入口", sourceId: "second-image" },
    { ...row, id: "unknown-one", address: "" },
    { ...row, id: "unknown-two", address: "" },
  ]);
  expect(groups.map(([, items]) => items.map(({ row }) => row.id))).toEqual([
    ["building", "garage"],
    ["neighbor"],
    ["unknown-one"],
    ["unknown-two"],
  ]);
  expect(groups[0]?.[1][1]).toMatchObject({
    index: 2,
    row: { sourceId: "second-image" },
  });
});

it("only expands an explicitly confirmed community code across entrances", () => {
  for (const entrance of ["楼栋门", "车库入口"] as const) {
    expect(appliesToEntrance("社区通用", entrance)).toBe(true);
    expect(appliesToEntrance("社区门禁", entrance)).toBe(false);
    expect(appliesToEntrance(unconfirmedEntrance, entrance)).toBe(false);
  }
  expect(appliesToEntrance("楼栋门", "车库入口")).toBe(false);
  expect(appliesToEntrance("车库入口", "楼栋门")).toBe(false);
  expect(appliesToEntrance("车库门", "车库入口")).toBe(true);
  expect(appliesToEntrance("车库门", "楼栋门")).toBe(false);
});
it("does not make OCR text shareable until there is an explicit structured address", () => {
  expect(canShareCandidate(row)).toBe(false);
  const a = {
    address_line1: "200 TEST Ave",
    city: "TEST City",
    state: "CA",
    postal_code: "90000",
  };
  expect(canShareCandidate({ ...row, confirmedAddress: a })).toBe(true);
  expect(
    canShareCandidate({ ...row, confirmedAddress: { ...a, city: "" } }),
  ).toBe(false);
  expect(
    canShareCandidate({
      ...row,
      confirmedAddress: { ...a, address_line1: "TEST Ave" },
    }),
  ).toBe(false);
  expect(importAddressLabel(a)).toBe(row.address);
  expect(row.value).toBe("*0012#");
});
it("only unlocks an unsuccessful plan with no durable private or shared effects", () => {
  expect(canRepairImportResult(result)).toBe(true);
  expect(
    canRepairImportResult({
      ...result,
      private_status: "saved",
      private_record_id: "TEST-private",
      share_status: "failed",
    }),
  ).toBe(false);
  expect(
    canRepairImportResult({
      ...result,
      private_status: "saved",
      share_status: "active",
    }),
  ).toBe(false);
  expect(importCommitPatch(result)).toMatchObject({
    selected: false,
    needsAddressReview: true,
    error: "请核对公寓地址后再共享",
  });
  expect(
    importCommitPatch({
      ...result,
      error_code: "ADDRESS_STORAGE_UNAVAILABLE",
      retryable: true,
    }),
  ).toMatchObject({ needsAddressReview: false, error: "保存失败，可重试" });
});
it("keeps the durable return target separate from a delayed or absent metadata read", () => {
  expect(
    importCommitPatch({
      ...result,
      private_status: "saved",
      private_record_id: "TEST-private",
      share_status: "active",
      error_code: null,
      apartment_id: "TEST-new-apartment",
    }),
  ).toMatchObject({
    shared: true,
    sharedApartmentId: "TEST-new-apartment",
    privateId: "TEST-private",
    needsAddressReview: false,
  });
});

it("distinguishes local address preparation failure from a durable server plan", () => {
  const pending = importCommitPatch({
    stage: "address_preparation",
    error_code: "ADDRESS_STORAGE_UNAVAILABLE",
    retryable: true,
  });
  expect(pending).toMatchObject({
    status: "failed",
    needsAddressReview: false,
    error: "地址暂未确认，可重试",
  });
  expect(pending).not.toHaveProperty("privateId");
  expect(pending).not.toHaveProperty("shared");
  expect(
    importCommitPatch({
      stage: "address_preparation",
      error_code: "ADDRESS_CONFIRMATION_REQUIRED",
      retryable: false,
    }),
  ).toMatchObject({ selected: false, needsAddressReview: true });
});
