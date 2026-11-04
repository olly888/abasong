export const PILOT_PROJECT = "mxlmemaunzoramgemiju";
export { databaseConnectionOptions, pilotDatabaseOptions } from "./database";
export type { DatabaseKey } from "./database";
import { pilotDatabaseOptions, type DatabaseKey } from "./database";
export const PILOT_API = "https://api-dev.abasong.com";
export function assertCloudImageEnvironment(
  service: "api" | "worker",
  env: Record<string, string | undefined> = process.env,
) {
  requireValue(
    env.ABASONG_ENV === "pilot-dev" && env.NODE_ENV === "production",
  );
  requireValue(
    env.LC_ALL === "C.UTF-8" && env.LANG === "C.UTF-8" && env.LANGUAGE === "",
  );
  return assertRuntimeEnvironment(service, env);
}
type Env = Record<string, string | undefined>;
function requireValue(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      "Runtime environment refused; check reviewed pilot configuration",
    );
}
export function assertRuntimeEnvironment(
  service: "api" | "worker",
  env: Env = process.env,
): "local" | "pilot-dev" {
  if (env.ABASONG_ENV !== "pilot-dev") {
    requireValue(
      env.NODE_ENV !== "production" &&
        env.DATA_ENCRYPTION_PROVIDER !== "aws-kms" &&
        (!env.ABASONG_ENV ||
          ["d0", "test", "development"].includes(env.ABASONG_ENV)),
    );
    return "local";
  }
  requireValue(env.NODE_ENV === "production" && env.AWS_REGION === "us-west-1");
  for (const key of [
    "DATABASE_ADMIN_URL",
    "LOCAL_DATA_KEK",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ])
    requireValue(env[key] === undefined);
  const expectedHost = env.PILOT_DATABASE_HOST;
  requireValue(
    expectedHost &&
      (expectedHost === `db.${PILOT_PROJECT}.supabase.co` ||
        /^aws-\d+-us-west-1\.pooler\.supabase\.com$/.test(expectedHost)),
  );
  function database(key: DatabaseKey) {
    pilotDatabaseOptions(env[key], expectedHost, key);
  }
  if (service === "api") {
    database("DATABASE_URL");
    database("DATABASE_SENSITIVE_URL");
    requireValue(
      env.WORKER_DATABASE_URL === undefined &&
        env.AUTH_ISSUER === `https://${PILOT_PROJECT}.supabase.co/auth/v1` &&
        env.AUTH_AUDIENCE === "authenticated" &&
        env.AUTH_JWT_ALGORITHM === "ES256",
    );
    requireValue(
      env.PUBLIC_API_ORIGIN === PILOT_API &&
        env.API_HOST === "0.0.0.0" &&
        env.API_PORT === "3001",
    );
    requireValue(
      env.DATA_ENCRYPTION_PROVIDER === "aws-kms" &&
        /^arn:aws:kms:us-west-1:\d{12}:key\/[0-9a-f-]{36}$/.test(
          env.KMS_KEY_ARN ?? "",
        ) &&
        /^[a-f0-9]{64}$/i.test(env.DATA_HMAC_KEY ?? "") &&
        /^pilot-v[1-9]\d*$/.test(env.DATA_HMAC_KEY_VERSION ?? ""),
    );
    requireValue(
      Number(env.IDEMPOTENCY_RETENTION_SECONDS) >= 3600 &&
        Number(env.IDEMPOTENCY_RETENTION_SECONDS) <= 604800,
    );
  } else {
    database("WORKER_DATABASE_URL");
    for (const key of [
      "DATABASE_URL",
      "DATABASE_SENSITIVE_URL",
      "DATA_HMAC_KEY",
      "KMS_KEY_ARN",
      "DATA_ENCRYPTION_PROVIDER",
    ])
      requireValue(env[key] === undefined);
  }
  return "pilot-dev";
}
