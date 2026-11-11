import { z } from "zod";
import type { components } from "@abasong/contracts";
import { SEARCH_RESULT_ID_MAX_LENGTH } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
type S = components["schemas"];
const string = z.string().min(1).max(2000);
const context = z
  .object({
    place: z.object({ name: string }).optional(),
    region: z
      .object({
        region_code: string.optional(),
        region_code_full: string.optional(),
      })
      .optional(),
    postcode: z.object({ name: string }).optional(),
    country: z.object({ country_code: string }).optional(),
    address: z.object({ name: string }).passthrough().optional(),
  })
  .passthrough();
const item = z
  .object({
    mapbox_id: z.string().min(1).max(SEARCH_RESULT_ID_MAX_LENGTH),
    name: string,
    address: string.optional(),
    full_address: string.optional(),
    place_formatted: string.optional(),
    context: context.optional(),
    feature_type: string.optional(),
  })
  .passthrough();
type Item = z.infer<typeof item>;
function postal(p: Item): S["SearchAddress"] | null {
  const state = (
    p.context?.region?.region_code ?? p.context?.region?.region_code_full
  )
    ?.split("-")
    .at(-1);
  const city = p.context?.place?.name;
  const street =
    p.address ??
    p.context?.address?.name ??
    (p.feature_type === "address" ? p.name : undefined);
  if (
    !street ||
    !city ||
    !state ||
    !/^[A-Z]{2}$/.test(state) ||
    p.context?.country?.country_code.toUpperCase() !== "US"
  )
    return null;
  if (street.length > 200 || city.length > 100) return null;
  return {
    address_line1: street,
    city,
    state,
    postal_code: p.context?.postcode?.name.slice(0, 12) ?? null,
  };
}
function view(p: Item): S["AddressSuggestion"] {
  return {
    provider_result_id: p.mapbox_id,
    title: p.name.slice(0, 200),
    label: (
      p.full_address ??
      [p.address ?? p.name, p.place_formatted].filter(Boolean).join(", ")
    ).slice(0, 300),
    subtitle: [
      p.address && p.address !== p.name ? p.address : undefined,
      p.place_formatted,
    ]
      .filter(Boolean)
      .join(", ")
      .slice(0, 300),
    address: postal(p),
  };
}
export class MapboxSearchProvider {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async get(
    path: string,
    parameters: Record<string, string>,
  ): Promise<unknown> {
    const token = process.env.MAPBOX_SEARCH_TOKEN;
    if (!token?.startsWith("pk."))
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "地址搜索暂不可用");
    const url = new URL("https://api.mapbox.com/search/searchbox/v1/" + path);
    for (const [key, value] of Object.entries({
      ...parameters,
      access_token: token,
      language: "en",
    }))
      url.searchParams.set(key, value);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 6000);
    try {
      const response = await this.request(url, {
        signal: abort.signal,
        redirect: "error",
      });
      if (response.status === 429)
        throw new ApiError(
          429,
          "SEARCH_RATE_LIMITED",
          "搜索较频繁，请稍后重试",
        );
      if (!response.ok || !response.body) throw new Error("provider");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 524288) {
            await reader.cancel();
            throw new Error("size");
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Never serialize a provider URL/error: it can include token and query.
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "地址搜索暂不可用，请重试");
    } finally {
      clearTimeout(timer);
    }
  }
  async suggest(query: string, session: string) {
    const body = await this.get("suggest", {
      q: query,
      session_token: session,
      country: "US",
      proximity: "-118.2437,34.0522",
      types: "address,poi,street,place",
      limit: "5",
    });
    const parsed = z
      .object({ suggestions: z.array(item).max(10), attribution: string })
      .safeParse(body);
    if (!parsed.success)
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "地址搜索暂不可用，请重试");
    return {
      items: parsed.data.suggestions.map(view),
      attribution: parsed.data.attribution,
    };
  }
  async retrieve(id: string, session: string) {
    const body = await this.get("retrieve/" + encodeURIComponent(id), {
      session_token: session,
    });
    const parsed = z
      .object({
        attribution: string,
        features: z
          .array(
            z.object({
              properties: item,
              geometry: z.object({
                type: z.literal("Point"),
                coordinates: z.tuple([
                  z.number().min(-180).max(180),
                  z.number().min(-90).max(90),
                ]),
              }),
            }),
          )
          .min(1)
          .max(10),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "地址暂不可用，请重新选择");
    const feature = parsed.data.features.find(
      (f) => f.properties.mapbox_id === id,
    );
    if (!feature)
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "地址暂不可用，请重新选择");
    return {
      ...view(feature.properties),
      point: {
        lng: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
      },
      attribution: parsed.data.attribution,
    };
  }
}
