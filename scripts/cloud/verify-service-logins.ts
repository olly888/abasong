import { readFileSync, lstatSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import type { TLSSocket } from "node:tls";
import {
  PILOT_PROJECT,
  pilotDatabaseOptions,
  type DatabaseKey,
} from "../../packages/runtime/src/index";
import { assertRuntimeApproval } from "./runtime-identity";

async function main() {
  const folder = ".tooling/cloud-runtime";
  const approval = JSON.parse(readFileSync(`${folder}/approval.json`, "utf8"));
  assertRuntimeApproval(approval, true);
  if (
    !/^aws-\d+-us-west-1\.pooler\.supabase\.com$/.test(approval.database_host)
  )
    throw new Error("Reviewed pooler host required");
  const path = `${folder}/service-logins.json`,
    info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077)
    throw new Error("Owner-only credentials required");
  const credentials = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    string
  >;
  const roles = [
    "abasong_api_dev",
    "abasong_sensitive_dev",
    "abasong_worker_dev",
  ];
  if (
    Object.keys(credentials).sort().join() !== [...roles].sort().join() ||
    Object.values(credentials).some((v) => !/^[a-f0-9]{64}$/.test(v))
  )
    throw new Error("Credential shape refused");
  const results = [];
  for (const role of roles) {
    const url = new URL(
      `postgresql://${approval.database_host}:5432/postgres?sslmode=verify-full`,
    );
    url.username = `${role}.${PILOT_PROJECT}`;
    url.password = credentials[role]!;
    const client = new Client({
      ...pilotDatabaseOptions(
        url.href,
        approval.database_host,
        {
          abasong_api_dev: "DATABASE_URL",
          abasong_sensitive_dev: "DATABASE_SENSITIVE_URL",
          abasong_worker_dev: "WORKER_DATABASE_URL",
        }[role] as DatabaseKey,
      ),
      connectionTimeoutMillis: 5000,
      statement_timeout: 3000,
    });
    try {
      await client.connect();
      const socket = (
        client as unknown as { connection: { stream: TLSSocket } }
      ).connection.stream;
      if (!socket.encrypted || !socket.authorized)
        throw new Error("Verified TLS required");
      const check = await client.query(
        "SELECT current_user AS name, has_table_privilege(current_user,'abasong.access_secrets','SELECT') AS sensitive_select",
      );
      if (
        check.rows[0]?.name !== role ||
        check.rows[0]?.sensitive_select !== (role === "abasong_sensitive_dev")
      )
        throw new Error("Runtime role boundary refused");
      results.push({
        role,
        tls: socket.getProtocol(),
        hostname_verified: true,
        sensitive_select: check.rows[0].sensitive_select,
      });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      console.error(
        JSON.stringify({
          role,
          connected: false,
          code:
            typeof code === "string" && /^[A-Z0-9_]{3,60}$/.test(code)
              ? code
              : "UNAVAILABLE",
        }),
      );
      throw new Error("Service login verification refused", { cause: error });
    } finally {
      await client.end();
    }
  }
  writeFileSync(
    `${folder}/service-login-verification.json`,
    JSON.stringify(
      {
        verified_at: new Date().toISOString(),
        results,
        credentials_output: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      verified_logins: results.length,
      tls: true,
      permission_separation: true,
      credentials_output: false,
    }),
  );
}
void main().catch(() => {
  console.error("Service login validation stopped; private details omitted.");
  process.exitCode = 1;
});
