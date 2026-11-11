import { randomUUID } from "node:crypto";

type Json = Record<string, unknown>;
type Check = {
  product: string;
  state: "passed" | "failed" | "skipped";
  http?: number;
  reason?: string;
  counts?: Record<string, number>;
};
const object = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Public property only; no driver GPS, password, database write or permanent
// geocoding. Raw responses, result IDs, URLs and token never leave this function.
export async function probeLiveMapbox(
  token: string,
  transport: typeof fetch = fetch,
) {
  if (!token.startsWith("pk.")) throw Error("Public Mapbox token required");
  const checks: Check[] = [];
  let calls = 0;
  const get = async (
    product: string,
    path: string,
    params: Record<string, string> = {},
  ): Promise<Json | null> => {
    const check: Check = { product, state: "failed" };
    checks.push(check);
    try {
      if (calls >= 6) throw Error("budget");
      calls++;
      const u = new URL(path, "https://api.mapbox.com");
      if (u.origin !== "https://api.mapbox.com") throw Error("host");
      for (const [k, v] of Object.entries({ ...params, access_token: token }))
        u.searchParams.set(k, v);
      const response = await transport(u, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      check.http = response.status;
      if (!response.ok) {
        check.reason =
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : response.status === 429
                ? "rate_limited"
                : "http_error";
        return null;
      }
      if (!response.body) throw Error("body");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 524288) {
            await reader.cancel();
            throw Error("body");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (
        !body ||
        (product === "style"
          ? body.version !== 8 || !object(body.sources)
          : !Array.isArray(
              body[product === "suggest" ? "suggestions" : "features"],
            ))
      )
        throw Error("body");
      check.state = "passed";
      return body;
    } catch {
      check.reason =
        check.http === undefined ? "network_unavailable" : "invalid_response";
      return null;
    }
  };
  const skip = (product: string) =>
    checks.push({
      product,
      state: "skipped",
      reason: "dependency_unavailable",
    });
  const report = () => ({
    sample: "DEL-MAR-PUBLIC",
    api_calls: calls,
    max_api_calls: 6,
    permanent_requests: 0,
    permanent_entitlement: "not_checked",
    checks,
  });
  const style = await get("style", "/styles/v1/mapbox/light-v11");
  if (!style || style.version !== 8 || !object(style.sources)) {
    if (style)
      Object.assign(checks.at(-1)!, {
        state: "failed",
        reason: "invalid_response",
      });
    for (const name of [
      "forward",
      "buildings",
      "reverse",
      "suggest",
      "retrieve",
    ])
      skip(name);
    return report();
  }
  const query = "2445 E Del Mar Blvd, Pasadena, CA 91107";
  const forward = await get("forward", "/search/geocode/v6/forward", {
    q: query,
    country: "US",
    types: "address",
    autocomplete: "false",
    permanent: "false",
    limit: "1",
  });
  const features = array(forward?.features);
  if (forward) checks.at(-1)!.counts = { results: features.length };
  const coordinate = array(object(object(features[0])?.geometry)?.coordinates);
  if (
    coordinate.length === 2 &&
    typeof coordinate[0] === "number" &&
    Number.isFinite(coordinate[0]) &&
    Math.abs(coordinate[0]) <= 180 &&
    typeof coordinate[1] === "number" &&
    Number.isFinite(coordinate[1]) &&
    Math.abs(coordinate[1]) <= 90
  ) {
    const buildings = await get(
      "buildings",
      `/v4/mapbox.mapbox-streets-v8/tilequery/${coordinate[0]},${coordinate[1]}.json`,
      {
        layers: "building",
        radius: "200",
        limit: "50",
        geometry: "polygon",
        dedupe: "true",
      },
    );
    if (buildings) {
      const found = array(buildings.features);
      checks.at(-1)!.counts = {
        results: found.length,
        apartments: found.filter(
          (f) => object(object(f)?.properties)?.type === "apartments",
        ).length,
      };
    }
    const reverse = await get("reverse", "/search/geocode/v6/reverse", {
      longitude: String(coordinate[0]),
      latitude: String(coordinate[1]),
      types: "address",
      limit: "1",
      permanent: "false",
    });
    if (reverse)
      checks.at(-1)!.counts = { results: array(reverse.features).length };
  } else {
    skip("buildings");
    skip("reverse");
  }
  const session = randomUUID();
  const suggest = await get("suggest", "/search/searchbox/v1/suggest", {
    q: query,
    country: "US",
    types: "address",
    limit: "5",
    language: "en",
    session_token: session,
  });
  const suggestions = array(suggest?.suggestions);
  if (suggest) checks.at(-1)!.counts = { results: suggestions.length };
  const id = object(suggestions[0])?.mapbox_id;
  if (typeof id === "string" && id.length > 0 && id.length <= 500) {
    const retrieved = await get(
      "retrieve",
      "/search/searchbox/v1/retrieve/" + encodeURIComponent(id),
      {
        session_token: session,
        language: "en",
      },
    );
    if (retrieved)
      checks.at(-1)!.counts = { results: array(retrieved.features).length };
  } else skip("retrieve");
  return report();
}
