import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SearchService } from "./search.service";
import { MapboxSearchProvider } from "./mapbox-search.provider";
import type { MeService } from "../me/me.service";
import type { ApartmentsService } from "../apartments/apartments.service";
import { ApiError } from "../common/api-error";
const actor = { userId: randomUUID(), issuedAt: 123 };
const suggestion = {
  provider_result_id: "test:id",
  title: "2445 E Del Mar Blvd",
  label: "2445 E Del Mar Blvd, Pasadena, CA",
  subtitle: "Pasadena, CA",
  address: {
    address_line1: "2445 E Del Mar Blvd",
    city: "Pasadena",
    state: "CA",
    postal_code: null,
  },
};
const detail = {
  ...suggestion,
  point: { lng: -118.1007, lat: 34.1428 },
  attribution: "TEST attribution",
};
const services: SearchService[] = [];
afterEach(() => {
  services.splice(0).forEach((s) => s.onModuleDestroy());
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function fixture() {
  const provider = {
    suggest: vi.fn<MapboxSearchProvider["suggest"]>(async () => ({
      items: [suggestion],
      attribution: "TEST attribution",
    })),
    retrieve: vi.fn<MapboxSearchProvider["retrieve"]>(async () => detail),
  };
  const accounts = { get: vi.fn(async () => ({})) },
    apartments = { matchSearchAddress: vi.fn(async () => []) };
  const service = new SearchService(
    provider as unknown as MapboxSearchProvider,
    accounts as unknown as MeService,
    apartments as unknown as ApartmentsService,
  );
  services.push(service);
  const session_token = randomUUID();
  return { service, provider, accounts, apartments, session_token };
}
describe("search sessions", () => {
  it("accepts long provider IDs only within the actor's suggested session", async () => {
    const f = fixture(),
      id = "TEST:" + "x".repeat(700);
    f.provider.suggest.mockResolvedValueOnce({
      items: [{ ...suggestion, provider_result_id: id }],
      attribution: "TEST",
    });
    f.provider.retrieve.mockResolvedValueOnce({
      ...detail,
      provider_result_id: id,
    });
    await f.service.suggest(actor, {
      query: "TEST",
      session_token: f.session_token,
    });
    expect(
      await f.service.retrieve(actor, {
        provider_result_id: id,
        session_token: f.session_token,
      }),
    ).toMatchObject({ address: suggestion.address, match_status: "unmatched" });
    expect(f.provider.retrieve.mock.calls[0]?.[0]).toBe(id);
    await expect(
      f.service.retrieve(
        { ...actor, userId: randomUUID() },
        { provider_result_id: id, session_token: f.session_token },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.provider.retrieve).toHaveBeenCalledTimes(1);
  });
  it("rejects IDs over the bounded DTO limit before contacting the supplier", async () => {
    const f = fixture();
    await expect(
      f.service.retrieve(actor, {
        provider_result_id: "x".repeat(4097),
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.provider.retrieve).not.toHaveBeenCalled();
  });
  it("binds provider IDs to an authenticated actor and session", async () => {
    const f = fixture();
    await f.service.suggest(actor, {
      query: "2445",
      session_token: f.session_token,
    });
    await expect(
      f.service.retrieve(
        { ...actor, userId: randomUUID() },
        { provider_result_id: "test:id", session_token: f.session_token },
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.service.retrieve(actor, {
        provider_result_id: "other:id",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.provider.retrieve).not.toHaveBeenCalled();
  });
  it("uses a separate provider session and caches repeated retrieval", async () => {
    const f = fixture();
    await f.service.suggest(actor, {
      query: "2445",
      session_token: f.session_token,
    });
    const body = {
      provider_result_id: "test:id",
      session_token: f.session_token,
    };
    const r = await Promise.all([
      f.service.retrieve(actor, body),
      f.service.retrieve(actor, body),
    ]);
    expect(f.provider.retrieve).toHaveBeenCalledTimes(1);
    expect(f.provider.suggest.mock.calls[0]?.[1]).toBe(
      f.provider.retrieve.mock.calls[0]?.[1],
    );
    expect(f.provider.retrieve.mock.calls[0]?.[1]).not.toBe(f.session_token);
    expect(r[0]).toMatchObject({
      match_status: "unmatched",
      use_mode: "temporary",
      apartments: [],
    });
    expect(f.apartments.matchSearchAddress).toHaveBeenCalledWith(
      actor,
      suggestion.address,
      detail.point,
    );
    await expect(
      f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects caller identity injection and malformed queries before provider access", async () => {
    const f = fixture();
    for (const query of ["a", "\n2445", "x".repeat(201)]) {
      // Internal control characters, rather than trimmed whitespace, are invalid.
      const bad = query === "\n2445" ? "24\n45" : query;
      await expect(
        f.service.suggest(actor, {
          query: bad,
          session_token: f.session_token,
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
        userId: actor.userId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.provider.suggest).not.toHaveBeenCalled();
  });
  it("rejects revoked accounts both before and after provider I/O", async () => {
    const f = fixture();
    f.accounts.get.mockRejectedValueOnce(
      new ApiError(403, "ACCOUNT_UNAVAILABLE", "TEST"),
    );
    await expect(
      f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.provider.suggest).not.toHaveBeenCalled();
    f.accounts.get
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(401, "SESSION_REVOKED", "TEST"));
    await expect(
      f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("expires sessions without accepting old IDs", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.suggest(actor, {
      query: "2445",
      session_token: f.session_token,
    });
    vi.advanceTimersByTime(150001);
    await expect(
      f.service.retrieve(actor, {
        provider_result_id: "test:id",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("bounds provider calls globally", async () => {
    const f = fixture();
    for (let i = 0; i < 8; i++)
      await f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
      });
    await expect(
      f.service.suggest(actor, {
        query: "2445",
        session_token: f.session_token,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.provider.suggest).toHaveBeenCalledTimes(8);
  });
});
const raw = {
  mapbox_id: "test:id",
  name: "2445 E Del Mar Blvd",
  feature_type: "address",
  context: {
    place: { name: "Pasadena" },
    region: { region_code: "CA" },
    country: { country_code: "US" },
  },
  internal: "MUST NOT LEAK",
};
describe("provider boundary", () => {
  it("retains a finite supplier ID bound", async () => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    const p = new MapboxSearchProvider((async () =>
      Response.json({
        suggestions: [{ ...raw, mapbox_id: "x".repeat(4097) }],
        attribution: "TEST",
      })) as typeof fetch);
    await expect(p.suggest("TEST", randomUUID())).rejects.toMatchObject({
      status: 503,
    });
  });
  it("keeps mixed suggestions and retrieves an opaque ID longer than 500 characters", async () => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    const id = "TEST:" + "x".repeat(700);
    const p = new MapboxSearchProvider((async (input: unknown) => {
      const u = new URL(String(input));
      if (u.pathname.endsWith("/suggest"))
        return Response.json({
          suggestions: [raw, { ...raw, mapbox_id: id }],
          attribution: "TEST",
        });
      expect(decodeURIComponent(u.pathname.split("/").at(-1)!)).toBe(id);
      return Response.json({
        attribution: "TEST",
        features: [
          {
            properties: { ...raw, mapbox_id: id },
            geometry: { type: "Point", coordinates: [-118, 34] },
          },
        ],
      });
    }) as typeof fetch);
    const found = await p.suggest("TEST", randomUUID());
    expect(found.items.map((i) => i.provider_result_id)).toEqual([
      raw.mapbox_id,
      id,
    ]);
    expect((await p.retrieve(id, randomUUID())).provider_result_id).toBe(id);
  });
  it("normalizes address features and strips unknown fields", async () => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    let url = "";
    const p = new MapboxSearchProvider((async (u) => {
      url = String(u);
      return Response.json({ suggestions: [raw], attribution: "TEST" });
    }) as typeof fetch);
    const r = await p.suggest("2445", randomUUID());
    expect(r.items[0]?.address?.address_line1).toBe(raw.name);
    expect(JSON.stringify(r)).not.toContain("MUST NOT LEAK");
    expect(new URL(url).searchParams.get("country")).toBe("US");
    expect(new URL(url).searchParams.get("proximity")).toBe(
      "-118.2437,34.0522",
    );
  });
  it.each([401, 500, 429])("sanitizes provider errors %s", async (status) => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    const p = new MapboxSearchProvider(
      (async () =>
        new Response("private-provider-error", { status })) as typeof fetch,
    );
    await expect(p.suggest("2445", randomUUID())).rejects.toMatchObject({
      status: status === 429 ? 429 : 503,
    });
  });
  it("rejects oversized bodies and nonmatching retrieved IDs", async () => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    const p = new MapboxSearchProvider(
      (async () => new Response("x".repeat(524289))) as typeof fetch,
    );
    await expect(p.suggest("2445", randomUUID())).rejects.toMatchObject({
      status: 503,
    });
    const q = new MapboxSearchProvider((async () =>
      Response.json({
        attribution: "TEST",
        features: [
          {
            properties: raw,
            geometry: { type: "Point", coordinates: [-118, 34] },
          },
        ],
      })) as typeof fetch);
    await expect(q.retrieve("wrong:id", randomUUID())).rejects.toMatchObject({
      status: 503,
    });
  });
  it("rejects redirects and invalid coordinates", async () => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.test-fixture");
    let redirect: RequestRedirect | undefined;
    const p = new MapboxSearchProvider((async (_u, o) => {
      redirect = o?.redirect;
      return Response.json({
        attribution: "TEST",
        features: [
          {
            properties: raw,
            geometry: { type: "Point", coordinates: [999, 34] },
          },
        ],
      });
    }) as typeof fetch);
    await expect(p.retrieve("test:id", randomUUID())).rejects.toMatchObject({
      status: 503,
    });
    expect(redirect).toBe("error");
  });
});
