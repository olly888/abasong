import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  serviceRoleTemplate,
  SERVICE_ROLE_STACK,
  SECRET_STACK,
} from "./runtime-identity";
import { assertDependencyGraph } from "./runtime-plan";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

function main() {
  const { account, mode } = runtimeTarget();
  if (!["--check", "--create", "--status"].includes(mode))
    throw new Error("Mode refused");
  const root = awsRuntime("abasong-bootstrap"),
    daily = awsRuntime();
  const identity = root(["sts", "get-caller-identity"]);
  if (
    identity.Account !== account ||
    identity.Arn !== `arn:aws:iam::${account}:root` ||
    (root(["iam", "get-account-summary"]).SummaryMap as Record<string, unknown>)
      .AccountMFAEnabled !== 1
  )
    throw new Error("IAM-only bootstrap requires verified owner MFA session");
  assertRuntimeCaller(daily, account);
  const folder = ".tooling/cloud-runtime";
  const save = (name: string, value: unknown) =>
    writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  if (mode === "--status") {
    const result = root([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      SERVICE_ROLE_STACK,
    ]);
    save("service-roles-status", result);
    const stack = (
      result.Stacks as Array<{ StackStatus: string; Outputs?: unknown[] }>
    )[0]!;
    console.log(
      JSON.stringify({
        stack: SERVICE_ROLE_STACK,
        status: stack.StackStatus,
        roles: stack.Outputs?.length ?? 0,
      }),
    );
    return;
  }
  const template = serviceRoleTemplate();
  assertDependencyGraph(template);
  if (
    Object.keys(template.Resources).length !== 4 ||
    Object.values(template.Resources).some(
      (r) => (r as { Type: string }).Type !== "AWS::IAM::Role",
    )
  )
    throw new Error("IAM-only four-role template required");
  const secrets = daily([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    SECRET_STACK,
  ]);
  const stack = (
    secrets.Stacks as Array<{
      StackStatus: string;
      Outputs: Array<{ OutputKey: string; OutputValue: string }>;
    }>
  )[0]!;
  if (stack.StackStatus !== "CREATE_COMPLETE" || stack.Outputs.length !== 5)
    throw new Error("Secrets not ready");
  const foundation = awsRuntime("abasong-pilot")([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "abasong-pilot-dev-foundation",
  ]);
  const fs = (
    foundation.Stacks as Array<{
      StackStatus: string;
      Outputs: Array<{ OutputKey: string; OutputValue: string }>;
    }>
  )[0]!;
  if (!["UPDATE_COMPLETE", "CREATE_COMPLETE"].includes(fs.StackStatus))
    throw new Error("Foundation not ready");
  const values: Record<string, string> = {
    BusinessKeyArn: fs.Outputs.find((o) => o.OutputKey === "DataKeyArn")!
      .OutputValue,
  };
  for (const output of stack.Outputs)
    values[output.OutputKey.replace(/Arn$/, "")] = output.OutputValue;
  if (
    Object.keys(values).sort().join() !==
    Object.keys(template.Parameters).sort().join()
  )
    throw new Error("Parameter inventory refused");
  for (const [key, value] of Object.entries(values)) {
    const p = template.Parameters[key as keyof typeof template.Parameters] as {
      AllowedPattern: string;
    };
    if (
      !new RegExp(p.AllowedPattern).test(value) ||
      value.split(":")[4] !== account
    )
      throw new Error("Parameter target refused");
  }
  save("service-roles-template", template);
  save(
    "service-roles-parameters",
    Object.entries(values).map(([ParameterKey, ParameterValue]) => ({
      ParameterKey,
      ParameterValue,
    })),
  );
  root([
    "cloudformation",
    "validate-template",
    "--template-body",
    `file://${folder}/service-roles-template.json`,
  ]);
  if (mode === "--check") {
    console.log(
      "Four-role IAM-only template and exact secret/key bindings verified; no writes.",
    );
    return;
  }
  const result = root([
    "cloudformation",
    "create-stack",
    "--stack-name",
    SERVICE_ROLE_STACK,
    "--template-body",
    `file://${folder}/service-roles-template.json`,
    "--parameters",
    `file://${folder}/service-roles-parameters.json`,
    "--capabilities",
    "CAPABILITY_NAMED_IAM",
    "--disable-rollback",
    "--client-request-token",
    `abasong-roles-${randomUUID()}`,
  ]);
  save("service-roles-create", {
    requested_at: new Date().toISOString(),
    result,
    resources: 4,
    iam_only: true,
  });
  console.log(
    "Four previously approved ECS roles requested; completion remains to be verified.",
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
