import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  assertRuntimeApproval,
  RUNTIME_DEPLOYER,
  SECRET_STACK,
  serviceSecretTemplate,
} from "./runtime-identity";
import { assertDependencyGraph } from "./runtime-plan";

function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--expected-account" ||
    !/^\d{12}$/.test(args[1]!) ||
    !["--check", "--create", "--status"].includes(args[2]!)
  )
    throw new Error("Explicit target and mode required");
  const account = args[1]!;
  assertRuntimeApproval(
    JSON.parse(readFileSync(".tooling/cloud-runtime/approval.json", "utf8")),
    true,
  );
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("AWS_")) delete env[k];
  const aws = (command: string[]): Record<string, unknown> => {
    const r = spawnSync(
      "./scripts/aws",
      [
        "--profile",
        "abasong-runtime",
        ...command,
        "--region",
        "us-west-1",
        "--output",
        "json",
        "--cli-connect-timeout",
        "5",
        "--cli-read-timeout",
        "20",
      ],
      { env, encoding: "utf8", timeout: 30000 },
    );
    if (r.error || r.status !== 0)
      throw new Error(
        `AWS operation refused (${/\(([A-Za-z0-9]+)\) when calling/.exec(r.stderr)?.[1] ?? "unavailable"})`,
      );
    return r.stdout.trim() ? JSON.parse(r.stdout) : {};
  };
  const identity = aws(["sts", "get-caller-identity"]);
  if (
    identity.Account !== account ||
    typeof identity.Arn !== "string" ||
    !new RegExp(
      `^arn:aws:sts::${account}:assumed-role/${RUNTIME_DEPLOYER}/[A-Za-z0-9_+=,.@-]{2,64}$`,
    ).test(identity.Arn)
  )
    throw new Error("Verified runtime MFA identity required");
  const folder = ".tooling/cloud-runtime";
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (args[2] === "--status") {
    const result = aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      SECRET_STACK,
    ]);
    writeFileSync(
      `${folder}/service-secrets-status.json`,
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    const stack = (
      result.Stacks as Array<{ StackStatus: string; Outputs?: unknown[] }>
    )[0]!;
    console.log(
      JSON.stringify({
        stack: SECRET_STACK,
        status: stack.StackStatus,
        outputs: stack.Outputs?.length ?? 0,
      }),
    );
    return;
  }
  const template = serviceSecretTemplate();
  assertDependencyGraph(template);
  if (
    Object.keys(template.Resources).length !== 5 ||
    Object.values(template.Resources).some(
      (v) => (v as { Type: string }).Type !== "AWS::SecretsManager::Secret",
    )
  )
    throw new Error("Five-secret inventory required");
  writeFileSync(
    `${folder}/service-secrets-template.json`,
    JSON.stringify(template, null, 2),
    { mode: 0o600 },
  );
  aws([
    "cloudformation",
    "validate-template",
    "--template-body",
    `file://${folder}/service-secrets-template.json`,
  ]);
  if (args[2] === "--check") {
    console.log("Runtime secret template and target verified; no writes.");
    return;
  }
  const result = aws([
    "cloudformation",
    "create-stack",
    "--stack-name",
    SECRET_STACK,
    "--template-body",
    `file://${folder}/service-secrets-template.json`,
    "--disable-rollback",
    "--client-request-token",
    `abasong-secrets-${randomUUID()}`,
  ]);
  writeFileSync(
    `${folder}/service-secrets-create.json`,
    JSON.stringify(
      {
        requested_at: new Date().toISOString(),
        result,
        plaintext_values: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Five empty service secrets requested; actual completion remains to be verified.",
  );
}
try {
  main();
} catch (error) {
  console.error(
    error instanceof Error && /^AWS operation refused/.test(error.message)
      ? error.message
      : "Service secret setup refused; private details omitted.",
  );
  process.exitCode = 1;
}
