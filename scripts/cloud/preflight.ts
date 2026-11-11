// Read-only cloud preflight. There is deliberately no apply switch in A2.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { PILOT_PROJECT } from "../../packages/runtime/src/index";
import { REQUIRED_SCHEMA_VERSIONS } from "../../packages/contracts/src/schema-versions";
import { migrationTarget } from "./target";
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--manifest", "--read-only"].includes(args[0]!))
    throw new Error(
      "Choose --manifest or --read-only; cloud apply is not enabled",
    );
  const files = readdirSync("database/migrations")
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  if (files.length !== REQUIRED_SCHEMA_VERSIONS.length)
    throw new Error("Migration manifest mismatch");
  const manifest = files.map((file, i) => {
    const sql = readFileSync(`database/migrations/${file}`, "utf8");
    if (!sql.includes(`'${REQUIRED_SCHEMA_VERSIONS[i]}'`))
      throw new Error("Migration version mismatch");
    return {
      file,
      version: REQUIRED_SCHEMA_VERSIONS[i],
      sha256: createHash("sha256").update(sql).digest("hex"),
    };
  });
  mkdirSync(".tooling/cloud", { recursive: true });
  writeFileSync(
    ".tooling/cloud/migration-manifest.json",
    JSON.stringify(
      { environment: "pilot-dev", project: PILOT_PROJECT, manifest },
      null,
      2,
    ) + "\n",
  );
  if (args[0] === "--manifest") {
    console.log(
      `Prepared ${manifest.length} migration checksums; no network or database writes`,
    );
    return;
  }
  const target = migrationTarget(
      process.env.CLOUD_DATABASE_MIGRATION_URL,
      process.env.CLOUD_PROJECT_REF,
      process.env.ABASONG_ENV,
    ),
    db = new Client({
      connectionString: target.href,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
  try {
    await db.connect();
    await db.query("BEGIN READ ONLY");
    const extension = (
      await db.query(
        "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'",
      )
    ).rows[0];
    if (extension && extension.nspname !== "extensions")
      throw new Error("PostGIS schema requires review before migration");
    const present = (
      await db.query(
        "SELECT to_regclass('abasong.schema_version') IS NOT NULL AS installed",
      )
    ).rows[0].installed;
    const installed = present
      ? (
          await db.query(
            "SELECT version FROM abasong.schema_version ORDER BY version",
          )
        ).rows.map((r) => r.version)
      : [];
    if (installed.some((v) => !REQUIRED_SCHEMA_VERSIONS.includes(v)))
      throw new Error("Unexpected schema version; stop and review");
    let gap = false;
    for (const version of REQUIRED_SCHEMA_VERSIONS) {
      if (!installed.includes(version)) gap = true;
      else if (gap)
        throw new Error("Non-contiguous migrations; stop and review");
    }
    // Reject local envelopes/fixtures in a cloud pilot. Never copy D0 data/keys.
    if (installed.includes("V12.0009")) {
      const old = (
        await db.query(
          "SELECT (SELECT count(*) FROM abasong.personal_apartments WHERE payload->>'format'<>'aws-kms-envelope-v1')+(SELECT count(*) FROM abasong.personal_access_records WHERE payload->>'format'<>'aws-kms-envelope-v1')+(SELECT count(*) FROM abasong.import_batches WHERE payload->>'format'<>'aws-kms-envelope-v1')+(SELECT count(*) FROM abasong.access_secrets WHERE cipher_version<>'aws-kms-envelope-v1') AS count",
        )
      ).rows[0];
      if (Number(old.count) !== 0)
        throw new Error(
          "Cloud contains unsupported envelopes; review required",
        );
    }
    await db.query("ROLLBACK");
    console.log(
      JSON.stringify({
        environment: "pilot-dev",
        project: PILOT_PROJECT,
        installed,
        missing: manifest
          .filter((v) => !installed.includes(v.version))
          .map((v) => v.file),
        read_only: true,
      }),
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Cloud preflight refused or failed; check reviewed target/TLS/schema. Sensitive details omitted.",
  );
  process.exitCode = 1;
});
