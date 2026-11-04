import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  inspectAwsAccount,
  type AwsReadResult,
  PILOT_REGION,
} from "./aws-inspection";

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== "--expected-account" ||
    !/^\d{12}$/.test(args[1]!)
  )
    throw new Error("Explicit expected account required");
  const env = { ...process.env };
  // CLI auth comes from the reviewed project login profile, not inherited keys,
  // alternate endpoints or credential-process/container environment overrides.
  for (const key of Object.keys(env))
    if (key.startsWith("AWS_")) delete env[key];
  const read = async (command: string[]): Promise<AwsReadResult> => {
    const r = spawnSync(
      "./scripts/aws",
      [
        ...command,
        "--region",
        PILOT_REGION,
        "--output",
        "json",
        "--no-cli-pager",
        "--cli-connect-timeout",
        "5",
        "--cli-read-timeout",
        "10",
      ],
      { env, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 20_000 },
    );
    if (r.error || r.status !== 0) {
      const message = r.stderr ?? "";
      const reason = /AccessDenied|UnauthorizedOperation|NotAuthorized/.test(
        message,
      )
        ? "denied"
        : /could not be found|Unable to locate credentials|ExpiredToken|Login.*expired|UnauthorizedSSOToken/.test(
              message,
            )
          ? "not_authenticated"
          : /RepositoryNotFound|ResourceNotFound/.test(message)
            ? "not_found"
            : "unavailable";
      return { ok: false, reason };
    }
    const data: unknown = JSON.parse(r.stdout);
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { ok: false, reason: "unavailable" };
    return { ok: true, data: data as Record<string, unknown> };
  };
  const result = {
    inspected_at: new Date().toISOString(),
    ...(await inspectAwsAccount(read, args[1]!)),
  };
  mkdirSync(".tooling/cloud-account", { recursive: true, mode: 0o700 });
  writeFileSync(
    ".tooling/cloud-account/inspection.json",
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => {
  console.error(
    "AWS inspection refused or unavailable; check project login and expected account. No cloud writes performed; sensitive details omitted.",
  );
  process.exitCode = 1;
});
