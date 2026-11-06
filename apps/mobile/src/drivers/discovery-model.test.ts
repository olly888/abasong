import { expect, it } from "vitest";
import { driverFixtures } from "./fixtures";
import {
  areaMarkers,
  createDiscoveryMemory,
  discoveryPath,
  validItem,
  reconcileDiscovery,
  filterDiscovery,
  selectDiscoveryItem,
  discoveryFocusRegion,
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
  expect(pins[0]?.count).toBe(1);
  expect(pins[0]?.point).toEqual(f.regions[0]?.display_point);
  expect(validItem(items[0]!, Date.now() + 86400000)).toBe(false);
  expect(
    validItem({
      kind: "request",
      request: { ...f.requests[0]!, status: "closed" },
    }),
  ).toBe(false);
});
it("keeps one card per driver across pages/regions and distinguishes region query from card selection", () => {
  const f = driverFixtures(),
    memory = createDiscoveryMemory(),
    view = memory["找人"];
  f.drivers[0]!.regions = f.regions;
  const items: DiscoveryItem[] = f.drivers.map((driver) => ({
    kind: "driver",
    driver,
  }));
  const rows = reconcileDiscovery([...items, items[0]!], view);
  expect(rows).toHaveLength(2);
  expect(discoveryFocusRegion(rows[0]!, f.regions, f.regions[1]!.id)?.id).toBe(
    f.regions[1]!.id,
  );
  expect(areaMarkers(rows, f.regions).map((p) => p.count)).toEqual([1, 2]);
  view.scroll = 213;
  view.pages = 3;
  const filters = view.filters;
  view.camera = {
    center: f.regions[0]!.display_point,
    zoom: 15.4,
    heading: 25,
    pitch: 12,
  };
  const camera = view.camera;
  selectDiscoveryItem(view, items[1]!);
  expect(view.filters).toBe(filters);
  expect([view.scroll, view.pages, view.camera]).toEqual([213, 3, camera]);
  expect(memory["找活"].camera).toBeUndefined();
  expect(filterDiscovery(view, { ...filters, region: f.regions[0]!.id })).toBe(
    true,
  );
  expect(view.selectedId).toBeNull();
  expect([view.scroll, view.pages]).toEqual([0, 1]);
  expect(reconcileDiscovery(items, view)).toEqual([items[0]]);
  selectDiscoveryItem(view, items[0]!);
  expect(filterDiscovery(view, { ...view.filters })).toBe(false);
  expect(view.selectedId).toBe(f.drivers[0]!.profile.user_id);
});
it("retains the selected ID after refresh and removes expired/closed objects without changing filters or camera", () => {
  const f = driverFixtures(),
    view = createDiscoveryMemory()["找活"];
  const items: DiscoveryItem[] = f.requests.map((request) => ({
    kind: "request",
    request,
  }));
  selectDiscoveryItem(view, items[1]!);
  expect(reconcileDiscovery(items, view)).toHaveLength(2);
  expect(view.selectedId).toBe(f.requests[1]!.id);
  f.requests[1]!.status = "closed";
  expect(reconcileDiscovery(items, view)).toHaveLength(1);
  expect(view.selectedId).toBe(f.requests[0]!.id);
  expect(reconcileDiscovery(items, view, Date.now() + 86400000)).toEqual([]);
  expect(view.selectedId).toBeNull();
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
  const work = new URL(
    discoveryPath("找活", { region: "", text: "", kind: "", day: "" }),
    "http://test.invalid",
  );
  expect(work.searchParams.get("request_schema_version")).toBe("2");
  expect(q.searchParams.has("request_schema_version")).toBe(false);
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
    endDate: "2026-11-05",
    start: "23:00",
    end: "01:00",
    regions: ["TEST"],
    capacity: "80",
  };
  const body = availabilityPayload(on, 3, Date.parse("2026-11-04T20:00:00Z"));
  expect(body.starts_at).toBe("2026-11-05T07:00:00.000Z");
  expect(body.ends_at).toBe("2026-11-05T09:00:00.000Z");
  expect(body.capacity_parcels).toBe(80);
  expect(() =>
    availabilityPayload(
      { ...on, capacity: "0" },
      3,
      Date.parse("2026-11-04T20:00:00Z"),
    ),
  ).toThrow();
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
