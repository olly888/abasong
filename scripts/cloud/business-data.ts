import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  runtimeTarget,
  awsRuntime,
  assertRuntimeCaller,
  safeFailure,
} from "./runtime-aws";

export const pilotBusinessPolicy = {
  feedback_window_days: 7,
  apartment_resolve: {
    radius_m: 150,
    max_age_seconds: 120,
    future_tolerance_seconds: 15,
    max_accuracy_m: 100,
  },
  import_policy: {
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
  },
};
export type BusinessManifest = {
  operation: string;
  apartment: string;
  source: string;
  building: string;
};
export function cloudBusinessSql(m: BusinessManifest) {
  if (
    Object.values(m).some(
      (v) =>
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          v,
        ),
    ) ||
    new Set(Object.values(m)).size !== 4
  )
    throw new Error("Business manifest refused");
  const dataset = JSON.parse(
      readFileSync("data/public-apartments/la-expansion.geojson", "utf8"),
    ),
    f = dataset.features[0],
    p = f.properties;
  const refs: string[] = p.geometry_sources ?? [p.geometry_source];
  if (
    dataset.license !== "https://opendatacommons.org/licenses/odbl/1-0/" ||
    p.address_line1 !== "2445 E Del Mar Blvd" ||
    !refs.length ||
    refs.some(
      (r) =>
        !/^https:\/\/www\.openstreetmap\.org\/(way|relation)\/\d+$/.test(r),
    ) ||
    !/^https:\/\//.test(p.address_source)
  )
    throw new Error("Public source refused");
  const lit = (s: string) => "'" + s.replaceAll("'", "''") + "'",
    geometry = lit(JSON.stringify(f.geometry)),
    cfg = lit(JSON.stringify(pilotBusinessPolicy));
  return `DO $business$
DECLARE shape extensions.geometry := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(${geometry}),4326); stored jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('abasong:pilot-dev:business-initialization',0));
 IF NOT EXISTS(SELECT 1 FROM abasong.schema_version WHERE version='V12.0009') OR NOT extensions.ST_IsValid(shape) OR extensions.ST_IsEmpty(shape) THEN RAISE EXCEPTION 'Pilot business prerequisite refused'; END IF;
 IF EXISTS(SELECT 1 FROM abasong.audit_events WHERE id='${m.operation}' AND action='operator.pilot.business_initialize') THEN
   IF NOT EXISTS(SELECT 1 FROM abasong.apartments WHERE id='${m.apartment}' AND source_id='${m.source}' AND address_line1='2445 E Del Mar Blvd') THEN RAISE EXCEPTION 'Business replay conflict'; END IF;
   RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM abasong.config_versions) OR EXISTS(SELECT 1 FROM abasong.apartments) THEN RAISE EXCEPTION 'Nonempty pilot configuration requires review'; END IF;
 INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(1,${cfg}::jsonb,now());
 INSERT INTO abasong.data_sources(id,source_type,provider,product,license_reference,persistent_use_approved,verified_at)
 VALUES('${m.source}','licensed_dataset','OpenStreetMap','osm-api-0.6',${lit("ODbL-1.0; " + refs.join("; ") + "; " + p.address_source)},true,now());
 INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,source_id,point,boundary,status,confidence)
 VALUES('${m.apartment}',${lit(p.name)},${lit(p.address_line1)},${lit(p.city)},${lit(p.state)},${lit(p.postal_code)},'${m.source}',extensions.ST_PointOnSurface(shape)::extensions.geography,shape,'active','authorized_source');
 INSERT INTO abasong.apartment_buildings(id,apartment_id,source_id,footprint,label_point,street_number,verified_at)
 SELECT '${m.building}',id,source_id,boundary,point::extensions.geometry,${lit(p.street_number)},now() FROM abasong.apartments WHERE id='${m.apartment}';
 INSERT INTO abasong.audit_events(id,action,object_type,object_id,result,reason) VALUES('${m.operation}','operator.pilot.business_initialize','apartment','${m.apartment}','success','Public ODbL Del Mar fixture and reviewed pilot policy; no passwords or driver location');
END $business$;`;
}
function main() {
  const { account, mode } = runtimeTarget();
  if (mode !== "--prepare-business")
    throw new Error(
      "Prepare only; execute through the connected DevWest owner",
    );
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const dir = ".tooling/cloud-runtime/acceptance",
    file = `${dir}/business-manifest.json`;
  const m: BusinessManifest = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        operation: randomUUID(),
        apartment: randomUUID(),
        source: randomUUID(),
        building: randomUUID(),
      };
  const sql = cloudBusinessSql(m);
  if (!existsSync(file))
    writeFileSync(file, JSON.stringify(m), { mode: 0o600, flag: "wx" });
  writeFileSync(`${dir}/business.sql`, sql, { mode: 0o600 });
  console.log(
    "One independently licensed public apartment and reviewed pilot policy prepared; no driver data, shared secrets or map-provider temporary results.",
  );
}
if (process.argv[1]?.endsWith("business-data.ts")) {
  try {
    main();
  } catch (e) {
    safeFailure(e);
  }
}
