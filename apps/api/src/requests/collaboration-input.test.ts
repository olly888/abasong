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
