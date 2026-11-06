import { describe, it, expect } from "vitest";
import {
  applyInput,
  conversationInput,
  validateApplication,
} from "./collaboration-input";
import { safeRequestSnapshot } from "./request-events";
import type { RequestRow } from "./requests.service";
const now = Date.parse("2026-11-04T19:00:00Z");
const row = {
  id: "sample",
  publisher_id: "owner",
  organization_id: null,
  kind: "partial_route",
  status: "open",
  version: 3,
  discarded_at: null,
  expires_at: new Date(now + 3600000),
  remaining_parcels: 100,
  minimum_parcels: 25,
  accepts_partial: true,
} as RequestRow;
const body = {
  observed_request_version: 3,
  expected_arrival_at: new Date(now + 900000).toISOString(),
  capacity_parcels: 50,
};
describe("application business limits", () => {
  const v2 = {
    ...row,
    request_schema_version: 2,
    scenario: "warehouse_shortage",
    quantity_mode: "unknown",
    handoff_date: "2026-11-05",
    starts_at: new Date("2026-11-05T20:00:00Z"),
    expires_at: new Date(now + 60000),
    remaining_parcels: null,
    remaining_drivers: 2,
    minimum_parcels: null,
  } as RequestRow;
  const v2Body = {
    observed_request_version: 3,
    expected_arrival_at: "2026-11-05T20:15:00Z",
  };
  it("accepts a future pickup after discovery expiry and unknown capacity without reserving parcels", () => {
    expect(() => validateApplication(v2, v2Body, now)).not.toThrow();
    expect(() =>
      validateApplication({ ...v2, remaining_drivers: 0 }, v2Body, now),
    ).toThrow();
    expect(() =>
      validateApplication(
        v2,
        { ...v2Body, expected_arrival_at: "2026-11-06T20:15:00Z" },
        now,
      ),
    ).toThrow();
  });
  it("estimated volume is not a hard upper bound but an explicit minimum still applies", () => {
    const estimate = {
      ...v2,
      quantity_mode: "estimate",
      parcel_count: 10,
      minimum_parcels: 20,
    };
    expect(() =>
      validateApplication(estimate, { ...v2Body, capacity_parcels: 35 }, now),
    ).not.toThrow();
    expect(() =>
      validateApplication(estimate, { ...v2Body, capacity_parcels: 10 }, now),
    ).toThrow();
  });
  it("V2 source projection strips address and payment body from historical stored data", () => {
    const projected = safeRequestSnapshot({
      request_schema_version: 2,
      request_id: "TEST",
      private_payment_terms: "TEST",
      pickup: { address_line1: "TEST" },
      point: { lng: 0, lat: 0 },
      publisher_display_name: "TEST author",
    });
    for (const key of ["private_payment_terms", "pickup", "point"])
      expect(projected).not.toHaveProperty(key);
    expect(projected).toHaveProperty("publisher_display_name", "TEST author");
  });
  it("requires the conditions actually read, without accepting spoofed identities", () => {
    expect(() =>
      validateApplication(row, { ...body, observed_request_version: 2 }, now),
    ).toThrow("重新核对");
    expect(
      applyInput.safeParse({ ...body, applicant_id: "someone" }).success,
    ).toBe(false);
  });
  it("bounds delivery capacity by the real gap and minimum", () => {
    expect(() => validateApplication(row, body, now)).not.toThrow();
    for (const n of [1, 101])
      expect(() =>
        validateApplication(row, { ...body, capacity_parcels: n }, now),
      ).toThrow();
  });
  it("requires full capacity for whole-route and nonsplittable support", () => {
    expect(() =>
      validateApplication({ ...row, accepts_partial: false }, body, now),
    ).toThrow("整量");
    expect(() =>
      validateApplication(
        { ...row, accepts_partial: false },
        { ...body, capacity_parcels: 100 },
        now,
      ),
    ).not.toThrow();
  });
  it("does not pretend vehicle help carries a parcel commitment", () => {
    expect(() =>
      validateApplication({ ...row, kind: "vehicle_help" }, body, now),
    ).toThrow();
    expect(() =>
      validateApplication(
        { ...row, kind: "vehicle_help" },
        {
          observed_request_version: 3,
          expected_arrival_at: body.expected_arrival_at,
        },
        now,
      ),
    ).not.toThrow();
  });
  it("rejects expired demand, elapsed arrival and zero driver gaps", () => {
    expect(() =>
      validateApplication({ ...row, status: "closed" }, body, now),
    ).toThrow();
    expect(() =>
      validateApplication(
        row,
        { ...body, expected_arrival_at: new Date(now - 120000).toISOString() },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateApplication(
        { ...row, kind: "extra_drivers", remaining_drivers: 0 },
        body,
        now,
      ),
    ).toThrow();
  });
  it("requires source request and version together", () => {
    expect(
      conversationInput.safeParse({
        other_user_id: "70a8deae-8d2e-4710-9dd8-00e070b333df",
        source_request_version: 3,
      }).success,
    ).toBe(false);
  });
  it("strips private additions even from stored historical snapshots", () => {
    const safe = safeRequestSnapshot({
      request_id: "sample",
      version: 3,
      private_meeting_point: "TEST",
      ciphertext: "TEST",
    });
    expect(safe).not.toHaveProperty("private_meeting_point");
    expect(safe).not.toHaveProperty("ciphertext");
    expect(safe.request_id).toBe("sample");
  });
});
