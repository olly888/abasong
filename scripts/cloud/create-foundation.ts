import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { PILOT_REGION } from "./aws-inspection";
import {
  assertFoundationIdentity,
  FOUNDATION_STACK,
} from "./foundation-target";

function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--expected-account" ||
    !/^\d{12}$/.test(args[1]!) ||
    !["--check", "--create"].includes(args[2]!)
  )
    throw new Error("Explicit target and check/create mode required");
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("AWS_")) delete env[key];
  function aws(command: string[]) {
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
        "20",
      ],
      { env, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    if (r.error || r.status !== 0) throw new Error("AWS operation unavailable");
    const data: unknown = JSON.parse(r.stdout);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Unexpected AWS response");
    return data as Record<string, unknown>;
  }
  // This must precede every CloudFormation call, including template validation.
  assertFoundationIdentity(
    aws(["sts", "get-caller-identity"]),
    args[1]!,
    PILOT_REGION,
  );
  const template = "file://deploy/pilot-dev/foundation.json";
  aws(["cloudformation", "validate-template", "--template-body", template]);
  if (args[2] === "--check") {
    console.log(
      "Foundation target and template verified; no cloud writes performed.",
    );
    return;
  }
  // Create-only: AWS rejects an existing stack. Never delete/recreate or silently
  // update an existing installation to resolve a conflict.
  const result = aws([
    "cloudformation",
    "create-stack",
    "--stack-name",
    FOUNDATION_STACK,
    "--template-body",
    template,
    "--tags",
    "Key=Project,Value=Abasong",
    "Key=Environment,Value=pilot-dev",
    "--on-failure",
    "DO_NOTHING",
    "--client-request-token",
    `abasong-foundation-${crypto.randomUUID()}`,
  ]);
  if (typeof result.StackId !== "string")
    throw new Error("Missing stack receipt");
  mkdirSync(".tooling/cloud-account", { recursive: true, mode: 0o700 });
  writeFileSync(
    ".tooling/cloud-account/foundation-create.json",
    JSON.stringify(
      {
        requested_at: new Date().toISOString(),
        environment: "pilot-dev",
        region: PILOT_REGION,
        account_suffix: args[1]!.slice(-4),
        stack: FOUNDATION_STACK,
        state: "creation_requested",
        stack_id: result.StackId,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Foundation creation requested; completion and resource checks are still required.",
  );
}

try {
  main();
} catch {
  console.error(
    "Foundation command refused or unavailable. Check project role and target; sensitive details omitted. Inspect AWS state before retrying a create request.",
  );
  process.exitCode = 1;
}
