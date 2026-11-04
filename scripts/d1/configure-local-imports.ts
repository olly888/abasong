import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
export const localImportPolicy = {
  version: 1,
  max_images: 10,
  max_image_bytes: 10485760,
  max_total_bytes: 52428800,
  max_pixels: 24000000,
  draft_ttl_seconds: 86400,
  source_ttl_seconds: 86400,
  upload_ttl_seconds: 300,
  processing_timeout_seconds: 60,
  daily_image_limit: 50,
  max_candidates: 100,
  recognition_mode: "on_device",
  supported_mime_types: ["image/jpeg", "image/png", "image/heic"],
};
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    u = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(u.username, "postgres");
  assert.equal(u.pathname, "/abasong_d0");
  const db = new Client({ connectionString: u.href });
  await db.connect();
  try {
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM abasong.schema_version WHERE version='V12.0004'",
        )
      ).rowCount,
      1,
    );
    await db.query("BEGIN");
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('local-d1-config',0))",
    );
    const prior = (
      await db.query(
        "SELECT version,config FROM abasong.config_versions WHERE activated_at<=now() ORDER BY version DESC LIMIT 1",
      )
    ).rows[0];
    const cfg = { ...prior?.config };
    if (!cfg.import_policy) {
      cfg.import_policy = localImportPolicy;
      cfg.feedback_window_days ??= 7;
      cfg.apartment_resolve ??= {
        radius_m: 150,
        max_age_seconds: 120,
        future_tolerance_seconds: 15,
        max_accuracy_m: 100,
      };
      await db.query(
        "INSERT INTO abasong.config_versions(version,config,activated_at) VALUES($1,$2,now())",
        [(prior?.version ?? 0) + 1, cfg],
      );
    }
    await db.query("COMMIT");
    console.log(
      "Local D1 import policy configured; existing parameters preserved; automatic matching not enabled; no cloud change",
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error("Local policy setup failed; no private details emitted");
  process.exitCode = 1;
});
