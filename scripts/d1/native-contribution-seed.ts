import type { Client } from "pg";
import { randomUUID } from "node:crypto";
export async function seedContributions(
  db: Client,
  owner: string,
  driver: string,
) {
  for (const user of [owner, driver])
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.contribute','TEST disposable contribution'),($1,'access.read','TEST disposable contribution')",
      [user],
    );
  const source = randomUUID(),
    ids = [randomUUID(), randomUUID(), randomUUID()];
  await db.query(
    "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic','TEST-only fictional addresses',true)",
    [source],
  );
  for (const [i, id] of ids.entries())
    await db.query(
      "INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,source_id,point,status) VALUES($1,$2,$3,'TEST City','CA','90000',$4,extensions.ST_SetSRID(extensions.ST_Point($5,34.0522),4326)::extensions.geography,'active')",
      [
        id,
        `TEST 公寓 ${100 + i * 2}`,
        `${100 + i * 2} TEST Ave`,
        source,
        -118.2437 + i * 0.0002,
      ],
    );
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
  await db.query(
    "INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(1,$1,now())",
    [JSON.stringify({ import_policy: policy, feedback_window_days: 7 })],
  );
  return ids;
}
export async function toggleContributionFailure(db: Client, enabled: boolean) {
  await db.query(
    "DROP TRIGGER IF EXISTS native_test_share_failure ON abasong.access_records",
  );
  if (enabled) {
    await db.query(
      "CREATE OR REPLACE FUNCTION abasong.native_test_share_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST controlled failure'; END $$",
    );
    await db.query(
      "CREATE TRIGGER native_test_share_failure BEFORE INSERT ON abasong.access_records FOR EACH ROW WHEN (NEW.scope_label='TEST 恢复门') EXECUTE FUNCTION abasong.native_test_share_failure()",
    );
  }
}
