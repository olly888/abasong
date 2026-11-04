import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  runtimeParentNetworkPolicy,
  runtimeComputePolicy,
} from "./runtime-identity";
import { awsRuntime, runtimeTarget, safeFailure } from "./runtime-aws";

function main() {
  const { account, mode } = runtimeTarget();
  if (!["--check", "--apply"].includes(mode)) throw new Error("Mode refused");
  const aws = awsRuntime("abasong-bootstrap"),
    id = aws(["sts", "get-caller-identity"]);
  if (
    id.Account !== account ||
    id.Arn !== `arn:aws:iam::${account}:root` ||
    (aws(["iam", "get-account-summary"]).SummaryMap as Record<string, unknown>)
      .AccountMFAEnabled !== 1
  )
    throw new Error("Isolated IAM bootstrap with MFA required");
  const next = runtimeComputePolicy(account),
    previous = runtimeParentNetworkPolicy(account);
  if (JSON.stringify(next).length > 6144) throw new Error("IAM quota exceeded");
  const arn = `arn:aws:iam::${account}:policy/abasong-pilot-dev-runtime-compute`;
  const info = aws(["iam", "get-policy", "--policy-arn", arn]).Policy as Record<
    string,
    unknown
  >;
  const current = aws([
    "iam",
    "get-policy-version",
    "--policy-arn",
    arn,
    "--version-id",
    String(info.DefaultVersionId),
  ]).PolicyVersion as Record<string, unknown>;
  if (isDeepStrictEqual(current.Document, next)) {
    console.log("Exact cluster-scoped observation policy already active.");
    return;
  }
  if (!isDeepStrictEqual(current.Document, previous))
    throw new Error(
      "Current policy differs from exact reviewed previous version",
    );
  const folder = ".tooling/cloud-runtime";
  const save = (name: string, value: unknown) =>
    writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  save("runtime-compute-before-observation", current);
  save("runtime-compute-observation", next);
  save("runtime-compute-observation-input", [JSON.stringify(next)]);
  const validation = aws([
    "accessanalyzer",
    "validate-policy",
    "--policy-type",
    "IDENTITY_POLICY",
    "--policy-document",
    `file://${folder}/runtime-compute-observation.json`,
  ]);
  save("runtime-compute-observation-validation", validation);
  if (
    !Array.isArray(validation.findings) ||
    validation.findings.some((f) =>
      ["ERROR", "SECURITY_WARNING"].includes(f.findingType),
    )
  )
    throw new Error("Policy analyzer refused");
  const cases = [
    {
      name: "own-task-list",
      cluster: `arn:aws:ecs:us-west-1:${account}:cluster/abasong-pilot-dev`,
      expected: "allowed",
    },
    {
      name: "foreign-task-list",
      cluster: `arn:aws:ecs:us-west-1:${account}:cluster/foreign`,
      expected: "implicitDeny",
    },
    { name: "missing-cluster-list", cluster: "", expected: "implicitDeny" },
  ];
  const simulations = cases.map((c) => {
    const result = aws([
      "iam",
      "simulate-custom-policy",
      "--policy-input-list",
      `file://${folder}/runtime-compute-observation-input.json`,
      "--action-names",
      "ecs:ListTasks",
      "--resource-arns",
      "*",
      ...(c.cluster
        ? [
            "--context-entries",
            JSON.stringify([
              {
                ContextKeyName: "ecs:cluster",
                ContextKeyValues: [c.cluster],
                ContextKeyType: "string",
              },
            ]),
          ]
        : []),
    ]);
    const rows = result.EvaluationResults as Array<{ EvalDecision: string }>;
    if (rows.length !== 1 || rows[0]?.EvalDecision !== c.expected)
      throw new Error("Observation scope simulation refused");
    return { name: c.name, passed: true };
  });
  save("runtime-compute-observation-simulations", simulations);
  if (mode === "--check") {
    console.log(
      JSON.stringify({
        findings: validation.findings.length,
        simulations: cases.length,
        writes: false,
      }),
    );
    return;
  }
  const result = aws([
    "iam",
    "create-policy-version",
    "--policy-arn",
    arn,
    "--policy-document",
    `file://${folder}/runtime-compute-observation.json`,
    "--set-as-default",
  ]);
  const version = (result.PolicyVersion as Record<string, unknown>).VersionId;
  const check = aws([
    "iam",
    "get-policy-version",
    "--policy-arn",
    arn,
    "--version-id",
    String(version),
  ]).PolicyVersion as Record<string, unknown>;
  if (
    check.IsDefaultVersion !== true ||
    !isDeepStrictEqual(check.Document, next)
  )
    throw new Error("Policy read-back refused");
  save("runtime-compute-observation-receipt", {
    applied_at: new Date().toISOString(),
    previous: info.DefaultVersionId,
    current: version,
    verified: true,
    old_version_retained: true,
  });
  console.log(
    "Exact-cluster Fargate observation applied; foreign or missing cluster listing refused, other permissions unchanged.",
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
