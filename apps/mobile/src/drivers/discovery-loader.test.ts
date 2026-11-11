import { expect, it } from "vitest";
import { createDiscoveryLoader } from "./discovery-loader";
import { defaultFilters } from "./discovery-model";
import { driverFixtures } from "./fixtures";
it("sends actual region/date/carrier filters without any driver position and follows bounded cursors", async () => {
  const f = driverFixtures(),
    paths: string[] = [];
  const loader = createDiscoveryLoader(async (path) => {
    paths.push(path);
    return path.startsWith("/v1/regions")
      ? { items: f.regions }
      : {
          items: [f.drivers[0]],
          next_cursor: `TEST cursor ${paths.length - 1}`,
        };
  });
  const result = await loader.load(
    "找人",
    {
      ...defaultFilters(),
      region: f.regions[0]!.id,
      text: "GOFO",
      day: "2026-11-05",
    },
    99,
  );
  expect(result).toMatchObject({ status: "ready", pages: 5 });
  expect(paths).toHaveLength(6);
  for (const path of paths.slice(1)) {
    const q = new URL(path, "http://test.invalid");
    expect(q.pathname).toBe("/v1/drivers");
    expect(q.searchParams.get("region_id")).toBe(f.regions[0]!.id);
    expect(q.searchParams.get("carrier")).toBe("GOFO");
    expect(q.searchParams.get("day")).toBe("2026-11-05");
    expect(q.searchParams.has("lat")).toBe(false);
  }
  expect(
    new URL(paths[2]!, "http://test.invalid").searchParams.get("cursor"),
  ).toBe("TEST cursor 1");
});
it("drops late success after fast region/mode changes even if transport ignores abort", async () => {
  const f = driverFixtures();
  let resolve!: (value: unknown) => void;
  const loader = createDiscoveryLoader(async (path) => {
    if (path.startsWith("/v1/regions")) return { items: f.regions };
    if (path.startsWith("/v1/requests"))
      return new Promise((r) => {
        resolve = r;
      });
    return { items: f.drivers, next_cursor: null };
  });
  const slow = loader.load("找活", defaultFilters(), 1);
  await Promise.resolve();
  const newer = await loader.load(
    "找人",
    { ...defaultFilters(), region: f.regions[1]!.id },
    1,
  );
  resolve({ items: f.requests, next_cursor: null });
  expect(await slow).toBeNull();
  expect(newer).toMatchObject({
    status: "ready",
    rows: [{ kind: "driver" }, { kind: "driver" }],
  });
});
it("ignores late failure after leaving, and keeps service failure distinct from an empty page", async () => {
  let reject!: (e: Error) => void;
  const loader = createDiscoveryLoader(
    async () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  const pending = loader.load("找人", defaultFilters(), 1);
  loader.cancel();
  reject(new Error("TEST late"));
  expect(await pending).toBeNull();
  const failure = createDiscoveryLoader(async () => {
    throw new Error("TEST offline");
  });
  expect(await failure.load("找活", defaultFilters(), 1)).toEqual({
    status: "error",
    message: "TEST offline",
  });
});
it("retries only the failed next page and preserves existing row identities without duplicates", async () => {
  const f = driverFixtures(),
    paths: string[] = [];
  let failure = true;
  const loader = createDiscoveryLoader(async (path) => {
    paths.push(path);
    if (path.startsWith("/v1/regions")) return { items: f.regions };
    if (path.includes("cursor=")) {
      if (failure) throw new Error("TEST offline");
      return { items: f.drivers, next_cursor: null };
    }
    return { items: [f.drivers[0]], next_cursor: "NEXT" };
  });
  await loader.load("找人", defaultFilters(), 1);
  const failed = await loader.more("找人", defaultFilters());
  expect(failed).toMatchObject({
    status: "ready",
    pages: 1,
    next: "NEXT",
    moreError: "TEST offline",
    rows: [{ driver: f.drivers[0] }],
  });
  failure = false;
  const done = await loader.more("找人", defaultFilters());
  expect(done).toMatchObject({
    status: "ready",
    pages: 2,
    next: null,
    moreError: undefined,
  });
  if (done?.status === "ready") expect(done.rows).toHaveLength(2);
  expect(paths).toHaveLength(4);
  expect(paths[2]).toBe(paths[3]);
});
it.each([401, 403])(
  "clears the page snapshot on %i instead of retaining protected rows",
  async (status) => {
    const f = driverFixtures();
    const loader = createDiscoveryLoader(async (path) => {
      if (path.startsWith("/v1/regions")) return { items: f.regions };
      if (path.includes("cursor="))
        throw Object.assign(new Error("TEST denied"), { status });
      return { items: f.drivers, next_cursor: "NEXT" };
    });
    await loader.load("找人", defaultFilters(), 1);
    expect(await loader.more("找人", defaultFilters())).toEqual({
      status: "error",
      message: "TEST denied",
    });
    expect(await loader.more("找人", defaultFilters())).toBeNull();
  },
);
it("drops a slow next page after a new filter wins and never appends across scopes", async () => {
  const f = driverFixtures();
  let resolve!: (v: unknown) => void;
  const loader = createDiscoveryLoader(async (path) => {
    if (path.startsWith("/v1/regions")) return { items: f.regions };
    if (path.includes("cursor="))
      return new Promise((r) => {
        resolve = r;
      });
    return { items: f.drivers, next_cursor: "NEXT" };
  });
  await loader.load("找人", defaultFilters(), 1);
  const late = loader.more("找人", defaultFilters());
  const next = { ...defaultFilters(), day: "2026-11-09" };
  await loader.load("找人", next, 1);
  resolve({ items: f.drivers, next_cursor: null });
  expect(await late).toBeNull();
  expect(await loader.more("找人", defaultFilters())).toBeNull();
  loader.cancel();
  expect(await loader.more("找人", next)).toBeNull();
});
it("rejects cycling cursors and incomplete pages without inventing an empty success", async () => {
  const f = driverFixtures();
  const loader = createDiscoveryLoader(async (path) =>
    path.startsWith("/v1/regions")
      ? { items: f.regions }
      : { items: f.drivers, next_cursor: "SAME" },
  );
  await loader.load("找人", defaultFilters(), 1);
  expect(await loader.more("找人", defaultFilters())).toMatchObject({
    status: "ready",
    pages: 1,
    moreError: "分页结果已变化，请重新加载",
    moreRecovery: "reload",
  });
  expect(await loader.load("找人", defaultFilters(), 3)).toMatchObject({
    status: "error",
  });
  const malformed = createDiscoveryLoader(async (path) =>
    path.startsWith("/v1/regions") ? { items: f.regions } : { items: [] },
  );
  expect(await malformed.load("找人", defaultFilters(), 1)).toMatchObject({
    status: "error",
  });
});
it("stops after five pages and invalidates stale snapshots when a refresh fails", async () => {
  const f = driverFixtures();
  let calls = 0,
    fail = false;
  const loader = createDiscoveryLoader(async (path) => {
    if (fail) throw new Error("TEST refresh failed");
    if (path.startsWith("/v1/regions")) return { items: f.regions };
    calls++;
    return { items: f.drivers, next_cursor: `page-${calls}` };
  });
  await loader.load("找人", defaultFilters(), 1);
  for (let i = 0; i < 6; i++) await loader.more("找人", defaultFilters());
  expect(calls).toBe(5);
  fail = true;
  expect(await loader.load("找人", defaultFilters(), 5)).toMatchObject({
    status: "error",
  });
  expect(await loader.more("找人", defaultFilters())).toBeNull();
});

it.each([404, 409])(
  "offers a full refresh when the pagination anchor becomes unavailable (%i)",
  async (status) => {
    const f = driverFixtures();
    const loader = createDiscoveryLoader(async (path) => {
      if (path.startsWith("/v1/regions")) return { items: f.regions };
      if (path.includes("cursor="))
        throw Object.assign(new Error("TEST changed"), { status });
      return { items: f.drivers, next_cursor: "NEXT" };
    });
    await loader.load("找人", defaultFilters(), 1);
    expect(await loader.more("找人", defaultFilters())).toMatchObject({
      status: "ready",
      pages: 1,
      moreRecovery: "reload",
    });
  },
);
