import { expect, it } from "vitest";
import { addressParts } from "./address-presentation";
import { contributionMeta } from "./presentation";
it("emphasizes the complete door token without dropping fractions, ranges, directions or units", () => {
  for (const [input, number, rest] of [
    ["2445 E Del Mar Blvd", "2445", "E Del Mar Blvd"],
    ["123A N Pine Ave Apt 28", "123A", "N Pine Ave Apt 28"],
    ["123 1/2 S Pine Ave", "123 1/2", "S Pine Ave"],
    ["12-34 31st Ave", "12-34", "31st Ave"],
    ["A17 Calle 1", "A17", "Calle 1"],
  ])
    expect(addressParts(input!)).toEqual({ number, rest });
});
it("keeps uncertain door forms readable instead of guessing a number", () => {
  for (const value of [
    "Route 66",
    "5th Ave",
    "12/14 Pine Ave",
    "123AB N Pine Ave",
  ])
    expect(addressParts(value)).toEqual({ number: null, rest: value });
});
it("contribution metadata includes the business-local time and driver username", () => {
  expect(
    contributionMeta(
      {
        contributed_at: "2026-11-01T16:20:00Z",
        scope: { timezone: "America/Los_Angeles" },
        contributor_display_name: "阿杰",
      },
      Date.parse("2026-11-01T20:00:00Z"),
    ),
  ).toBe("今天 8:20 AM 贡献 · 阿杰");
});
it("uses the local date across midnight and keeps an explicit fallback for unknown metadata", () => {
  const record = {
    contributed_at: "2026-11-01T06:20:00Z",
    scope: { timezone: "America/Los_Angeles" },
    contributor_display_name: "",
  };
  const label = contributionMeta(record, Date.parse("2026-11-01T07:01:00Z"));
  expect(label).toContain("10月31日");
  expect(label).toContain("11:20 PM 贡献 · 司机");
  expect(contributionMeta({ ...record, contributed_at: "invalid" })).toBe(
    "时间未知 贡献 · 司机",
  );
});
