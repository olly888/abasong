import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionOptions } from "node:tls";

const PROJECT = "mxlmemaunzoramgemiju";
const logins = {
  DATABASE_URL: "abasong_api_dev",
  DATABASE_SENSITIVE_URL: "abasong_sensitive_dev",
  WORKER_DATABASE_URL: "abasong_worker_dev",
} as const;
export type DatabaseKey = keyof typeof logins;

/** Validate before removing URI SSL options: pg otherwise replaces the supplied CA. */
export function pilotDatabaseOptions(
  raw: string | undefined,
  expectedHost: string | undefined,
  key: DatabaseKey,
): { connectionString: string; ssl: ConnectionOptions } {
  const refuse = () => {
    throw new Error("Reviewed pilot database TLS configuration required");
  };
  try {
    if (
      !raw ||
      !expectedHost ||
      !(
        expectedHost === `db.${PROJECT}.supabase.co` ||
        /^aws-\d+-us-west-1\.pooler\.supabase\.com$/.test(expectedHost)
      )
    )
      return refuse();
    const url = new URL(raw);
    const login = logins[key];
    if (
      !login ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== expectedHost ||
      (url.port && url.port !== "5432") ||
      url.pathname !== "/postgres" ||
      url.hash ||
      !url.password ||
      decodeURIComponent(url.username) !==
        (expectedHost.startsWith("db.") ? login : `${login}.${PROJECT}`) ||
      url.searchParams.getAll("sslmode").length !== 1 ||
      url.searchParams.get("sslmode") !== "verify-full" ||
      [...url.searchParams.keys()].some((k) => k !== "sslmode")
    )
      return refuse();
    url.searchParams.delete("sslmode");
    return {
      connectionString: url.href,
      ssl: {
        ca: readFileSync(
          join(__dirname, "../certs/supabase-prod-root.pem"),
          "utf8",
        ),
        rejectUnauthorized: true,
        servername: expectedHost,
      },
    };
  } catch {
    return refuse();
  }
}

export function databaseConnectionOptions(
  key: DatabaseKey,
  env: Record<string, string | undefined> = process.env,
): { connectionString: string | undefined; ssl?: ConnectionOptions } {
  if (env.ABASONG_ENV === "pilot-dev")
    return pilotDatabaseOptions(env[key], env.PILOT_DATABASE_HOST, key);
  if (env.NODE_ENV === "production")
    throw new Error(
      "Production database requires reviewed pilot configuration",
    );
  return { connectionString: env[key] };
}
