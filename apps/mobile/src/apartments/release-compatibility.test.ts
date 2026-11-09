import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../auth/supabase", () => ({ supabase: null }));
import { dataRequest } from "./client";
import { createDiscoveryLoader } from "../drivers/discovery-loader";
import { defaultFilters } from "../drivers/discovery-model";
import { driverFixtures } from "../drivers/fixtures";
import { discoveryInput } from "./nearby-policy";
import {
  createVisibleAccessReader,
  type AccessRowState,
} from "./visible-access-reader";

// Transport-level rollout checks. All responses are local synthetic fixtures;
// these do not claim native UI acceptance or contact the pilot environment.
type S = components["schemas"];
const session = {
  access_token: "TEST-session",
  user: { id: "TEST-owner" },
} as Session;
const fetcher = vi.fn();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const read = (path: string, signal: AbortSignal) =>
  dataRequest(session, path, { signal });
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("keeps the catalog request compatible but does not silently drop expansion after a legacy 400", async () => {
  const observation = {
    fix: {
      coords: { longitude: -118.1, latitude: 34.1, accuracy: 5 },
      timestamp: Date.now(),
    },
    approximate: false,
  };
  fetcher.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    return "expand" in body
      ? json({ code: "INVALID_INPUT", message: "请求参数无效" }, 400)
      : json({ items: [], radius_m: 200 });
  });
  await expect(
    dataRequest(session, "/v1/apartments/discover", {
      method: "POST",
      body: discoveryInput(observation),
    }),
  ).resolves.toMatchObject({ items: [], radius_m: 200 });
  await expect(
    dataRequest(session, "/v1/apartments/discover/mapbox", {
      method: "POST",
      body: discoveryInput(observation, true),
    }),
  ).rejects.toMatchObject({ status: 400, code: "INVALID_INPUT" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).expand).toBe(true);
});

it.each(["warehouse_shortage", "delivery_handoff"])(
  "rejects unsupported %s without unfiltered fallback or a successful zero count",
  async (kind) => {
    const fixtures = driverFixtures();
    fetcher.mockImplementation(async (url: string) =>
      url.includes("/regions?")
        ? json({ items: fixtures.regions, next_cursor: null })
        : json({ code: "INVALID_INPUT", message: "请求参数无效" }, 400),
    );
    const loader = createDiscoveryLoader(read);
    expect(await loader.load("找活", { ...defaultFilters(), kind }, 1)).toEqual(
      { status: "error", message: "请求参数无效" },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = new URL(fetcher.mock.calls[1]![0]);
    expect(url.searchParams.get("scenario")).toBe(kind);
    expect(url.searchParams.get("request_schema_version")).toBe("2");
    expect(await loader.more("找活", { ...defaultFilters(), kind })).toBeNull();
    loader.cancel();
  },
);

it("recovers the same scenario after a service upgrade only on an explicit retry", async () => {
  const fixtures = driverFixtures();
  const filters = { ...defaultFilters(), kind: "warehouse_shortage" };
  let available = false;
  fetcher.mockImplementation(async (url: string) =>
    url.includes("/regions?")
      ? json({ items: fixtures.regions, next_cursor: null })
      : available
        ? json({ items: [], next_cursor: null })
        : json({ code: "UNAVAILABLE", message: "暂时无法加载" }, 503),
  );
  const loader = createDiscoveryLoader(read);
  expect(await loader.load("找活", filters, 1)).toMatchObject({
    status: "error",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  available = true;
  expect(await loader.load("找活", filters, 1)).toMatchObject({
    status: "ready",
    rows: [],
  });
  expect(fetcher.mock.calls[3]![0]).toBe(fetcher.mock.calls[1]![0]);
  loader.cancel();
});

it("does not apply a late legacy filter rejection to a newer people result", async () => {
  const fixtures = driverFixtures();
  let started!: () => void;
  let reply!: (r: Response) => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  fetcher.mockImplementation(async (url: string) => {
    if (url.includes("/regions?")) return json({ items: fixtures.regions });
    if (url.includes("/requests?"))
      return new Promise<Response>((resolve) => {
        reply = resolve;
        started();
      });
    return json({ items: fixtures.drivers, next_cursor: null });
  });
  const loader = createDiscoveryLoader(read);
  const old = loader.load(
    "找活",
    { ...defaultFilters(), kind: "delivery_handoff" },
    1,
  );
  await waiting;
  const latest = await loader.load("找人", defaultFilters(), 1);
  reply(json({ code: "INVALID_INPUT", message: "请求参数无效" }, 400));
  expect(await old).toBeNull();
  expect(latest).toMatchObject({
    status: "ready",
    rows: fixtures.drivers.map((driver) => ({ kind: "driver", driver })),
  });
  loader.cancel();
});

const record: S["AccessRecord"] = {
  id: "TEST-record",
  apartment_id: "TEST-apartment",
  method: "keypad",
  value: "*0012#",
  scope: { label: "大堂门" },
  contributed_at: "2026-11-09T12:00:00Z",
  contributor_display_name: "TEST",
  last_success_at: null,
  last_failure_at: null,
  effective_useful: false,
  my_feedback: null,
  verification_label: "community_contribution",
};
async function accessResult(response: Response) {
  fetcher.mockResolvedValue(response);
  let snapshot: ReadonlyMap<string, AccessRowState> = new Map();
  const reader = createVisibleAccessReader(
    (id, signal) =>
      dataRequest(session, `/v1/apartments/${id}/access-records`, { signal }),
    (states) => {
      snapshot = states;
    },
  );
  reader.update([record.apartment_id], true);
  try {
    await vi.waitFor(() =>
      expect(snapshot.get(record.apartment_id)?.status).not.toBe("loading"),
    );
    return snapshot.get(record.apartment_id);
  } finally {
    reader.dispose();
  }
}
it.each([400, 404, 503])(
  "a failed code request (%i) is not an empty password success",
  async (status) => {
    expect(
      await accessResult(
        json({ code: "UNAVAILABLE", message: "读取失败" }, status),
      ),
    ).toEqual({ status: "error", records: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("still reads a legacy code list without the additive pause field and preserves exact symbols", async () => {
  expect(
    await accessResult(
      json({ config_version: 1, next_cursor: null, items: [record] }),
    ),
  ).toEqual({ status: "ready", records: [record] });
});
it("never displays bodies from a response explicitly marked sharing-paused", async () => {
  expect(
    await accessResult(
      json({
        config_version: 1,
        next_cursor: null,
        sharing_paused: true,
        items: [record],
      }),
    ),
  ).toEqual({ status: "paused", records: [] });
});
it.each([
  [401, "AUTH_REQUIRED", "denied"],
  [403, "CAPABILITY_REQUIRED", "denied"],
  [403, "APARTMENT_SHARING_PAUSED", "paused"],
])(
  "keeps %s/%s separate from an empty code list",
  async (status, code, expected) => {
    expect(
      await accessResult(
        json({ code, message: "资料暂不可用" }, status as number),
      ),
    ).toEqual({ status: expected, records: [] });
  },
);
