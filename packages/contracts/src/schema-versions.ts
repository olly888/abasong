// Runtime readiness and local migration verification use the same required set.
// Append a version when application behavior begins depending on that migration.
export const REQUIRED_SCHEMA_VERSIONS = Object.freeze([
  "V12.0001",
  "V12.0002",
  "V12.0003",
  "V12.0004",
  "V12.0005",
  "V12.0006",
  "V12.0007",
  "V12.0008",
  "V12.0009",
  "V12.0010",
  "V12.0011",
  "V12.0012",
] as const);
