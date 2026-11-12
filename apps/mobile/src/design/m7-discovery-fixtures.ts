import type { components } from "@abasong/contracts";

type S = components["schemas"];
export const m7Scenes = [
  "range-200",
  "range-500",
  "range-1000",
  "coverage-partial",
  "coverage-empty",
  "range-failed",
  "range-failed-empty",
] as const;
export function isM7DiscoveryScene(scene: string) {
  return (m7Scenes as readonly string[]).includes(scene);
}

// TEST response fixtures, not a replacement for the service expansion algorithm.
// Real bounded-query / geometry behavior is covered by the HTTP/PG suite.
export function m7Discovery(
  scene: string,
  input: S["NearbyInput"],
  provider: boolean,
): S["NearbyDiscovery"] {
  if (provider && !(input as S["NearbyInput"] & { expand?: boolean }).expand)
    throw new Error("TEST · 新版首页必须请求受控扩围");
  const empty = scene === "coverage-empty" || scene === "range-failed-empty";
  const failed = scene.startsWith("range-failed");
  const partial = scene.startsWith("coverage-");
  const radius =
    !provider || failed || scene === "range-200"
      ? 200
      : scene === "range-1000"
        ? 1000
        : 500;
  const distances = empty
    ? []
    : !provider || failed
      ? [40]
      : radius === 200
        ? [40, 90, 160]
        : radius === 1000
          ? [40, 400, 800]
          : [40, 280, 450];
  return {
    items: distances.map((distance, i) => {
      const apartment: S["Apartment"] = {
        id: `11111111-1111-4111-8111-11111111111${i + 1}`,
        name: "TEST Apartments",
        address_line1: `${100 + i * 2} TEST Arrival Ave`,
        city: "Test City",
        state: "CA",
        postal_code: null,
        point: {
          lng: input.point.lng,
          lat: input.point.lat + distance / 111195,
        },
        confidence: "unverified",
      };
      return {
        key: apartment.id,
        source: "catalog",
        apartment,
        address: {
          address_line1: apartment.address_line1,
          city: apartment.city,
          state: apartment.state,
          postal_code: null,
        },
        point: apartment.point,
        distance_m: distance,
        distance_basis: "address_point",
        classification: "catalog_community",
        requires_address_confirmation: false,
      };
    }),
    radius_m: radius,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    truncated: false,
    provider_status: !provider
      ? "not_requested"
      : failed
        ? "unavailable"
        : "ok",
    attribution: "TEST",
    use_mode: "temporary",
    coverage: {
      catalog: "queried",
      mapbox: !provider
        ? "not_requested"
        : failed
          ? "unavailable"
          : partial
            ? "partial"
            : "queried",
    },
    ...(provider
      ? {
          expansion: {
            attempted_radii_m: (scene === "range-200"
              ? [200]
              : radius === 1000
                ? [200, 500, 1000]
                : [200, 500]) as (200 | 500 | 1000)[],
            stop_reason: failed
              ? ("provider_unavailable" as const)
              : partial
                ? ("coverage_incomplete" as const)
                : ("sufficient" as const),
            catalog_queries:
              radius === 1000 ? 3 : scene === "range-200" ? 1 : 2,
            tilequery_requests:
              radius === 1000 ? 3 : scene === "range-200" ? 1 : 2,
            reverse_requests: 0,
            metadata_requests: 1,
            elapsed_ms: 800,
          },
        }
      : {}),
    distance_context: {
      observation_id: input.observation_id ?? null,
      observed_at: input.observed_at,
      accuracy_m: input.accuracy_m,
      accuracy_permission: input.accuracy_permission,
      valid_until: new Date(
        Date.parse(input.observed_at) + 20000,
      ).toISOString(),
    },
  };
}
