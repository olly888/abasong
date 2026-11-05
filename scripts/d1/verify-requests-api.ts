import { verifyPush } from "./verify-push";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, escapeLiteral } from "pg";
import { localTarget } from "../d0/database-target";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    adminUrl = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL),
    sensitive = new URL(runtime);
  assert.equal(adminUrl.username, "postgres");
  assert.equal(adminUrl.pathname, "/abasong_d0");
  assert.equal(runtime.username, "abasong_api_local");
  const name = "abasong_d2_requests_test_" + randomBytes(8).toString("hex"),
    sensitiveRole = "abasong_message_test_" + randomBytes(8).toString("hex"),
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
      capabilities: ["request.publish", "request.apply"],
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
    createdRole = false,
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
    assert.equal(r.headers.get("cache-control"), "no-store");
    const value = await r.json();
    if (r.status !== status)
      console.error(
        "HTTP mismatch",
        method,
        (path.split("?")[0] ?? "").replace(/[0-9a-f-]{36}/gi, ":id"),
        status,
        r.status,
        /^[A-Z_]{1,80}$/.test(value.code ?? "") ? value.code : "unknown",
      );
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
    sensitive.pathname = "/" + name;
    db = new Client({ connectionString: adminUrl.href });
    await db.connect();
    for (const f of readdirSync("database/migrations")
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort())
      await db.query(readFileSync("database/migrations/" + f, "utf8"));
    // CI deliberately has no persistent sensitive-service login. Use the same
    // disposable restricted-role pattern as the library/import HTTP harnesses.
    const sensitivePassword = randomBytes(24).toString("hex");
    await admin.query(
      `CREATE ROLE ${sensitiveRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${escapeLiteral(sensitivePassword)}`,
    );
    createdRole = true;
    await admin.query(`GRANT abasong_sensitive TO ${sensitiveRole}`);
    sensitive.username = sensitiveRole;
    sensitive.password = sensitivePassword;
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
        DATABASE_SENSITIVE_URL: sensitive.href,
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
    // B2: actual transactions, source cards, ownership and version changes.
    const supportDraft = await request(
      "/v1/requests",
      "POST",
      auth,
      201,
      { ...body, parcel_count: 100, minimum_parcels: 25 },
      randomUUID(),
    );
    let support = await request(
      `/v1/requests/${supportDraft.id}/publish`,
      "POST",
      auth,
      200,
      { expected_version: supportDraft.version },
      randomUUID(),
    );
    const arrival = new Date(Date.now() + 15 * 60000).toISOString(),
      applyBody = {
        expected_arrival_at: arrival,
        capacity_parcels: 50,
        observed_request_version: support.version,
      };
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      403,
      applyBody,
      randomUUID(),
    );
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) SELECT u,'request.apply','TEST isolated B2' FROM unnest($1::uuid[]) u",
      [[owner, reader, stranger]],
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      auth,
      400,
      applyBody,
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      400,
      { ...applyBody, applicant_id: stranger },
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      422,
      { ...applyBody, capacity_parcels: 10 },
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      422,
      { ...applyBody, capacity_parcels: 101 },
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      422,
      {
        ...applyBody,
        expected_arrival_at: new Date(Date.now() - 3600000).toISOString(),
      },
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      409,
      { ...applyBody, observed_request_version: 1 },
      randomUUID(),
    );
    // A failed source insert must roll back the application, pair and idempotency row together.
    const eventsBeforeFailure = Number(
      (await db.query("SELECT count(*) AS n FROM abasong.outbox")).rows[0].n,
    );
    await db.query(
      "CREATE FUNCTION abasong.test_source_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST'; END $$; CREATE TRIGGER test_source_failure BEFORE INSERT ON abasong.conversation_sources FOR EACH ROW EXECUTE FUNCTION abasong.test_source_failure()",
    );
    const retryKey = randomUUID();
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      500,
      applyBody,
      retryKey,
    );
    assert.equal(
      (
        await db.query(
          "SELECT (SELECT count(*) FROM abasong.applications)::integer AS apps,(SELECT count(*) FROM abasong.conversations)::integer AS chats,(SELECT count(*) FROM abasong.messages)::integer AS msgs",
        )
      ).rows[0].apps,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM abasong.conversations",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      Number(
        (await db.query("SELECT count(*) AS n FROM abasong.outbox")).rows[0].n,
      ),
      eventsBeforeFailure,
    );
    await db.query(
      "DROP TRIGGER test_source_failure ON abasong.conversation_sources; DROP FUNCTION abasong.test_source_failure()",
    );
    const applications = await Promise.all([
      request(
        `/v1/requests/${support.id}/applications`,
        "POST",
        other,
        201,
        applyBody,
        retryKey,
      ),
      request(
        `/v1/requests/${support.id}/applications`,
        "POST",
        other,
        201,
        applyBody,
        retryKey,
      ),
      request(
        `/v1/requests/${support.id}/applications`,
        "POST",
        other,
        201,
        applyBody,
        randomUUID(),
      ),
    ]);
    const applied = applications[0];
    assert(
      applications.every(
        (x) =>
          x.id === applied.id && x.conversation_id === applied.conversation_id,
      ),
    );
    assert.equal(applied.applicant_profile.display_name, "TEST D2 Driver");
    assert(!("phone" in applied.applicant_profile));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM abasong.application_events WHERE application_id=$1 AND event_type='applied'",
          [applied.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await request(`/v1/requests/${support.id}`)).remaining_parcels,
      100,
    );
    const appsPage = await request(`/v1/requests/${support.id}/applications`);
    assert.equal(appsPage.items[0].id, applied.id);
    await request(`/v1/requests/${support.id}/applications`, "GET", other, 404);
    await request(
      `/v1/requests/${support.id}/applications`,
      "GET",
      noRights,
      404,
    );
    assert.equal(
      (
        await request(
          `/v1/me/applications?request_id=${support.id}`,
          "GET",
          other,
        )
      ).items[0].id,
      applied.id,
    );
    assert.equal(
      (await request("/v1/me/applications", "GET", noRights)).items.length,
      0,
    );
    await request(
      `/v1/me/applications?cursor=${applied.id}`,
      "GET",
      noRights,
      404,
    );
    await request(`/v1/applications/${applied.id}`, "DELETE", auth, 404);
    await request(
      `/v1/applications/${applied.id}/contacted`,
      "PUT",
      other,
      404,
    );
    await Promise.all([
      request(`/v1/applications/${applied.id}/contacted`, "PUT"),
      request(`/v1/applications/${applied.id}/contacted`, "PUT"),
    ]);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM abasong.application_events WHERE application_id=$1 AND event_type='contacted'",
          [applied.id],
        )
      ).rows[0].n,
      1,
    );
    const conversationId = applied.conversation_id;
    const contact = await request(
      "/v1/conversations",
      "POST",
      other,
      201,
      {
        other_user_id: owner,
        source_request_id: support.id,
        source_request_version: support.version,
      },
      randomUUID(),
    );
    assert.equal(contact.id, conversationId);
    assert.equal(
      (
        await request(
          "/v1/conversations",
          "POST",
          auth,
          201,
          {
            other_user_id: reader.toUpperCase(),
            source_request_id: support.id.toUpperCase(),
            source_request_version: support.version,
          },
          randomUUID(),
        )
      ).id,
      conversationId,
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      409,
      { ...applyBody, capacity_parcels: 60 },
      retryKey,
    );
    let cards = await request(
      `/v1/conversations/${conversationId}/messages`,
      "GET",
      other,
    );
    assert.equal(cards.items.length, 1);
    assert.equal(cards.items[0].request_snapshot.price_cents, 185);
    await request(
      `/v1/conversations/${conversationId}/messages`,
      "GET",
      noRights,
      404,
    );
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      noRights,
      404,
      { last_read_sequence: cards.items[0].sequence },
    );
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      other,
      400,
      { last_read_sequence: 9999999 },
    );
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      other,
      200,
      { last_read_sequence: cards.items[0].sequence },
    );
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      other,
      200,
      { last_read_sequence: 0 },
    );
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT last_read_sequence FROM abasong.conversation_reads WHERE conversation_id=$1 AND user_id=$2",
            [conversationId, reader],
          )
        ).rows[0].last_read_sequence,
      ),
      cards.items[0].sequence,
    );
    await request(`/v1/requests/${support.id}/versions`, "GET", noRights, 404);
    assert.equal(
      (await request(`/v1/requests/${support.id}/versions`, "GET", other)).items
        .length,
      1,
    );
    support = await request(`/v1/requests/${support.id}`, "PATCH", auth, 200, {
      expected_version: support.version,
      price_cents: 195,
    });
    cards = await request(
      `/v1/conversations/${conversationId}/messages`,
      "GET",
      other,
    );
    assert.deepEqual(
      cards.items.map(
        (m: { request_snapshot: { price_cents: number } }) =>
          m.request_snapshot.price_cents,
      ),
      [185, 195],
    );
    const cardPage = await request(
      `/v1/conversations/${conversationId}/messages?limit=1`,
      "GET",
      other,
    );
    assert(cardPage.next_cursor);
    assert.equal(
      (
        await request(
          `/v1/conversations/${conversationId}/messages?limit=1&cursor=${cardPage.next_cursor}`,
          "GET",
          other,
        )
      ).items[0].request_snapshot.price_cents,
      195,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM abasong.notifications WHERE user_id=$1 AND kind='request_updated'",
          [reader],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await request(
          `/v1/me/applications?request_id=${support.id}`,
          "GET",
          other,
        )
      ).items[0].observed_request_version,
      applied.observed_request_version,
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      noRights,
      409,
      applyBody,
      randomUUID(),
    );
    await request(`/v1/requests/${support.id}/gap`, "PATCH", other, 404, {
      expected_version: support.version,
      remaining_parcels: 80,
    });
    await request(`/v1/requests/${support.id}/gap`, "PATCH", auth, 400, {
      expected_version: support.version,
      remaining_parcels: 101,
    });
    await request(`/v1/requests/${support.id}`, "PATCH", auth, 409, {
      expected_version: support.version,
      parcel_count: 80,
    });
    const gapVersion = support.version;
    const [firstGap, secondGap] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/v1/requests/${support.id}/gap`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expected_version: gapVersion,
          remaining_parcels: 80,
        }),
      }),
      fetch(`http://127.0.0.1:${port}/v1/requests/${support.id}/gap`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expected_version: gapVersion,
          remaining_parcels: 70,
        }),
      }),
    ]);
    assert.deepEqual([firstGap.status, secondGap.status].sort(), [200, 409]);
    checks += 2;
    support = await request(`/v1/requests/${support.id}`);
    assert([70, 80].includes(support.remaining_parcels));
    await db.query(
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [owner, reader],
    );
    await request(
      "/v1/conversations",
      "POST",
      other,
      404,
      { other_user_id: owner },
      randomUUID(),
    );
    assert.equal(
      (
        await request(
          `/v1/me/applications?request_id=${support.id}`,
          "GET",
          other,
        )
      ).items[0].request_summary,
      null,
    );
    cards = await request(
      `/v1/conversations/${conversationId}/messages`,
      "GET",
      other,
    );
    assert(
      cards.items.every(
        (m: { request_snapshot: unknown }) => m.request_snapshot === null,
      ),
    );
    await request(`/v1/applications/${applied.id}/contacted`, "PUT", auth, 404);
    assert.equal(
      (await request(`/v1/requests/${support.id}/applications`)).items[0]
        .applicant_profile,
      null,
    );
    await db.query(
      "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [owner, reader],
    );
    const beforeCorrection = await request(
      `/v1/requests/${support.id}/versions?limit=1`,
      "GET",
      other,
    );
    assert(beforeCorrection.next_cursor);
    const oldVersions = await request(
      `/v1/requests/${support.id}/versions?limit=1&cursor=${beforeCorrection.next_cursor}`,
      "GET",
      other,
    );
    assert(oldVersions.items[0].version < beforeCorrection.items[0].version);
    await db.query(
      'UPDATE abasong.request_versions SET snapshot=snapshot||\'{"private_meeting_point":"TEST forbidden"}\'::jsonb WHERE request_id=$1',
      [support.id],
    );
    assert(
      (
        await request(`/v1/requests/${support.id}/versions`, "GET", other)
      ).items.every(
        (s: Record<string, unknown>) => !("private_meeting_point" in s),
      ),
    );
    assert(
      (
        await request(
          `/v1/conversations/${conversationId}/messages`,
          "GET",
          other,
        )
      ).items.every(
        (m: { request_snapshot: Record<string, unknown> }) =>
          !("private_meeting_point" in m.request_snapshot),
      ),
    );
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='request.apply'",
      [reader],
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      403,
      { ...applyBody, observed_request_version: support.version },
      randomUUID(),
    );
    await Promise.all([
      request(`/v1/applications/${applied.id}`, "DELETE", other),
      request(`/v1/applications/${applied.id}`, "DELETE", other),
    ]);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM abasong.application_events WHERE application_id=$1 AND event_type='withdrawn'",
          [applied.id],
        )
      ).rows[0].n,
      1,
    );
    await request(`/v1/applications/${applied.id}/contacted`, "PUT", auth, 409);
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL WHERE user_id=$1 AND capability='request.apply'",
      [reader],
    );
    const reapplied = await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      other,
      201,
      { ...applyBody, observed_request_version: support.version },
      randomUUID(),
    );
    assert.equal(reapplied.id, applied.id);
    assert.equal(reapplied.contacted_at, null);
    support = await request(
      `/v1/requests/${support.id}/gap`,
      "PATCH",
      auth,
      200,
      { expected_version: support.version, remaining_parcels: 0 },
    );
    assert.equal(support.status, "open");
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      noRights,
      422,
      { ...applyBody, observed_request_version: support.version },
      randomUUID(),
    );
    support = await request(
      `/v1/requests/${support.id}/close`,
      "POST",
      auth,
      200,
      { expected_version: support.version, status: "found" },
      randomUUID(),
    );
    await request(
      `/v1/requests/${support.id}/applications`,
      "POST",
      noRights,
      409,
      { ...applyBody, observed_request_version: support.version },
      randomUUID(),
    );
    assert(
      (
        await request(
          `/v1/conversations/${conversationId}/messages`,
          "GET",
          other,
        )
      ).items.length > 1,
    );
    support = await request(
      `/v1/requests/${support.id}/reopen`,
      "POST",
      auth,
      200,
      { expected_version: support.version },
      randomUUID(),
    );
    assert.equal(support.remaining_parcels, 100);
    await request(
      `/v1/requests/${support.id}/reopen`,
      "POST",
      auth,
      409,
      { expected_version: support.version },
      randomUUID(),
    );
    await db.query(
      "UPDATE abasong.requests SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' WHERE id=$1",
      [support.id],
    );
    support = await request(`/v1/requests/${support.id}`);
    assert.equal(support.status, "expired");
    support = await request(`/v1/requests/${support.id}`, "PATCH", auth, 200, {
      expected_version: support.version,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(support.status, "expired");
    const reopenKey = randomUUID(),
      reopenVersion = support.version;
    support = await request(
      `/v1/requests/${support.id}/reopen`,
      "POST",
      auth,
      200,
      { expected_version: reopenVersion },
      reopenKey,
    );
    assert.equal(
      (
        await request(
          `/v1/requests/${support.id}/reopen`,
          "POST",
          auth,
          200,
          { expected_version: reopenVersion },
          reopenKey,
        )
      ).version,
      support.version,
    );
    const wholePublished = await request(
      `/v1/requests/${whole.id}/publish`,
      "POST",
      auth,
      200,
      { expected_version: negotiable.version },
      randomUUID(),
    );
    await request(
      `/v1/requests/${whole.id}/applications`,
      "POST",
      noRights,
      422,
      {
        ...applyBody,
        capacity_parcels: 50,
        observed_request_version: wholePublished.version,
      },
      randomUUID(),
    );
    await request(`/v1/requests/${whole.id}/gap`, "PATCH", auth, 400, {
      expected_version: wholePublished.version,
      remaining_parcels: 10,
    });
    const wholeApplication = await request(
      `/v1/requests/${whole.id}/applications`,
      "POST",
      noRights,
      201,
      {
        ...applyBody,
        capacity_parcels: wholePublished.parcel_count,
        observed_request_version: wholePublished.version,
      },
      randomUUID(),
    );
    assert.equal(
      wholeApplication.capacity_parcels,
      wholePublished.parcel_count,
    );
    const otherCard = (
      await request(
        `/v1/conversations/${wholeApplication.conversation_id}/messages`,
        "GET",
        noRights,
      )
    ).items[0];
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      other,
      400,
      { last_read_sequence: otherCard.sequence },
    );
    // B3: synthetic participants only. No SMS, cloud or real-account grants.
    const beforeSummary = await request("/v1/me/inbox-summary", "GET", other);
    const conversationMeta = await request(
      `/v1/conversations/${conversationId}`,
      "GET",
      auth,
    );
    assert.equal(conversationMeta.can_send, true);
    await request(`/v1/conversations/${conversationId}`, "GET", noRights, 404);
    await request("/v1/conversations?limit=101", "GET", auth, 400);
    await request("/v1/conversations?cursor=bad", "GET", auth, 400);
    const sendPath = `/v1/conversations/${conversationId}/messages`;
    const clientMessage = randomUUID(),
      textBody = {
        client_message_id: clientMessage,
        kind: "text",
        text: "TEST B3 encrypted\nmessage",
      };
    const sendKey = randomUUID();
    const accepted = await request(
      sendPath,
      "POST",
      auth,
      201,
      textBody,
      sendKey,
    );
    assert.equal(accepted.text, textBody.text);
    assert.equal(accepted.client_message_id, clientMessage);
    assert.equal(
      (await request(sendPath, "POST", auth, 201, textBody, sendKey)).id,
      accepted.id,
    );
    assert.equal(
      (await request(sendPath, "POST", auth, 201, textBody, randomUUID())).id,
      accepted.id,
    );
    await request(
      sendPath,
      "POST",
      auth,
      409,
      { ...textBody, text: "TEST changed" },
      sendKey,
    );
    await request(
      sendPath,
      "POST",
      auth,
      409,
      { ...textBody, text: "TEST changed" },
      randomUUID(),
    );
    await request(
      sendPath,
      "POST",
      noRights,
      404,
      { ...textBody, client_message_id: randomUUID() },
      randomUUID(),
    );
    for (const body of [
      { ...textBody, text: " " },
      { ...textBody, text: "x".repeat(2001) },
      { ...textBody, sender_id: reader },
      { client_message_id: randomUUID(), kind: "request_card" },
    ])
      await request(sendPath, "POST", auth, 400, body, randomUUID());
    await request(sendPath, "POST", auth, 400, textBody);
    assert.equal(
      (await request("/v1/me/inbox-summary", "GET", other)).unread_messages,
      beforeSummary.unread_messages + 1,
    );
    const inboxBefore = await request("/v1/conversations", "GET", other);
    const listed = inboxBefore.items.find(
      (x: { id: string }) => x.id === conversationId,
    );
    assert(listed);
    assert(!JSON.stringify(listed).includes(textBody.text));
    assert.equal(
      (await request("/v1/me/inbox-summary", "GET", other)).unread_messages,
      beforeSummary.unread_messages + 1,
    );
    assert(
      (await request(`/v1/conversations/${conversationId}`, "GET", auth))
        .other_last_read_sequence < accepted.sequence,
    );
    const stored = (
      await db.query(
        "SELECT s.* FROM abasong.message_secrets s WHERE message_id=$1",
        [accepted.id],
      )
    ).rows[0];
    assert.equal(stored.cipher_version, "local-envelope-v1");
    assert.equal(stored.content_hmac.length, 32);
    assert(!stored.ciphertext.toString().includes(textBody.text));
    const regular = new Client({ connectionString: runtime.href });
    await regular.connect();
    try {
      await assert.rejects(
        regular.query("SELECT * FROM abasong.message_secrets"),
        (e: unknown) => (e as { code: string }).code === "42501",
      );
    } finally {
      await regular.end();
    }
    const latest = await request(
      `${sendPath}?before_sequence=${Number.MAX_SAFE_INTEGER}&limit=2`,
      "GET",
      other,
    );
    assert.equal(latest.items.at(-1).id, accepted.id);
    assert(latest.next_cursor.startsWith("b:"));
    const previous = await request(
      `${sendPath}?cursor=${encodeURIComponent(latest.next_cursor)}&limit=2`,
      "GET",
      other,
    );
    assert(
      previous.items.every(
        (m: { sequence: number }) => m.sequence < latest.items[0].sequence,
      ),
    );
    const concurrentBody = {
        client_message_id: randomUUID(),
        kind: "text",
        text: "TEST concurrent retry",
      },
      concurrentKey = randomUUID();
    const copies = await Promise.all([
      request(sendPath, "POST", auth, 201, concurrentBody, concurrentKey),
      request(sendPath, "POST", auth, 201, concurrentBody, concurrentKey),
    ]);
    assert.equal(copies[0].id, copies[1].id);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM abasong.messages WHERE sender_id=$1 AND client_message_id=$2",
            [owner, concurrentBody.client_message_id],
          )
        ).rows[0].n,
      ),
      1,
    );
    await db.query(
      "UPDATE abasong.idempotency_keys SET expires_at=now()-interval '1 second' WHERE actor_id=$1 AND route='message.send' AND key=$2",
      [owner, concurrentKey],
    );
    assert.equal(
      (
        await request(
          sendPath,
          "POST",
          auth,
          201,
          concurrentBody,
          concurrentKey,
        )
      ).id,
      copies[0].id,
    );
    const incremental = await request(
      `${sendPath}?after_sequence=${accepted.sequence}`,
      "GET",
      other,
    );
    assert.equal(incremental.items.at(-1).id, copies[0].id);
    await request(
      `${sendPath}?before_sequence=100&after_sequence=1`,
      "GET",
      other,
      400,
    );
    await request(
      `${sendPath}?cursor=b:10&after_sequence=1`,
      "GET",
      other,
      400,
    );
    const otherBefore = await request("/v1/me/inbox-summary", "GET", noRights);
    await request(
      `/v1/conversations/${conversationId}/read`,
      "PUT",
      other,
      200,
      { last_read_sequence: copies[0].sequence },
    );
    assert.equal(
      (await request(`/v1/conversations/${conversationId}`, "GET", auth))
        .other_last_read_sequence,
      copies[0].sequence,
    );
    assert.equal(
      (await request(`/v1/conversations/${conversationId}`, "GET", other))
        .unread_count,
      0,
    );
    assert.deepEqual(
      await request("/v1/me/inbox-summary", "GET", noRights),
      otherBefore,
    );
    const corrupted = Buffer.from(stored.auth_tag);
    await db.query(
      "UPDATE abasong.message_secrets SET auth_tag=$2 WHERE message_id=$1",
      [accepted.id, Buffer.alloc(16)],
    );
    await request(
      `${sendPath}?after_sequence=${accepted.sequence - 1}`,
      "GET",
      other,
      503,
    );
    await request("/v1/conversations", "GET", other);
    await request("/v1/me/inbox-summary", "GET", other);
    await db.query(
      "UPDATE abasong.message_secrets SET auth_tag=$2 WHERE message_id=$1",
      [accepted.id, corrupted],
    );
    // A database failure after metadata insertion must roll back message, secret, event and retry reference.
    await db.query(
      "CREATE FUNCTION abasong.test_message_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST only'; END $$; CREATE TRIGGER test_message_failure BEFORE INSERT ON abasong.message_secrets FOR EACH ROW EXECUTE FUNCTION abasong.test_message_failure()",
    );
    const failedBody = {
        client_message_id: randomUUID(),
        kind: "text",
        text: "TEST atomic failure",
      },
      failedKey = randomUUID();
    await request(sendPath, "POST", auth, 500, failedBody, failedKey);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM abasong.messages WHERE client_message_id=$1",
            [failedBody.client_message_id],
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM abasong.idempotency_keys WHERE actor_id=$1 AND route='message.send' AND key=$2",
            [owner, failedKey],
          )
        ).rows[0].n,
      ),
      0,
    );
    await db.query(
      "DROP TRIGGER test_message_failure ON abasong.message_secrets; DROP FUNCTION abasong.test_message_failure()",
    );
    await request(sendPath, "POST", auth, 201, failedBody, failedKey);
    const prefs = { chat_push: false, request_push: false, system_push: false };
    assert.deepEqual(
      await request(
        "/v1/me/notification-preferences",
        "PUT",
        other,
        200,
        prefs,
      ),
      prefs,
    );
    assert.deepEqual(
      await request("/v1/me/notification-preferences", "GET", other),
      prefs,
    );
    await request("/v1/me/notification-preferences", "PUT", other, 400, {
      chat_push: "false",
    });
    const ownNotifications = await request("/v1/me/notifications", "GET", auth);
    assert(ownNotifications.items.length > 0);
    assert(
      ownNotifications.items.every(
        (n: Record<string, unknown>) => !("text" in n) && !("body" in n),
      ),
    );
    const notification = ownNotifications.items[0];
    const noticeCount = await request("/v1/me/inbox-summary", "GET", auth);
    await request("/v1/me/notifications", "GET", auth);
    assert.equal(
      (await request("/v1/me/inbox-summary", "GET", auth)).unread_notifications,
      noticeCount.unread_notifications,
    );
    await request(
      `/v1/me/notifications/${notification.id}/read`,
      "PUT",
      other,
      404,
    );
    await request(`/v1/me/notifications/${notification.id}/read`, "PUT", auth);
    await request(`/v1/me/notifications/${notification.id}/read`, "PUT", auth);
    assert.equal(
      (await request("/v1/me/inbox-summary", "GET", auth)).unread_notifications,
      noticeCount.unread_notifications - Number(!notification.read_at),
    );
    const sourceBody = {
      client_message_id: randomUUID(),
      kind: "request_card",
      source_request_id: support.id,
      source_request_version: support.version,
    };
    const sourceSent = await request(
      sendPath,
      "POST",
      auth,
      201,
      sourceBody,
      randomUUID(),
    );
    assert.equal(sourceSent.request_snapshot.version, support.version);
    assert(sourceSent.request_region_label);
    assert(!("private_meeting_point" in sourceSent.request_snapshot));
    assert.equal(
      (await request(sendPath, "POST", auth, 201, sourceBody, randomUUID())).id,
      sourceSent.id,
    );
    await request(
      sendPath,
      "POST",
      auth,
      409,
      {
        ...sourceBody,
        client_message_id: randomUUID(),
        source_request_version: support.version - 1,
      },
      randomUUID(),
    );
    const conversationPage = await request(
      "/v1/conversations?limit=1",
      "GET",
      auth,
    );
    assert(conversationPage.next_cursor);
    const nextConversation = await request(
      `/v1/conversations?limit=1&cursor=${encodeURIComponent(conversationPage.next_cursor)}`,
      "GET",
      auth,
    );
    assert.notEqual(conversationPage.items[0].id, nextConversation.items[0].id);
    await db.query(
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [reader, owner],
    );
    assert.equal(
      (await request(`/v1/conversations/${conversationId}`, "GET", auth))
        .can_send,
      false,
    );
    await request(
      sendPath,
      "POST",
      auth,
      403,
      { ...failedBody, client_message_id: randomUUID() },
      randomUUID(),
    );
    await request(
      sendPath,
      "POST",
      other,
      403,
      { ...failedBody, client_message_id: randomUUID() },
      randomUUID(),
    );
    const blockedHistory = await request(sendPath, "GET", other);
    assert(
      blockedHistory.items.some((m: { id: string }) => m.id === accepted.id),
    );
    await db.query(
      "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [reader, owner],
    );
    await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
      reader,
    ]);
    assert.equal(
      (await request(`/v1/conversations/${conversationId}`, "GET", auth))
        .can_send,
      false,
    );
    await request(
      sendPath,
      "POST",
      auth,
      403,
      { ...failedBody, client_message_id: randomUUID() },
      randomUUID(),
    );
    await request(sendPath, "GET", other, 403);
    await db.query("UPDATE abasong.users SET status='active' WHERE id=$1", [
      reader,
    ]);
    const pendingEvents = (
      await db.query("SELECT status,payload FROM abasong.outbox")
    ).rows;
    assert(pendingEvents.length > 0);
    assert(
      pendingEvents.every(
        (e) =>
          e.status === "pending" &&
          Object.keys(e.payload).every((k) =>
            ["request_id", "version", "conversation_id"].includes(k),
          ),
      ),
    );
    const workerUrl = localTarget(env.WORKER_DATABASE_URL);
    workerUrl.pathname = `/${name}`;
    await verifyPush({
      db,
      http: request,
      auth,
      other,
      strangerToken: noRights,
      owner,
      reader,
      stranger,
      body,
      workerUrl: workerUrl.href,
      runtimeUrl: runtime.href,
    });
    await db.query(
      "UPDATE abasong.users SET session_invalid_before=now() WHERE id=$1",
      [owner],
    );
    await request("/v1/me/requests", "GET", auth, 401);
    await request(sendPath, "GET", auth, 401);
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
    if (createdRole) {
      assert(/^abasong_message_test_[a-f0-9]{16}$/.test(sensitiveRole));
      await admin.query(`DROP ROLE ${sensitiveRole}`);
    }
    await admin.end();
  }
}
void main().catch((error: unknown) => {
  // Only our own source location: never SQL, credentials, payload or provider error text.
  if (error instanceof Error) {
    const frames = error.stack
      ?.split("\n")
      .filter(
        (line) =>
          line.trim().startsWith("at ") &&
          (line.includes("/scripts/d1/verify-requests-api.ts:") ||
            line.includes("/scripts/d1/verify-meeting-push.ts:")),
      );
    for (const frame of frames ?? []) console.error(frame.trim());
  }
  console.error(
    "Isolated request API verification failed; private details omitted.",
  );
  process.exitCode = 1;
});
