import { X509Certificate } from "node:crypto";
import { expect, test } from "vitest";
import { databaseConnectionOptions, pilotDatabaseOptions } from "./database";

const host = "aws-0-us-west-1.pooler.supabase.com";
const raw = `postgres://abasong_api_dev.mxlmemaunzoramgemiju:TEST@${host}:5432/postgres?sslmode=verify-full`;

test("pilot PG uses vendor CA with mandatory hostname verification, without URI override", () => {
  const options = pilotDatabaseOptions(raw, host, "DATABASE_URL");
  expect(new URL(options.connectionString).search).toBe("");
  expect(options.ssl.rejectUnauthorized).toBe(true);
  expect(options.ssl.servername).toBe(host);
  const certificate = new X509Certificate(options.ssl.ca as string);
  expect(certificate.ca).toBe(true);
  expect(certificate.fingerprint256.replaceAll(":", "")).toBe(
    "807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA",
  );
  expect(certificate.checkIssued(certificate)).toBe(true);
});

test("pilot refuses SSL downgrades, other hosts, roles, projects and URI option injection", () => {
  for (const value of [
    raw.replace("verify-full", "require"),
    raw.replace("verify-full", "no-verify"),
    raw.replace("verify-full", "disable"),
    raw + "&sslmode=disable",
    raw + "&sslcert=other",
    raw + "&sslrootcert=other",
    raw + "&ssl=false",
    raw + "#other",
    raw.replace(host, "other.supabase.co"),
    raw.replace("mxlmemaunzoramgemiju", "anotherproject"),
    raw.replace("abasong_api_dev", "postgres"),
    raw.replace(":5432", ":6543"),
    raw.replace("/postgres?", "/other?"),
    "not a URL TEST-sensitive-input",
  ]) {
    expect(() => pilotDatabaseOptions(value, host, "DATABASE_URL")).toThrow(
      "Reviewed pilot database TLS configuration required",
    );
  }
  expect(() =>
    pilotDatabaseOptions(raw, host, "DATABASE_SENSITIVE_URL"),
  ).toThrow();
});

test("CA trust stays within pilot PG clients; local D0 and global trust unchanged", () => {
  expect(
    databaseConnectionOptions("DATABASE_URL", { DATABASE_URL: "TEST-local" }),
  ).toEqual({ connectionString: "TEST-local" });
  expect(() =>
    databaseConnectionOptions("DATABASE_URL", {
      NODE_ENV: "production",
      DATABASE_URL: raw,
    }),
  ).toThrow();
  expect(
    databaseConnectionOptions("DATABASE_URL", {
      ABASONG_ENV: "pilot-dev",
      DATABASE_URL: raw,
      PILOT_DATABASE_HOST: host,
    }).ssl?.rejectUnauthorized,
  ).toBe(true);
});
