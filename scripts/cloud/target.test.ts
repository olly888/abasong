import { expect, test } from "vitest";
import { migrationTarget } from "./target";
import { PILOT_PROJECT } from "../../packages/runtime/src/index";
test("cloud migration target requires DevWest, pilot environment, admin and verified TLS", () => {
  const good = `postgres://postgres:TEST@db.${PILOT_PROJECT}.supabase.co:5432/postgres?sslmode=verify-full`;
  expect(migrationTarget(good, PILOT_PROJECT, "pilot-dev").hostname).toBe(
    `db.${PILOT_PROJECT}.supabase.co`,
  );
  for (const bad of [
    good.replace(PILOT_PROJECT, "other"),
    good.replace("5432", "6543"),
    good.replace("verify-full", "require"),
    good.replace("/postgres?", "/abasong_d0?"),
    good + "&sslrootcert=bad",
    good.replace("postgres:TEST", "abasong_api_dev:TEST"),
  ])
    expect(() => migrationTarget(bad, PILOT_PROJECT, "pilot-dev")).toThrow();
  expect(() => migrationTarget(good, PILOT_PROJECT, "d0")).toThrow();
  expect(() => migrationTarget(good, "other", "pilot-dev")).toThrow();
});
