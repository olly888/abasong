import type { components } from "@abasong/contracts";
import { driverFixtures } from "../drivers/fixtures";
import { localDateTime } from "./presentation";
type S = components["schemas"];
// TEST only: shared by DEV lab and unit tests, never a service fallback.
export function deliveryFixture(
  scenario: "warehouse_shortage" | "delivery_handoff" = "warehouse_shortage",
  now = Date.now(),
): S["RequestDetailV2"] {
  const base = driverFixtures().requests[0]!;
  return {
    ...base,
    request_schema_version: 2,
    scenario,
    pickup_region_id:
      scenario === "warehouse_shortage"
        ? base.region_id
        : base.pickup_region_id,
    kind: scenario === "warehouse_shortage" ? "extra_drivers" : "partial_route",
    task_scope: "partial",
    quantity_mode: "estimate",
    parcel_count: 150,
    remaining_parcels: null,
    drivers_needed: scenario === "warehouse_shortage" ? 2 : null,
    remaining_drivers: scenario === "warehouse_shortage" ? 2 : null,
    status: "draft",
    handoff_mode: "asap",
    handoff_date: localDateTime(null, now).date,
    starts_at: new Date(now).toISOString(),
    expires_at: new Date(now + 5 * 3600000).toISOString(),
    completion_mode: "same_day",
    pickup_kind:
      scenario === "warehouse_shortage" ? "warehouse" : "contact_handoff",
    minimum_parcels: null,
    pickup:
      scenario === "warehouse_shortage"
        ? {
            kind: "warehouse",
            address_version: 1,
            name: "TEST 取件仓库",
            address_line1: "2445 E Del Mar Blvd",
            city: "Pasadena",
            state: "CA",
            postal_code: "91107",
            address_confirmed: true,
            address_source: "publisher_entered",
            point: { lng: -118.0999, lat: 34.1425 },
            point_source: "persistent_source",
          }
        : { kind: "contact_handoff" },
  };
}
