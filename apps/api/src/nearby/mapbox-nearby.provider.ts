import { confirmedAddress } from "./nearby-input";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { components } from "@abasong/contracts";
import { addressIdentity } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
import { distanceM, offsetPoint, mapFeatureId } from "./nearby-spatial";
type S = components["schemas"];
const point = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export type PermanentAddress = {
  point: S["Point"];
  address: S["SearchAddress"];
};
@Injectable()
export class MapboxNearbyProvider {
  constructor(private readonly transport: typeof fetch = fetch) {}
  private async get(path: string, params: Record<string, string>) {
    const token = process.env.MAPBOX_SEARCH_TOKEN;
    if (!token?.startsWith("pk."))
      throw new ApiError(503, "MAP_UNAVAILABLE", "附近地图资料暂不可用");
    const url = new URL(path, "https://api.mapbox.com");
    for (const [k, v] of Object.entries({ ...params, access_token: token }))
      url.searchParams.set(k, v);
    try {
      const r = await this.transport(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!r.ok || !r.body) throw Error();
      const reader = r.body.getReader();
      let n = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const v = await reader.read();
          if (v.done) break;
          n += v.value.byteLength;
          if (n > 524288) {
            await reader.cancel();
            throw Error();
          }
          chunks.push(v.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new ApiError(503, "MAP_UNAVAILABLE", "附近地图资料暂不可用");
    }
  }
  private async buildingBatch(p: S["Point"], radius: number) {
    const raw = await this.get(
      `/v4/mapbox.mapbox-streets-v8/tilequery/${p.lng},${p.lat}.json`,
      {
        layers: "building",
        radius: String(radius),
        limit: "50",
        dedupe: "true",
        geometry: "polygon",
      },
    );
    const parsed = z
      .object({
        features: z
          .array(
            z.object({
              id: z.unknown().optional(),
              geometry: z.object({ coordinates: point }),
              properties: z
                .object({
                  type: z.string().nullish(),
                  tilequery: z.object({ distance: z.number().finite().min(0) }),
                })
                .passthrough(),
            }),
          )
          .max(50),
      })
      .safeParse(raw);
    if (!parsed.success)
      throw new ApiError(503, "MAP_UNAVAILABLE", "附近地图资料暂不可用");
    return parsed.data.features;
  }
  async buildings(p: S["Point"]) {
    const first = await this.buildingBatch(p, 200);
    const batches = [{ features: first, primary: true }];
    // One initial query + at most four parallel supplements. A capped result
    // remains explicitly partial; no attempt to crawl/complete a city dataset.
    if (first.length === 50 && Math.abs(p.lat) < 85) {
      const extra = await Promise.allSettled(
        [0, 90, 180, 270].map((bearing) =>
          this.buildingBatch(offsetPoint(p, 100, bearing), 150),
        ),
      );
      for (const result of extra)
        if (result.status === "fulfilled")
          batches.push({ features: result.value, primary: false });
    }
    const closest = new Map<
      string,
      {
        point: S["Point"];
        distance_m: number;
        distance_basis: "building_footprint" | "building_point_upper_bound";
        feature_id?: string;
      }
    >();
    for (const batch of batches)
      for (const f of batch.features) {
        if (f.properties.type !== "apartments") continue;
        const point = {
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        };
        // Supplement results are closest to the offset query, not the driver.
        // Distance to that returned point is a conservative upper bound; never
        // copy an offset-query distance as distance from the original location.
        const distance = batch.primary
          ? f.properties.tilequery.distance
          : distanceM(p, point);
        if (distance > 200) continue;
        const id = mapFeatureId(f.id),
          key = id ?? point.lng + "," + point.lat;
        const previous = closest.get(key);
        if (!previous || distance < previous.distance_m)
          closest.set(key, {
            point,
            distance_m: distance,
            distance_basis: batch.primary
              ? "building_footprint"
              : "building_point_upper_bound",
            ...(id ? { feature_id: id } : {}),
          });
      }
    return {
      truncated: first.length === 50 || closest.size > 50,
      items: [...closest.values()]
        .sort(
          (a, b) =>
            a.distance_m - b.distance_m ||
            (a.feature_id ?? "").localeCompare(b.feature_id ?? ""),
        )
        .slice(0, 50),
    };
  }
  private parseGeocode(raw: unknown) {
    const schema = z.object({
      features: z
        .array(
          z.object({
            geometry: z.object({ coordinates: point }),
            properties: z.object({
              feature_type: z.string(),
              coordinates: z
                .object({ accuracy: z.string().optional() })
                .optional(),
              match_code: z
                .object({
                  confidence: z.string(),
                  address_number: z.string().optional(),
                  street: z.string().optional(),
                  region: z.string().optional(),
                })
                .optional(),
              context: z.object({
                address: z.object({
                  address_number: z.string(),
                  street_name: z.string(),
                }),
                place: z.object({ name: z.string() }),
                region: z.object({ region_code: z.string() }),
                country: z.object({ country_code: z.string() }),
                postcode: z.object({ name: z.string() }).optional(),
              }),
            }),
          }),
        )
        .max(10),
    });
    const p = schema.safeParse(raw);
    if (!p.success) return null;
    const f = p.data.features[0];
    if (
      !f ||
      f.properties.feature_type !== "address" ||
      f.properties.context.country.country_code.toUpperCase() !== "US"
    )
      return null;
    const c = f.properties.context;
    return {
      point: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
      address: {
        address_line1: `${c.address.address_number} ${c.address.street_name}`,
        city: c.place.name,
        state: c.region.region_code.split("-").at(-1)!,
        postal_code: c.postcode?.name ?? null,
      },
      accuracy: f.properties.coordinates?.accuracy,
      match: f.properties.match_code,
    };
  }
  async reverse(p: S["Point"]): Promise<S["SearchAddress"] | null> {
    // A reverse result is only an address suggestion, never a verified association.
    const v = this.parseGeocode(
      await this.get("/search/geocode/v6/reverse", {
        longitude: String(p.lng),
        latitude: String(p.lat),
        types: "address",
        country: "US",
        limit: "1",
        permanent: "false",
      }),
    );
    return v && confirmedAddress.safeParse(v.address).success
      ? v.address
      : null;
  }
  async permanent(address: S["SearchAddress"]): Promise<PermanentAddress> {
    if (process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED !== "true")
      throw new ApiError(
        503,
        "ADDRESS_STORAGE_UNAVAILABLE",
        "新地址保存暂不可用，填写内容已保留",
      );
    const raw = await this.get("/search/geocode/v6/forward", {
      q: [
        address.address_line1,
        address.city,
        address.state,
        address.postal_code,
      ]
        .filter(Boolean)
        .join(", "),
      country: "US",
      types: "address",
      limit: "1",
      autocomplete: "false",
      permanent: "true",
    }).catch(() => {
      // A failed save must remain distinguishable from empty nearby coverage.
      // Never retry it as temporary geocoding or expose provider error details.
      throw new ApiError(
        503,
        "ADDRESS_STORAGE_UNAVAILABLE",
        "新地址暂时无法保存，请稍后重试",
      );
    });
    const found = this.parseGeocode(raw);
    if (
      !found ||
      !["rooftop", "parcel", "point"].includes(found.accuracy ?? "") ||
      !["exact", "high"].includes(found.match?.confidence ?? "") ||
      found.match?.address_number !== "matched" ||
      found.match?.street !== "matched" ||
      found.match?.region !== "matched" ||
      !confirmedAddress.safeParse(found.address).success ||
      addressIdentity(found.address) !== addressIdentity(address) ||
      (address.postal_code && address.postal_code !== found.address.postal_code)
    )
      throw new ApiError(
        409,
        "ADDRESS_CONFIRMATION_REQUIRED",
        "未能确认这个地址，请核对门牌和街道",
      );
    return { point: found.point, address: found.address };
  }
}
