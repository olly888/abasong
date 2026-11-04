import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client } from "pg";
import { localTarget } from "../d0/database-target";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    adminUrl = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL);
  assert.equal(adminUrl.username, "postgres");
  assert.equal(adminUrl.pathname, "/abasong_d0");
  assert.equal(runtime.username, "abasong_api_local");
  const name = "abasong_d2_requests_test_" + randomBytes(8).toString("hex"),
    admin = new Client({ connectionString: adminUrl.href });
  const pair = await generateKeyPair("ES256", { extractable: true }),
    jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "d2-test",
      alg: "ES256",
    };
  const provider = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const issuer = `http://127.0.0.1:${(provider.address() as { port: number }).port}/auth/v1`;
  const issued = Math.floor(Date.now() / 1000) - 60,
    owner = randomUUID(),
    reader = randomUUID(),
    stranger = randomUUID(),
    region = randomUUID(),
    pickup = randomUUID();
  const token = (id: string) =>
    new SignJWT({
      sub: id,
      role: "authenticated",
      capabilities: ["request.publish"],
      iat: issued,
      exp: issued + 3600,
      iss: issuer,
      aud: "authenticated",
    })
      .setProtectedHeader({ alg: "ES256", kid: "d2-test" })
      .sign(pair.privateKey);
  const auth = await token(owner),
    other = await token(reader),
    noRights = await token(stranger);
  let db: Client | undefined,
    api: ChildProcess | undefined,
    created = false,
    port = 0,
    checks = 0;
  async function request(
    path: string,
    method = "GET",
    t: string | undefined = auth,
    status = 200,
    body?: unknown,
    key?: string,
  ) {
    const r = await fetch(`http://127.0.0.1:${port}` + path, {
      method,
      headers: {
        ...(t ? { Authorization: "Bearer " + t } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    assert.equal(
      r.status,
      status,
      `${method} ${path} status (${value.code ?? "ok"})`,
    );
    checks++;
    return value;
  }
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    adminUrl.pathname = "/" + name;
    runtime.pathname = "/" + name;
    db = new Client({ connectionString: adminUrl.href });
    await db.connect();
    for (const f of readdirSync("database/migrations")
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort())
      await db.query(readFileSync("database/migrations/" + f, "utf8"));
    await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
      [owner, reader, stranger],
    ]);
    await db.query(
      "INSERT INTO abasong.profiles(user_id,display_name) SELECT u,'TEST D2 Driver' FROM unnest($1::uuid[]) u",
      [[owner, reader, stranger]],
    );
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'request.publish','TEST isolated D2')",
      [owner],
    );
    await db.query(
      "INSERT INTO abasong.regions(id,label,display_point) VALUES($1,'TEST Pasadena','SRID=4326;POINT(-118.14 34.15)'::extensions.geography),($2,'TEST Industry','SRID=4326;POINT(-117.96 34.01)'::extensions.geography)",
      [region, pickup],
    );
    const free = createServer();
    free.listen(0, "127.0.0.1");
    await once(free, "listening");
    port = (free.address() as { port: number }).port;
    await new Promise<void>((r) => free.close(() => r()));
    api = spawn(process.execPath, ["apps/api/dist/main.js"], {
      stdio: "ignore",
      env: {
        ...process.env,
        ...env,
        NODE_ENV: "test",
        ABASONG_ENV: "test",
        DATA_ENCRYPTION_PROVIDER: "local-development",
        LOCAL_DATA_KEK: randomBytes(32).toString("hex"),
        DATABASE_URL: runtime.href,
        AUTH_ISSUER: issuer,
        AUTH_AUDIENCE: "authenticated",
        AUTH_JWT_ALGORITHM: "ES256",
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        IDEMPOTENCY_RETENTION_SECONDS: "3600",
      },
    });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (api.exitCode !== null) throw new Error("TEST API exited");
      try {
        if ((await fetch(`http://127.0.0.1:${port}/health/ready`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* startup */
      }
      await pause(100);
    }
    assert(ready);
    await request("/v1/requests", "GET", "", 401);
    await request(
      "/v1/requests",
      "POST",
      noRights,
      403,
      { kind: "partial_route" },
      randomUUID(),
    );
    await request(
      "/v1/requests",
      "POST",
      auth,
      400,
      { kind: "partial_route", publisher_id: reader },
      randomUUID(),
    );
    await request("/v1/requests", "POST", auth, 400, { kind: "partial_route" });
    const regions = await request("/v1/regions");
    assert.equal(regions.items.length, 2);
    const key = randomUUID(),
      body = {
        kind: "partial_route",
        region_id: region,
        pickup_region_id: pickup,
        carrier: "TEST Carrier",
        starts_at: new Date(Date.now() - 60000).toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        parcel_count: 150,
        price_cents: 185,
        price_unit: "per_parcel",
        sorted_state: "sorted",
        handoff_requirement: "dsp_approval",
        minimum_parcels: 50,
        private_payment_terms: "TEST private agreement",
      };
    const [draft, duplicate] = await Promise.all([
      request("/v1/requests", "POST", auth, 201, body, key),
      request("/v1/requests", "POST", auth, 201, body, key),
    ]);
    assert.equal(draft.id, duplicate.id);
    assert.equal(draft.pickup_area, "TEST Industry");
    await request(
      "/v1/requests",
      "POST",
      auth,
      409,
      { ...body, parcel_count: 160 },
      key,
    );
    await request(`/v1/requests/${draft.id}`, "GET", other, 404);
    assert.equal((await request("/v1/requests", "GET", other)).items.length, 0);
    await request(`/v1/requests/${draft.id}`, "PATCH", other, 403, {
      expected_version: 1,
      parcel_count: 100,
    });
    await request(`/v1/requests/${draft.id}`, "PATCH", auth, 409, {
      expected_version: 99,
      parcel_count: 100,
    });
    await request(`/v1/requests/${draft.id}`, "PATCH", auth, 400, {
      expected_version: 1,
      kind: "whole_route",
    });
    const updated = await request(
      `/v1/requests/${draft.id}`,
      "PATCH",
      auth,
      200,
      { expected_version: 1, description: "TEST urgent support" },
    );
    await request(
      `/v1/requests/${draft.id}/publish`,
      "POST",
      auth,
      409,
      { expected_version: 1 },
      randomUUID(),
    );
    const publishKey = randomUUID(),
      published = await request(
        `/v1/requests/${draft.id}/publish`,
        "POST",
        auth,
        200,
        { expected_version: updated.version },
        publishKey,
      );
    assert.equal(published.status, "open");
    assert.equal(published.remaining_parcels, 150);
    assert.equal(
      (
        await request(
          `/v1/requests/${draft.id}/publish`,
          "POST",
          auth,
          200,
          { expected_version: updated.version },
          publishKey,
        )
      ).version,
      published.version,
    );
    assert.equal(
      (await request("/v1/requests", "GET", other)).items[0].id,
      draft.id,
    );
    assert.equal(
      (await request("/v1/requests?carrier=test%20carrier", "GET", other)).items
        .length,
      1,
    );
    assert.equal(
      (await request("/v1/requests?query=TEST%25", "GET", other)).items.length,
      0,
    );
    const details = await request(`/v1/requests/${draft.id}`, "GET", other);
    assert.equal(details.price_cents, 185);
    assert(!("ciphertext" in details));
    assert(!("point" in details));
    await request(`/v1/requests/${draft.id}`, "DELETE", auth, 409);
    await db.query(
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [reader, owner],
    );
    await request(`/v1/requests/${draft.id}`, "GET", other, 404);
    assert.equal((await request("/v1/requests", "GET", other)).items.length, 0);
    await db.query(
      "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [reader, owner],
    );
    await request(
      `/v1/requests/${draft.id}/close`,
      "POST",
      other,
      404,
      { expected_version: published.version, status: "closed" },
      randomUUID(),
    );
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1",
      [owner],
    );
    await request(
      "/v1/requests",
      "POST",
      auth,
      403,
      { kind: "other_help" },
      randomUUID(),
    );
    // Publishers can close existing needs even after publish eligibility ends.
    const closeKey = randomUUID(),
      closed = await request(
        `/v1/requests/${draft.id}/close`,
        "POST",
        auth,
        200,
        { expected_version: published.version, status: "found" },
        closeKey,
      );
    assert.equal(closed.status, "found");
    assert.equal(
      (
        await request(
          `/v1/requests/${draft.id}/close`,
          "POST",
          auth,
          200,
          { expected_version: published.version, status: "found" },
          closeKey,
        )
      ).version,
      closed.version,
    );
    assert.equal((await request("/v1/requests", "GET", other)).items.length, 0);
    assert.equal(
      (await request(`/v1/requests/${draft.id}`, "GET", other)).status,
      "found",
    );
    assert.equal(
      (await request("/v1/me/requests", "GET", other)).items.length,
      0,
    );
    assert.equal((await request("/v1/me/requests")).items.length, 1);
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL WHERE user_id=$1",
      [owner],
    );
    const help = await request(
      "/v1/requests",
      "POST",
      auth,
      201,
      {
        kind: "vehicle_help",
        region_id: region,
        starts_at: body.starts_at,
        expires_at: body.expires_at,
      },
      randomUUID(),
    );
    await request(
      `/v1/requests/${help.id}/publish`,
      "POST",
      auth,
      422,
      { expected_version: 1 },
      randomUUID(),
    );
    const helpDraft = await request(
      `/v1/requests/${help.id}`,
      "PATCH",
      auth,
      200,
      { expected_version: 1, description: "TEST flat tire" },
    );
    await request(
      `/v1/requests/${help.id}/publish`,
      "POST",
      auth,
      200,
      { expected_version: helpDraft.version },
      randomUUID(),
    );
    await db.query(
      "UPDATE abasong.requests SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",
      [help.id],
    );
    assert.equal((await request(`/v1/requests/${help.id}`)).status, "expired");
    assert.equal((await request("/v1/requests", "GET", other)).items.length, 0);
    const discard = await request(
      "/v1/requests",
      "POST",
      auth,
      201,
      { kind: "other_help" },
      randomUUID(),
    );
    await request(`/v1/requests/${discard.id}`, "DELETE");
    await request(`/v1/requests/${discard.id}`, "GET", auth, 404);
    const foreignOrg = randomUUID();
    await db.query(
      "INSERT INTO abasong.organizations(id,name,contact_user_id) VALUES($1,'TEST other DSP',$2)",
      [foreignOrg, reader],
    );
    await request(
      "/v1/requests",
      "POST",
      auth,
      403,
      { kind: "other_help", organization_id: foreignOrg },
      randomUUID(),
    );
    const { price_cents: _price, ...unpriced } = body;
    void _price;
    const quote = await request(
      "/v1/requests",
      "POST",
      auth,
      201,
      unpriced,
      randomUUID(),
    );
    assert.equal(quote.price_cents, null);
    await request(
      `/v1/requests/${quote.id}/publish`,
      "POST",
      auth,
      422,
      { expected_version: quote.version },
      randomUUID(),
    );
    await assert.rejects(
      db.query("UPDATE abasong.requests SET status='open' WHERE id=$1", [
        quote.id,
      ]),
      (e: { code: string }) => e.code === "23514",
    );
    const cleared = await request(
      `/v1/requests/${quote.id}`,
      "PATCH",
      auth,
      200,
      {
        expected_version: quote.version,
        parcel_count: null,
        minimum_parcels: null,
        price_cents: null,
        pickup_deadline_at: null,
      },
    );
    assert.equal(cleared.parcel_count, null);
    assert.equal(cleared.price_cents, null);
    const firstPage = await request("/v1/me/requests?limit=1");
    assert.equal(firstPage.items[0].id, quote.id);
    const nextPage = await request(
      "/v1/me/requests?limit=1&cursor=" + firstPage.next_cursor,
    );
    assert.notEqual(nextPage.items[0].id, quote.id);
    await request("/v1/requests?cursor=not-a-uuid", "GET", other, 400);
    const whole = await request(
      "/v1/requests",
      "POST",
      auth,
      201,
      {
        ...body,
        kind: "whole_route",
        accepts_partial: true,
        minimum_parcels: 10,
      },
      randomUUID(),
    );
    assert.equal(whole.accepts_partial, false);
    assert.equal(whole.minimum_parcels, whole.parcel_count);
    const negotiable = await request(
      `/v1/requests/${whole.id}`,
      "PATCH",
      auth,
      200,
      { expected_version: whole.version, price_unit: "negotiable" },
    );
    assert.equal(negotiable.price_cents, null);
    await db.query(
      "UPDATE abasong.users SET session_invalid_before=now() WHERE id=$1",
      [owner],
    );
    await request("/v1/me/requests", "GET", auth, 401);
    const versions = (
      await db.query(
        "SELECT snapshot FROM abasong.request_versions WHERE request_id=$1 ORDER BY version",
        [draft.id],
      )
    ).rows;
    assert.equal(versions.length, 2);
    assert(
      !versions.some((v) => "publisher" in v.snapshot || "point" in v.snapshot),
    );
    console.log(
      `PASS: requests ${checks} actual HTTP/DB checks; concurrent idempotency, ownership, expiry, blocks, safe snapshots and revoked-session/capability boundaries. No SMS/cloud or real-account grant.`,
    );
  } finally {
    if (api && api.exitCode === null) {
      api.kill("SIGTERM");
      await once(api, "exit");
    }
    await new Promise<void>((r) => provider.close(() => r()));
    await db?.end();
    if (created) {
      assert(/^abasong_d2_requests_test_[a-f0-9]{16}$/.test(name));
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.end();
  }
}
void main().catch(() => {
  console.error(
    "Isolated request API verification failed; private details omitted.",
  );
  process.exitCode = 1;
});
