import { expect, test } from "vitest";
import type { components } from "@abasong/contracts";
import { apartmentCardLabel } from "./card-accessibility";
import type { AccessRowState } from "./visible-access-reader";

const record = {
  method: "keypad",
  value: "*0012#",
  scope: { label: "大堂门" },
  contributed_at: "2026-11-08T16:20:00Z",
  contributor_display_name: "TEST 司机",
} as components["schemas"]["AccessRecord"];
const input = {
  address: "100 TEST Ave，TEST City，CA",
  distance: "约40 m",
  pendingAddress: false,
};

test("spoken card keeps zeros, explicit symbols, address, gate and attribution", () => {
  const label = apartmentCardLabel({
    ...input,
    state: { status: "ready", records: [record] },
  });
  for (const part of [
    input.address,
    "约40 m",
    "大堂门",
    "星号，0，0，1，2，井号",
    "贡献 · TEST 司机",
    "1 条进入资料",
  ])
    expect(label).toContain(part);
});
test.each(["loading", "error", "denied", "paused"] as const)(
  "%s never leaks retained bodies into accessibility",
  (status) => {
    const label = apartmentCardLabel({
      ...input,
      state: { status, records: [record] },
    });
    expect(label).not.toContain("星号");
    expect(label).not.toContain("TEST 司机");
    expect(label).not.toContain("暂无共享");
  },
);
test("empty and unbound cards distinguish missing data from address confirmation", () => {
  const state: AccessRowState = { status: "ready", records: [] };
  expect(apartmentCardLabel({ ...input, state })).toContain("暂无共享门禁码");
  expect(
    apartmentCardLabel({ ...input, pendingAddress: true, state }),
  ).toContain("核对地址后共享");
});
test("non keypad instructions remain words rather than character-spelled codes", () => {
  const label = apartmentCardLabel({
    ...input,
    state: {
      status: "ready",
      records: [{ ...record, method: "front_desk", value: "TEST 前台登记" }],
    },
  });
  expect(label).toContain("前台登记，TEST 前台登记");
  expect(label).not.toContain("门禁码 T");
});
