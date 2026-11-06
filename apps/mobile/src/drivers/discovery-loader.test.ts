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
      : { items: [f.drivers[0]], next_cursor: "TEST cursor" };
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
  ).toBe("TEST cursor");
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
