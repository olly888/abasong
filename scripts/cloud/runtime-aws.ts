import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertRuntimeApproval, RUNTIME_DEPLOYER } from "./runtime-identity";

export function runtimeTarget() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--expected-account" ||
    !/^\d{12}$/.test(args[1]!) ||
    !/^--[a-z-]+$/.test(args[2]!)
  )
    throw new Error("Explicit target and mode required");
  const approval = JSON.parse(
    readFileSync(".tooling/cloud-runtime/approval.json", "utf8"),
  );
  assertRuntimeApproval(approval, true);
  return { account: args[1]!, mode: args[2]!, approval };
}

export function awsRuntime(profile = "abasong-runtime") {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("AWS_")) delete env[key];
  return (command: string[]): Record<string, unknown> => {
    const r = spawnSync(
      "./scripts/aws",
      [
        "--profile",
        profile,
        ...command,
        "--region",
        "us-west-1",
        "--output",
        "json",
        "--no-cli-pager",
        "--cli-connect-timeout",
        "5",
        "--cli-read-timeout",
        "20",
      ],
      { env, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
    );
    if (r.error || r.status !== 0) {
      const code =
        /\(([A-Za-z0-9]+)\) when calling/.exec(r.stderr)?.[1] ?? "Unavailable";
      throw new Error(
        `AWS operation refused (${code}; kms=${/kms|KMS/.test(r.stderr)})`,
      );
    }
    return r.stdout.trim() ? JSON.parse(r.stdout) : {};
  };
}
export function assertRuntimeCaller(
  aws: ReturnType<typeof awsRuntime>,
  account: string,
) {
  const identity = aws(["sts", "get-caller-identity"]);
  if (
    identity.Account !== account ||
    typeof identity.Arn !== "string" ||
    !new RegExp(
      `^arn:aws:sts::${account}:assumed-role/${RUNTIME_DEPLOYER}/[A-Za-z0-9_+=,.@-]{2,64}$`,
    ).test(identity.Arn)
  )
    throw new Error("Reviewed runtime MFA session required");
}
export function safeFailure(error: unknown) {
  console.error(
    error instanceof Error && error.message.startsWith("AWS operation refused")
      ? error.message
      : "Reviewed cloud operation stopped; private details omitted.",
  );
  process.exitCode = 1;
}
