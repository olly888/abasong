import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, escapeLiteral } from "pg";
import { localTarget } from "../d0/database-target";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    admin = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL);
  assert.equal(admin.username, "postgres");
  assert.equal(runtime.username, "abasong_api_local");
  const suffix = randomBytes(8).toString("hex"),
    name = `abasong_d1_library_test_${suffix}`,
    role = `abasong_d1_secret_${suffix}`;
  const bootstrap = new Client({ connectionString: admin.href });
  await bootstrap.connect();
  let db: Client | undefined,
    api: ChildProcess | undefined,
    created = false,
    createdRole = false,
    checks = 0;
  const pair = await generateKeyPair("ES256", { extractable: true }),
    jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "library-test",
      alg: "ES256",
      use: "sig",
    };
  const jwks = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  jwks.listen(0, "127.0.0.1");
  await once(jwks, "listening");
  const issuer = `http://127.0.0.1:${(jwks.address() as { port: number }).port}/auth/v1`;
  const actor = randomUUID(),
    other = randomUUID(),
    aid = randomUUID(),
    issued = Math.floor(Date.now() / 1000) - 60;
  const token = (sub: string) =>
    new SignJWT({
      role: "authenticated",
      sub,
      iat: issued,
      exp: issued + 3600,
      iss: issuer,
      aud: "authenticated",
      capabilities: ["access.contribute", "access.read"],
    })
      .setProtectedHeader({ alg: "ES256", kid: "library-test" })
      .sign(pair.privateKey);
  let base = "";
  async function req(
    method: string,
    path: string,
    auth: string | undefined,
    status: number,
    body?: unknown,
    key?: string,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const out = await response.json();
    if (response.status !== status)
      console.error(
        `HTTP check ${checks + 1}: expected ${status}, received ${response.status}`,
      );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (status >= 400)
      assert.deepEqual(Object.keys(out).sort(), [
        "code",
        "message",
        "request_id",
      ]);
    checks++;
    return out;
  }
  try {
    await bootstrap.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    admin.pathname = `/${name}`;
    runtime.pathname = `/${name}`;
    db = new Client({ connectionString: admin.href });
    await db.connect();
    for (const file of [
      "0001_v12_initial.sql",
      "0002_personal_apartments.sql",
      "0003_apartment_buildings.sql",
    ])
      await db.query(readFileSync(`database/migrations/${file}`, "utf8"));
    const password = randomBytes(24).toString("hex");
    await bootstrap.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${escapeLiteral(password)}`,
    );
    createdRole = true;
    await bootstrap.query(`GRANT abasong_sensitive TO ${role}`);
    const sensitive = new URL(runtime);
    sensitive.username = role;
    sensitive.password = password;
    await db.query("INSERT INTO abasong.users(id) VALUES($1),($2)", [
      actor,
      other,
    ]);
    const source = randomUUID();
    await db.query(
      "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic','isolated test',true)",
      [source],
    );
    await db.query(
      "INSERT INTO abasong.apartments(id,name,address_line1,city,source_id,point,status) VALUES($1,'Synthetic Apartment','Example street','Los Angeles',$2,'SRID=4326;POINT(-118.25 34.05)'::extensions.geography,'active')",
      [aid, source],
    );
    const portServer = createServer();
    portServer.listen(0, "127.0.0.1");
    await once(portServer, "listening");
    const port = (portServer.address() as { port: number }).port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    base = `http://127.0.0.1:${port}`;
    api = spawn(process.execPath, ["apps/api/dist/main.js"], {
      stdio: "ignore",
      env: {
        ...process.env,
        ...env,
        NODE_ENV: "test",
        DATABASE_URL: runtime.href,
        DATABASE_SENSITIVE_URL: sensitive.href,
        DATA_ENCRYPTION_PROVIDER: "local-development",
        LOCAL_DATA_KEK: randomBytes(32).toString("hex"),
        AUTH_ISSUER: issuer,
        AUTH_AUDIENCE: "authenticated",
        AUTH_JWT_ALGORITHM: "ES256",
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        IDEMPOTENCY_RETENTION_SECONDS: "3600",
      },
    });
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + "/health/live")).ok) break;
      } catch {
        /* test service starting */
      }
      await pause(100);
    }
    const a = await token(actor),
      b = await token(other),
      root = "/v1/me/apartment-library";
    const resolvePath = "/v1/apartments/resolve";
    const fix = {
      point: { lng: -118.25, lat: 34.05 },
      observed_at: new Date().toISOString(),
      accuracy_m: 10,
      accuracy_permission: "precise",
    };
    await req("POST", resolvePath, undefined, 401, fix);
    await req("POST", resolvePath, a, 503, fix);
    await req("POST", resolvePath, a, 400, {
      ...fix,
      point: { lng: 181, lat: 0 },
    });
    await req("POST", resolvePath, a, 400, { ...fix, accuracy_m: -1 });
    await req("POST", resolvePath, a, 400, { ...fix, observed_at: "invalid" });
    await req("POST", resolvePath + "?point=hidden", a, 400, fix);
    await req("POST", resolvePath, a, 400, { ...fix, owner_id: other });
    await db.query(
      `INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(1,$1,now())`,
      [
        JSON.stringify({
          apartment_resolve: {
            radius_m: 100,
            max_age_seconds: 120,
            future_tolerance_seconds: 15,
            max_accuracy_m: 100,
          },
        }),
      ],
    );
    const nearby = await req("POST", resolvePath, a, 200, fix);
    assert.equal(nearby.status, "candidates");
    assert.equal(nearby.matched_id, null);
    assert.deepEqual(
      nearby.candidates.map((p: { id: string }) => p.id),
      [aid],
    );
    assert.deepEqual(
      Object.keys(nearby.candidates[0]).sort(),
      [
        "id",
        "name",
        "address_line1",
        "city",
        "state",
        "postal_code",
        "confidence",
        "point",
      ].sort(),
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...fix,
          accuracy_permission: "approximate",
        })
      ).status,
      "candidates",
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, { ...fix, accuracy_m: 101 }))
        .status,
      "unknown",
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...fix,
          observed_at: new Date(Date.now() - 180000).toISOString(),
        })
      ).status,
      "stale_location",
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...fix,
          observed_at: new Date(Date.now() + 60000).toISOString(),
        })
      ).status,
      "stale_location",
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...fix,
          point: { lng: 0, lat: 0 },
        })
      ).status,
      "unknown",
    );
    const second = randomUUID();
    await db.query(
      "INSERT INTO abasong.apartments(id,address_line1,city,source_id,point,status) VALUES($1,'Second synthetic','Los Angeles',$2,'SRID=4326;POINT(-118.2501 34.05)'::extensions.geography,'active')",
      [second, source],
    );
    const multiple = await req("POST", resolvePath, a, 200, fix);
    assert.deepEqual(
      multiple.candidates.map((p: { id: string }) => p.id),
      [aid, second],
    );
    assert.equal(multiple.matched_id, null);
    await db.query(
      "UPDATE abasong.apartments SET status='pending' WHERE id=$1",
      [second],
    );
    assert.deepEqual(
      (await req("POST", resolvePath, a, 200, fix)).candidates.map(
        (p: { id: string }) => p.id,
      ),
      [aid],
    );
    // Spatial evidence is synthetic, disposable and never enables persistent D0 auto-match.
    await db.query(
      "UPDATE abasong.apartments SET confidence='field_verified', boundary=extensions.ST_Multi(extensions.ST_GeomFromText('POLYGON((-118.251 34.049,-118.249 34.049,-118.249 34.051,-118.251 34.051,-118.251 34.049))',4326)) WHERE id=$1",
      [aid],
    );
    const spatialFix = { ...fix, observed_at: new Date().toISOString() };
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.data_sources SET verified_at=now() WHERE id=$1",
      [source],
    );
    await db.query(
      `UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve,auto_match}',$1::jsonb) WHERE version=1`,
      [
        JSON.stringify({
          enabled: true,
          evidence_ref: "SYNTHETIC-TEST-ONLY",
          max_accuracy_m: 20,
        }),
      ],
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      aid,
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...spatialFix,
          accuracy_permission: "approximate",
        })
      ).matched_id,
      null,
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...spatialFix,
          accuracy_m: 21,
        })
      ).matched_id,
      null,
    );
    assert.equal(
      (
        await req("POST", resolvePath, a, 200, {
          ...spatialFix,
          point: { lng: -118.24901, lat: 34.05 },
        })
      ).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.apartments SET status='active',confidence='unverified',boundary=(SELECT boundary FROM abasong.apartments WHERE id=$1) WHERE id=$2",
      [aid, second],
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.apartments SET status='pending',boundary=NULL WHERE id=$1",
      [second],
    );
    // A competing building need only touch the uncertainty disk to veto a
    // match; requiring full disk containment on both buildings misses this case.
    await db.query(
      "UPDATE abasong.apartments SET status='active',confidence='unverified',boundary=extensions.ST_Multi(extensions.ST_MakeEnvelope(-118.24996,34.04999,-118.2498,34.05001,4326)) WHERE id=$1",
      [second],
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    // Missing geometry is not permission to ignore an address point lying
    // inside the device's uncertainty radius either.
    await db.query(
      "UPDATE abasong.apartments SET boundary=NULL,point='SRID=4326;POINT(-118.24996 34.05)'::extensions.geography WHERE id=$1",
      [second],
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve,radius_m}','1'::jsonb) WHERE version=1",
    );
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve,radius_m}','150'::jsonb) WHERE version=1",
    );
    await db.query(
      "UPDATE abasong.apartments SET status='pending',point='SRID=4326;POINT(-118.2501 34.05)'::extensions.geography WHERE id=$1",
      [second],
    );
    const mapPath = `/v1/apartments/${aid}/map-context`;
    await req("GET", mapPath, undefined, 401);
    await req("GET", mapPath + "?extra=1", a, 400);
    await req("GET", `/v1/apartments/${randomUUID()}/map-context`, a, 404);
    assert.deepEqual((await req("GET", mapPath, a, 200)).buildings, []);
    const building = randomUUID();
    await db.query(
      `INSERT INTO abasong.apartment_buildings(id,apartment_id,source_id,footprint,label_point,street_number,verified_at)
      SELECT $1,id,source_id,boundary,point::extensions.geometry,'TEST',now() FROM abasong.apartments WHERE id=$2`,
      [building, aid],
    );
    const map = await req("GET", mapPath, a, 200);
    assert.equal(map.buildings[0].street_number, "TEST");
    assert.deepEqual(Object.keys(map).sort(), ["apartment_id", "buildings"]);
    assert.deepEqual(Object.keys(map.buildings[0]).sort(), [
      "geometry",
      "id",
      "label_point",
      "street_number",
      "verified_at",
    ]);
    await db.query(
      "UPDATE abasong.data_sources SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [source],
    );
    assert.deepEqual((await req("GET", mapPath, a, 200)).buildings, []);
    assert.equal(
      (await req("POST", resolvePath, a, 200, spatialFix)).matched_id,
      null,
    );
    await db.query(
      "UPDATE abasong.data_sources SET expires_at=NULL WHERE id=$1",
      [source],
    );
    await db.query(
      "UPDATE abasong.apartments SET status='pending' WHERE id=$1",
      [aid],
    );
    await req("GET", mapPath, a, 404);
    await db.query(
      "UPDATE abasong.apartments SET status='active',boundary=NULL,confidence='unverified' WHERE id=$1",
      [aid],
    );
    // API/service roles can read map metadata, never create their own verified association.
    const mappingClient = new Client({ connectionString: runtime.href });
    await mappingClient.connect();
    try {
      await assert.rejects(
        mappingClient.query(
          "UPDATE abasong.apartment_buildings SET street_number='spoof' WHERE id=$1",
          [building],
        ),
        /permission denied/,
      );
      checks++;
    } finally {
      await mappingClient.end();
    }
    await db.query("DELETE FROM abasong.apartment_buildings WHERE id=$1", [
      building,
    ]);
    await db.query("DELETE FROM abasong.apartments WHERE id=$1", [second]);
    await db.query("DELETE FROM abasong.config_versions WHERE version=1");
    await req("GET", root, undefined, 401);
    await req("GET", root, a, 200);
    await req(
      "POST",
      root,
      a,
      400,
      { address: "Example", owner_id: other },
      randomUUID(),
    );
    await req(
      "POST",
      root,
      a,
      400,
      { address: "Example", apartment_id: aid },
      randomUUID(),
    );
    await req("POST", root, a, 400, { address: "Example" });
    const k = randomUUID(),
      entry = await req("POST", root, a, 201, { apartment_id: aid }, k);
    assert.equal(
      (await req("POST", root, a, 201, { apartment_id: aid }, k)).id,
      entry.id,
    );
    await req("POST", root, a, 409, { address: "Changed" }, k);
    assert.deepEqual(
      (
        await req("GET", `${root}?apartment_id=${aid}&limit=1`, a, 200)
      ).items.map((x: { id: string }) => x.id),
      [entry.id],
    );
    assert.equal(
      (await req("GET", `${root}?apartment_id=${aid}`, b, 200)).items.length,
      0,
    );
    assert.equal(
      (await req("GET", `${root}?apartment_id=${randomUUID()}`, a, 200)).items
        .length,
      0,
    );
    await req("GET", `${root}?apartment_id=invalid`, a, 400);

    await req("GET", `${root}/${entry.id}`, b, 404);
    await req(
      "PATCH",
      `${root}/${entry.id}`,
      b,
      404,
      { expected_version: 1, region: "Other" },
      randomUUID(),
    );
    await req("DELETE", `${root}/${entry.id}`, b, 404);
    const body = {
        value: randomBytes(8).toString("hex"),
        scope_label: "side gate",
        note: randomBytes(8).toString("hex"),
      },
      rk = randomUUID();
    const record = await req(
      "POST",
      `${root}/${entry.id}/records`,
      a,
      201,
      body,
      rk,
    );
    assert.equal(
      (await req("POST", `${root}/${entry.id}/records`, a, 201, body, rk)).id,
      record.id,
    );
    assert.equal(
      (
        await req(
          "POST",
          `${root}/${entry.id}/records`,
          a,
          201,
          body,
          randomUUID(),
        )
      ).id,
      record.id,
    );
    await req(
      "POST",
      `${root}/${entry.id}/records`,
      b,
      404,
      body,
      randomUUID(),
    );
    const priv = `/v1/me/private-access-records/${record.id}`;
    await req(
      "PATCH",
      priv,
      b,
      404,
      { ...body, expected_version: 1 },
      randomUUID(),
    );
    await req("DELETE", priv, b, 404);
    await req(
      "POST",
      priv + "/share",
      a,
      403,
      { expected_version: 1, source_attested: true },
      randomUUID(),
    ); // JWT claim is never authority.
    const detail = await req("GET", `${root}/${entry.id}`, a, 200);
    assert.equal(detail.records[0].value, body.value);
    const raw = (
      await db.query(
        "SELECT payload FROM abasong.personal_access_records WHERE id=$1",
        [record.id],
      )
    ).rows[0].payload;
    assert(!JSON.stringify(raw).includes(body.value));
    assert(!JSON.stringify(raw).includes(body.note));
    checks += 2;
    await db.query(
      "UPDATE abasong.personal_access_records SET version=version+1 WHERE id=$1",
      [record.id],
    );
    await req("GET", `${root}/${entry.id}`, a, 503);
    await db.query(
      "UPDATE abasong.personal_access_records SET version=version-1 WHERE id=$1",
      [record.id],
    );
    const cap = randomUUID();
    await db.query(
      "INSERT INTO abasong.capabilities(id,user_id,capability,reason) VALUES($1,$2,'access.contribute','synthetic test')",
      [cap, actor],
    );
    const sk = randomUUID(),
      shared = await req(
        "POST",
        priv + "/share",
        a,
        201,
        { expected_version: 1, source_attested: true },
        sk,
      );
    assert.equal(shared.outcome, "created_pending");
    assert.deepEqual(
      await req(
        "POST",
        priv + "/share",
        a,
        201,
        { expected_version: 1, source_attested: true },
        sk,
      ),
      shared,
    );
    assert.equal(
      (
        await req(
          "POST",
          priv + "/share",
          a,
          201,
          { expected_version: 1, source_attested: true },
          randomUUID(),
        )
      ).outcome,
      "same_value_validation",
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM abasong.access_feedback"))
        .rows[0].n,
      0,
    );
    checks++;
    await req("GET", `/v1/apartments/${aid}/access-records`, a, 403);
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.read','synthetic test')",
      [actor],
    );
    await req("GET", `/v1/apartments/${aid}/access-records`, a, 503);
    await db.query(
      `INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(1,'{"feedback_window_days":7}',now())`,
    );
    assert.equal(
      (await req("GET", `/v1/apartments/${aid}/access-records`, a, 200)).items
        .length,
      0,
    );
    await db.query(
      "UPDATE abasong.access_records SET status='active' WHERE id=$1",
      [shared.record_id],
    );
    assert.equal(
      (await req("GET", `/v1/apartments/${aid}/access-records`, a, 200))
        .items[0].value,
      body.value,
    );
    const fb = { client_event_id: randomUUID(), value: "useful" };
    const event = await req(
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      a,
      200,
      fb,
    );
    assert.deepEqual(
      await req(
        "PUT",
        `/v1/access-records/${shared.record_id}/feedback`,
        a,
        200,
        fb,
      ),
      event,
    );
    await req(
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      a,
      409,
      { ...fb, value: "not_useful" },
    );
    assert.equal(
      (await req("GET", `/v1/apartments/${aid}/access-records`, a, 200))
        .items[0].effective_useful,
      true,
    );
    await req(
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      a,
      200,
      { client_event_id: randomUUID(), value: "withdrawn" },
    );
    assert.equal(
      (await req("GET", `/v1/apartments/${aid}/access-records`, a, 200))
        .items[0].effective_useful,
      false,
    );
    await db.query(
      "UPDATE abasong.access_records SET status='withdrawn' WHERE id=$1",
      [shared.record_id],
    );
    assert.equal(
      (await req("GET", `/v1/apartments/${aid}/access-records`, a, 200)).items
        .length,
      0,
    );
    await req(
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      a,
      404,
      { client_event_id: randomUUID(), value: "useful" },
    );
    await db.query(
      "UPDATE abasong.access_records SET status='active' WHERE id=$1",
      [shared.record_id],
    );

    const changed = {
      ...body,
      value: randomBytes(8).toString("hex"),
      expected_version: 1,
    };
    await req("PATCH", priv, a, 200, changed, randomUUID());
    await req("PATCH", priv, a, 409, changed, randomUUID());
    await req(
      "POST",
      priv + "/share",
      a,
      409,
      { expected_version: 1, source_attested: true },
      randomUUID(),
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM abasong.access_records"))
        .rows[0].n,
      1,
    );
    checks++;
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE id=$1",
      [cap],
    );
    await req(
      "POST",
      priv + "/share",
      a,
      403,
      { expected_version: 2, source_attested: true },
      randomUUID(),
    );
    await req("GET", `${root}/${entry.id}`, a, 200);
    const off = await req(
      "PATCH",
      `${root}/${entry.id}`,
      a,
      200,
      { expected_version: 1, favorite: false },
      randomUUID(),
    );
    assert.equal(off.favorite, false);
    const detailAfterOff = await req("GET", `${root}/${entry.id}`, a, 200);
    assert.equal(detailAfterOff.records.length, 1);
    assert.equal(
      (await req("GET", `${root}?apartment_id=${aid}`, a, 200)).items[0]
        .favorite,
      false,
    );
    const on = await req(
      "PATCH",
      `${root}/${entry.id}`,
      a,
      200,
      { expected_version: off.version, favorite: true },
      randomUUID(),
    );
    assert.equal(on.favorite, true);

    const unknown = await req(
      "POST",
      root,
      a,
      201,
      { address: "Unknown private address", name: "Private apartment" },
      randomUUID(),
    );
    const ur = await req(
      "POST",
      `${root}/${unknown.id}/records`,
      a,
      201,
      body,
      randomUUID(),
    );
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL WHERE id=$1",
      [cap],
    );
    await req(
      "POST",
      `/v1/me/private-access-records/${ur.id}/share`,
      a,
      422,
      { expected_version: 1, source_attested: true },
      randomUUID(),
    );
    await req("GET", root + "?actor_id=" + other, a, 400);
    await req("GET", root + "?limit=10000", a, 400);
    await req(
      "PATCH",
      `${root}/${entry.id}`,
      a,
      200,
      { expected_version: on.version, region: "Local region", favorite: false },
      randomUUID(),
    );
    await req(
      "PATCH",
      `${root}/${entry.id}`,
      a,
      409,
      { expected_version: 1, region: "stale" },
      randomUUID(),
    );
    const apiDb = new Client({ connectionString: runtime.href });
    await apiDb.connect();
    try {
      await assert.rejects(
        apiDb.query("SELECT * FROM abasong.personal_access_records"),
        (e) => (e as { code: string }).code === "42501",
      );
      checks++;
    } finally {
      await apiDb.end();
    }
    const secretDb = new Client({ connectionString: sensitive.href });
    await secretDb.connect();
    try {
      assert.equal(
        (
          await secretDb.query(
            "SELECT count(*)::int n FROM abasong.personal_access_records",
          )
        ).rows[0].n,
        0,
      );
      await secretDb.query("BEGIN");
      await secretDb.query("SELECT set_config('abasong.actor_id',$1,true)", [
        other,
      ]);
      assert.equal(
        (
          await secretDb.query(
            "SELECT count(*)::int n FROM abasong.personal_access_records",
          )
        ).rows[0].n,
        0,
      );
      await secretDb.query("ROLLBACK");
      checks += 2;
    } finally {
      await secretDb.end();
    }
    await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
      actor,
    ]);
    await req("GET", root, a, 403);
    await db.query(
      "UPDATE abasong.users SET status='active',session_invalid_before=now() WHERE id=$1",
      [actor],
    );
    await req("GET", root, a, 401);
    await db.query(
      "UPDATE abasong.users SET session_invalid_before=NULL WHERE id=$1",
      [actor],
    );
    await req("DELETE", `${root}/${entry.id}`, a, 200);
    await req("GET", `${root}/${entry.id}`, a, 404);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM abasong.access_records"))
        .rows[0].n,
      1,
    );
    checks++;
    console.log(
      `PASS: ${checks} real HTTP/database private-library, encryption, RLS, qualification, dedup and isolation checks; disposable local database only`,
    );
  } finally {
    if (api && api.exitCode === null) {
      const ended = once(api, "exit");
      api.kill("SIGTERM");
      await Promise.race([ended, pause(5000).then(() => api?.kill("SIGKILL"))]);
    }
    await db?.end();
    await new Promise<void>((resolve) => jwks.close(() => resolve()));
    if (created) {
      assert(/^abasong_d1_library_test_[a-f0-9]{16}$/.test(name));
      await bootstrap.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    if (createdRole) await bootstrap.query(`DROP ROLE ${role}`);
    await bootstrap.end();
  }
}
main().catch((error: unknown) => {
  if (error instanceof Error) {
    const location = error.stack
      ?.split("\n")
      .find(
        (line) =>
          /^\s+at /.test(line) && line.includes("verify-library-api.ts"),
      );
    if (location) console.error(location.trim());
  }
  console.error(
    "Private-library verification failed (assertion/setup/runtime); no sensitive details emitted",
  );
  process.exitCode = 1;
});
