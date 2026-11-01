import { afterEach, expect, it, vi } from "vitest";
import type { components } from "@abasong/contracts";
import { addressIdentity } from "@abasong/contracts";
import { mergeSearchResults } from "./search-results";
import {
  clearSearchDestination,
  getSearchDestination,
  setSearchDestination,
} from "./search-destination";
type S = components["schemas"];
const address = {
  address_line1: "2445 E Del Mar Blvd",
  city: "Pasadena",
  state: "CA",
  postal_code: null,
};
const apartment: S["Apartment"] = {
  ...address,
  id: "test-a",
  name: "TEST apartment",
  point: { lng: -118.1, lat: 34.14 },
  confidence: "field_verified",
};
const suggestion: S["AddressSuggestion"] = {
  provider_result_id: "test:id",
  title: "TEST",
  label: "TEST",
  subtitle: "TEST",
  address: { ...address, address_line1: "2445 East Del Mar Boulevard" },
};
afterEach(() => {
  clearSearchDestination();
  vi.useRealTimers();
});
it("normalizes directions/street suffixes but preserves house, city and unit identity", () => {
  expect(addressIdentity(address)).toBe(addressIdentity(suggestion.address));
  for (const change of [
    { address_line1: "2446 E Del Mar Blvd" },
    { city: "Los Angeles" },
    { address_line1: "2445 E Del Mar Blvd Apt 2" },
  ])
    expect(addressIdentity({ ...address, ...change })).not.toBe(
      addressIdentity(address),
    );
  expect(addressIdentity(null)).toBeNull();
  expect(
    addressIdentity({ ...address, address_line1: "Del Mar Blvd" }),
  ).toBeNull();
});
it("deduplicates provider IDs and equivalent full addresses without hiding distinct catalog apartments", () => {
  const other = {
    ...suggestion,
    provider_result_id: "other",
    address: { ...address, address_line1: "2446 E Del Mar Blvd" },
  };
  expect(
    mergeSearchResults(
      [apartment, { ...apartment, id: "test-b" }],
      [suggestion, other, other],
    ),
  ).toHaveLength(3);
  expect(
    mergeSearchResults(
      [],
      [suggestion, { ...suggestion, provider_result_id: "second" }],
    ),
  ).toHaveLength(1);
});
it("isolates temporary handoff by actor, random key, expiry and explicit cleanup", () => {
  vi.useFakeTimers();
  setSearchDestination("key", "actor", {
    title: "TEST",
    label: "TEST",
    point: apartment.point,
    attribution: "TEST",
    use_mode: "temporary",
    match_status: "unmatched",
    apartments: [],
  });
  expect(getSearchDestination("key", "other")).toBeUndefined();
  expect(getSearchDestination("other", "actor")).toBeUndefined();
  expect(getSearchDestination("key", "actor")).toBeDefined();
  vi.advanceTimersByTime(600001);
  expect(getSearchDestination("key", "actor")).toBeUndefined();
});
