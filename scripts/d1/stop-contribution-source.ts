import { readFileSync, lstatSync } from "node:fs";
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
          "--source-id",
          "--expected-version",
          "--operation-id",
          "--reason",
        ].includes(key),
      );
      assert(!values[key]);
      const value = args[++i];
      assert(value && !value.startsWith("--"));
      values[key] = value;
    }
  }
  assert.equal(
    values["--environment"],
    "d0",
    "This reviewed command currently supports isolated D0 only",
  );
  const env = parseEnv(readFileSync(".env", "utf8")),
    target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.pathname, "/abasong_d0");
  assert.equal(target.username, "postgres");
  const stat = lstatSync(values["--token-file"]!);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size <= 16384 &&
      (stat.mode & 0o077) === 0 &&
      stat.uid === process.getuid?.(),
  );
  const jwt = readFileSync(values["--token-file"]!, "utf8").trim();
  assert(jwt.length > 0);
  Object.assign(process.env, env);
  const require = createRequire(__filename),
    { TokenVerifier } = require("../../apps/api/dist/auth/token-verifier.js"),
    {
      StopContributionCommand,
    } = require("../../apps/api/dist/operations/stop-contribution.js");
  const pool = new Pool({ connectionString: target.href });
  try {
    const result = await new StopContributionCommand(
      pool,
      new TokenVerifier(),
    ).run(
      "Bearer " + jwt,
      {
        source_id: values["--source-id"],
        expected_version: Number(values["--expected-version"]),
        operation_id: values["--operation-id"],
        reason: values["--reason"],
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
    "Operator stop refused or failed; check target, MFA, qualification and version. Sensitive details omitted.",
  );
  process.exitCode = 1;
});
