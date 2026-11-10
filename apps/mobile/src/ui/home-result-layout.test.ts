import { expect, it } from "vitest";
import { homeMapHeight, homeResultLayout as l } from "./home-result-layout";

it("budgets a full card and only the next title at normal phone sizes", () => {
  for (const height of [596, 703, 737, 825]) {
    const map = homeMapHeight(height, 116, 1);
    expect(height - map - 116).toBe(l.listTop + l.card + l.rowGap + l.preview);
    if (height >= 703) expect(map).toBeGreaterThan(height * 0.42);
  }
});
it("reclaims the preview for the map on a short screen without clipping the first card", () => {
  expect(homeMapHeight(461, 116, 1)).toBe(161);
  expect(461 - homeMapHeight(461, 116, 1) - 116).toBe(l.listTop + l.card);
  expect(homeMapHeight(0, 116, 1)).toBe(0);
});
it("uses measured chrome and reserves a scrollable list for enlarged text", () => {
  expect(homeMapHeight(737, 150, 1)).toBe(347);
  expect(homeMapHeight(737, 116, 2)).toBe(260);
  expect(homeMapHeight(461, 170, 2)).toBe(107);
  for (const height of [461, 596, 737, 825]) {
    expect(height - 170 - homeMapHeight(height, 170, 2)).toBeGreaterThanOrEqual(
      184,
    );
  }
});
