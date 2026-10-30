import { expect, test } from "vitest";
import {
  anchorOffset,
  localTime,
  scopeLabel,
  methodLabel,
} from "./presentation";
import type { components } from "@abasong/contracts";
test("times use Los Angeles business time, not host timezone", () => {
  expect(localTime("2026-10-30T16:20:00Z")).toContain("9:20 AM");
  expect(localTime("invalid")).toBe("时间未知");
  expect(localTime("2026-10-30T16:20:00Z", "invalid")).toBe("时间未知");
});
test("scope preserves gate/schedule and does not invent a gate", () => {
  expect(scopeLabel({})).toBe("门别未注明");
  const s = scopeLabel({
    label: "侧门",
    weekdays: [1, 5],
    start_local: "08:00",
    end_local: "18:00",
    timezone: "America/Los_Angeles",
  });
  expect(s).toContain("周一、周五");
  expect(s).toContain("洛杉矶时间");
  expect(s).toContain("08:00–18:00");
});
test("reordered record restores its screen-relative anchor and clamps start", () => {
  expect(anchorOffset({ id: "r", viewportY: 40 }, { r: 600 })).toBe(560);
  expect(anchorOffset({ id: "r", viewportY: 40 }, { r: 20 })).toBe(0);
  expect(anchorOffset({ id: "missing", viewportY: 40 }, {})).toBeNull();
});
test("non-code access methods have explicit titles", () => {
  expect(
    methodLabel({
      method: "front_desk",
    } as components["schemas"]["AccessRecord"]),
  ).toBe("前台登记");
  expect(
    methodLabel({
      method: "no_fixed_code",
    } as components["schemas"]["AccessRecord"]),
  ).toBe("无固定密码");
});
