import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
type S = components["schemas"];
type Request = (
  method: string,
  path: string,
  token: string | undefined,
  status: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyContributionManagement(
  db: Client,
  req: Request,
  token: (id: string) => Promise<string>,
  base: string,
  sensitive: string,
) {
  const owners = [randomUUID(), randomUUID(), randomUUID()];
  const [one, two, reader] = await Promise.all(owners.map(token));
  await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
    owners,
  ]);
  await db.query(
    "INSERT INTO abasong.capabilities(user_id,capability,reason) SELECT u,c,'TEST disposable contribution management' FROM unnest($1::uuid[]) u CROSS JOIN unnest(ARRAY['access.read','access.contribute']) c",
    [owners],
  );
  await db.query("INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST First'),($2,'TEST Second')",[owners[0],owners[1]]);
  const source = (
    await db.query(
      "INSERT INTO abasong.data_sources(source_type,provider,license_reference,persistent_use_approved) VALUES('own_field','synthetic','TEST management',true) RETURNING id",
    )
  ).rows[0].id;
  const apartment = (
    await db.query(
      "INSERT INTO abasong.apartments(name,address_line1,city,source_id,point,status) VALUES('TEST Management','100 TEST Management Ave','Los Angeles',$1,'SRID=4326;POINT(-118.25 34.05)'::extensions.geography,'active') RETURNING id",
      [source],
    )
  ).rows[0].id;
  const root = "/v1/me/contributions",
    publicPath = `/v1/apartments/${apartment}/access-records`;
  const call = <T>(
    method: string,
    path: string,
    t: string | undefined,
    status: number,
    b?: unknown,
    k?: string,
  ) => req(method, path, t, status, b, k) as Promise<T>;
  const body = (value: string) => ({
    method: "keypad",
    value,
    scope: { label: "TEST gate" },
    source_attested: true,
  });
  const share = (t: string, value: string) =>
    call<S["ContributionResult"]>(
      "POST",
      publicPath,
      t,
      201,
      body(value),
      randomUUID(),
    );
  const list = (t: string, q = "") =>
    call<S["ContributionSummaryPage"]>("GET", root + q, t, 200);
  const find = async (t: string, rid: string) =>
    (await list(t)).items.find((s) => s.record_id === rid)!;
  const read = () => call<S["AccessList"]>("GET", publicPath, reader!, 200);
  const correction = (s: S["ContributionSummary"], value: string) => ({
    expected_version: s.version,
    value,
    scope: { label: "TEST gate" },
    source_attested: true,
  });
  const old = await share(one!, "TEST-OLD#");
  await share(two!, "TEST-OLD#");
  await share(one!, "TEST-OLD#");
  let a = await find(one!, old.record_id);
  const b = await find(two!, old.record_id);
  assert(a && b && a.id !== b.id);
  assert.equal(a.other_source_count, 1);
  assert.equal((await list(one!)).items.length, 1);
  assert.equal(a.views_count, null);
  assert(!JSON.stringify(a).includes("TEST-OLD#"));
  await call("GET", root, undefined, 401);
  await call("GET", root + "/" + a.id, two!, 404);
  await call("GET", root + "?cursor=" + a.id, two!, 404);
  assert.equal(
    (await call<S["ContributionDetail"]>("GET", root + "/" + a.id, one!, 200))
      .value,
    "TEST-OLD#",
  );
  await call(
    "PUT",
    `/v1/access-records/${old.record_id}/feedback`,
    reader!,
    200,
    { client_event_id: randomUUID(), value: "useful" },
  );
  a = await find(one!, old.record_id);
  assert.equal(a.useful_count, 1);
  const snapshot = (
    await db.query(
      "SELECT r.contributed_at,r.version,s.ciphertext,s.nonce,s.auth_tag FROM abasong.access_records r JOIN abasong.access_secrets s ON s.record_id=r.id WHERE r.id=$1",
      [old.record_id],
    )
  ).rows[0];
  await call(
    "POST",
    root + "/" + a.id + "/corrections",
    two!,
    404,
    correction(a, "TEST-NEW#"),
    randomUUID(),
  );
  await call(
    "POST",
    root + "/" + a.id + "/withdraw",
    two!,
    404,
    { expected_version: a.version },
    randomUUID(),
  );
  await call(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    400,
    { ...correction(a, "TEST-NEW#"), owner_id: owners[1] },
    randomUUID(),
  );
  await call(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    400,
    { ...correction(a, "TEST-NEW#"), source_attested: false },
    randomUUID(),
  );
  await call(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    409,
    correction(a, "TEST-OLD#"),
    randomUUID(),
  );
  const key = randomUUID(),
    payload = correction(a, "TEST-NEW#");
  const changed = await call<S["ContributionChangeResult"]>(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    200,
    payload,
    key,
  );
  assert.equal(changed.operation, "corrected");
  assert.equal(changed.source.status, "corrected");
  assert.equal(changed.applied_version, 2);
  assert.equal(changed.replacement?.status, "active");
  assert.equal(changed.replacement?.useful_count, 0);
  assert.equal(changed.source.useful_count, 1);
  assert.deepEqual(
    (
      await db.query(
        "SELECT r.contributed_at,r.version,s.ciphertext,s.nonce,s.auth_tag FROM abasong.access_records r JOIN abasong.access_secrets s ON s.record_id=r.id WHERE r.id=$1",
        [old.record_id],
      )
    ).rows[0],
    snapshot,
  );
  const remaining=(await read()).items.find(r=>r.id===old.record_id)!;
  assert.equal(remaining.contributor_display_name,'TEST Second');
  assert.equal(remaining.contributed_at,b.occurred_at);
  assert.equal(
    (await call<S["ContributionDetail"]>("GET", root + "/" + a.id, one!, 200))
      .value,
    null,
  );
  const replay = await call<S["ContributionChangeResult"]>(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    200,
    payload,
    key,
  );
  assert.equal(replay.replacement?.id, changed.replacement?.id);
  await call(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    409,
    { ...payload, value: "TEST-DIFFERENT#" },
    key,
  );
  await call(
    "POST",
    root + "/" + a.id + "/withdraw",
    one!,
    409,
    { expected_version: 1 },
    randomUUID(),
  );
  // Last independent source removed: old code hides, but feedback and cipher survive.
  const withdrawn = await call<S["ContributionChangeResult"]>(
    "POST",
    root + "/" + b.id + "/withdraw",
    two!,
    200,
    { expected_version: b.version },
    randomUUID(),
  );
  assert.equal(withdrawn.source.status, "withdrawn");
  assert(!(await read()).items.some((r) => r.id === old.record_id));
  await call(
    "PUT",
    `/v1/access-records/${old.record_id}/feedback`,
    reader!,
    404,
    { client_event_id: randomUUID(), value: "useful" },
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM abasong.access_feedback WHERE record_id=$1",
        [old.record_id],
      )
    ).rows[0].n,
    1,
  );
  // Explicit later re-share; replaying an old correction receipt must not end it again.
  await share(one!, "TEST-OLD#");
  a = await find(one!, old.record_id);
  assert.equal(a.status, "active");
  assert.equal(a.version, 3);
  const oldReceipt = await call<S["ContributionChangeResult"]>(
    "POST",
    root + "/" + a.id + "/corrections",
    one!,
    200,
    payload,
    key,
  );
  assert.equal(oldReceipt.applied_version, 2);
  assert.equal(oldReceipt.source.status, "active");
  assert.equal(oldReceipt.source.version, 3);
  assert.equal(
    (await find(one!, old.record_id)).occurred_at,
    changed.source.occurred_at,
  );
  // Version race: exactly one mutation commits and a failed correction leaves no orphan.
  const raceBody = correction(a, "TEST-RACE#");
  const outcomes = await Promise.all(
    ["corrections", "withdraw"].map(async (op) => {
      const res = await fetch(base + root + "/" + a.id + "/" + op, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + one,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(
          op === "corrections" ? raceBody : { expected_version: a.version },
        ),
        signal: AbortSignal.timeout(10000),
      });
      return {
        status: res.status,
        result: (await res.json()) as S["ContributionChangeResult"],
      };
    }),
  );
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  const winner = outcomes.find((r) => r.status === 200)!.result;
  const raceSources = (await list(one!)).items.filter(
    (s) =>
      s.status === "active" && s.record_id !== changed.replacement!.record_id,
  );
  assert.equal(raceSources.length, winner.operation === "corrected" ? 1 : 0);
  const left = await share(two!, "TEST-LEFT#"),
    right = await share(two!, "TEST-RIGHT#");
  const ls = await find(two!, left.record_id),
    rs = await find(two!, right.record_id);
  const opposite = await Promise.all([
    call<S["ContributionChangeResult"]>(
      "POST",
      root + "/" + ls.id + "/corrections",
      two!,
      200,
      correction(ls, "TEST-RIGHT#"),
      randomUUID(),
    ),
    call<S["ContributionChangeResult"]>(
      "POST",
      root + "/" + rs.id + "/corrections",
      two!,
      200,
      correction(rs, "TEST-LEFT#"),
      randomUUID(),
    ),
  ]);
  assert.equal(opposite.length, 2);
  const paired = (await list(two!)).items.filter((x) =>
    [left.record_id, right.record_id].includes(x.record_id),
  );
  assert.equal(paired.filter((x) => x.status === "active").length, 1);
  // Read/contribute qualifications revoked: owner metadata and withdrawal remain available.
  const current = await find(one!, changed.replacement!.record_id);
  await db.query(
    "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1",
    [owners[0]],
  );
  await call("GET", root + "/" + current.id, one!, 403);
  const summary = await call<S["ContributionSummary"]>(
    "GET",
    root + "/" + current.id + "/summary",
    one!,
    200,
  );
  assert.equal(summary.id, current.id);
  await call("GET", root + "/" + current.id + "/summary", two!, 404);
  await call(
    "POST",
    root + "/" + current.id + "/corrections",
    one!,
    403,
    correction(current, "TEST-DENIED#"),
    randomUUID(),
  );
  const noCaps = await find(one!, current.record_id);
  assert.equal(noCaps.can_correct, false);
  assert.equal(noCaps.can_withdraw_record, true);
  const withdrawKey = randomUUID(),
    withdrawBody = { expected_version: current.version };
  await call(
    "POST",
    root + "/" + current.id + "/withdraw",
    one!,
    200,
    withdrawBody,
    withdrawKey,
  );
  await call(
    "POST",
    root + "/" + current.id + "/withdraw",
    one!,
    200,
    withdrawBody,
    withdrawKey,
  );
  // Pagination uses source identity and does not duplicate repeated contribution events.
  const first = await list(one!, "?limit=1");
  assert(first.next_cursor);
  const second = await list(one!, "?limit=1&cursor=" + first.next_cursor);
  assert.notEqual(second.items[0]?.id, first.items[0]?.id);
  await call("GET", root + "?owner_id=" + owners[1], one!, 400);
  await call(
    "POST",
    root + "/" + current.id + "/withdraw",
    one!,
    400,
    { expected_version: current.version, status: "active" },
    randomUUID(),
  );
  // Actual non-owner RLS write denial, independent of HTTP object checks.
  const c = new Client({ connectionString: sensitive });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('abasong.actor_id',$1,true)", [owners[1]]);
    assert.equal(
      (
        await c.query(
          "UPDATE abasong.access_contribution_sources SET version=version+1 WHERE id=$1",
          [current.id],
        )
      ).rowCount,
      0,
    );
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
  await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
    owners[0],
  ]);
  await call("GET", root, one!, 403);
  await db.query(
    "UPDATE abasong.users SET status='active',session_invalid_before=now() WHERE id=$1",
    [owners[0]],
  );
  await call("GET", root, one!, 401);
  console.log(
    "PASS: real contribution-management HTTP/PG owner isolation, multi-source correction/withdrawal, encrypted history, feedback, pagination, qualifications, race and idempotency replay",
  );
}
