import { expect, it } from "vitest";
import { reviewPoint } from "./review-position";
it("rejects stale/future/invalid fixes and never substitutes a gate as the driver location", () => {
  const fix = {
    coords: { longitude: -117.91, latitude: 34.02, accuracy: 4 },
    timestamp: 1000,
  };
  expect(reviewPoint(fix, 1001)).toEqual({ lng: -117.91, lat: 34.02 });
  for (const [value, now] of [
    [fix, 22000],
    [fix, -1001],
    [{ ...fix, coords: { ...fix.coords, accuracy: null } }, 1001],
    [{ ...fix, coords: { ...fix.coords, latitude: 91 } }, 1001],
  ] as const)
    expect(reviewPoint(value, now)).toBeNull();
});
