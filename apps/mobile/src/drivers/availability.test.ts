import { expect, it, vi } from "vitest";
import type { components } from "@abasong/contracts";
import { driverFixtures } from "./fixtures";
import {
  availabilityDraftKey,
  availabilityEndDate,
  availabilityFields,
  availabilityPayload,
  availabilitySummary,
  changeAvailabilityField,
} from "./availability-fields";
import {
  availabilityConflict,
  createAvailabilitySession,
  type AvailabilityRequest,
} from "./availability-session";
type S = components["schemas"];
const now = Date.parse("2026-11-06T20:00:00Z"),
  fixtures = driverFixtures(now),
  value = fixtures.drivers[0]!.availability!;
const form = () => ({
  ...availabilityFields(value, now),
  date: "2026-11-06",
  start: "14:00",
  end: "16:00",
  endDate: "2026-11-06",
  enabled: true,
});
const off = { ...value, enabled: false };
function transport(
  current: S["Availability"] | null,
  put: (options: { body?: unknown }) => unknown = () => value,
): AvailabilityRequest {
  return async <T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ) => {
    if (path.startsWith("/v1/regions")) return { items: fixtures.regions } as T;
    if (options?.method === "PUT") return (await put(options)) as T;
    if (!current) throw { status: 404, code: "NOT_FOUND" };
    return current as T;
  };
}
it("starts new and expired declarations closed with fresh reference times and preserves chosen regions", () => {
  expect(availabilityFields(null, now).enabled).toBe(false);
  const expired = availabilityFields(
    { ...value, ends_at: new Date(now - 1).toISOString() },
    now,
  );
  expect(expired.enabled).toBe(false);
  expect(expired.regions).toEqual(value.region_ids);
  expect(expired.endDate).toBe("2026-11-06");
});
it("today/tomorrow shifting preserves an overnight end day, without any service write", () => {
  let f = changeAvailabilityField(form(), "start", "23:00");
  f = changeAvailabilityField(f, "end", "01:00");
  expect(availabilityEndDate(f)).toBe("2026-11-07");
  f = changeAvailabilityField(f, "date", "2026-11-07");
  expect(f.endDate).toBe("2026-11-08");
  expect(changeAvailabilityField(f, "date", "2026-11-06").endDate).toBe(
    "2026-11-07",
  );
});
it("explicit end date isn't silently overwritten when a clock is changed", () => {
  const f = changeAvailabilityField(form(), "endDate", "2026-11-06");
  const next = changeAvailabilityField(f, "end", "01:00");
  expect(next.endDate).toBe("2026-11-06");
  expect(() => availabilityPayload(next, 1, now)).toThrow("24小时");
});
it("stale dates, invalid capacity and no regions never block switching off", () => {
  expect(
    availabilityPayload(
      {
        ...form(),
        enabled: false,
        date: "bad",
        endDate: "bad",
        regions: [],
        capacity: "bad",
      },
      7,
      now,
    ),
  ).toEqual({ expected_version: 7, enabled: false });
});
it("enforces actual elapsed duration across LA daylight changes instead of assuming a day is always24hours", () => {
  expect(() =>
    availabilityPayload(
      {
        ...form(),
        date: "2026-11-01",
        start: "00:00",
        endDate: "2026-11-02",
        end: "00:00",
      },
      1,
      Date.parse("2026-10-31T18:00:00Z"),
    ),
  ).toThrow("24小时");
  const spring = availabilityPayload(
    {
      ...form(),
      date: "2027-03-14",
      start: "00:00",
      endDate: "2027-03-15",
      end: "00:00",
    },
    1,
    Date.parse("2027-03-13T18:00:00Z"),
  );
  expect(Date.parse(spring.ends_at!) - Date.parse(spring.starts_at!)).toBe(
    23 * 3600000,
  );
  expect(() =>
    availabilityPayload(
      { ...form(), date: "2026-11-01", start: "01:30" },
      1,
      Date.parse("2026-10-31T18:00:00Z"),
    ),
  ).toThrow("夏令时");
});
it("rejects elapsed/overlong/far-future windows, permits an ongoing period and optional capacity", () => {
  expect(() => availabilityPayload(form(), 1, now + 86400000)).toThrow(
    "尚未结束",
  );
  expect(() =>
    availabilityPayload({ ...form(), endDate: "2026-11-08" }, 1, now),
  ).toThrow("24小时");
  expect(() =>
    availabilityPayload(
      { ...form(), date: "2026-11-14", endDate: "2026-11-14" },
      1,
      now,
    ),
  ).toThrow("7天内");
  expect(
    availabilityPayload(availabilityFields(value, now), 1, now)
      .capacity_parcels,
  ).toBe(value.capacity_parcels);
  expect(
    availabilityPayload({ ...form(), capacity: "" }, 1, now).capacity_parcels,
  ).toBeNull();
});
it("validates one to five distinct regions and numeric capacity", () => {
  for (const regions of [
    [],
    Array(6).fill("same"),
    [value.region_ids[0]!, value.region_ids[0]!],
  ])
    expect(() => availabilityPayload({ ...form(), regions }, 1, now)).toThrow(
      "1–5",
    );
  for (const capacity of ["0", "10001", "2.5", "bad"])
    expect(() =>
      availabilityPayload({ ...form(), capacity }, 1, now),
    ).toThrow();
});
it("describes future and expired declarations without claiming online presence or keeping an on state", () => {
  expect(availabilitySummary(off, now)).toBe("已关闭");
  expect(
    availabilitySummary(
      {
        ...value,
        starts_at: new Date(now + 86400000).toISOString(),
        ends_at: new Date(now + 90000000).toISOString(),
      },
      now,
    ),
  ).toContain("明天");
  expect(
    availabilitySummary(
      { ...value, ends_at: new Date(now).toISOString() },
      now,
    ),
  ).toBe("本次时段已结束");
  expect(availabilitySummary(value, now)).not.toContain("在线");
});
it("draft comparison ignores region order and automatic-date bookkeeping", () => {
  const f = { ...form(), regions: ["a", "b"] };
  expect(availabilityDraftKey(f)).toBe(
    availabilityDraftKey({ ...f, regions: ["b", "a"], endDateEdited: true }),
  );
});
it("load and local editing do not enable a declaration; saving is explicit and versioned", async () => {
  const spy = vi.fn(transport(off));
  const store = createAvailabilitySession(
    spy as AvailabilityRequest,
    () => now,
  );
  expect((await store.load())?.value?.enabled).toBe(false);
  expect(spy.mock.calls.every(([, o]) => o?.method !== "PUT")).toBe(true);
  await store.save(form());
  const put = spy.mock.calls.find(([, o]) => o?.method === "PUT")!;
  expect(put[1]?.body).toMatchObject({
    expected_version: value.version,
    enabled: true,
  });
  expect(put[1]?.body).not.toHaveProperty("point");
});
it("failed save preserves version for explicit retry, without an automatic retry loop", async () => {
  const bodies: unknown[] = [];
  let attempts = 0;
  const store = createAvailabilitySession(
    transport(off, (o) => {
      bodies.push(o.body);
      if (!attempts++) throw new Error("network");
      return value;
    }),
    () => now,
  );
  await store.load();
  await expect(store.save(form())).rejects.toThrow("network");
  expect(bodies).toHaveLength(1);
  await store.save(form());
  expect(bodies[0]).toEqual(bodies[1]);
});
it("a failed region read blocks opening, yet still permits minimal versioned close", async () => {
  const base = transport(value);
  const writes: unknown[] = [];
  const request: AvailabilityRequest = async <T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ) => {
    if (path.startsWith("/v1/regions")) throw new Error("regions offline");
    if (options?.method === "PUT") {
      writes.push(options.body);
      return off as T;
    }
    return base<T>(path, options);
  };
  const store = createAvailabilitySession(request, () => now);
  expect((await store.load())?.regionError).toBeTruthy();
  await expect(store.save(form())).rejects.toThrow("区域");
  await store.save({ ...form(), enabled: false, date: "bad", capacity: "bad" });
  expect(writes).toEqual([{ expected_version: value.version, enabled: false }]);
});
it("a new session treats only NOT_FOUND as no declaration and cannot write after cancellation", async () => {
  const store = createAvailabilitySession(transport(null), () => now);
  expect((await store.load())?.value).toBeNull();
  store.cancel();
  await expect(store.save(form())).rejects.toThrow("先读取");
  const forbidden = createAvailabilitySession(async () => {
    throw { status: 403, code: "FORBIDDEN" };
  });
  await expect(forbidden.load()).rejects.toMatchObject({ status: 403 });
});
it("late reads after disposal cannot replace the current snapshot", async () => {
  let release!: (v: S["Availability"]) => void,
    reads = 0;
  const base = transport(value);
  const request: AvailabilityRequest = async <T>(
    path: string,
    o?: { method?: string; body?: unknown },
  ) => {
    if (path === "/v1/me/availability" && o?.method !== "PUT" && !reads++)
      return (await new Promise<S["Availability"]>((r) => {
        release = r;
      })) as T;
    return base<T>(path, o);
  };
  const store = createAvailabilitySession(request, () => now),
    late = store.load();
  await store.load();
  release({ ...value, version: 99 });
  expect(await late).toBeNull();
  const saved = await store.save(form());
  expect(saved?.version).toBe(value.version);
});
it("an already-sent write finishing after screen disposal cannot update the discarded editor", async () => {
  let release!: (v: S["Availability"]) => void;
  const store = createAvailabilitySession(
    transport(
      value,
      () =>
        new Promise<S["Availability"]>((r) => {
          release = r;
        }),
    ),
    () => now,
  );
  await store.load();
  const pending = store.save(form());
  store.cancel();
  release({ ...value, version: 99 });
  expect(await pending).toBeNull();
  await expect(store.save(form())).rejects.toThrow("先读取");
});
it("a changed version is identified without silently replacing another session's declaration", async () => {
  const store = createAvailabilitySession(
    transport(value, () => {
      throw { code: "VERSION_CONFLICT", status: 409 };
    }),
    () => now,
  );
  await store.load();
  await expect(store.save(form())).rejects.toSatisfy(availabilityConflict);
  expect(availabilityConflict(new Error("network"))).toBe(false);
});
