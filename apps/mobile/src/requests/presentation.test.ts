import { expect, it } from "vitest";
import {
  laInstant,
  localDateTime,
  centsInput,
  requestPrice,
  requestTime,
} from "./presentation";
it("preserves exact cents and distinguishes negotiable from missing or zero prices", () => {
  expect(centsInput("1.85")).toBe(185);
  expect(requestPrice({ price_cents: null, price_unit: "negotiable" })).toBe(
    "联系议价",
  );
  expect(requestPrice({ price_cents: null, price_unit: null })).toBe(
    "报价未填写",
  );
  expect(requestPrice({ price_cents: 0, price_unit: "per_parcel" })).toBe(
    "$0.00/件",
  );
  for (const v of ["", "-1", "1.851", "1e3", "NaN"])
    expect(() => centsInput(v)).toThrow();
});
it("shows an explicit US 12-hour delivery time across midnight and DST", () => {
  expect(requestTime("2026-11-04T23:00:00Z")).toBe("11/4 3:00 PM");
  expect(requestTime("2026-07-04T07:05:00Z")).toBe("7/4 12:05 AM");
  expect(requestTime("2026-07-04T19:05:00Z")).toBe("7/4 12:05 PM");
  expect(requestTime(null)).toBe("时间未填写");
});
it("uses Los Angeles time independent of device timezone, with explicit DST gaps and repeats", () => {
  expect(laInstant("2026-11-03", "15:00")).toBe("2026-11-03T23:00:00.000Z");
  expect(laInstant("2026-07-03", "15:00")).toBe("2026-07-03T22:00:00.000Z");
  expect(localDateTime("2026-11-03T23:00:00Z")).toEqual({
    date: "2026-11-03",
    time: "15:00",
  });
  for (const [d, t] of [
    ["2026-03-08", "02:30"],
    ["2026-11-01", "01:30"],
    ["2026-02-30", "12:00"],
  ])
    expect(() => laInstant(d!, t!)).toThrow();
});
