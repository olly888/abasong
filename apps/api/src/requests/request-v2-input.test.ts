import { expect, it } from "vitest";
import { checked, draftInput, patchInput } from "./request-input";
import {
  draftV2Input,
  patchV2Input,
  prepareV2Publication,
  endOfLaDay,
  laDate,
  calendarDate,
} from "./request-v2-input";
const now = Date.parse("2026-11-05T20:00:00Z");
const full = () => ({
  request_schema_version: 2,
  scenario: "warehouse_shortage",
  task_scope: "partial",
  region_id: "11111111-1111-4111-8111-111111111111",
  pickup_region_id: "22222222-2222-4222-8222-222222222222",
  carrier: "TEST",
  quantity_mode: "estimate",
  parcel_count: 300,
  drivers_needed: 2,
  handoff_mode: "scheduled",
  handoff_date: "2026-11-05",
  starts_at: "2026-11-05T21:00:00Z",
  completion_mode: "same_day",
  pickup: {
    kind: "warehouse",
    address_source: "publisher_entered",
    address_line1: "100 TEST Warehouse Ave",
    city: "TEST City",
    state: "CA",
    address_confirmed: true,
  },
  price_unit: "per_parcel",
  price_cents: 185,
  sorted_state: "unknown",
  handoff_requirement: "dsp_approval",
});
it("prepares estimated warehouse work without inventing an exact gap or per-driver promise", () => {
  const p = prepareV2Publication(full(), now);
  expect(p.kind).toBe("extra_drivers");
  expect(p.remaining_parcels).toBeNull();
  expect(p.parcel_count).toBe(300);
  expect(p.remaining_drivers).toBe(2);
  expect(p.expires_at).toBe("2026-11-06T07:59:59.999Z");
});
it("unknown quantities remain null and contact handoff carries no private meeting location", () => {
  const p = prepareV2Publication(
    {
      ...full(),
      scenario: "delivery_handoff",
      quantity_mode: "unknown",
      parcel_count: null,
      drivers_needed: null,
      pickup: { kind: "contact_handoff" },
      completion_mode: "contact",
      price_unit: "negotiable",
      price_cents: 185,
    },
    now,
  );
  expect(p.parcel_count).toBeNull();
  expect(p.remaining_parcels).toBeNull();
  expect(p.remaining_drivers).toBeNull();
  expect(p.price_cents).toBeNull();
  expect(p.delivery_deadline_at).toBeNull();
});
it("whole scope is independent of scene and requires exact quantities", () => {
  const p = prepareV2Publication(
    {
      ...full(),
      scenario: "delivery_handoff",
      task_scope: "whole_route",
      quantity_mode: "exact",
    },
    now,
  );
  expect(p.kind).toBe("whole_route");
  expect(p.minimum_parcels).toBe(300);
  expect(p.accepts_partial).toBe(false);
  expect(p.remaining_parcels).toBe(300);
});
it.each([
  { quantity_mode: "unknown", parcel_count: 300 },
  { quantity_mode: "unknown", parcel_count: null, minimum_parcels: 10 },
  { quantity_mode: "exact", parcel_count: null },
  { quantity_mode: "exact", minimum_parcels: 301 },
  { task_scope: "whole_route" },
  { drivers_needed: null },
  { price_cents: null },
  { starts_at: "2026-11-05T19:59:59Z" },
  { handoff_date: "2026-11-06" },
  { handoff_mode: "asap", starts_at: "2026-11-05T21:00:00Z" },
  { handoff_mode: "asap", starts_at: null, handoff_date: "2026-11-06" },
  { pickup_deadline_at: "2026-11-05T20:30:00Z" },
  { pickup_deadline_at: "2026-11-06T09:00:00Z" },
  { expires_at: "2026-11-05T19:59:59Z" },
  { completion_mode: "contact", delivery_deadline_at: "2026-11-06T07:00:00Z" },
  { delivery_deadline_at: "2026-11-05T20:30:00Z" },
  { delivery_deadline_at: "2026-11-06T08:00:00Z" },
  {
    pickup: {
      kind: "warehouse",
      address_line1: "",
      city: "TEST",
      state: "CA",
      address_confirmed: true,
    },
  },
  {
    pickup: {
      kind: "warehouse",
      address_line1: "TEST",
      city: "TEST",
      state: "CA",
      address_confirmed: false,
    },
  },
])("refuses inconsistent publication %j", (change) => {
  expect(() => prepareV2Publication({ ...full(), ...change }, now)).toThrow();
});
it("drafts can retain incomplete addresses, publication cannot", () => {
  const draft = {
    request_schema_version: 2,
    scenario: "warehouse_shortage",
    pickup: { kind: "warehouse", city: "T" },
  };
  expect(checked(draftV2Input, draft).pickup).toEqual(draft.pickup);
  expect(() => prepareV2Publication(draft, now)).toThrow();
});
it("requires an explicit warehouse address origin and preserves provider-derived text for server licensing", () => {
  const p = full();
  const unclassified = { ...p.pickup, address_source: undefined };
  expect(() =>
    prepareV2Publication({ ...p, pickup: unclassified }, now),
  ).toThrow();
  expect(() =>
    prepareV2Publication(
      { ...p, pickup: { ...p.pickup, address_source: "provider_permanent" } },
      now,
    ),
  ).toThrow();
  const result = prepareV2Publication(
    { ...p, pickup: { ...p.pickup, address_source: "mapbox_suggestion" } },
    now,
  );
  expect(result.pickup).toMatchObject({ address_source: "mapbox_suggestion" });
});
it("asap binds to the current LA day and server clock, never to a stale draft timestamp", () => {
  const p = prepareV2Publication(
    { ...full(), handoff_mode: "asap", starts_at: null },
    now,
  );
  expect(p.starts_at).toBe(new Date(now).toISOString());
  expect(laDate(Date.parse("2026-11-06T07:59:59Z"))).toBe("2026-11-05");
});
it("expiry can stop discovery before a scheduled arrival without redefining completion", () => {
  const p = prepareV2Publication(
    {
      ...full(),
      expires_at: "2026-11-05T20:30:00Z",
      completion_mode: "next_day",
    },
    now,
  );
  expect(p.expires_at < p.starts_at).toBe(true);
  expect(p.delivery_deadline_at).toBe("2026-11-07T07:59:59.999Z");
  const q = prepareV2Publication(
    { ...full(), pickup_deadline_at: "2026-11-05T22:00:00Z" },
    now,
  );
  expect(q.expires_at).toBe(q.pickup_deadline_at);
  expect(() =>
    prepareV2Publication(
      {
        ...full(),
        pickup_deadline_at: "2026-11-05T22:00:00Z",
        expires_at: "2026-11-05T23:00:00Z",
      },
      now,
    ),
  ).toThrow();
});
it("LA end-of-day defaults honor 23/25-hour DST transitions", () => {
  expect(endOfLaDay("2026-03-08") - endOfLaDay("2026-03-07")).toBe(
    23 * 3600000,
  );
  expect(endOfLaDay("2026-11-01") - endOfLaDay("2026-10-31")).toBe(
    25 * 3600000,
  );
  expect(new Date(endOfLaDay("2026-03-08")).toISOString()).toBe(
    "2026-03-09T06:59:59.999Z",
  );
  expect(() => endOfLaDay("2026-02-30")).toThrow();
});
it.each([
  { ...full(), kind: "extra_drivers" },
  { ...full(), pickup: { ...full().pickup, point: { lng: 0, lat: 0 } } },
  {
    ...full(),
    pickup: { ...full().pickup, provider_result_id: "TEST temporary" },
  },
  {
    ...full(),
    pickup: { kind: "contact_handoff", address_line1: "TEST private" },
  },
  { ...full(), actor_id: "TEST" },
  { ...full(), parcel_count: 0 },
  { ...full(), starts_at: "2026-11-05T13:00:00" },
])("rejects forged, mixed or invalid input", (p) =>
  expect(() => checked(draftV2Input, p)).toThrow(),
);
it("V1 stays strict; V2 patch cannot change source, scene or optimistic version bounds", () => {
  expect(() => checked(draftInput, full())).toThrow();
  expect(() =>
    checked(patchInput, { expected_version: 1, quantity_mode: "unknown" }),
  ).toThrow();
  for (const extra of [
    { scenario: "delivery_handoff" },
    { organization_id: full().region_id },
    { expected_version: 2147483647 },
  ])
    expect(() =>
      checked(patchV2Input, {
        request_schema_version: 2,
        expected_version: 1,
        ...extra,
      }),
    ).toThrow();
});

it("last-minute asap still has a future end-of-day expiry", () => {
  const late = Date.parse("2026-11-06T07:59:30Z");
  const p = prepareV2Publication(
    { ...full(), handoff_mode: "asap", starts_at: null },
    late,
  );
  expect(Date.parse(p.expires_at)).toBeGreaterThan(late);
  expect(p.expires_at).toBe("2026-11-06T07:59:59.999Z");
});
it("preserves a pg calendar DATE without reinterpreting it as a GPS timestamp", () => {
  expect(calendarDate(new Date(2026, 10, 6))).toBe("2026-11-06");
  expect(calendarDate("2026-11-06")).toBe("2026-11-06");
});
it("only an existing unchanged start can remain in the past when editing open work", () => {
  const original = "2026-11-05T19:00:00.000Z";
  expect(() =>
    prepareV2Publication({ ...full(), starts_at: original }, now),
  ).toThrow();
  expect(
    prepareV2Publication({ ...full(), starts_at: original }, now, original)
      .starts_at,
  ).toBe(original);
  expect(() =>
    prepareV2Publication(
      { ...full(), starts_at: "2026-11-05T18:00:00.000Z" },
      now,
      original,
    ),
  ).toThrow();
});
