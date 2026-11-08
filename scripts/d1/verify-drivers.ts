import assert from "node:assert/strict";
import { createDiscoveryLoader } from "../../apps/mobile/src/drivers/discovery-loader";
import { defaultFilters } from "../../apps/mobile/src/drivers/discovery-model";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import {
  availabilityFields,
  availabilityPayload,
  nextDate,
} from "../../apps/mobile/src/drivers/availability-fields";
import { localDateTime } from "../../apps/mobile/src/requests/presentation";
type S = components["schemas"];
type Http = (
  path: string,
  method?: string,
  token?: string,
  status?: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyDrivers(p: {
  db: Client;
  http: Http;
  auth: string;
  other: string;
  owner: string;
  reader: string;
  stranger: string;
  strangerToken: string;
  region: string;
  pickup: string;
}) {
  const { db, http, auth, other, owner, reader, region, pickup } = p,
    call = async <T>(...args: Parameters<Http>) => (await http(...args)) as T;
  // Exercise the new request-side date/region-text filters on live HTTP/PG rows.
  await http("/v1/requests?day=bad", "GET", auth, 400);
  assert.equal(
    (await call<S["RequestPage"]>("/v1/requests?day=1900-01-01", "GET", auth))
      .items.length,
    0,
  );
  const requestPage = await call<S["RequestPage"]>(
    `/v1/requests?region_id=${region}&limit=100`,
    "GET",
    auth,
  );
  const sample = requestPage.items[0];
  assert(
    sample?.starts_at,
    "the isolated fixture must include an open regional request",
  );
  const sampleDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date(sample.starts_at));
  assert(
    (
      await call<S["RequestPage"]>(
        `/v1/requests?region_id=${region}&day=${sampleDay}&limit=100`,
        "GET",
        auth,
      )
    ).items.some((r) => r.id === sample.id),
  );
  const regionRow = (
    await db.query("SELECT label FROM abasong.regions WHERE id=$1", [region])
  ).rows[0];
  assert(
    (
      await call<S["RequestPage"]>(
        `/v1/requests?region_id=${region}&query=${encodeURIComponent(regionRow.label)}&limit=100`,
        "GET",
        auth,
      )
    ).items.some((r) => r.id === sample.id),
  );
  const starts = new Date(Date.now() - 300000).toISOString(),
    ends = new Date(Date.now() + 3600000).toISOString(),
    base = {
      expected_version: 0,
      enabled: true,
      starts_at: starts,
      ends_at: ends,
      region_ids: [region],
      capacity_parcels: 80,
    };
  await http("/v1/me/availability", "GET", auth, 404);
  await http("/v1/me/availability", "PUT", auth, 400, {
    enabled: true,
    expected_version: 0,
  });
  await http("/v1/me/availability", "PUT", auth, 400, {
    ...base,
    user_id: reader,
  });
  await http("/v1/me/availability", "PUT", auth, 400, {
    ...base,
    point: { lng: 0, lat: 0 },
  });
  await http("/v1/me/availability", "PUT", auth, 400, {
    ...base,
    region_ids: [region, region],
  });
  await http("/v1/me/availability", "PUT", auth, 400, {
    ...base,
    capacity_parcels: 10001,
  });
  await http("/v1/me/availability", "PUT", auth, 422, {
    ...base,
    region_ids: [randomUUID()],
  });
  await http("/v1/me/availability", "PUT", auth, 422, {
    ...base,
    ends_at: new Date(Date.now() - 3600000).toISOString(),
  });
  await http("/v1/me/availability", "PUT", auth, 422, {
    ...base,
    ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
  });
  await http("/v1/me/availability", "PUT", auth, 422, {
    ...base,
    starts_at: new Date(Date.now() + 8 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 8 * 86400000 + 3600000).toISOString(),
  });
  const av = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    base,
  );
  assert.equal(av.version, 1);
  assert.equal(av.currently_available, true);
  assert.deepEqual(av.region_ids, [region]);
  await http("/v1/me/availability", "GET", other, 404);
  await http("/v1/me/availability", "PUT", auth, 409, base);
  const stable = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    { ...base, expected_version: 1 },
  );
  assert.equal(stable.version, 1);
  await db.query(
    "UPDATE abasong.profiles SET experience=$2::jsonb WHERE user_id=$1",
    [
      owner,
      JSON.stringify([
        {
          carrier: "TEST Carrier",
          region_label: "TEST Area",
          description: "TEST self report",
          source: "verified",
        },
      ]),
    ],
  );
  const available = await call<S["DriverPage"]>(
    `/v1/drivers?region_id=${region}&carrier=TEST%20Car`,
    "GET",
    other,
  );
  assert(available.items.some((d) => d.profile.user_id === owner));
  assert(available.items.every((d) => d.profile.user_id !== reader));
  assert.equal(
    (
      await call<S["DriverPage"]>(
        `/v1/drivers?region_id=${pickup}`,
        "GET",
        other,
      )
    ).items.length,
    0,
  );
  const driver = await call<S["Driver"]>(`/v1/drivers/${owner}`, "GET", other);
  assert.equal(driver.profile.experience[0]!.source, "self_reported");
  assert.deepEqual(Object.keys(driver).sort(), [
    "availability",
    "profile",
    "regions",
  ]);
  assert(!JSON.stringify(driver).includes("push_token"));
  assert(driver.regions[0]!.display_point);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
  assert(
    (
      await call<S["DriverPage"]>(`/v1/drivers?day=${day}`, "GET", other)
    ).items.some((d) => d.profile.user_id === owner),
  );
  assert.equal(
    (await call<S["DriverPage"]>("/v1/drivers?day=2020-01-01", "GET", other))
      .items.length,
    0,
  );
  await http("/v1/drivers?day=bad", "GET", other, 400);
  await http("/v1/drivers?lat=34", "GET", other, 400);
  await db.query(
    "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
    [owner, reader],
  );
  assert.equal(
    (await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.length,
    0,
  );
  await http(`/v1/drivers/${owner}`, "GET", other, 404);
  await db.query(
    "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
    [owner, reader],
  );
  await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
    owner,
  ]);
  await http(`/v1/drivers/${owner}`, "GET", other, 404);
  assert.equal(
    (await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.length,
    0,
  );
  await db.query("UPDATE abasong.users SET status='active' WHERE id=$1", [
    owner,
  ]);
  await http("/v1/me/availability", "PUT", other, 200, {
    ...base,
    region_ids: [region, pickup],
    capacity_parcels: null,
  });
  const page = await call<S["DriverPage"]>(
    "/v1/drivers?limit=1",
    "GET",
    p.strangerToken,
  );
  assert.equal(page.items.length, 1);
  assert(page.next_cursor);
  const page2 = await call<S["DriverPage"]>(
    `/v1/drivers?limit=1&cursor=${page.next_cursor}`,
    "GET",
    p.strangerToken,
  );
  assert.equal(page2.items.length, 1);
  assert.notEqual(
    page.items[0]!.profile.user_id,
    page2.items[0]!.profile.user_id,
  );
  // Exercise the same native loader with real date/region filters and two pages.
  const discovery = createDiscoveryLoader(async (path) => {
    const url = new URL(path, "http://test.invalid");
    if (url.pathname === "/v1/drivers") url.searchParams.set("limit", "1");
    return http(url.pathname + url.search, "GET", p.strangerToken);
  });
  const filters = { ...defaultFilters(), region, day };
  const firstDiscovery = await discovery.load("找人", filters, 1);
  assert(firstDiscovery?.status === "ready" && firstDiscovery.next);
  const both = await discovery.more("找人", filters);
  assert(both?.status === "ready");
  assert.equal(both.rows.length, 2);
  assert.deepEqual(
    new Set(
      both.rows.map((x) =>
        x.kind === "driver" ? x.driver.profile.user_id : "wrong",
      ),
    ),
    new Set([owner, reader]),
  );
  assert(
    both.rows.every(
      (x) =>
        x.kind === "driver" &&
        !Object.hasOwn(x.driver, "point") &&
        !Object.hasOwn(x.driver.profile, "phone"),
    ),
  );
  const none = await discovery.load(
    "找人",
    { ...filters, day: "1900-01-01" },
    1,
  );
  assert(none?.status === "ready" && none.rows.length === 0);
  discovery.cancel();
  const closed = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    { expected_version: 1, enabled: false },
  );
  assert.equal(closed.version, 2);
  assert(
    !(await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.some(
      (d) => d.profile.user_id === owner,
    ),
  );
  assert.equal(
    (await call<S["Driver"]>(`/v1/drivers/${owner}`, "GET", other))
      .availability,
    null,
  );
  await http("/v1/me/availability", "PUT", auth, 409, {
    ...base,
    expected_version: 1,
  });
  const on = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    { ...base, expected_version: 2 },
  );
  assert.equal(on.version, 3);
  await db.query(
    "UPDATE abasong.availability SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE user_id=$1",
    [owner],
  );
  assert.equal(
    (await call<S["Availability"]>("/v1/me/availability", "GET", auth))
      .currently_available,
    false,
  );
  assert.equal(
    (await call<S["Driver"]>(`/v1/drivers/${owner}`, "GET", other))
      .availability,
    null,
  );
  assert(
    !(await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.some(
      (d) => d.profile.user_id === owner,
    ),
  );
  // A future declared window is visible with an explicit currently_available=false, never an online badge.
  const future = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    {
      ...base,
      expected_version: 3,
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      ends_at: new Date(Date.now() + 7200000).toISOString(),
    },
  );
  assert.equal(future.currently_available, false);
  assert(
    (await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.some(
      (d) => d.profile.user_id === owner,
    ),
  );
  // R4-09: real native payload builder → actual guard/DTO/service/PG, no grants.
  const tomorrow = nextDate(localDateTime(null).date);
  const fields = {
    ...availabilityFields(future),
    date: tomorrow,
    start: "09:00",
    endDate: tomorrow,
    end: "11:00",
    capacity: "",
  };
  const native = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    availabilityPayload(fields, future.version),
  );
  assert.equal(native.capacity_parcels, null);
  assert.equal(native.currently_available, false);
  assert(
    (
      await call<S["DriverPage"]>(`/v1/drivers?day=${tomorrow}`, "GET", other)
    ).items.some((d) => d.profile.user_id === owner),
  );
  const closing = availabilityPayload(
    {
      ...fields,
      enabled: false,
      date: "invalid",
      endDate: "invalid",
      regions: [],
      capacity: "invalid",
    },
    native.version,
  );
  const nativeClosed = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    closing,
  );
  assert(
    !(await call<S["DriverPage"]>("/v1/drivers", "GET", other)).items.some(
      (d) => d.profile.user_id === owner,
    ),
  );
  const replay = await call<S["Availability"]>(
    "/v1/me/availability",
    "PUT",
    auth,
    200,
    { enabled: false, expected_version: nativeClosed.version },
  );
  assert.equal(replay.version, nativeClosed.version);
  await http("/v1/me/availability", "PUT", auth, 409, closing);
  console.log(
    "PASS: R4-09 native tomorrow/explicit end/optional capacity/minimal close/replay/conflict actual HTTP/PG; six additional calls.",
  );
  console.log(
    "PASS: driver availability/version/expiry/filter/pagination/block/privacy actual HTTP/PG; no driver GPS, real accounts or cloud writes.",
  );
}
