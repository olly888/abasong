import { confirmedAddress } from "./nearby-input";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { components } from "@abasong/contracts";
import { addressIdentity } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
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
  async buildings(p: S["Point"]) {
    const raw = await this.get(
      `/v4/mapbox.mapbox-streets-v8/tilequery/${p.lng},${p.lat}.json`,
      {
        layers: "building",
        radius: "200",
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
              id: z.union([z.string(), z.number()]).optional(),
              geometry: z.object({ coordinates: point }),
              properties: z
                .object({
                  type: z.string(),
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
    const seen = new Set<string>();
    return {
      truncated: parsed.data.features.length === 50,
      items: parsed.data.features
        .filter(
          (f) =>
            f.properties.type === "apartments" &&
            f.properties.tilequery.distance <= 200,
        )
        .filter((f) => {
          const k = String(f.id ?? f.geometry.coordinates.join(","));
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((f) => ({
          point: {
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          },
          distance_m: f.properties.tilequery.distance,
        })),
    };
  }
  private parseGeocode(raw: unknown): PermanentAddress | null {
    const schema = z.object({
      features: z
        .array(
          z.object({
            geometry: z.object({ coordinates: point }),
            properties: z.object({
              feature_type: z.string(),
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
      address_line1: address.address_line1,
      place: address.city,
      region: address.state,
      ...(address.postal_code ? { postcode: address.postal_code } : {}),
      country: "US",
      types: "address",
      limit: "1",
      autocomplete: "false",
      permanent: "true",
    });
    const found = this.parseGeocode(raw);
    if (
      !found ||
      !confirmedAddress.safeParse(found.address).success ||
      addressIdentity(found.address) !== addressIdentity(address) ||
      (address.postal_code && address.postal_code !== found.address.postal_code)
    )
      throw new ApiError(
        409,
        "ADDRESS_CONFIRMATION_REQUIRED",
        "未能确认这个地址，请核对门牌和街道",
      );
    return found;
  }
}
