import { expect, it } from "vitest";
import { compactCardHeight, measuredCardHeight } from "./card-layout";
it("ignores zero/narrow first-pass layout and invalid measurements before caching a shared rail height", () => {
  expect(measuredCardHeight(0, 1400, 192)).toBeNull();
  expect(measuredCardHeight(32, 1400, 192)).toBeNull();
  expect(measuredCardHeight(300, Infinity, 192)).toBeNull();
  expect(measuredCardHeight(300, 150, 192)).toBe(192);
});
it("grows equal-height cards for measured wrapped content or system text scaling without shrinking the standard frame", () => {
  expect(measuredCardHeight(256, 240, 192)).toBe(268);
  expect(measuredCardHeight(300, 160, compactCardHeight(2))).toBe(336);
});
