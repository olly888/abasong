import type { components } from "@abasong/contracts";
type S = components["schemas"];
export function driverFixtures(now = Date.now()) {
  const regions: S["Region"][] = [
    {
      id: "45111111-1111-4111-8111-111111111111",
      label: "TEST · Pasadena",
      timezone: "America/Los_Angeles",
      display_point: { lng: -118.1445, lat: 34.1478 },
    },
    {
      id: "45222222-2222-4222-8222-222222222222",
      label: "TEST · Altadena",
      timezone: "America/Los_Angeles",
      display_point: { lng: -118.133, lat: 34.158 },
    },
  ];
  const drivers: S["Driver"][] = ["阿杰", "小林"].map((name, i) => ({
    profile: {
      user_id: `45333333-3333-4333-8333-33333333333${i}`,
      display_name: `TEST ${name}`,
      bio: "TEST · 临时支援，联系时确认具体条件",
      vehicle_type: i ? "Van" : "轿车",
      experience: [
        {
          carrier: i ? "GOFO" : "SwiftX",
          region_label: regions[i]!.label,
          description: "TEST · 自报配送经验",
          source: "self_reported",
        },
      ],
    },
    availability: {
      user_id: `45333333-3333-4333-8333-33333333333${i}`,
      version: 1,
      enabled: true,
      currently_available: true,
      starts_at: new Date(now - 300000).toISOString(),
      ends_at: new Date(now + 7200000).toISOString(),
      region_ids: [regions[i]!.id],
      capacity_parcels: i ? null : 80,
      latest_finish_at: null,
    },
    regions: [regions[i]!],
  }));
  const requests: S["Request"][] = regions.map((r, i) => ({
    id: `45444444-4444-4444-8444-44444444444${i}`,
    publisher: drivers[i]!.profile,
    organization: null,
    kind: i ? "extra_drivers" : "partial_route",
    status: "open",
    version: 1,
    region_id: r.id,
    pickup_region_id: regions[1]!.id,
    pickup_area: null,
    carrier: i ? "GOFO" : "SwiftX",
    route_label: "TEST-01",
    description: null,
    starts_at: new Date(now + 3600000).toISOString(),
    expires_at: new Date(now + 7200000).toISOString(),
    pickup_deadline_at: null,
    delivery_deadline_at: null,
    timezone: r.timezone,
    parcel_count: i ? 300 : 150,
    drivers_needed: i ? 2 : null,
    remaining_parcels: i ? 200 : 100,
    remaining_drivers: i ? 1 : null,
    price_cents: i ? null : 185,
    price_unit: i ? "negotiable" : "per_parcel",
    currency: "USD",
    sorted_state: "sorted",
    handoff_requirement: "contact_confirm",
    private_payment_terms: null,
    stop_count: null,
    accepts_partial: true,
    minimum_parcels: 50,
    experience_requirement: "any",
  }));
  return { regions, drivers, requests };
}
