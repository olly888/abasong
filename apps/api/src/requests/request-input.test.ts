import { expect, it } from "vitest";
import {
  checked,
  draftInput,
  patchInput,
  validatePublishing,
} from "./request-input";
const now = Date.parse("2026-11-03T20:00:00Z");
const complete = () => ({
  kind: "partial_route",
  region_id: "11111111-1111-4111-8111-111111111111",
  pickup_region_id: "22222222-2222-4222-8222-222222222222",
  carrier: "TEST",
  starts_at: "2026-11-03T19:00:00Z",
  expires_at: "2026-11-03T22:00:00Z",
  parcel_count: 150,
  price_unit: "per_parcel",
  price_cents: 185,
  sorted_state: "sorted",
  handoff_requirement: "dsp_approval",
});
it("allows support for an ongoing route, and negotiable price without inventing a zero amount", () => {
  expect(() => validatePublishing(complete(), now)).not.toThrow();
  expect(() =>
    validatePublishing(
      { ...complete(), price_unit: "negotiable", price_cents: null },
      now,
    ),
  ).not.toThrow();
});
it.each([
  { expires_at: "2026-11-03T19:30:00Z" },
  { price_cents: null },
  { carrier: "" },
  { pickup_region_id: null },
  { minimum_parcels: 151 },
  { kind: "whole_route", accepts_partial: true },
  { kind: "extra_drivers", drivers_needed: null },
  { pickup_deadline_at: "2026-11-03T21:00:00Z" },
  { delivery_deadline_at: "2026-11-03T18:00:00Z" },
])("refuses incomplete/inconsistent publication %j", (change) => {
  expect(() => validatePublishing({ ...complete(), ...change }, now)).toThrow();
});
it("keeps vehicle help simple and validates its explanation", () => {
  const v = {
    kind: "vehicle_help",
    region_id: complete().region_id,
    starts_at: complete().starts_at,
    expires_at: complete().expires_at,
    description: "TEST flat tire",
  };
  expect(() => validatePublishing(v, now)).not.toThrow();
  expect(() => validatePublishing({ ...v, description: "" }, now)).toThrow();
});
it("rejects precision/contact injection, type changes and forged owner/status/currency", () => {
  for (const bad of [
    { kind: "long_term" },
    { kind: "partial_route", pickup_area: "exact address" },
    { kind: "partial_route", publisher_id: complete().region_id },
    { kind: "partial_route", status: "open" },
    { kind: "partial_route", currency: "CNY" },
    { kind: "partial_route", price_cents: 1.85 },
  ])
    expect(() => checked(draftInput, bad)).toThrow();
  expect(() =>
    checked(patchInput, { expected_version: 1, kind: "whole_route" }),
  ).toThrow();
});

it("allows readable multi-line delivery explanations but rejects control characters", () => {
  expect(
    checked(draftInput, {
      kind: "other_help",
      description: "TEST line one\nTEST line two",
    }).description,
  ).toContain("\n");
  expect(() =>
    checked(draftInput, { kind: "other_help", description: "bad\u0000text" }),
  ).toThrow();
});
