import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { buildRuntimeTemplates } from "./runtime-templates";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

export function assertBootstrapConfigUpdate(prior: unknown, next: unknown) {
  const expected = structuredClone(buildRuntimeTemplates().runtime);
  if (!isDeepStrictEqual(next, expected))
    throw new Error("Unexpected next template");
  const task = (expected.Resources.ApiTask as { Properties: unknown })
    .Properties as {
    ContainerDefinitions: Array<{
      Secrets: Array<{ Name: string; ValueFrom: unknown }>;
    }>;
  };
  task.ContainerDefinitions[0]!.Secrets =
    task.ContainerDefinitions[0]!.Secrets.filter(
      (s) => s.Name !== "IDEMPOTENCY_HMAC_KEY",
    );
  if (!isDeepStrictEqual(prior, expected))
    throw new Error("Runtime drift; refuse update");
}

function main() {
  const { account, mode } = runtimeTarget();
  if (
    ![
      "--bootstrap-check",
      "--bootstrap-prepare",
      "--bootstrap-status",
      "--bootstrap-execute",
    ].includes(mode)
  )
    throw new Error("Explicit bootstrap config mode required");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const folder = ".tooling/cloud-runtime",
    stack = "abasong-pilot-dev-runtime";
  const save = (file: string, value: unknown) =>
    writeFileSync(`${folder}/${file}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  if (["--bootstrap-status", "--bootstrap-execute"].includes(mode)) {
    const receipt = JSON.parse(
      readFileSync(`${folder}/bootstrap-changeset.json`, "utf8"),
    );
    if (
      receipt.account !== account ||
      receipt.stack !== stack ||
      typeof receipt.id !== "string"
    )
      throw new Error("Change set target refused");
    const result = aws([
      "cloudformation",
      "describe-change-set",
      "--stack-name",
      stack,
      "--change-set-name",
      receipt.id,
    ]);
    save("bootstrap-changeset-status", result);
    const changes = result.Changes as
      | Array<{
          ResourceChange: {
            Action: string;
            LogicalResourceId: string;
            Replacement: string;
          };
        }>
      | undefined;
    if (mode === "--bootstrap-status") {
      console.log(
        JSON.stringify({
          status: result.Status,
          changes: changes?.map((c) => ({
            action: c.ResourceChange.Action,
            resource: c.ResourceChange.LogicalResourceId,
            replacement: c.ResourceChange.Replacement,
          })),
        }),
      );
      return;
    }
    if (
      result.Status !== "CREATE_COMPLETE" ||
      result.ExecutionStatus !== "AVAILABLE" ||
      !changes?.length ||
      changes.some(
        (c) =>
          c.ResourceChange.Action !== "Modify" ||
          !["ApiTask", "ApiService"].includes(
            c.ResourceChange.LogicalResourceId,
          ),
      ) ||
      !changes.some((c) => c.ResourceChange.LogicalResourceId === "ApiTask")
    )
      throw new Error("Change set exceeds bootstrap fix");
    const raw = aws([
      "cloudformation",
      "get-template",
      "--stack-name",
      stack,
    ]).TemplateBody;
    const next = buildRuntimeTemplates().runtime;
    assertBootstrapConfigUpdate(
      typeof raw === "string" ? JSON.parse(raw) : raw,
      next,
    );
    const proposed = aws([
      "cloudformation",
      "get-template",
      "--stack-name",
      stack,
      "--change-set-name",
      receipt.id,
    ]).TemplateBody;
    if (
      !isDeepStrictEqual(
        typeof proposed === "string" ? JSON.parse(proposed) : proposed,
        next,
      )
    )
      throw new Error("Changed proposal refused");
    aws([
      "cloudformation",
      "execute-change-set",
      "--stack-name",
      stack,
      "--change-set-name",
      receipt.id,
    ]);
    console.log(
      "Exact account bootstrap config update requested; no new secret, image, role or network.",
    );
    return;
  }
  const state = (
    aws(["cloudformation", "describe-stacks", "--stack-name", stack])
      .Stacks as Array<{
      StackStatus: string;
      Parameters: Array<{ ParameterKey: string }>;
    }>
  )[0]!;
  if (!["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(state.StackStatus))
    throw new Error("Stable runtime required");
  const raw = aws([
    "cloudformation",
    "get-template",
    "--stack-name",
    stack,
  ]).TemplateBody;
  const next = buildRuntimeTemplates().runtime;
  assertBootstrapConfigUpdate(
    typeof raw === "string" ? JSON.parse(raw) : raw,
    next,
  );
  save("bootstrap-runtime-template", next);
  save(
    "bootstrap-parameters",
    state.Parameters.map((p) => ({
      ParameterKey: p.ParameterKey,
      UsePreviousValue: true,
    })),
  );
  if (mode === "--bootstrap-check") {
    console.log(
      "Exact prior template and single secret binding verified; no writes.",
    );
    return;
  }
  const result = aws([
    "cloudformation",
    "create-change-set",
    "--stack-name",
    stack,
    "--change-set-name",
    `${stack}-bootstrap-${randomUUID()}`,
    "--change-set-type",
    "UPDATE",
    "--template-body",
    `file://${folder}/bootstrap-runtime-template.json`,
    "--parameters",
    `file://${folder}/bootstrap-parameters.json`,
  ]);
  save("bootstrap-changeset", { account, stack, id: result.Id });
  console.log(
    "Bounded bootstrap configuration change set prepared; execution requires exact change review.",
  );
}
if (process.argv[1]?.endsWith("update-business-config.ts")) {
  try {
    main();
  } catch (e) {
    safeFailure(e);
  }
}
