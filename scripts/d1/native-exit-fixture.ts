import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, escapeLiteral } from "pg";
import { localTarget } from "../d0/database-target";
import {
  seedContributions,
  toggleContributionFailure,
} from "./native-contribution-seed";
import {
  fixtureRequestAllowed,
  fixtureFaultMatch,
  childRunning,
} from "./native-exit-guard";

// Separate test tool, never imported by the API or the application bundle.
// Native clients choose fictional actors; JWTs stay in this process and go only
// to the fixed disposable API. No login bypass is added to the business server.
async function main() {
  const scenario = process.env.ABASONG_NATIVE_EXIT_SCENARIO ?? "delivery";
  assert(["delivery", "contribution"].includes(scenario));
  const verify = process.env.ABASONG_NATIVE_EXIT_VERIFY ?? "default";
  assert(["default", "collaboration", "unlisted", "profile"].includes(verify));
  assert(verify !== "unlisted" || scenario === "contribution");
  assert(verify !== "collaboration" || scenario === "delivery");
  let apartments: string[] = [];
  let addressStorage = true;
  let providerCalls = 0;
  const env = parseEnv(readFileSync(".env", "utf8")),
    adminUrl = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL),
    sensitive = new URL(runtime);
  assert.equal(adminUrl.username, "postgres");
  assert.equal(adminUrl.pathname, "/abasong_d0");
  assert.equal(runtime.username, "abasong_api_local");
  const name = "abasong_native_exit_test_" + randomBytes(8).toString("hex"),
    role = "abasong_native_exit_" + randomBytes(8).toString("hex"),
    admin = new Client({ connectionString: adminUrl.href }),
    owner = randomUUID(),
    driver = randomUUID(),
    region = randomUUID(),
    pickup = randomUUID();
  const pair = await generateKeyPair("ES256"),
    jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "native-exit",
      alg: "ES256",
    };
  const provider = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/mapbox-permanent?")) {
      providerCalls++;
      if (!addressStorage) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "TEST provider unavailable" }));
        return;
      }
      const query =
        new URL(req.url, "http://127.0.0.1").searchParams.get("q") ?? "";
      const number = /^(100|[23][0-9]{2}) TEST (Ave|Avenue)\b/i.exec(
        query,
      )?.[1];
      res.end(
        JSON.stringify({
          features: number
            ? [
                {
                  geometry: {
                    type: "Point",
                    coordinates: [-118.2437, 34.0522],
                  },
                  properties: {
                    feature_type: "address",
                    coordinates: { accuracy: "rooftop" },
                    match_code: {
                      confidence: "exact",
                      address_number: "matched",
                      street: "matched",
                      region: "matched",
                    },
                    context: {
                      address: {
                        address_number: number,
                        street_name: "TEST Avenue",
                      },
                      place: { name: "TEST City" },
                      region: { region_code: "US-CA" },
                      country: { country_code: "US" },
                      postcode: { name: "90000" },
                    },
                  },
                },
              ]
            : [],
        }),
      );
    } else res.end(JSON.stringify({ keys: [jwk] }));
  });
  let db: Client | undefined,
    api: ChildProcess | undefined,
    created = false,
    createdRole = false,
    stopping = false;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const artifactBatch =
    verify === "profile"
      ? "b5-01"
      : verify === "unlisted"
        ? "r4-13"
        : scenario === "contribution"
          ? "r4-11"
          : verify === "collaboration"
            ? "r4-12"
            : "r4-10";
  const resourceFile = `artifacts/${artifactBatch}/test-resources/${name}.json`;
  const recordResources = (cleaned = false) => {
    mkdirSync(`artifacts/${artifactBatch}/test-resources`, { recursive: true });
    writeFileSync(
      resourceFile,
      JSON.stringify(
        {
          database: name,
          role,
          pid: process.pid,
          api_pid: api?.pid ?? null,
          database_created: created,
          role_created: createdRole,
          cleaned,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  };
  const port = 3028;
  let apiPort = 0;
  let fault: { operation: string; after: boolean } | null = null;
  const tokens: Record<string, string> = {};
  const broker = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const reply = (status: number, value: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    if (
      !fixtureRequestAllowed(
        req.headers,
        req.url ?? "",
        req.method ?? "",
        scenario as "delivery" | "contribution",
      )
    )
      return reply(403, {
        code: "FIXTURE_ONLY",
        message: "仅本机 TEST 工具可用",
      });
    try {
      if (req.url === "/fixture" && req.method === "GET")
        return reply(200, {
          owner,
          driver,
          region,
          pickup,
          isolated: true,
          scenario,
          apartments,
          run_id: process.env.ABASONG_NATIVE_EXIT_RUN ?? null,
        });
      if (
        verify === "profile" &&
        req.url === "/fixture/profile-checks" &&
        req.method === "GET"
      ) {
        const record = (
          await db!.query(
            "SELECT contact_payload FROM abasong.self_profiles WHERE user_id=$1",
            [owner],
          )
        ).rows[0];
        const encrypted = JSON.stringify(record?.contact_payload ?? {});
        let ownerRls = false;
        await db!.query("BEGIN");
        try {
          await db!.query("SET LOCAL ROLE abasong_sensitive");
          await db!.query("SELECT set_config('abasong.actor_id',$1,true)", [
            driver,
          ]);
          const other = (
            await db!.query(
              "SELECT user_id FROM abasong.self_profiles WHERE user_id=$1",
              [owner],
            )
          ).rowCount;
          const updated = (
            await db!.query(
              "UPDATE abasong.profiles SET display_name='forbidden' WHERE user_id=$1",
              [owner],
            )
          ).rowCount;
          ownerRls = other === 0 && updated === 0;
        } finally {
          await db!.query("ROLLBACK");
        }
        const caps = (
          await db!.query(
            "SELECT capability FROM abasong.capabilities WHERE user_id=$1",
            [owner],
          )
        ).rows;
        return reply(200, {
          isolated_contact:
            record &&
            !encrypted.includes("TEST-private-owner") &&
            !encrypted.includes("202 555"),
          owner_rls: ownerRls,
          no_extra_caps:
            caps.length === 1 && caps[0].capability === "request.publish",
        });
      }
      if (req.url === "/fixture/snapshot" && req.method === "GET") {
        const rows = (
          await db!.query(
            "SELECT status,count(*)::int n FROM abasong.requests GROUP BY status",
          )
        ).rows;
        const counts = (
          await db!.query(
            "SELECT (SELECT count(*)::int FROM abasong.apartments) apartments,(SELECT count(*)::int FROM abasong.requests) requests,(SELECT count(*)::int FROM abasong.applications) applications,(SELECT count(*)::int FROM abasong.messages WHERE kind='text') messages,(SELECT count(*)::int FROM abasong.conversations) conversations,(SELECT count(*)::int FROM abasong.access_records) access_records,(SELECT count(*)::int FROM abasong.access_contribution_sources) contribution_sources,(SELECT count(*)::int FROM abasong.personal_access_records) private_records",
          )
        ).rows[0];
        return reply(200, {
          ...counts,
          provider_calls: providerCalls,
          states: rows,
        });
      }
      if (req.url === "/fixture/control" && req.method === "POST") {
        const b = JSON.parse(await body(req)) as Record<string, unknown>;
        if (
          b.action === "fault" &&
          [
            "create",
            "publish",
            "apply",
            "message",
            "read",
            "conversation",
            "contribute",
            "correct",
            "import_commit",
            "profile",
            "availability",
          ].includes(String(b.operation))
        ) {
          fault = { operation: String(b.operation), after: b.after === true };
          return reply(200, { armed: true });
        }
        if (
          verify === "unlisted" &&
          b.action === "access_qualification" &&
          typeof b.enabled === "boolean"
        ) {
          await db!.query(
            "UPDATE abasong.capabilities SET revoked_at=CASE WHEN $2 THEN NULL ELSE now() END WHERE user_id=$1 AND capability='access.contribute'",
            [owner, b.enabled],
          );
          return reply(200, { enabled: b.enabled });
        }
        if (
          verify === "unlisted" &&
          b.action === "address_storage" &&
          typeof b.enabled === "boolean"
        ) {
          addressStorage = b.enabled;
          return reply(200, { enabled: addressStorage });
        }
        if (
          scenario === "contribution" &&
          b.action === "share_failure" &&
          typeof b.enabled === "boolean"
        ) {
          await toggleContributionFailure(db!, b.enabled);
          return reply(200, { enabled: b.enabled });
        }
        if (
          scenario === "delivery" &&
          verify === "collaboration" &&
          b.action === "block" &&
          typeof b.enabled === "boolean"
        ) {
          if (b.enabled)
            await db!.query(
              "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [owner, driver],
            );
          else
            await db!.query(
              "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
              [owner, driver],
            );
          return reply(200, { enabled: b.enabled });
        }
        if (b.action === "qualification" && typeof b.enabled === "boolean") {
          await db!.query(
            "UPDATE abasong.capabilities SET revoked_at=CASE WHEN $2 THEN NULL ELSE now() END WHERE user_id=$1 AND capability='request.publish'",
            [owner, b.enabled],
          );
          return reply(200, { enabled: b.enabled });
        }
        return reply(400, { code: "INVALID_CONTROL" });
      }
      const actor = req.headers["x-abasong-test-actor"];
      if (typeof actor !== "string" || !["owner", "driver"].includes(actor))
        return reply(401, { code: "TEST_ACTOR_REQUIRED" });
      const hit =
        fault && fixtureFaultMatch(fault.operation, req.method!, req.url!);
      const activeFault = hit ? fault : null;
      if (hit) fault = null;
      const lost = () =>
        reply(503, {
          code: "TEST_RESPONSE_UNCONFIRMED",
          message: "TEST · 保存结果未确认，请重试",
        });
      if (activeFault && !activeFault.after) return lost();
      const payload = ["GET", "HEAD"].includes(req.method!)
        ? undefined
        : await body(req);
      const response = await fetch(`http://127.0.0.1:${apiPort}` + req.url, {
        method: req.method,
        headers: {
          Authorization: "Bearer " + tokens[actor],
          "Content-Type": "application/json",
          ...(req.headers["idempotency-key"]
            ? { "Idempotency-Key": String(req.headers["idempotency-key"]) }
            : {}),
        },
        body: payload,
        signal: AbortSignal.timeout(12000),
      });
      const value = await response.text();
      if (activeFault && response.ok) return lost();
      res.writeHead(response.status);
      res.end(value);
    } catch {
      reply(503, {
        code: "FIXTURE_UNAVAILABLE",
        message: "TEST · 本地服务暂不可用",
      });
    }
  });
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearTimeout(lifetime);
    await new Promise<void>((r) => broker.close(() => r()));
    if (api && childRunning(api)) {
      api.kill("SIGTERM");
      await Promise.race([once(api, "exit"), pause(5000)]);
      if (childRunning(api)) {
        api.kill("SIGKILL");
        await once(api, "exit");
      }
    }
    await new Promise<void>((r) => provider.close(() => r()));
    await db?.end();
    if (created) {
      assert(/^abasong_native_exit_test_[a-f0-9]{16}$/.test(name));
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    if (createdRole) {
      assert(/^abasong_native_exit_[a-f0-9]{16}$/.test(role));
      await admin.query(`DROP ROLE ${role}`);
    }
    await admin.end();
    recordResources(true);
    console.log(
      "Native TEST fixture stopped; disposable database/role cleaned.",
    );
  }
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    recordResources();
    for (const url of [adminUrl, runtime, sensitive]) url.pathname = "/" + name;
    db = new Client({ connectionString: adminUrl.href });
    await db.connect();
    for (const f of readdirSync("database/migrations")
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort())
      await db.query(readFileSync("database/migrations/" + f, "utf8"));
    const password = randomBytes(24).toString("hex");
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${escapeLiteral(password)}`,
    );
    createdRole = true;
    recordResources();
    await admin.query(`GRANT abasong_sensitive TO ${role}`);
    sensitive.username = role;
    sensitive.password = password;
    await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
      [owner, driver],
    ]);
    await db.query(
      "INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST 发布人'),($2,'TEST 司机')",
      [owner, driver],
    );
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'request.publish','TEST disposable native exit'),($2,'request.apply','TEST disposable native exit')",
      [owner, driver],
    );
    await db.query(
      "INSERT INTO abasong.regions(id,label,display_point) VALUES($1,'TEST Pasadena','SRID=4326;POINT(-118.14 34.15)'::extensions.geography),($2,'TEST Industry','SRID=4326;POINT(-117.96 34.01)'::extensions.geography)",
      [region, pickup],
    );
    if (scenario === "contribution")
      apartments = await seedContributions(db, owner, driver);
    provider.listen(0, "127.0.0.1");
    await once(provider, "listening");
    const issuer = `http://127.0.0.1:${(provider.address() as { port: number }).port}/auth/v1`;
    for (const [label, id] of [
      ["owner", owner],
      ["driver", driver],
    ])
      tokens[label!] = await new SignJWT({ sub: id, role: "authenticated" })
        .setProtectedHeader({ alg: "ES256", kid: "native-exit" })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience("authenticated")
        .setExpirationTime("2h")
        .sign(pair.privateKey);
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    apiPort = (reservation.address() as { port: number }).port;
    await new Promise<void>((r) => reservation.close(() => r()));
    api = spawn(
      process.execPath,
      [
        "--import",
        "./scripts/d1/request-mapbox-fixture.mjs",
        "apps/api/dist/main.js",
      ],
      {
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
          API_PORT: String(apiPort),
          ABASONG_TEST_PROVIDER_URL: issuer.replace("/auth/v1", ""),
          MAPBOX_SEARCH_TOKEN: "pk.TEST.fixture",
          MAPBOX_PERMANENT_GEOCODING_ENABLED: "true",
          REQUEST_SHARE_BASE_URL: "https://share.abasong.invalid",
        },
      },
    );
    recordResources();
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (!childRunning(api)) throw new Error("child failed");
      try {
        if ((await fetch(`http://127.0.0.1:${apiPort}/health/ready`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* startup */
      }
      await pause(100);
    }
    assert(ready);
    broker.listen(port, "127.0.0.1");
    await once(broker, "listening");
    console.log(
      "Native TEST fixture ready on loopback3028; real isolated API/PG; no credentials printed.",
    );
    const shutdown = () =>
      void stop().catch(() => {
        console.error(
          "Native TEST cleanup failed; inspect only this fixture's disposable resources.",
        );
        process.exitCode = 1;
      });
    lifetime = setTimeout(shutdown, 2 * 3600000);
    api.once("exit", () => {
      if (!stopping) shutdown();
    });
    for (const sig of ["SIGTERM", "SIGINT"] as const)
      process.once(sig, shutdown);
  } catch (error: unknown) {
    await stop();
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EADDRINUSE"
    )
      console.log(
        "TEST loopback port already in use; existing listener untouched.",
      );
    throw error;
  }
}
async function body(req: IncomingMessage) {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 32768) throw new Error("body too large");
    parts.push(bytes);
  }
  return Buffer.concat(parts).toString("utf8");
}
void main().catch(() => {
  console.error("Native TEST fixture failed; private details omitted.");
  process.exitCode = 1;
});
