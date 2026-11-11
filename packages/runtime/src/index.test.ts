import { expect, test } from "vitest";
import {
  assertRuntimeEnvironment,
  assertCloudImageEnvironment,
  PILOT_PROJECT,
  PILOT_API,
} from "./index";
function valid() {
  const host = `db.${PILOT_PROJECT}.supabase.co`;
  return {
    ABASONG_ENV: "pilot-dev",
    NODE_ENV: "production",
    AWS_REGION: "us-west-1",
    PILOT_DATABASE_HOST: host,
    DATABASE_URL: `postgres://abasong_api_dev:TEST@${host}/postgres?sslmode=verify-full`,
    DATABASE_SENSITIVE_URL: `postgres://abasong_sensitive_dev:TEST@${host}/postgres?sslmode=verify-full`,
    AUTH_ISSUER: `https://${PILOT_PROJECT}.supabase.co/auth/v1`,
    AUTH_AUDIENCE: "authenticated",
    AUTH_JWT_ALGORITHM: "ES256",
    PUBLIC_API_ORIGIN: PILOT_API,
    API_HOST: "0.0.0.0",
    API_PORT: "3001",
    DATA_ENCRYPTION_PROVIDER: "aws-kms",
    KMS_KEY_ARN:
      "arn:aws:kms:us-west-1:000000000000:key/11111111-1111-4111-8111-111111111111",
    DATA_HMAC_KEY: "a".repeat(64),
    DATA_HMAC_KEY_VERSION: "pilot-v1",
    IDEMPOTENCY_RETENTION_SECONDS: "86400",
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    LANGUAGE: "",
  };
}
test("fixed cloud image entrypoint refuses relabeling as local even with a development NODE_ENV", () => {
  expect(() =>
    assertCloudImageEnvironment("api", {
      ...valid(),
      ABASONG_ENV: "d0",
      NODE_ENV: "development",
      DATA_ENCRYPTION_PROVIDER: "local-development",
    }),
  ).toThrow();
  expect(assertCloudImageEnvironment("api", valid())).toBe("pilot-dev");
});
test("cloud images refuse environment-selected gettext catalogs", () => {
  for (const patch of [
    { LC_ALL: "en_US.UTF-8" },
    { LANG: "en_US.UTF-8" },
    { LANGUAGE: "../../app-tmp" },
  ])
    expect(() =>
      assertCloudImageEnvironment("api", { ...valid(), ...patch }),
    ).toThrow();
});
test("pilot enforces provider/project/TLS/role and cannot be bypassed by changing NODE_ENV", () => {
  expect(assertRuntimeEnvironment("api", valid())).toBe("pilot-dev");
  for (const patch of [
    { NODE_ENV: "development" },
    { ABASONG_ENV: "d0" },
    { DATA_ENCRYPTION_PROVIDER: "local-development" },
    { LOCAL_DATA_KEK: "TEST" },
    { AUTH_ISSUER: "https://other.supabase.co/auth/v1" },
    { DATABASE_URL: valid().DATABASE_URL.replace("verify-full", "require") },
    {
      DATABASE_URL: valid().DATABASE_URL.replace("abasong_api_dev", "postgres"),
    },
    { AWS_ACCESS_KEY_ID: "TEST" },
    { PILOT_DATABASE_HOST: "other.supabase.co" },
  ])
    expect(() =>
      assertRuntimeEnvironment("api", { ...valid(), ...patch }),
    ).toThrow();
});
test("worker cannot receive private connection/KMS material", () => {
  const api = valid(),
    worker = {
      ABASONG_ENV: api.ABASONG_ENV,
      NODE_ENV: api.NODE_ENV,
      AWS_REGION: api.AWS_REGION,
      PILOT_DATABASE_HOST: api.PILOT_DATABASE_HOST,
      WORKER_DATABASE_URL: api.DATABASE_URL.replace(
        "abasong_api_dev",
        "abasong_worker_dev",
      ),
    };
  expect(assertRuntimeEnvironment("worker", worker)).toBe("pilot-dev");
  for (const key of [
    "DATABASE_URL",
    "DATABASE_SENSITIVE_URL",
    "DATA_HMAC_KEY",
    "KMS_KEY_ARN",
  ])
    expect(() =>
      assertRuntimeEnvironment("worker", { ...worker, [key]: "TEST" }),
    ).toThrow();
});
