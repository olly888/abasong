import { REQUIRED_SCHEMA_VERSIONS } from "@abasong/contracts";
export async function assertSchemaReady(
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: { version: string }[] }>,
) {
  const { rows } = await query(
    "SELECT version FROM abasong.schema_version WHERE version=ANY($1::text[])",
    [[...REQUIRED_SCHEMA_VERSIONS]],
  );
  const installed = new Set(rows.map((r) => r.version));
  if (REQUIRED_SCHEMA_VERSIONS.some((version) => !installed.has(version)))
    throw new Error("Required schema unavailable");
}
