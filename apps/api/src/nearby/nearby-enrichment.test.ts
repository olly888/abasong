import "reflect-metadata";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { components } from "@abasong/contracts";
import { NearbyService } from "./nearby.service";
import type { ApartmentsService } from "../apartments/apartments.service";
import type { MeService } from "../me/me.service";
import type { MapboxNearbyProvider } from "./mapbox-nearby.provider";
type S = components["schemas"];
const point = { lng: -118.01, lat: 34.42 };
const address: S["SearchAddress"] = {
  address_line1: "100 TEST Ave",
  city: "TEST City",
  state: "CA",
  postal_code: null,
};
const catalog: S["NearbyCandidate"] = {
  key: randomUUID(),
  source: "catalog",
  address,
  point,
  distance_m: 20,
  apartment: {
    ...address,
    id: randomUUID(),
    name: "TEST community",
    point,
    confidence: "authorized_source",
  },
  classification: "catalog_community",
  requires_address_confirmation: false,
};
function setup() {
  const apartments = {
    discoverCatalog: vi.fn(async () => [catalog]),
    // Old blanket spatial suppression incorrectly hides independent addresses.
    uncoveredDiscoveryPoints: vi.fn(async () => []),
  };
  const maps = {
    buildings: vi.fn(async () => ({
      items: [{ point, distance_m: 20 }],
      truncated: false,
    })),
    reverse: vi.fn<(_: S["Point"]) => Promise<S["SearchAddress"] | null>>(
      async () => address,
    ),
  };
  const service = new NearbyService(
    apartments as unknown as ApartmentsService,
    { get: async () => ({ capabilities: [] }) } as unknown as MeService,
    maps as unknown as MapboxNearbyProvider,
  );
  const actor = { userId: randomUUID(), issuedAt: 1 };
  const fix = {
    point,
    observed_at: new Date().toISOString(),
    accuracy_m: 5,
    accuracy_permission: "precise",
  };
  return { service, apartments, maps, actor, fix };
}
it("retains known catalog apartments without asking for a provider classification", async () => {
  const f = setup();
  expect((await f.service.discover(f.actor, f.fix)).items).toEqual([catalog]);
  expect(f.maps.buildings).not.toHaveBeenCalled();
});
it("does not suppress a separate address merely because its building lies in a catalog community", async () => {
  const f = setup();
  f.maps.reverse.mockResolvedValue({
    ...address,
    address_line1: "102 TEST Ave",
  });
  const result = await f.service.discover(f.actor, f.fix, true);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    address: { address_line1: "102 TEST Ave" },
    apartment: null,
    requires_address_confirmation: true,
  });
  expect(f.apartments.uncoveredDiscoveryPoints).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain("access_records");
});
it("deduplicates community roofs by confirmed postal identity and bounds reverse lookups", async () => {
  const f = setup();
  f.maps.buildings.mockResolvedValue({
    items: Array.from({ length: 8 }, (_, i) => ({
      point: { ...point, lng: point.lng + i * 0.00001 },
      distance_m: i,
    })),
    truncated: false,
  });
  const result = await f.service.discover(f.actor, f.fix, true);
  expect(result.items).toEqual([]);
  expect(f.maps.reverse).toHaveBeenCalledTimes(4);
  expect(result.truncated).toBe(true);
});
it("keeps unresolved addresses temporary without binding another apartment or reading a code", async () => {
  const f = setup();
  f.maps.reverse.mockRejectedValue(Error("TEST reverse unavailable"));
  const result = await f.service.discover(f.actor, f.fix, true);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    address: null,
    apartment: null,
    requires_address_confirmation: true,
  });
  expect(result.provider_status).toBe("ok");
});
