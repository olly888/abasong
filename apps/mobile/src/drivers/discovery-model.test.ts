import { expect, it } from "vitest";
import { driverFixtures } from "./fixtures";
import {
  areaMarkers,
  createDiscoveryMemory,
  discoveryPath,
  validItem,
  type DiscoveryItem,
} from "./discovery-model";
import { availabilityFields, availabilityPayload } from "./availability-fields";
it("uses declared service-region points, groups drivers in the same region and excludes closed/expired results", () => {
  const f = driverFixtures(),
    items: DiscoveryItem[] = f.drivers.map((driver) => ({
      kind: "driver",
      driver,
    }));
  items.push(items[0]!);
  const pins = areaMarkers(items, f.regions);
  expect(pins[0]?.count).toBe(2);
  expect(pins[0]?.point).toEqual(f.regions[0]?.display_point);
  expect(validItem(items[0]!, Date.now() + 86400000)).toBe(false);
  expect(
    validItem({
      kind: "request",
      request: { ...f.requests[0]!, status: "closed" },
    }),
  ).toBe(false);
});
it("keeps per-mode reading state and encodes filters without turning them into paths", () => {
  const memory = createDiscoveryMemory();
  memory["找活"].selectedId = "TEST";
  memory["找活"].scroll = 200;
  expect(memory["找人"].selectedId).toBeNull();
  expect(memory["找人"].scroll).toBe(0);
  const path = discoveryPath("找人", {
    region: "",
    day: "2026-11-04",
    kind: "",
    text: "A&B / C",
  });
  const q = new URL(path, "http://test.invalid");
  expect(q.pathname).toBe("/v1/drivers");
  expect(q.searchParams.get("carrier")).toBe("A&B / C");
  expect(q.searchParams.has("lat")).toBe(false);
});
it("preserves explicit off intent without requiring stale date fields and handles an overnight shift in LA", () => {
  const f = availabilityFields(null);
  expect(availabilityPayload(f, 3)).toEqual({
    expected_version: 3,
    enabled: false,
  });
  const on = {
    ...f,
    enabled: true,
    date: "2026-11-04",
    start: "23:00",
    end: "01:00",
    regions: ["TEST"],
    capacity: "80",
  };
  const body = availabilityPayload(on, 3);
  expect(body.starts_at).toBe("2026-11-05T07:00:00.000Z");
  expect(body.ends_at).toBe("2026-11-05T09:00:00.000Z");
  expect(body.capacity_parcels).toBe(80);
  expect(() => availabilityPayload({ ...on, capacity: "0" }, 3)).toThrow();
});

it("reopens an expired declaration as an off draft with fresh times while retaining declared regions", () => {
  const f = driverFixtures(0);
  const form = availabilityFields(
    f.drivers[0]!.availability,
    Date.parse("2026-11-04T20:00:00Z"),
  );
  expect(form.enabled).toBe(false);
  expect(form.date).toBe("2026-11-04");
  expect(form.regions).toEqual(f.drivers[0]!.availability!.region_ids);
});
