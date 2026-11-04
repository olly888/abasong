import {
  readFileSync,
  fstatSync,
  openSync,
  closeSync,
  constants,
} from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { Pool } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";

async function main() {
  const args = process.argv.slice(2),
    values: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (key === "--apply") {
      assert(!apply);
      apply = true;
    } else {
      assert(
        [
          "--environment",
          "--token-file",
          "--user-id",
          "--operation-id",
          "--action",
          "--valid-until",
          "--grant-operation-id",
          "--reason",
        ].includes(key),
      );
      assert(!values[key]);
      const value = args[++i];
      assert(value && !value.startsWith("--"));
      values[key] = value;
    }
  }
  assert.equal(values["--environment"], "d0", "Only isolated D0 is reviewed");
  assert(["grant", "revoke"].includes(values["--action"]!));
  assert(
    values["--action"] === "grant"
      ? !values["--grant-operation-id"]
      : !values["--valid-until"],
  );
  const env = parseEnv(readFileSync(".env", "utf8")),
    target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.pathname, "/abasong_d0");
  assert.equal(target.username, "postgres");
  const fd = openSync(
    values["--token-file"]!,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let jwt: string;
  try {
    const stat = fstatSync(fd);
    assert(
      stat.isFile() &&
        stat.size <= 16384 &&
        (stat.mode & 0o077) === 0 &&
        stat.uid === process.getuid?.(),
    );
    jwt = readFileSync(fd, "utf8").trim();
    assert(jwt.length <= 16384);
  } finally {
    closeSync(fd);
  }
  assert(jwt.length > 0);
  Object.assign(process.env, env);
  const require = createRequire(__filename),
    { TokenVerifier } = require("../../apps/api/dist/auth/token-verifier.js"),
    {
      PilotAccessCommand,
    } = require("../../apps/api/dist/operations/pilot-access.js");
  const pool = new Pool({ connectionString: target.href });
  try {
    const result = await new PilotAccessCommand(pool, new TokenVerifier()).run(
      "Bearer " + jwt,
      {
        user_id: values["--user-id"],
        operation_id: values["--operation-id"],
        action: values["--action"],
        reason: values["--reason"],
        ...(values["--action"] === "grant"
          ? { valid_until: values["--valid-until"] }
          : { grant_operation_id: values["--grant-operation-id"] }),
      },
      apply,
    );
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Pilot access refused or failed; check D0 target, operator MFA/role, expiry and operation ID. Sensitive details omitted.",
  );
  process.exitCode = 1;
});
