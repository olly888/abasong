import { expect, it } from "vitest";
import { probeLiveMapbox } from "./live-mapbox-probe";

const token = "pk.TEST-LIVE-PROBE";
function fixture(u: URL) {
  if (u.pathname.includes("/styles/"))
    return { version: 8, sources: { composite: {} } };
  if (u.pathname.endsWith("/forward"))
    return { features: [{ geometry: { coordinates: [-118.101, 34.138] } }] };
  if (u.pathname.includes("/tilequery/"))
    return {
      features: [
        { properties: { type: "apartments" } },
        { properties: { type: "house" } },
      ],
    };
  if (u.pathname.endsWith("/suggest"))
    return { suggestions: [{ mapbox_id: "TEST/RESULT?secret=hidden" }] };
  return { features: [{}] };
}
it("bounds live diagnostics to six temporary calls and one shared search session, without serializing source data", async () => {
  const seen: URL[] = [];
  const r = await probeLiveMapbox(token, (async (input, options) => {
    const u = new URL(String(input));
    seen.push(u);
    expect(u.origin).toBe("https://api.mapbox.com");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeDefined();
    return Response.json(fixture(u));
  }) as typeof fetch);
  expect(r.api_calls).toBe(6);
  expect(r.permanent_requests).toBe(0);
  expect(r.permanent_entitlement).toBe("not_checked");
  expect(r.checks.every((c) => c.state === "passed")).toBe(true);
  expect(r.checks.find((c) => c.product === "buildings")?.counts).toEqual({
    results: 2,
    apartments: 1,
  });
  const geo = seen.filter((u) => u.pathname.includes("/geocode/"));
  expect(geo).toHaveLength(2);
  expect(geo.every((u) => u.searchParams.get("permanent") === "false")).toBe(
    true,
  );
  expect(seen[4]!.searchParams.get("session_token")).toBe(
    seen[5]!.searchParams.get("session_token"),
  );
  const printed = JSON.stringify(r);
  for (const hidden of [
    token,
    "api.mapbox.com",
    "TEST/RESULT",
    "34.138",
    "Del Mar",
  ])
    expect(printed).not.toContain(hidden);
});
it("stops after one denied style request rather than consuming the remaining product checks", async () => {
  let calls = 0;
  const r = await probeLiveMapbox(token, (async () => {
    calls++;
    return new Response(null, { status: 401 });
  }) as typeof fetch);
  expect(calls).toBe(1);
  expect(r.checks[0]).toMatchObject({
    state: "failed",
    http: 401,
    reason: "unauthorized",
  });
  expect(r.checks.slice(1).every((c) => c.state === "skipped")).toBe(true);
});
it("does not derive map coordinates from failed geocoding, while completing the independent search session", async () => {
  const seen: string[] = [];
  const r = await probeLiveMapbox(token, (async (input) => {
    const u = new URL(String(input));
    seen.push(u.pathname);
    return u.pathname.endsWith("/forward")
      ? new Response(null, { status: 503 })
      : Response.json(fixture(u));
  }) as typeof fetch);
  expect(r.api_calls).toBe(4);
  expect(
    seen.some((s) => s.includes("tilequery") || s.endsWith("reverse")),
  ).toBe(false);
  expect(r.checks.find((c) => c.product === "retrieve")?.state).toBe("passed");
});
it("never propagates a transport error containing credentials or the provider URL", async () => {
  const r = await probeLiveMapbox(token, (async () => {
    throw Error("https://api.mapbox.com/?access_token=" + token);
  }) as typeof fetch);
  expect(r.checks[0]?.reason).toBe("network_unavailable");
  expect(JSON.stringify(r)).not.toContain(token);
  expect(JSON.stringify(r)).not.toContain("https://");
});
it("rejects oversized and malformed successful responses instead of recording product availability", async () => {
  for (const body of [
    { version: 8 },
    { version: 8, sources: {}, padding: "x".repeat(524288) },
  ]) {
    const r = await probeLiveMapbox(token, (async () =>
      Response.json(body)) as typeof fetch);
    expect(r.api_calls).toBe(1);
    expect(r.checks[0]).toMatchObject({
      state: "failed",
      http: 200,
      reason: "invalid_response",
    });
    expect(r.checks.slice(1).every((c) => c.state === "skipped")).toBe(true);
  }
});
