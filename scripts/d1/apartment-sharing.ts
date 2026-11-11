import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs, parseEnv } from "node:util";
import { Pool } from "pg";
import { localTarget } from "../d0/database-target";

async function main() {
  const { values } = parseArgs({
    options: {
      environment: { type: "string" },
      "token-file": { type: "string" },
      "apartment-id": { type: "string" },
      "operation-id": { type: "string" },
      "expected-version": { type: "string" },
      action: { type: "string" },
      reason: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  assert.equal(values.environment, "d0");
  const env = parseEnv(readFileSync(".env", "utf8"));
  const target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.pathname, "/abasong_d0");
  assert.equal(target.username, "postgres");
  const file = values["token-file"];
  assert(file);
  const stat = lstatSync(file);
  assert(
    stat.isFile() &&
      stat.size <= 16384 &&
      (stat.mode & 0o077) === 0 &&
      stat.uid === process.getuid?.(),
  );
  const jwt = readFileSync(file, "utf8").trim();
  assert(jwt.length > 0);
  const version = values["expected-version"];
  assert(version === undefined || /^(0|[1-9]\d*)$/.test(version));
  Object.assign(process.env, env);
  const require = createRequire(__filename);
  const {
    TokenVerifier,
  } = require("../../apps/api/dist/auth/token-verifier.js");
  const {
    ApartmentSharingCommand,
  } = require("../../apps/api/dist/operations/apartment-sharing.js");
  const pool = new Pool({ connectionString: target.href });
  try {
    const result = await new ApartmentSharingCommand(
      pool,
      new TokenVerifier(),
    ).run(
      `Bearer ${jwt}`,
      {
        apartment_id: values["apartment-id"],
        expected_version: version === undefined ? undefined : Number(version),
        operation_id: values["operation-id"],
        action: values.action,
        reason: values.reason,
      },
      values.apply,
    );
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("操作未执行。请核对 D0 环境、管理员资格、MFA 和共享状态版本。");
  process.exitCode = 1;
});
