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
import {
  ingestPublicApartments,
  publicExpansion,
  publicApartmentId,
} from "./public-apartment-data";
import { localTarget } from "../d0/database-target";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    admin = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL);
  assert.equal(admin.username, "postgres");
  assert.equal(runtime.username, "abasong_api_local");
  const suffix = randomBytes(8).toString("hex"),
    name = `abasong_d1_import_test_${suffix}`,
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
  // Real TCP fault: forward the POST, wait for the complete upstream response
  // (therefore its DB commit), then destroy the downstream connection. Retrying
  // must return the same durable resource, not create a second one.
  async function dropReply(
    path: string,
    auth: string,
    body: unknown,
    key: string,
    status: number,
  ) {
    let finish!: () => void, fail!: (e: unknown) => void;
    const forwarded = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const proxy = createServer((_incoming, response) => {
      void (async () => {
        try {
          const upstream = await fetch(base + path, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${auth}`,
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          });
          assert.equal(upstream.status, status);
          await upstream.arrayBuffer();
          response.destroy();
          finish();
        } catch (e) {
          response.destroy();
          fail(e);
        }
      })();
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    try {
      await assert.rejects(
        fetch(
          `http://127.0.0.1:${(proxy.address() as { port: number }).port}/lost`,
          { method: "POST", signal: AbortSignal.timeout(12000) },
        ),
      );
      await forwarded;
      checks++;
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
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
      "0004_import_batches.sql",
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
    const testApiEnv = {
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
    };
    async function launchApi() {
      api = spawn(process.execPath, ["apps/api/dist/main.js"], {
        stdio: ["ignore", "ignore", "pipe"],
        env: testApiEnv,
      });
      api.stderr?.on("data", (bytes: Buffer) => {
        const m = bytes.toString().match(/IMPORT_DB_FAILED [A-Z0-9]{5,8}/);
        if (m) console.error(m[0]);
      });
      for (let i = 0; i < 80; i++) {
        try {
          if (
            (
              await fetch(base + "/health/live", {
                signal: AbortSignal.timeout(1000),
              })
            ).ok
          )
            return;
        } catch {
          /* test process starting */
        }
        if (api.exitCode !== null) throw new Error("Test API did not start");
        await pause(100);
      }
      throw new Error("Test API startup timeout");
    }
    await launchApi();
    const a = await token(actor),
      b = await token(other);
    const path = "/v1/me/import-batches";
    const policy = {
      version: 1,
      max_images: 10,
      max_image_bytes: 10485760,
      max_total_bytes: 52428800,
      max_pixels: 24000000,
      draft_ttl_seconds: 86400,
      source_ttl_seconds: 3600,
      upload_ttl_seconds: 300,
      processing_timeout_seconds: 60,
      daily_image_limit: 50,
      max_candidates: 100,
      recognition_mode: "on_device",
      supported_mime_types: ["image/jpeg", "image/png", "image/heic"],
    };
    await req("GET", "/v1/me/import-policy", undefined, 401);
    await req("GET", "/v1/me/import-policy", a, 503);
    await db.query(
      "INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(1,$1,now())",
      [
        JSON.stringify({
          import_policy: policy,
          feedback_window_days: 7,
          apartment_resolve: {
            radius_m: 150,
            max_age_seconds: 120,
            future_tolerance_seconds: 15,
            max_accuracy_m: 100,
            auto_match: {
              enabled: true,
              evidence_ref: "DISPOSABLE-TEST-ONLY",
              max_accuracy_m: 5,
            },
          },
        }),
      ],
    );
    assert.equal(
      (await req("GET", "/v1/me/import-policy", a, 200)).recognition_mode,
      "on_device",
    );
    // Batch JSON accepts >16 KiB for many candidates, but remains bounded;
    // unknown fields still fail DTO validation rather than being accepted.
    await req(
      "POST",
      path,
      a,
      400,
      { unexpected: "x".repeat(20000) },
      randomUUID(),
    );
    await req(
      "POST",
      path,
      a,
      413,
      { unexpected: "x".repeat(140000) },
      randomUUID(),
    );
    await ingestPublicApartments(db);
    await ingestPublicApartments(db); // Idempotent re-ingest; never overwrite reviewed mappings.
    // Public geometry/address, simulated observation, isolated qualification and TEST code only.
    const point = (
      await db.query(
        "SELECT extensions.ST_X(point::extensions.geometry) lng,extensions.ST_Y(point::extensions.geometry) lat FROM abasong.apartments WHERE id=$1",
        [publicApartmentId],
      )
    ).rows[0];
    const fix = {
      point,
      observed_at: new Date().toISOString(),
      accuracy_m: 2,
      accuracy_permission: "precise",
    };
    const match = await req("POST", "/v1/apartments/resolve", a, 200, fix);
    assert.equal(match.matched_id, publicApartmentId);
    const geometry = await req(
      "GET",
      `/v1/apartments/${publicApartmentId}/map-context`,
      a,
      200,
    );
    assert.equal(geometry.buildings[0].street_number, "300");
    await req(
      "GET",
      `/v1/apartments/${publicApartmentId}/access-records`,
      a,
      403,
    );
    const cap = randomUUID();
    await db.query(
      "INSERT INTO abasong.capabilities(id,user_id,capability,reason,granted_by,valid_from) VALUES($1,$2,'access.contribute','synthetic test',$2,now())",
      [cap, actor],
    );
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason,granted_by,valid_from) VALUES($1,'access.read','synthetic test',$1,now())",
      [actor],
    );
    const noCodes = await req(
      "GET",
      `/v1/apartments/${publicApartmentId}/access-records`,
      a,
      200,
    );
    assert.deepEqual(noCodes.items, []);
    // All new public addresses are durable search candidates; only verified
    // footprint subsets may auto-match. Observations/codes below are synthetic.
    for (const sample of publicExpansion) {
      const row: {
        address_line1: string;
        has_building: boolean;
        lng: number;
        lat: number;
      } = (
        await db.query(
          "SELECT address_line1, boundary IS NOT NULL AS has_building, extensions.ST_X(point::extensions.geometry) lng,extensions.ST_Y(point::extensions.geometry) lat FROM abasong.apartments WHERE id=$1",
          [sample.id],
        )
      ).rows[0];
      const resolved = await req("POST", "/v1/apartments/resolve", a, 200, {
        ...fix,
        point: { lng: row.lng, lat: row.lat },
        accuracy_m: 1,
        observed_at: new Date().toISOString(),
      });
      assert(
        resolved.candidates.some((p: { id: string }) => p.id === sample.id),
      );
      assert.equal(resolved.matched_id, row.has_building ? sample.id : null);
      const context = await req(
        "GET",
        `/v1/apartments/${sample.id}/map-context`,
        a,
        200,
      );
      assert.equal(context.buildings.length, row.has_building ? 1 : 0);
      assert.deepEqual(
        (await req("GET", `/v1/apartments/${sample.id}/access-records`, a, 200))
          .items,
        [],
      );
      const search = await req(
        "GET",
        "/v1/apartments?query=" + encodeURIComponent(row.address_line1),
        a,
        200,
      );
      assert(search.items.some((p: { id: string }) => p.id === sample.id));
    }
    const courtyard = (
      await db.query(
        "SELECT extensions.ST_X(p) lng,extensions.ST_Y(p) lat FROM (SELECT extensions.ST_PointOnSurface(extensions.ST_MakePolygon(extensions.ST_InteriorRingN(extensions.ST_GeometryN(boundary,1),1))) p FROM abasong.apartments WHERE id=$1) x",
        [publicExpansion[0]!.id],
      )
    ).rows[0];
    assert.equal(
      (
        await req("POST", "/v1/apartments/resolve", a, 200, {
          ...fix,
          point: courtyard,
          accuracy_m: 1,
          observed_at: new Date().toISOString(),
        })
      ).matched_id,
      null,
    );
    const createBody = {
      client_batch_id: randomUUID(),
      policy_version: 1,
      mode: "private_only",
      origin: "contribute",
    };
    await req(
      "POST",
      path,
      a,
      400,
      { ...createBody, owner_id: other },
      randomUUID(),
    );
    await req("POST", path, a, 400, createBody);
    const createKey = randomUUID();
    await dropReply(path, a, createBody, createKey, 201);
    let batch = await req("POST", path, a, 201, createBody, createKey);
    const bid = batch.id,
      rootBatch = path + "/" + bid;
    assert.equal(
      (await req("POST", path, a, 201, createBody, createKey)).id,
      bid,
    );
    await req(
      "POST",
      path,
      a,
      409,
      { ...createBody, mode: "private_and_share" },
      createKey,
    );
    await req(
      "POST",
      path,
      a,
      409,
      { ...createBody, policy_version: 2 },
      randomUUID(),
    );
    await req("GET", rootBatch, b, 404);
    await req("GET", rootBatch + "?owner_id=" + other, a, 400);
    await req("GET", path + "?owner_id=" + other, a, 400);
    assert.equal((await req("GET", path, b, 200)).items.length, 0);
    await req(
      "POST",
      rootBatch + "/sources/local",
      b,
      404,
      {
        client_source_id: randomUUID(),
        expected_batch_version: 1,
        mime_type: "image/png",
        byte_size: 100,
        width: 100,
        height: 100,
      },
      randomUUID(),
    );
    const srcInput = {
      client_source_id: randomUUID(),
      expected_batch_version: batch.version,
      mime_type: "image/png",
      byte_size: 100,
      width: 100,
      height: 100,
    };
    await req(
      "POST",
      rootBatch + "/sources/local",
      a,
      422,
      { ...srcInput, width: 1000000 },
      randomUUID(),
    );
    await req(
      "POST",
      rootBatch + "/sources/local",
      a,
      400,
      { ...srcInput, upload_url: "https://example.invalid/" },
      randomUUID(),
    );
    const sourceKey = randomUUID();
    await dropReply(rootBatch + "/sources/local", a, srcInput, sourceKey, 201);
    const src = await req(
      "POST",
      rootBatch + "/sources/local",
      a,
      201,
      srcInput,
      sourceKey,
    );
    assert.equal(src.state, "registered");
    assert(!("upload_url" in src));
    assert.deepEqual(
      await req(
        "POST",
        rootBatch + "/sources/local",
        a,
        201,
        srcInput,
        sourceKey,
      ),
      src,
    );
    await req(
      "POST",
      rootBatch + "/sources/local",
      a,
      409,
      { ...srcInput, byte_size: 101 },
      sourceKey,
    );
    const extractBody = {
      expected_source_version: 1,
      recognizer_version: "TEST-device-v1",
      candidates: [
        {
          address_text: "300 S Santa Fe Ave, Los Angeles, CA 90012",
          value: "TEST-GATE-1",
          method: "keypad",
          scope: { label: "TEST entrance" },
        },
        {
          address_text: "Unlisted Example street",
          value: "TEST-GATE-2",
          method: "keypad",
        },
      ],
    };
    await req(
      "POST",
      rootBatch + "/sources/" + src.id + "/extractions",
      b,
      404,
      extractBody,
      randomUUID(),
    );
    await req(
      "POST",
      rootBatch + "/sources/" + randomUUID() + "/extractions",
      a,
      404,
      extractBody,
      randomUUID(),
    );
    await req(
      "POST",
      rootBatch + "/sources/" + src.id + "/extractions",
      a,
      400,
      { ...extractBody, ocr_full_text: "TEST forbidden" },
      randomUUID(),
    );
    const extractKey = randomUUID();
    await dropReply(
      rootBatch + "/sources/" + src.id + "/extractions",
      a,
      extractBody,
      extractKey,
      201,
    );
    const extracted = await req(
      "POST",
      rootBatch + "/sources/" + src.id + "/extractions",
      a,
      201,
      extractBody,
      extractKey,
    );
    const cid = extracted.items[0].id,
      cid2 = extracted.items[1].id;
    assert.equal(extracted.items[0].state, "needs_review");
    assert.equal(extracted.items[0].confirmation_revision, null);
    assert.equal(
      (
        await req(
          "POST",
          rootBatch + "/sources/" + src.id + "/extractions",
          a,
          201,
          extractBody,
          extractKey,
        )
      ).items.length,
      2,
    );
    assert.equal(
      (await req("GET", rootBatch + "/sources", a, 200)).items.length,
      1,
    );
    assert.equal(
      (await req("GET", rootBatch + "/candidates?limit=1", a, 200)).items
        .length,
      1,
    );
    const stored = await db.query(
      "SELECT payload::text FROM abasong.import_batches WHERE id=$1",
      [bid],
    );
    assert(!stored.rows[0].payload.includes("TEST-GATE-1"));
    checks++;
    const row = await req(
      "PATCH",
      rootBatch + "/candidates/" + cid,
      a,
      200,
      { expected_revision: 1, apartment_id: publicApartmentId },
      randomUUID(),
    );
    assert.equal(row.revision, 2);
    await req(
      "PATCH",
      rootBatch + "/candidates/" + cid,
      a,
      409,
      { expected_revision: 1, value: "TEST-stale" },
      randomUUID(),
    );
    batch = await req("GET", rootBatch, a, 200);
    await req(
      "POST",
      rootBatch + "/candidates/confirm",
      a,
      409,
      {
        expected_batch_version: batch.version,
        fields_confirmed: true,
        items: [
          { candidate_id: cid, expected_revision: 2 },
          { candidate_id: cid2, expected_revision: 99 },
        ],
      },
      randomUUID(),
    );
    assert(
      (await req("GET", rootBatch + "/candidates", a, 200)).items.every(
        (x: { confirmation_revision: number | null }) =>
          x.confirmation_revision === null,
      ),
    );
    const confirmed = await req(
      "POST",
      rootBatch + "/candidates/confirm",
      a,
      200,
      {
        expected_batch_version: batch.version,
        fields_confirmed: true,
        items: [
          { candidate_id: cid, expected_revision: 2 },
          { candidate_id: cid2, expected_revision: 1 },
        ],
      },
      randomUUID(),
    );
    assert.equal(confirmed.items.length, 2);
    batch = await req("GET", rootBatch, a, 200);
    const commitBody = {
      expected_batch_version: batch.version,
      mode: "private_only",
      source_attested: true,
      items: [
        {
          candidate_id: cid,
          confirmed_revision: 2,
          client_commit_id: randomUUID(),
        },
        {
          candidate_id: cid2,
          confirmed_revision: 1,
          client_commit_id: randomUUID(),
        },
      ],
    };
    const commitKey = randomUUID();
    await dropReply(rootBatch + "/commit", a, commitBody, commitKey, 200);
    const result = await req(
      "POST",
      rootBatch + "/commit",
      a,
      200,
      commitBody,
      commitKey,
    );
    assert.equal(result.batch.state, "completed");
    assert(
      result.results.every(
        (r: { private_status: string }) => r.private_status === "saved",
      ),
    );
    const repeat = await req(
      "POST",
      rootBatch + "/commit",
      a,
      200,
      commitBody,
      commitKey,
    );
    assert.deepEqual(repeat.results, result.results);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM abasong.personal_access_records WHERE owner_id=$1",
          [actor],
        )
      ).rows[0].n,
      2,
    );
    await req(
      "PATCH",
      rootBatch,
      a,
      409,
      { expected_version: result.batch.version, mode: "private_and_share" },
      randomUUID(),
    );
    await req(
      "PATCH",
      rootBatch + "/candidates/" + cid,
      a,
      409,
      { expected_revision: 2, value: "TEST change" },
      randomUUID(),
    );
    await req(
      "POST",
      rootBatch + "/commit",
      a,
      409,
      { ...commitBody, mode: "private_and_share" },
      commitKey,
    );
    await req(
      "DELETE",
      rootBatch,
      a,
      409,
      { expected_version: result.batch.version },
      randomUUID(),
    );
    const shareBatch = await req(
      "POST",
      path,
      a,
      201,
      {
        ...createBody,
        client_batch_id: randomUUID(),
        mode: "private_and_share",
      },
      randomUUID(),
    );
    const sb = path + "/" + shareBatch.id;
    const ss = await req(
      "POST",
      sb + "/sources/local",
      a,
      201,
      {
        ...srcInput,
        client_source_id: randomUUID(),
        expected_batch_version: shareBatch.version,
      },
      randomUUID(),
    );
    const sx = await req(
      "POST",
      sb + "/sources/" + ss.id + "/extractions",
      a,
      201,
      { ...extractBody, candidates: [extractBody.candidates[0]] },
      randomUUID(),
    );
    const sc = sx.items[0].id;
    await req(
      "PATCH",
      sb + "/candidates/" + sc,
      a,
      200,
      { expected_revision: 1, apartment_id: publicApartmentId },
      randomUUID(),
    );
    await req(
      "POST",
      sb + "/candidates/" + sc + "/confirm",
      a,
      200,
      { expected_revision: 2, fields_confirmed: true },
      randomUUID(),
    );
    const sv = await req("GET", sb, a, 200);
    const shareBody = {
      expected_batch_version: sv.version,
      mode: "private_and_share",
      source_attested: true,
      items: [
        {
          candidate_id: sc,
          confirmed_revision: 2,
          client_commit_id: randomUUID(),
        },
      ],
    };
    // Force shared persistence failure after private save; transaction rollback must retain the private stage.
    await db.query(
      "CREATE FUNCTION abasong.test_block_shared() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST controlled failure'; END $$",
    );
    await db.query(
      "CREATE TRIGGER block_shared BEFORE INSERT ON abasong.access_records FOR EACH ROW EXECUTE FUNCTION abasong.test_block_shared()",
    );
    const partial = await req(
      "POST",
      sb + "/commit",
      a,
      200,
      shareBody,
      randomUUID(),
    );
    assert.equal(partial.results[0].private_status, "saved");
    assert.equal(partial.results[0].share_status, "failed");
    assert.equal(partial.batch.state, "partial_failed");
    const saved = partial.results[0].private_record_id;
    // Kill only this isolated test API process, then reload the encrypted
    // durable plan from the database with the same test key configuration.
    const crashed = api!;
    const stopped = once(crashed, "exit");
    crashed.kill("SIGKILL");
    await stopped;
    await launchApi();
    const resumed = await req("GET", sb + "/candidates", a, 200);
    assert.equal(resumed.items[0].commit_result.private_record_id, saved);
    assert.equal(
      resumed.items[0].commit_result.client_commit_id,
      shareBody.items[0]!.client_commit_id,
    );
    await db.query("DROP TRIGGER block_shared ON abasong.access_records");
    const shared = await req(
      "POST",
      sb + "/commit",
      a,
      200,
      { ...shareBody, expected_batch_version: partial.batch.version },
      randomUUID(),
    );
    assert.equal(shared.results[0].private_record_id, saved);
    assert.equal(shared.results[0].share_status, "pending");
    assert.equal(
      (
        await req(
          "GET",
          `/v1/apartments/${publicApartmentId}/access-records`,
          a,
          200,
        )
      ).items.length,
      0,
    );
    // Simulate an approved TEST record in this disposable DB only, exercising automatic lookup -> authorized code read.
    await db.query(
      "UPDATE abasong.access_records SET status='active' WHERE apartment_id=$1",
      [publicApartmentId],
    );
    const liveCodes = await req(
      "GET",
      `/v1/apartments/${publicApartmentId}/access-records`,
      a,
      200,
    );
    assert.equal(liveCodes.items[0].value, "TEST-GATE-1");
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE id=$1",
      [cap],
    );
    await req(
      "POST",
      path,
      a,
      403,
      {
        ...createBody,
        client_batch_id: randomUUID(),
        mode: "private_and_share",
      },
      randomUUID(),
    );
    await req("GET", sb + "/candidates", a, 200);
    const cancelled = await req(
      "POST",
      sb + "/cancel",
      a,
      200,
      { expected_version: shared.batch.version },
      randomUUID(),
    );
    await req(
      "POST",
      sb + "/commit",
      a,
      409,
      { ...shareBody, expected_batch_version: cancelled.version },
      randomUUID(),
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM abasong.personal_access_records WHERE owner_id=$1",
          [actor],
        )
      ).rows[0].n,
      2,
    );
    const simple = await req(
      "POST",
      path,
      a,
      201,
      { ...createBody, client_batch_id: randomUUID() },
      randomUUID(),
    );
    await db.query(
      "UPDATE abasong.import_batches SET expires_at=now()-interval '1 second' WHERE id=$1",
      [simple.id],
    );
    await req("GET", path + "/" + simple.id, a, 422);
    await req(
      "POST",
      path + "/" + simple.id + "/sources/local",
      a,
      422,
      srcInput,
      randomUUID(),
    );
    const disposable = await req(
      "POST",
      path,
      a,
      201,
      { ...createBody, client_batch_id: randomUUID() },
      randomUUID(),
    );
    const deleteKey = randomUUID(),
      deleteInput = { expected_version: disposable.version };
    await req(
      "DELETE",
      path + "/" + disposable.id,
      b,
      404,
      deleteInput,
      deleteKey,
    );
    await req(
      "DELETE",
      path + "/" + disposable.id,
      a,
      200,
      deleteInput,
      deleteKey,
    );
    await req(
      "DELETE",
      path + "/" + disposable.id,
      a,
      200,
      deleteInput,
      deleteKey,
    );
    await req(
      "DELETE",
      path + "/" + disposable.id,
      a,
      409,
      { expected_version: 99 },
      deleteKey,
    );
    await req("GET", path + "/" + disposable.id, a, 404);
    const raw = new Client({ connectionString: runtime.href });
    await raw.connect();
    try {
      await assert.rejects(
        raw.query("SELECT payload FROM abasong.import_batches"),
        /permission denied/,
      );
      checks++;
    } finally {
      await raw.end();
    }
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL WHERE id=$1",
      [cap],
    );
    const qbatch = await req(
      "POST",
      path,
      a,
      201,
      {
        ...createBody,
        client_batch_id: randomUUID(),
        mode: "private_and_share",
      },
      randomUUID(),
    );
    const qb = path + "/" + qbatch.id,
      qs = await req(
        "POST",
        qb + "/sources/local",
        a,
        201,
        {
          ...srcInput,
          client_source_id: randomUUID(),
          expected_batch_version: qbatch.version,
        },
        randomUUID(),
      );
    const qx = await req(
      "POST",
      qb + "/sources/" + qs.id + "/extractions",
      a,
      201,
      {
        ...extractBody,
        candidates: [{ ...extractBody.candidates[0], value: "TEST-GATE-3" }],
      },
      randomUUID(),
    );
    const qc = qx.items[0].id;
    await req(
      "PATCH",
      qb + "/candidates/" + qc,
      a,
      200,
      { expected_revision: 1, apartment_id: publicApartmentId },
      randomUUID(),
    );
    await req(
      "POST",
      qb + "/candidates/" + qc + "/confirm",
      a,
      200,
      { expected_revision: 2, fields_confirmed: true },
      randomUUID(),
    );
    await db.query(
      `CREATE FUNCTION abasong.test_revoke_after_private() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN UPDATE abasong.capabilities SET revoked_at=now() WHERE id='${cap}'; RETURN NEW; END $$`,
    );
    await db.query(
      "CREATE TRIGGER revoke_on_private AFTER INSERT ON abasong.personal_access_records FOR EACH ROW EXECUTE FUNCTION abasong.test_revoke_after_private()",
    );
    const qv = await req("GET", qb, a, 200),
      qi = {
        expected_batch_version: qv.version,
        mode: "private_and_share",
        source_attested: true,
        items: [
          {
            candidate_id: qc,
            confirmed_revision: 2,
            client_commit_id: randomUUID(),
          },
        ],
      };
    const lost = await req("POST", qb + "/commit", a, 200, qi, randomUUID());
    assert.equal(lost.results[0].private_status, "saved");
    assert.equal(lost.results[0].share_status, "failed");
    assert.equal(lost.results[0].error_code, "CAPABILITY_REQUIRED");
    await db.query(
      "DROP TRIGGER revoke_on_private ON abasong.personal_access_records",
    );
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL WHERE id=$1",
      [cap],
    );
    const restored = await req(
      "POST",
      qb + "/commit",
      a,
      200,
      { ...qi, expected_batch_version: lost.batch.version },
      randomUUID(),
    );
    assert.equal(
      restored.results[0].private_record_id,
      lost.results[0].private_record_id,
    );
    assert.equal(restored.results[0].share_status, "pending");
    const recovered = (await req("GET", qb + "/candidates", a, 200)).items[0];
    assert.equal(
      recovered.commit_result.client_commit_id,
      qi.items[0]!.client_commit_id,
    );
    assert.equal(
      recovered.commit_result.private_record_id,
      lost.results[0].private_record_id,
    );
    const concurrentKey = randomUUID(),
      retry = { ...qi, expected_batch_version: restored.batch.version };
    await Promise.all([
      req("POST", qb + "/commit", a, 200, retry, concurrentKey),
      req("POST", qb + "/commit", a, 200, retry, concurrentKey),
    ]);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM abasong.personal_access_records WHERE owner_id=$1",
          [actor],
        )
      ).rows[0].n,
      3,
    );
    const encrypted = (
      await db.query("SELECT payload FROM abasong.import_batches WHERE id=$1", [
        bid,
      ])
    ).rows[0].payload;
    await db.query(
      "UPDATE abasong.import_batches SET version=version+1 WHERE id=$1",
      [bid],
    );
    await req("GET", rootBatch, a, 503);
    await db.query(
      "UPDATE abasong.import_batches SET version=version-1,payload=$2 WHERE id=$1",
      [bid, encrypted],
    );
    await db.query(
      "UPDATE abasong.config_versions SET config=jsonb_set(config,'{import_policy,daily_image_limit}','1') WHERE version=1",
    );
    const limited = await req(
      "POST",
      path,
      a,
      201,
      { ...createBody, client_batch_id: randomUUID() },
      randomUUID(),
    );
    await req(
      "POST",
      path + "/" + limited.id + "/sources/local",
      a,
      429,
      {
        ...srcInput,
        client_source_id: randomUUID(),
        expected_batch_version: limited.version,
      },
      randomUUID(),
    );
    await db.query("BEGIN");
    await db.query("SET LOCAL ROLE abasong_worker");
    const purged = await db.query(
      "SELECT abasong.purge_expired_import_drafts(100) n",
    );
    assert.equal(purged.rows[0].n, 1);
    checks++;
    await db.query("ROLLBACK");
    const workerCheck = new Client({ connectionString: runtime.href });
    await workerCheck.connect();
    try {
      await assert.rejects(
        workerCheck.query("SELECT abasong.purge_expired_import_drafts(100)"),
        /permission denied/,
      );
      checks++;
    } finally {
      await workerCheck.end();
    }
    await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
      actor,
    ]);
    await req("GET", rootBatch, a, 403);
    console.log(
      `PASS: ${checks} import HTTP/database checks; public geometry + simulated observation + TEST access data; disposable local database only`,
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
      assert(/^abasong_d1_import_test_[a-f0-9]{16}$/.test(name));
      await bootstrap.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    if (createdRole) await bootstrap.query(`DROP ROLE ${role}`);
    await bootstrap.end();
  }
}
main().catch((error: unknown) => {
  if (typeof error === "object" && error && "code" in error)
    console.error("Database error code", (error as { code: unknown }).code);
  if (error instanceof Error) {
    const location = error.stack
      ?.split("\n")
      .find(
        (line) => /^\s+at /.test(line) && line.includes("verify-import-api.ts"),
      );
    if (location) console.error(location.trim());
  }
  console.error(
    "Import verification failed (assertion/setup/runtime); no sensitive details emitted",
  );
  process.exitCode = 1;
});
