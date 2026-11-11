import { expect, it } from "vitest";
import { homeMapHeight, homeResultLayout as l } from "./home-result-layout";

it("keeps the first card readable and lets additional rows fill the available space", () => {
  const available = [596, 703, 737, 825].map((height) => {
    const map = homeMapHeight(height, 116, 1);
    expect(map).toBe(Math.round(height * 0.44));
    return height - map - 116;
  });
  expect(available[0]).toBeGreaterThanOrEqual(l.listTop + l.card);
  expect(available[2]).toBeGreaterThan(l.listTop + l.card + l.rowGap + 44);
  expect(available[3]).toBeGreaterThan(available[2]!);
});
it("limits the map on a short screen without clipping the first card", () => {
  expect(homeMapHeight(461, 116, 1)).toBe(185);
  expect(461 - homeMapHeight(461, 116, 1) - 116).toBe(l.listTop + l.card);
  expect(homeMapHeight(0, 116, 1)).toBe(0);
});
it("makes room for the next title when the compact viewport can keep a usable map", () => {
  expect(homeMapHeight(544, 116, 1)).toBe(210);
});
it("uses measured chrome and reserves a scrollable list for enlarged text", () => {
  expect(homeMapHeight(737, 150, 1)).toBe(324);
  expect(homeMapHeight(737, 116, 2)).toBe(260);
  expect(homeMapHeight(461, 170, 2)).toBe(131);
  for (const height of [461, 596, 737, 825]) {
    expect(height - 170 - homeMapHeight(height, 170, 2)).toBeGreaterThanOrEqual(
      l.listTop + l.card,
    );
  }
});
