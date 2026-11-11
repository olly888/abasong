import assert from "node:assert/strict";
import { createDiscoveryLoader } from "../../apps/mobile/src/drivers/discovery-loader";
import { defaultFilters } from "../../apps/mobile/src/drivers/discovery-model";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import {
  endOfLaDay,
  laDate,
} from "../../apps/api/src/requests/request-v2-input";
type S = components["schemas"];
type R = S["RequestDetailV2"];
type Http = (
  path: string,
  method?: string,
  token?: string,
  status?: number | readonly number[],
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyDeliveryServices(p: {
  db: Client;
  http: Http;
  auth: string;
  other: string;
  strangerToken: string;
  owner: string;
  reader: string;
  region: string;
  pickup: string;
  providerMode: (mode: "success" | "failure" | "mismatch") => void;
  providerCalls: () => number;
}) {
  const { db, http, auth, other, owner, reader, region, pickup } = p;
  const call = async <T = R>(...args: Parameters<Http>) =>
    (await http(...args)) as T;
  let checks = 0;
  const equal = (a: unknown, b: unknown) => {
    assert.deepEqual(a, b);
    checks++;
  };
  const ok = (a: unknown) => {
    assert(a);
    checks++;
  };
  const count = async (sql: string, args: unknown[] = []) =>
    Number((await db.query(sql, args)).rows[0].n);
  const start = endOfLaDay(laDate(Date.now())) + 1 + 12 * 3600000;
  const workday = laDate(start);
  const address = {
    kind: "warehouse",
    address_source: "publisher_entered",
    name: "TEST warehouse",
    address_line1: "100 TEST Ave",
    city: "TEST City",
    state: "CA",
    postal_code: "90000",
    address_confirmed: true,
  };
  const body = {
    request_schema_version: 2,
    scenario: "warehouse_shortage",
    task_scope: "partial",
    region_id: region,
    pickup_region_id: pickup,
    carrier: "R4-07 TEST",
    quantity_mode: "unknown",
    parcel_count: null,
    drivers_needed: 2,
    handoff_mode: "scheduled",
    handoff_date: workday,
    starts_at: new Date(start).toISOString(),
    completion_mode: "contact",
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    pickup: address,
    price_unit: "per_parcel",
    price_cents: 185,
    sorted_state: "unknown",
    handoff_requirement: "dsp_approval",
    private_payment_terms: "TEST PRIVATE TERMS",
  };
  await http("/v1/requests", "POST", "", 401, body, randomUUID());
  await http("/v1/requests", "POST", other, 403, body, randomUUID());
  await db.query(
    "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'request.publish','TEST isolated R4-07 object authorization')",
    [reader],
  );
  await http(
    "/v1/requests",
    "POST",
    auth,
    400,
    { ...body, publisher_id: reader },
    randomUUID(),
  );
  const org = randomUUID();
  await db.query(
    "INSERT INTO abasong.organizations(id,name,contact_user_id) VALUES($1,'TEST DSP alpha',$2)",
    [org, owner],
  );
  await http(
    "/v1/requests",
    "POST",
    other,
    403,
    { ...body, organization_id: org },
    randomUUID(),
  );
  await http(
    "/v1/requests",
    "POST",
    auth,
    400,
    { ...body, pickup: { ...address, point: { lng: 0, lat: 0 } } },
    randomUUID(),
  );
  let incomplete = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      pickup: {
        kind: "warehouse",
        address_source: "publisher_entered",
        city: "TEST City",
      },
    },
    randomUUID(),
  );
  await http(
    `/v1/requests/${incomplete.id}/publish`,
    "POST",
    auth,
    422,
    { expected_version: incomplete.version },
    randomUUID(),
  );
  equal((await call(`/v1/requests/${incomplete.id}`)).status, "draft");
  incomplete = await call(`/v1/requests/${incomplete.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: incomplete.version,
    pickup: address,
    pickup_region_id: pickup,
  });
  incomplete = await call(
    `/v1/requests/${incomplete.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: incomplete.version },
    randomUUID(),
  );
  equal(
    incomplete.pickup?.kind === "warehouse"
      ? incomplete.pickup.address_line1
      : "wrong",
    "100 TEST Ave",
  );
  const originalName = (
    await db.query(
      "SELECT display_name FROM abasong.profiles WHERE user_id=$1",
      [owner],
    )
  ).rows[0].display_name;
  const sourceBody = { ...body, organization_id: org },
    key = randomUUID();
  let [r, replay] = await Promise.all([
    call("/v1/requests", "POST", auth, 201, sourceBody, key),
    call("/v1/requests", "POST", auth, 201, sourceBody, key),
  ]);
  equal(r.id, replay.id);
  equal(r.version, 1);
  equal(r.parcel_count, null);
  equal(r.pickup?.kind, "warehouse");
  equal(
    await count("SELECT count(*)::int AS n FROM abasong.requests WHERE id=$1", [
      r.id,
    ]),
    1,
  );
  await http(
    "/v1/requests",
    "POST",
    auth,
    409,
    { ...sourceBody, drivers_needed: 3 },
    key,
  );
  await http(`/v1/requests/${r.id}`, "GET", other, 404);
  await http(`/v1/requests/${r.id}`, "PATCH", other, 404, {
    request_schema_version: 2,
    expected_version: r.version,
    route_label: "TEST",
  });
  await http(`/v1/requests/${r.id}`, "PATCH", auth, 409, {
    request_schema_version: 2,
    expected_version: 99,
    route_label: "TEST",
  });
  await http(
    `/v1/requests/${r.id}/share-links`,
    "POST",
    auth,
    409,
    { public_preview_confirmed: true },
    randomUUID(),
  );
  const publishKey = randomUUID();
  [r, replay] = await Promise.all([
    call(
      `/v1/requests/${r.id}/publish`,
      "POST",
      auth,
      200,
      { expected_version: r.version },
      publishKey,
    ),
    call(
      `/v1/requests/${r.id}/publish`,
      "POST",
      auth,
      200,
      { expected_version: r.version },
      publishKey,
    ),
  ]);
  equal(r.version, replay.version);
  equal(r.status, "open");
  equal(r.remaining_parcels, null);
  equal(r.remaining_drivers, 2);
  equal(r.handoff_date, workday);
  equal(r.pickup?.kind === "warehouse" ? r.pickup.point : "wrong", null);
  const page = await call<S["RequestPageV2"]>(
    "/v1/requests?request_schema_version=2&carrier=R4-07%20TEST",
    "GET",
    other,
  );
  ok(page.items.some((x) => x.id === r.id));
  const summary = page.items.find((x) => x.id === r.id)!;
  for (const field of [
    "pickup",
    "private_payment_terms",
    "source_id",
    "address_line1",
    "point",
  ])
    equal(Object.hasOwn(summary, field), false);
  ok(
    !(await call<S["RequestPage"]>("/v1/requests", "GET", other)).items.some(
      (x) => x.id === r.id,
    ),
  );
  await http(
    `/v1/me/requests?request_schema_version=1&cursor=${r.id}`,
    "GET",
    auth,
    404,
  );
  await db.query(
    "UPDATE abasong.organizations SET name='TEST DSP beta' WHERE id=$1",
    [org],
  );
  await db.query(
    "UPDATE abasong.profiles SET display_name='TEST Renamed' WHERE user_id=$1",
    [owner],
  );
  r = await call(`/v1/requests/${r.id}`, "GET", other);
  equal(r.publisher.display_name, originalName);
  equal(r.organization?.name, "TEST DSP alpha");
  let code: unknown;
  try {
    await db.query(
      "UPDATE abasong.requests SET publishing_identity=NULL WHERE id=$1",
      [r.id],
    );
  } catch (e) {
    code = (e as { code?: string }).code;
  }
  equal(code, "23514");
  await http(`/v1/requests/${r.id}`, "PATCH", auth, 400, {
    request_schema_version: 2,
    expected_version: r.version,
    publishing_identity: { publisher_display_name: "TEST forged" },
  });
  const appBody = {
    observed_request_version: r.version,
    expected_arrival_at: new Date(start + 900000).toISOString(),
  };
  const appKey = randomUUID();
  const [application, applicationAgain] = await Promise.all([
    call<S["Application"]>(
      `/v1/requests/${r.id}/applications`,
      "POST",
      other,
      201,
      appBody,
      appKey,
    ),
    call<S["Application"]>(
      `/v1/requests/${r.id}/applications`,
      "POST",
      other,
      201,
      appBody,
      appKey,
    ),
  ]);
  equal(application.id, applicationAgain.id);
  equal(application.capacity_parcels, null);
  r = await call(`/v1/requests/${r.id}`);
  equal(r.remaining_drivers, 2);
  equal(r.remaining_parcels, null);
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.application_events WHERE application_id=$1 AND event_type='applied'",
      [application.id],
    ),
    1,
  );
  equal(Object.hasOwn(application.request_summary!, "pickup"), false);
  await http(
    `/v1/requests/${r.id}/applications`,
    "POST",
    auth,
    400,
    appBody,
    randomUUID(),
  );
  await http(`/v1/requests/${r.id}/versions`, "GET", p.strangerToken, 404);
  await http(`/v1/requests/${r.id}/applications`, "GET", other, 404);
  const versions = await call<S["RequestVersionPage"]>(
    `/v1/requests/${r.id}/versions`,
    "GET",
    other,
  );
  const snap = versions.items[0]!;
  equal(Object.hasOwn(snap, "private_payment_terms"), false);
  equal(Object.hasOwn(snap, "pickup"), false);
  ok(!JSON.stringify(snap).includes("100 TEST Ave"));
  const thread = await call<S["Conversation"]>(
    `/v1/conversations/${application.conversation_id}`,
    "GET",
    other,
  );
  equal(thread.last_request_snapshot?.request_id, r.id);
  equal(
    Object.hasOwn(thread.last_request_snapshot!, "private_payment_terms"),
    false,
  );
  await http(`/v1/requests/${r.id}/gap`, "PATCH", auth, 422, {
    request_schema_version: 2,
    expected_version: r.version,
    remaining_parcels: 1,
  });
  await http(`/v1/requests/${r.id}/gap`, "PATCH", auth, 400, {
    request_schema_version: 2,
    expected_version: r.version,
    remaining_drivers: 3,
  });
  r = await call(`/v1/requests/${r.id}/gap`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: r.version,
    remaining_drivers: 1,
  });
  equal(r.remaining_drivers, 1);
  equal(r.remaining_parcels, null);
  await http(`/v1/requests/${r.id}/gap`, "PATCH", auth, 409, {
    request_schema_version: 2,
    expected_version: r.version - 1,
    remaining_drivers: 0,
  });
  r = await call(`/v1/requests/${r.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: r.version,
    route_label: "TEST revised",
  });
  equal(r.handoff_date, workday);
  equal(r.remaining_drivers, 1);
  const expectedRaceVersion = r.version;
  const edits = await Promise.all([
    call<R | S["Error"]>(`/v1/requests/${r.id}`, "PATCH", auth, [200, 409], {
      request_schema_version: 2,
      expected_version: expectedRaceVersion,
      route_label: "TEST race",
    }),
    call<R | S["Error"]>(`/v1/requests/${r.id}`, "PATCH", auth, [200, 409], {
      request_schema_version: 2,
      expected_version: expectedRaceVersion,
      route_label: "TEST race",
    }),
  ]);
  equal(
    edits.filter((x) => "code" in x && x.code === "VERSION_CONFLICT").length,
    1,
  );
  equal(
    edits.filter((x) => "version" in x && x.version === expectedRaceVersion + 1)
      .length,
    1,
  );
  r = await call(`/v1/requests/${r.id}`);
  await http(
    `/v1/requests/${r.id}/applications`,
    "POST",
    other,
    409,
    appBody,
    randomUUID(),
  );
  const pickupCount = await count(
    "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
    [r.id],
  );
  await http(`/v1/requests/${r.id}`, "PATCH", auth, 422, {
    request_schema_version: 2,
    expected_version: r.version,
    pickup_region_id: pickup,
    pickup: {
      ...address,
      address_line1: "200 TEST Ave",
      address_confirmed: false,
    },
  });
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
      [r.id],
    ),
    pickupCount,
  );
  await http(`/v1/requests/${r.id}`, "PATCH", auth, 422, {
    request_schema_version: 2,
    expected_version: r.version,
    pickup: { kind: "contact_handoff" },
  });
  r = await call(`/v1/requests/${r.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: r.version,
    pickup_region_id: pickup,
    pickup: { kind: "contact_handoff" },
  });
  equal(r.pickup, { kind: "contact_handoff" });
  r = await call(`/v1/requests/${r.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: r.version,
    pickup_region_id: pickup,
    pickup: { ...address, address_line1: "200 TEST Ave" },
  });
  equal(
    r.pickup?.kind === "warehouse" ? r.pickup.address_line1 : "wrong",
    "200 TEST Ave",
  );
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
      [r.id],
    ),
    pickupCount + 1,
  );
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1 AND address_line1='100 TEST Ave'",
      [r.id],
    ),
    1,
  );
  const beforeSameAddress = await count(
    "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
    [r.id],
  );
  r = await call(`/v1/requests/${r.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: r.version,
    pickup: { ...address, address_line1: "200 TEST Ave" },
  });
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
      [r.id],
    ),
    beforeSameAddress,
  );
  // Shares expose an independent allowlist, never the private detail or Auth rights.
  const shareKey = randomUUID();
  const share = await call<S["RequestShare"]>(
    `/v1/requests/${r.id}/share-links`,
    "POST",
    auth,
    201,
    { public_preview_confirmed: true },
    shareKey,
  );
  equal(
    (
      await call<S["RequestShare"]>(
        `/v1/requests/${r.id}/share-links`,
        "POST",
        auth,
        201,
        { public_preview_confirmed: true },
        shareKey,
      )
    ).id,
    share.id,
  );
  const shareToken = new URL(share.public_url).pathname.split("/").at(-1)!;
  const publicView = await call<S["PublicRequestShare"]>(
    `/v1/public/request-shares/${shareToken}`,
    "GET",
    "",
  );
  equal(publicView.status, "open");
  ok(publicView.summary);
  for (const field of [
    "pickup",
    "address_line1",
    "point",
    "private_payment_terms",
    "publisher_id",
    "contact_phone",
    "wechat",
  ])
    equal(Object.hasOwn(publicView.summary!, field), false);
  ok(!JSON.stringify(publicView).includes("200 TEST Ave"));
  equal(
    (await call(`/v1/request-shares/${shareToken}/resolve`, "GET", other)).id,
    r.id,
  );
  await http(`/v1/request-shares/${shareToken}/resolve`, "GET", "", 401);
  await http(`/v1/request-shares/${share.id}`, "DELETE", other, 404);
  await db.query(
    "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
    [owner, reader],
  );
  await http(`/v1/requests/${r.id}`, "GET", other, 404);
  await http(`/v1/request-shares/${shareToken}/resolve`, "GET", other, 404);
  await db.query(
    "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
    [owner, reader],
  );
  r = await call(
    `/v1/requests/${r.id}/close`,
    "POST",
    auth,
    200,
    { expected_version: r.version, status: "closed" },
    randomUUID(),
  );
  const ended = await call<S["PublicRequestShare"]>(
    `/v1/public/request-shares/${shareToken}`,
    "GET",
    "",
  );
  equal(ended.status, "ended");
  equal(ended.summary, null);
  await http(`/v1/request-shares/${shareToken}/resolve`, "GET", other, 404);
  await http(`/v1/request-shares/${share.id}`, "DELETE", auth);
  await http(`/v1/public/request-shares/${shareToken}`, "GET", "", 404);
  await http(`/v1/request-shares/${share.id}`, "DELETE", auth);
  await db.query(
    "UPDATE abasong.organizations SET contact_user_id=$2 WHERE id=$1",
    [org, reader],
  );
  await http(
    `/v1/requests/${r.id}/reopen`,
    "POST",
    auth,
    403,
    { expected_version: r.version },
    randomUUID(),
  );
  await db.query(
    "UPDATE abasong.organizations SET contact_user_id=$2 WHERE id=$1",
    [org, owner],
  );
  // Permanent provider transport remains synthetic; failures must roll back all rows.
  const providerBody = {
    ...body,
    pickup: { ...address, address_source: "mapbox_suggestion" },
  };
  const beforeProvider = await count(
    "SELECT count(*)::int AS n FROM abasong.requests WHERE request_schema_version=2",
  );
  const providerKey = randomUUID();
  p.providerMode("failure");
  await http("/v1/requests", "POST", auth, 503, providerBody, providerKey);
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.requests WHERE request_schema_version=2",
    ),
    beforeProvider,
  );
  p.providerMode("mismatch");
  await http("/v1/requests", "POST", auth, 409, providerBody, providerKey);
  equal(
    await count(
      "SELECT count(*)::int AS n FROM abasong.requests WHERE request_schema_version=2",
    ),
    beforeProvider,
  );
  p.providerMode("success");
  let mapped = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    providerBody,
    providerKey,
  );
  equal(
    mapped.pickup?.kind === "warehouse"
      ? mapped.pickup.address_source
      : "wrong",
    "provider_permanent",
  );
  ok(mapped.pickup?.kind === "warehouse" && mapped.pickup.point);
  const beforeReplay = p.providerCalls();
  p.providerMode("failure");
  equal(
    (await call("/v1/requests", "POST", auth, 201, providerBody, providerKey))
      .id,
    mapped.id,
  );
  equal(p.providerCalls(), beforeReplay);
  p.providerMode("success");
  mapped = await call(
    `/v1/requests/${mapped.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: mapped.version },
    randomUUID(),
  );
  const beforeSameProvider = p.providerCalls();
  mapped = await call(`/v1/requests/${mapped.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: mapped.version,
    pickup: providerBody.pickup,
  });
  equal(p.providerCalls(), beforeSameProvider);
  await db.query(
    "UPDATE abasong.data_sources SET expires_at=now()-interval '1 hour' WHERE id=(SELECT source_id FROM abasong.request_pickup_addresses WHERE request_id=$1 AND address_version=1)",
    [mapped.id],
  );
  const expiredPoint = await call(`/v1/requests/${mapped.id}`, "GET", other);
  equal(
    expiredPoint.pickup?.kind === "warehouse"
      ? expiredPoint.pickup.point
      : "wrong",
    null,
  );
  mapped = await call(
    `/v1/requests/${mapped.id}/close`,
    "POST",
    auth,
    200,
    { expected_version: mapped.version, status: "closed" },
    randomUUID(),
  );
  await http(
    `/v1/requests/${mapped.id}/reopen`,
    "POST",
    auth,
    422,
    { expected_version: mapped.version },
    randomUUID(),
  );
  equal((await call(`/v1/requests/${mapped.id}`)).status, "closed");
  // Estimates have no exact gap/cap; whole-route work still has an exact commitment.
  let estimate = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      quantity_mode: "estimate",
      parcel_count: 10,
      minimum_parcels: 20,
    },
    randomUUID(),
  );
  estimate = await call(
    `/v1/requests/${estimate.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: estimate.version },
    randomUUID(),
  );
  await http(
    `/v1/requests/${estimate.id}/applications`,
    "POST",
    other,
    422,
    {
      ...appBody,
      observed_request_version: estimate.version,
      capacity_parcels: 10,
    },
    randomUUID(),
  );
  await http(
    `/v1/requests/${estimate.id}/applications`,
    "POST",
    other,
    201,
    {
      ...appBody,
      observed_request_version: estimate.version,
      capacity_parcels: 35,
    },
    randomUUID(),
  );
  equal((await call(`/v1/requests/${estimate.id}`)).remaining_parcels, null);
  let whole = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      task_scope: "whole_route",
      quantity_mode: "exact",
      parcel_count: 100,
    },
    randomUUID(),
  );
  whole = await call(
    `/v1/requests/${whole.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: whole.version },
    randomUUID(),
  );
  equal(whole.accepts_partial, false);
  equal(whole.minimum_parcels, 100);
  await http(
    `/v1/requests/${whole.id}/applications`,
    "POST",
    other,
    422,
    {
      ...appBody,
      observed_request_version: whole.version,
      capacity_parcels: 50,
    },
    randomUUID(),
  );
  await http(
    `/v1/requests/${whole.id}/applications`,
    "POST",
    other,
    201,
    {
      ...appBody,
      observed_request_version: whole.version,
      capacity_parcels: 100,
    },
    randomUUID(),
  );
  await http(`/v1/requests/${whole.id}/gap`, "PATCH", auth, 400, {
    request_schema_version: 2,
    expected_version: whole.version,
    remaining_parcels: 50,
  });
  whole = await call(`/v1/requests/${whole.id}/gap`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: whole.version,
    remaining_parcels: 0,
  });
  equal(whole.remaining_parcels, 0);
  equal(whole.remaining_drivers, 2);
  let handoff = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      scenario: "delivery_handoff",
      drivers_needed: 2,
      pickup: { kind: "contact_handoff" },
    },
    randomUUID(),
  );
  handoff = await call(
    `/v1/requests/${handoff.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: handoff.version },
    randomUUID(),
  );
  handoff = await call(`/v1/requests/${handoff.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: handoff.version,
    drivers_needed: null,
  });
  equal(handoff.pickup, { kind: "contact_handoff" });
  equal(handoff.remaining_drivers, null);
  await http(
    `/v1/requests/${handoff.id}/applications`,
    "POST",
    other,
    201,
    { ...appBody, observed_request_version: handoff.version },
    randomUUID(),
  );
  // M4-02: real request scenario/date/region filters through the native loader.
  let wholeHandoff = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      scenario: "delivery_handoff",
      task_scope: "whole_route",
      quantity_mode: "exact",
      parcel_count: 20,
      pickup: { kind: "contact_handoff" },
    },
    randomUUID(),
  );
  wholeHandoff = await call(
    `/v1/requests/${wholeHandoff.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: wholeHandoff.version },
    randomUUID(),
  );
  await http(
    "/v1/requests?request_schema_version=2&scenario=other",
    "GET",
    other,
    400,
  );
  const filters = {
    ...defaultFilters(),
    region,
    day: workday,
    text: "R4-07 TEST",
    kind: "delivery_handoff",
  };
  const paths: string[] = [];
  const discovery = createDiscoveryLoader(async (path) => {
    paths.push(path);
    // Force a short server page so a small real fixture exercises pagination.
    const url = new URL(path, "http://test.invalid");
    if (url.pathname === "/v1/requests") url.searchParams.set("limit", "1");
    return http(url.pathname + url.search, "GET", other);
  });
  const first = await discovery.load("找活", filters, 1);
  ok(first?.status === "ready" && first.rows.length === 1 && first.next);
  const second = await discovery.more("找活", filters);
  ok(second?.status === "ready");
  if (second?.status !== "ready") throw new Error("TEST discovery failed");
  equal(
    new Set(
      second.rows.map((x) => (x.kind === "request" ? x.request.id : "wrong")),
    ),
    new Set([handoff.id, wholeHandoff.id]),
  );
  ok(
    second.rows.every(
      (x) =>
        x.kind === "request" &&
        "scenario" in x.request &&
        x.request.scenario === "delivery_handoff",
    ),
  );
  equal(paths.filter((x) => x.startsWith("/v1/regions")).length, 1);
  equal(paths.length, 3);
  const warehousePage = await discovery.load(
    "找活",
    { ...filters, kind: "warehouse_shortage" },
    1,
  );
  ok(
    warehousePage?.status === "ready" &&
      warehousePage.rows.length > 0 &&
      warehousePage.rows.every(
        (x) =>
          x.kind === "request" &&
          "scenario" in x.request &&
          x.request.scenario === "warehouse_shortage",
      ),
  );
  const otherRegion = await discovery.load(
    "找活",
    { ...filters, region: pickup },
    1,
  );
  ok(otherRegion?.status === "ready" && otherRegion.rows.length === 0);
  const otherDay = await discovery.load(
    "找活",
    { ...filters, day: "1900-01-01" },
    1,
  );
  ok(otherDay?.status === "ready" && otherDay.rows.length === 0);
  await call(
    `/v1/requests/${wholeHandoff.id}/close`,
    "POST",
    auth,
    200,
    { expected_version: wholeHandoff.version, status: "found" },
    randomUUID(),
  );
  const afterClose = await discovery.load("找活", filters, 2);
  ok(
    afterClose?.status === "ready" &&
      afterClose.rows.length === 1 &&
      afterClose.rows[0]?.kind === "request" &&
      afterClose.rows[0].request.id === handoff.id,
  );
  discovery.cancel();
  // Still-open work from an earlier day must not leak into today's filter.
  const past = Date.now() - 86400000,
    pastDay = laDate(past);
  await db.query(
    "UPDATE abasong.requests SET starts_at=$2,handoff_date=$3 WHERE id=$1",
    [handoff.id, new Date(past), pastDay],
  );
  const today = await call<S["RequestPageV2"]>(
    `/v1/requests?request_schema_version=2&day=${laDate(Date.now())}`,
    "GET",
    other,
  );
  ok(!today.items.some((x) => x.id === handoff.id));
  ok(
    (
      await call<S["RequestPageV2"]>(
        `/v1/requests?request_schema_version=2&day=${pastDay}`,
        "GET",
        other,
      )
    ).items.some((x) => x.id === handoff.id),
  );
  handoff = await call(`/v1/requests/${handoff.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: handoff.version,
    route_label: "TEST ongoing",
  });
  equal(handoff.handoff_date, pastDay);
  equal(handoff.starts_at, new Date(past).toISOString());
  // Quantity mode changes are explicit condition edits, never application deductions.
  let changing = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    { ...body, quantity_mode: "exact", parcel_count: 100 },
    randomUUID(),
  );
  changing = await call(
    `/v1/requests/${changing.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: changing.version },
    randomUUID(),
  );
  changing = await call(`/v1/requests/${changing.id}/gap`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: changing.version,
    remaining_parcels: 20,
  });
  await http(`/v1/requests/${changing.id}`, "PATCH", auth, 409, {
    request_schema_version: 2,
    expected_version: changing.version,
    parcel_count: 10,
  });
  changing = await call(`/v1/requests/${changing.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: changing.version,
    quantity_mode: "estimate",
    parcel_count: 10,
  });
  equal(changing.remaining_parcels, null);
  changing = await call(`/v1/requests/${changing.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: changing.version,
    quantity_mode: "unknown",
    parcel_count: null,
  });
  equal(changing.remaining_parcels, null);
  equal(changing.parcel_count, null);
  changing = await call(`/v1/requests/${changing.id}`, "PATCH", auth, 200, {
    request_schema_version: 2,
    expected_version: changing.version,
    quantity_mode: "exact",
    parcel_count: 15,
  });
  equal(changing.remaining_parcels, 15);
  const todayDay = laDate(Date.now());
  let asap = await call(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      ...body,
      scenario: "delivery_handoff",
      pickup: { kind: "contact_handoff" },
      handoff_mode: "asap",
      handoff_date: todayDay,
      starts_at: null,
      expires_at: null,
    },
    randomUUID(),
  );
  asap = await call(
    `/v1/requests/${asap.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: asap.version },
    randomUUID(),
  );
  equal(asap.handoff_date, todayDay);
  equal(asap.expires_at, new Date(endOfLaDay(todayDay)).toISOString());
  asap = await call(
    `/v1/requests/${asap.id}/close`,
    "POST",
    auth,
    200,
    { expected_version: asap.version, status: "found" },
    randomUUID(),
  );
  asap = await call(
    `/v1/requests/${asap.id}/reopen`,
    "POST",
    auth,
    200,
    { expected_version: asap.version },
    randomUUID(),
  );
  equal(asap.status, "open");
  equal(asap.remaining_parcels, null);
  const zero = await call(
    `/v1/requests/${estimate.id}/gap`,
    "PATCH",
    auth,
    200,
    {
      request_schema_version: 2,
      expected_version: estimate.version,
      remaining_drivers: 0,
    },
  );
  await http(
    `/v1/requests/${estimate.id}/applications`,
    "POST",
    p.strangerToken,
    409,
    { ...appBody, observed_request_version: zero.version },
    randomUUID(),
  );
  await db.query(
    "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='request.publish'",
    [owner],
  );
  await http("/v1/requests", "POST", auth, 403, body, randomUUID());
  await http(
    `/v1/requests/${whole.id}/close`,
    "POST",
    auth,
    200,
    { expected_version: whole.version, status: "found" },
    randomUUID(),
  );
  await db.query(
    "UPDATE abasong.capabilities SET revoked_at=NULL WHERE user_id=$1 AND capability='request.publish'",
    [owner],
  );
  console.log(
    `PASS: R4-07 delivery HTTP flows and ${checks} additional assertions; quantities/time/address/provenance/identity/source/share/permissions; synthetic provider only.`,
  );
  return checks;
}
