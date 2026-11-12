import { expect, it } from "vitest";
import {
  laInstant,
  localDateTime,
  centsInput,
  requestPrice,
  requestTime,
  applicationSourceStatus,
  publishedRequestCounts,
  publishedRequestTimestamp,
} from "./presentation";
import { deliveryFixture } from "./delivery-fixtures";
it("separates draft plans, actual open gaps and ended quantities", () => {
  const draft = {
    ...deliveryFixture(),
    quantity_mode: "exact" as const,
    parcel_count: 40,
    remaining_parcels: null,
    remaining_drivers: null,
  };
  const open = {
    ...draft,
    status: "open" as const,
    remaining_parcels: 25,
    remaining_drivers: 1,
  };
  expect(publishedRequestCounts(draft)).toEqual(["40 件", "计划找 2 人"]);
  expect(publishedRequestCounts(open)).toEqual(["剩余 25 件", "还需 1 人"]);
  expect(
    publishedRequestCounts({
      ...open,
      remaining_parcels: 0,
      remaining_drivers: 0,
    }),
  ).toEqual(["剩余 0 件", "还需 0 人"]);
  expect(
    publishedRequestCounts({
      ...open,
      quantity_mode: "estimate",
      remaining_drivers: null,
    }),
  ).toEqual(["约 40 件", "司机缺口待确认"]);
  expect(
    publishedRequestCounts({
      ...open,
      quantity_mode: "unknown",
      parcel_count: null,
    }),
  ).toEqual(["数量待确认", "还需 1 人"]);
  for (const status of ["found", "closed", "expired"] as const)
    expect(publishedRequestCounts({ ...open, status })).toEqual(["40 件"]);
  expect(
    publishedRequestTimestamp({ ...open, updated_at: "2026-11-11T23:00:00Z" }),
  ).toBe("更新于 11/11 3:00 PM");
  expect(
    publishedRequestTimestamp({
      ...open,
      handoff_mode: "scheduled",
      starts_at: null,
    }),
  ).toBeNull();
});
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

it("distinguishes ended and unavailable application sources from changed open terms", () => {
  const request = deliveryFixture("delivery_handoff");
  const status = (request_summary: typeof request | null, observed = 1) =>
    applicationSourceStatus({
      request_summary,
      observed_request_version: observed,
    });
  expect(status(null)).toBe("来源需求当前不可见");
  expect(status({ ...request, status: "open", version: 1 })).toBeNull();
  expect(status({ ...request, status: "open", version: 2 })).toBe(
    "需求条件已更新",
  );
  expect(status({ ...request, status: "found", version: 2 })).toBe(
    "需求已找到司机",
  );
  expect(status({ ...request, status: "closed", version: 2 })).toBe(
    "需求已关闭",
  );
  expect(status({ ...request, status: "expired", version: 2 })).toBe(
    "需求已到期",
  );
});
