import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Client, Pool } from "pg";
type Result = {
  applied: boolean;
  replayed: boolean;
  capability_count: number;
  valid_until: string | null;
};
type Request = (
  method: string,
  path: string,
  token: string | undefined,
  status: number,
) => Promise<unknown>;
export async function verifyPilotAccess(
  db: Client,
  adminUrl: string,
  issuer: string,
  token: (id: string, aal?: string) => Promise<string>,
  req: Request,
  apartmentId: string,
) {
  const require = createRequire(__filename);
  const { PilotAccessCommand } =
    require("../../apps/api/dist/operations/pilot-access.js") as {
      PilotAccessCommand: new (
        p: Pool,
        v: unknown,
      ) => {
        run(auth: string, input: unknown, apply?: boolean): Promise<Result>;
      };
    };
  const {
    TokenVerifier,
  } = require("../../apps/api/dist/auth/token-verifier.js");
  const previous = {
    issuer: process.env.AUTH_ISSUER,
    node: process.env.NODE_ENV,
  };
  process.env.AUTH_ISSUER = issuer;
  process.env.NODE_ENV = "test";
  const verifier = new TokenVerifier();
  for (const [key, value] of [
    ["AUTH_ISSUER", previous.issuer],
    ["NODE_ENV", previous.node],
  ]) {
    if (value === undefined) delete process.env[key!];
    else process.env[key!] = value;
  }
  const pool = new Pool({ connectionString: adminUrl, max: 3 });
  const command = new PilotAccessCommand(pool, verifier);
  const [operator, driver, stranger, noProfile] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ] as const;
  await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
    [operator, driver, stranger, noProfile],
  ]);
  await db.query(
    "INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST Pilot Driver')",
    [driver],
  );
  await db.query(
    "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'ops.user_manage','TEST operator')",
    [operator],
  );
  const auth = "Bearer " + (await token(operator, "aal2")),
    driverToken = await token(driver);
  const grant = {
    action: "grant",
    user_id: driver,
    operation_id: randomUUID(),
    reason: "invited_pilot",
    valid_until: new Date(Date.now() + 3600_000).toISOString(),
  };
  const read = (status: number) =>
    req(
      "GET",
      `/v1/apartments/${apartmentId}/access-records`,
      driverToken,
      status,
    );
  let checks = 0;
  const fail = async (input: unknown, code: string, authorization = auth) => {
    await assert.rejects(
      command.run(authorization, input, true),
      (e: { code: string }) => e.code === code,
    );
    checks++;
  };
  try {
    await read(403);
    await fail({ ...grant, extra: true }, "INVALID_INPUT");
    await fail(
      grant,
      "STAFF_MFA_REQUIRED",
      "Bearer " + (await token(operator, "aal1")),
    );
    await fail(
      grant,
      "STAFF_REQUIRED",
      "Bearer " + (await token(stranger, "aal2")),
    );
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'ops.review','TEST review only')",
      [stranger],
    );
    await fail(
      grant,
      "STAFF_REQUIRED",
      "Bearer " + (await token(stranger, "aal2")),
    );
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='ops.user_manage'",
      [operator],
    );
    await fail(grant, "STAFF_REQUIRED");
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=NULL,valid_from=now()+interval '1 hour' WHERE user_id=$1 AND capability='ops.user_manage'",
      [operator],
    );
    await fail(grant, "STAFF_REQUIRED");
    await db.query(
      "UPDATE abasong.capabilities SET valid_from=now() WHERE user_id=$1 AND capability='ops.user_manage'",
      [operator],
    );
    await fail({ ...grant, user_id: operator }, "SELF_GRANT_FORBIDDEN");
    await fail(
      { ...grant, user_id: operator.toUpperCase() },
      "SELF_GRANT_FORBIDDEN",
    );
    await fail({ ...grant, user_id: noProfile }, "PROFILE_REQUIRED");
    await fail(
      { ...grant, valid_until: new Date(Date.now() - 1000).toISOString() },
      "INVALID_EXPIRY",
    );
    await fail(
      {
        ...grant,
        valid_until: new Date(Date.now() + 8 * 86400_000).toISOString(),
      },
      "INVALID_EXPIRY",
    );
    await db.query(
      "UPDATE abasong.users SET session_invalid_before=now() WHERE id=$1",
      [operator],
    );
    await fail(grant, "SESSION_REVOKED");
    await db.query(
      "UPDATE abasong.users SET session_invalid_before=NULL WHERE id=$1",
      [operator],
    );
    assert.equal((await command.run(auth, grant)).applied, false);
    assert.equal(
      (
        await db.query("SELECT id FROM abasong.capabilities WHERE user_id=$1", [
          driver,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT id FROM abasong.audit_events WHERE id=$1", [
          grant.operation_id,
        ])
      ).rowCount,
      0,
    );
    checks++;
    const concurrent = await Promise.all([
      command.run(auth, grant, true),
      command.run(auth, grant, true),
    ]);
    assert.equal(concurrent.filter((r) => r.replayed).length, 1);
    assert.equal(
      (
        await db.query("SELECT id FROM abasong.capabilities WHERE user_id=$1", [
          driver,
        ])
      ).rowCount,
      2,
    );
    checks++;
    await read(200);
    await fail(
      { ...grant, valid_until: new Date(Date.now() + 7200_000).toISOString() },
      "IDEMPOTENCY_CONFLICT",
    );
    await fail(
      { ...grant, operation_id: randomUUID() },
      "CAPABILITY_ALREADY_ACTIVE",
    );
    // Expiration is enforced by ordinary business authorization, not a cleanup job.
    await db.query(
      "UPDATE abasong.capabilities SET valid_from=now()-interval '2 hour',valid_until=now()-interval '1 hour' WHERE user_id=$1",
      [driver],
    );
    await read(403);
    const replay = await command.run(auth, grant, true);
    assert.equal(replay.replayed, true);
    await read(403);
    checks++;
    const revoke = {
      action: "revoke",
      user_id: driver,
      operation_id: randomUUID(),
      grant_operation_id: grant.operation_id,
      reason: "pilot_completed",
    };
    await fail({ ...revoke, user_id: stranger }, "NOT_FOUND");
    const unrelated = (
      await db.query(
        "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.read','TEST unrelated grant') RETURNING id",
        [driver],
      )
    ).rows[0].id;
    assert.equal((await command.run(auth, revoke)).applied, false);
    assert.equal(
      (
        await db.query(
          "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND revoked_at IS NOT NULL",
          [driver],
        )
      ).rowCount,
      0,
    );
    checks++;
    // Revoking an invitation must remain possible when a user has been suspended.
    await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1", [
      driver,
    ]);
    assert.equal((await command.run(auth, revoke, true)).applied, true);
    assert.equal((await command.run(auth, revoke, true)).replayed, true);
    assert.equal(
      (
        await db.query(
          "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND revoked_at IS NOT NULL",
          [driver],
        )
      ).rowCount,
      2,
    );
    assert.equal(
      (
        await db.query(
          "SELECT revoked_at FROM abasong.capabilities WHERE id=$1",
          [unrelated],
        )
      ).rows[0].revoked_at,
      null,
    );
    checks++;
    await fail({ ...grant, operation_id: randomUUID() }, "TARGET_NOT_ACTIVE");
    const audit = (
      await db.query(
        "SELECT action,actor_id,reason FROM abasong.audit_events WHERE id=ANY($1::uuid[]) ORDER BY action",
        [[grant.operation_id, revoke.operation_id]],
      )
    ).rows;
    assert.equal(audit.length, 2);
    assert(audit.every((r) => r.actor_id === operator));
    assert.deepEqual(JSON.parse(audit[0].reason), grant);
    checks++;
    console.log(
      `PASS: pilot access ${checks} operator/expiry/idempotency/isolation checks and real HTTP permission transitions`,
    );
  } finally {
    await pool.end();
  }
}
