import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { laDate } from "../../apps/api/src/requests/request-v2-input";
type S = components["schemas"];
type Http = (
  path: string,
  method?: string,
  token?: string,
  status?: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyTeamServices({
  db,
  http,
  auth,
  other,
  noRights,
  owner,
  reader,
  region,
}: {
  db: Client;
  http: Http;
  auth: string;
  other: string;
  noRights: string;
  owner: string;
  reader: string;
  region: string;
}) {
  const call = async <T>(...args: Parameters<Http>) =>
    (await http(...args)) as T;
  const my = "/v1/me/organization",
    put = (body: unknown, key = randomUUID(), token = auth, code = 200) =>
      call<S["OwnTeam"]>(my, "PUT", token, code, body, key);
  const pub = (r: S["RequestDetailV2"], teamVersion: number, code = 200) =>
    call<S["RequestDetailV2"]>(
      `/v1/requests/${r.id}/publish`,
      "POST",
      auth,
      code,
      { expected_version: r.version, expected_team_version: teamVersion },
      randomUUID(),
    );
  const get = (id: string) =>
    call<S["RequestDetailV2"]>(`/v1/requests/${id}`, "GET", other);
  let checks = 0;
  const check = (value: unknown) => {
    assert(value);
    checks++;
  };
  const base = await call<S["OwnTeam"]>(my, "GET", auth);
  check(base.version === 0 && !base.contact_shared);
  await http(my, "GET", "", 401);
  await http(my, "GET", noRights, 404);
  const legacy = (
    await db.query<{ id: string }>(
      `INSERT INTO abasong.requests(publisher_id,organization_id,kind,status,region_id,starts_at,expires_at)
  VALUES($1,$2,'other_help','open',$3,now(),now()+interval '1 hour') RETURNING id`,
      [owner, base.team.id, region],
    )
  ).rows[0]!;
  const legacyName = (await get(legacy.id)).organization?.name;
  const body = {
    expected_version: 0,
    name: "TEST B5 Team",
    carriers: ["GOFO", "SwiftX"],
    region_ids: [region],
    active: true,
    contact_shared: false,
    business_contact: { phone: "+1 202 555 0109", wechat: "TEST-B5-business" },
  };
  await put({ ...body, contact_user_id: reader }, randomUUID(), auth, 400);
  await put(
    { ...body, verification_status: "verified" },
    randomUUID(),
    auth,
    400,
  );
  await put({ ...body, region_ids: [randomUUID()] }, randomUUID(), auth, 400);
  await put({ ...body, carriers: ["GOFO", "gofo"] }, randomUUID(), auth, 400);
  await put(
    {
      ...body,
      contact_shared: true,
      business_contact: { phone: "", wechat: "" },
    },
    randomUUID(),
    auth,
    400,
  );
  const key = randomUUID(),
    created = await put(body, key);
  check(
    created.team.id === base.team.id &&
      created.version === 1 &&
      created.team.carriers.length === 2 &&
      created.team.regions[0]?.id === region,
  );
  check((await put(body, key)).version === 1);
  await put({ ...body, name: "TEST different" }, key, auth, 409);
  await put(body, randomUUID(), auth, 409);
  check((await get(legacy.id)).organization?.name === legacyName);
  const metadata = await call<S["OwnTeamSummary"]>(
    my + "/summary",
    "GET",
    auth,
  );
  check(!("business_contact" in metadata) && !metadata.team.contact_available);
  const driverScope = `/v1/drivers/${owner}/team`;
  check(
    !(await call<S["TeamSummary"]>(driverScope, "GET", other))
      .contact_available,
  );
  await http(driverScope + "/contact", "GET", other, 404);
  const personal = await put(
    { ...body, name: "TEST Other Team" },
    randomUUID(),
    noRights,
  );
  check(personal.team.id !== created.team.id);
  await http(
    "/v1/requests",
    "POST",
    noRights,
    403,
    {
      request_schema_version: 2,
      scenario: "delivery_handoff",
      organization_id: personal.team.id,
    },
    randomUUID(),
  );
  await http(
    "/v1/requests",
    "POST",
    auth,
    403,
    {
      request_schema_version: 2,
      scenario: "delivery_handoff",
      organization_id: personal.team.id,
    },
    randomUUID(),
  );
  const draft = await call<S["RequestDetailV2"]>(
    "/v1/requests",
    "POST",
    auth,
    201,
    {
      request_schema_version: 2,
      scenario: "delivery_handoff",
      task_scope: "partial",
      quantity_mode: "estimate",
      parcel_count: 44,
      handoff_mode: "asap",
      handoff_date: laDate(Date.now()),
      completion_mode: "contact",
      region_id: region,
      pickup_region_id: region,
      carrier: "GOFO",
      route_label: "TEST B5 route",
      price_unit: "per_parcel",
      price_cents: 183,
      sorted_state: "unknown",
      handoff_requirement: "contact_confirm",
      pickup: { kind: "contact_handoff" },
    },
    randomUUID(),
  );
  const path = `/v1/requests/${draft.id}`,
    detail = path + "/team";
  await http(detail, "GET", other, 404);
  const choose = (r: S["RequestDetailV2"], id: string | null, code = 200) =>
    call<S["RequestDetailV2"]>(path, "PATCH", auth, code, {
      request_schema_version: 2,
      expected_version: r.version,
      organization_id: id,
    });
  await choose(draft, personal.team.id, 403);
  let selected = await choose(draft, created.team.id);
  check(
    selected.organization?.id === created.team.id &&
      selected.route_label === draft.route_label &&
      selected.price_cents === draft.price_cents,
  );
  selected = await choose(selected, null);
  check(selected.organization === null);
  selected = await choose(selected, created.team.id);
  const shared = await put({
    ...body,
    expected_version: 1,
    contact_shared: true,
  });
  check(shared.team.contact_available && shared.version === 2);
  await pub(selected, 1, 409);
  const published = await pub(selected, 2);
  check(
    published.organization?.name === body.name && published.status === "open",
  );
  await choose(published, null, 409);
  check((await call<S["TeamSummary"]>(detail, "GET", other)).contact_available);
  await http(detail + "/contact", "GET", "", 401);
  check(
    (await call<S["TeamContact"]>(detail + "/contact", "GET", other))
      .business_contact.wechat === body.business_contact.wechat,
  );
  const leak = (v: unknown) =>
    JSON.stringify(v).includes(body.business_contact.wechat);
  check(!leak(await get(draft.id)));
  check(
    !leak(await http("/v1/requests?request_schema_version=2", "GET", other)),
  );
  check(!leak(await http("/v1/drivers/" + owner, "GET", other)));
  const link = await call<S["RequestShare"]>(
    path + "/share-links",
    "POST",
    auth,
    201,
    { public_preview_confirmed: true },
    randomUUID(),
  );
  const publicPath =
    "/v1/public/request-shares/" +
    new URL(link.public_url).pathname.split("/").at(-1);
  check(!leak(await http(publicPath, "GET", "")));
  const persisted = (
    await db.query(
      "SELECT payload FROM abasong.organization_contacts WHERE organization_id=$1",
      [created.team.id],
    )
  ).rows[0];
  check(!!persisted && !leak(persisted));
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE abasong_sensitive");
    await db.query("SELECT set_config('abasong.actor_id',$1,true)", [reader]);
    check(
      (
        await db.query(
          "SELECT payload FROM abasong.organization_contacts WHERE organization_id=$1",
          [created.team.id],
        )
      ).rowCount === 0,
    );
    check(
      (
        await db.query(
          "UPDATE abasong.organizations SET name='denied' WHERE id=$1",
          [created.team.id],
        )
      ).rowCount === 0,
    );
  } finally {
    await db.query("ROLLBACK");
  }
  for (const [a, b] of [
    [reader, owner],
    [owner, reader],
  ]) {
    await db.query(
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [a, b],
    );
    await http(detail + "/contact", "GET", other, 404);
    await http(driverScope, "GET", other, 404);
    await db.query(
      "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [a, b],
    );
  }
  const renamed = await put({
    ...body,
    expected_version: 2,
    name: "TEST B5 Renamed",
    contact_shared: false,
  });
  check(
    renamed.team.name === "TEST B5 Renamed" &&
      (await get(draft.id)).organization?.name === body.name,
  );
  check((await get(legacy.id)).organization?.name === legacyName);
  check(
    (await call<S["PublicRequestShare"]>(publicPath, "GET", "")).summary
      ?.public_organization_name === body.name,
  );
  check(
    (await call<S["TeamSummary"]>(detail, "GET", other)).name ===
      renamed.team.name,
  );
  await http(detail + "/contact", "GET", other, 404);
  await http(driverScope + "/contact", "GET", other, 404);
  const disabled = await put({
    ...body,
    expected_version: 3,
    name: renamed.team.name,
    active: false,
    business_contact: { phone: "", wechat: "" },
  });
  check(
    !disabled.can_represent &&
      !disabled.business_contact.phone &&
      !leak(await put(body, key)),
  );
  await http(detail, "GET", other, 404);
  await http(detail + "/contact", "GET", other, 404);
  check((await get(draft.id)).organization?.name === body.name);
  await http(
    "/v1/requests",
    "POST",
    auth,
    403,
    {
      request_schema_version: 2,
      scenario: "delivery_handoff",
      organization_id: created.team.id,
    },
    randomUUID(),
  );
  const history = await call<S["RequestVersionPage"]>(
    path + "/versions",
    "GET",
    auth,
  );
  check(JSON.stringify(history).includes(body.name) && !leak(history));
  console.log(
    `PASS: B5-02 DSP teams, opt-in contact, owner/block permissions, draft identity and immutable history (${checks} assertions).`,
  );
  return checks;
}
