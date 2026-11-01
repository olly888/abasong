import { expect, it } from "vitest";
import { mergeNearby, distanceM } from "./nearby-policy";
import {
  getNearbyContribution,
  setNearbyContribution,
} from "./nearby-contribution";
import type { components } from "@abasong/contracts";
type C = components["schemas"]["NearbyCandidate"];
const item = (key: string, distance_m: number): C => ({
  key,
  source: "mapbox",
  apartment: null,
  address: null,
  point: { lng: -118.1, lat: 34.1 },
  distance_m,
  classification: "apartments",
  requires_address_confirmation: true,
});
it("orders by distance without password metadata and deduplicates identities", () => {
  expect(
    mergeNearby([item("a", 100)], [item("b", 20), item("a", 100)]).map(
      (c) => c.key,
    ),
  ).toEqual(["b", "a"]);
  expect(distanceM(item("a", 1).point, item("b", 2).point)).toBe(0);
});
it("keeps temporary contribution handoff isolated by account and random key", () => {
  expect(getNearbyContribution(undefined, "TEST-a")).toBeUndefined();
  setNearbyContribution("TEST-key", "TEST-a", item("a", 10));
  expect(getNearbyContribution("TEST-key", "TEST-b")).toBeUndefined();
  expect(getNearbyContribution("TEST-key", "TEST-a")?.key).toBe("a");
});
