import { expect, it } from "vitest";
import { homeAvailabilityLabel } from "./home-availability-label";

it("only compresses the repeated date for the same Los Angeles day", () => {
  expect(
    homeAvailabilityLabel("2026-11-10T17:00:00Z", "2026-11-11T01:00:00Z"),
  ).toBe("11/10 9:00 AM–5:00 PM");
});
it("retains both dates across local midnight even when the UTC date is identical", () => {
  expect(
    homeAvailabilityLabel("2026-11-11T07:00:00Z", "2026-11-11T09:00:00Z"),
  ).toBe("11/10 11:00 PM–\n11/11 1:00 AM");
});
