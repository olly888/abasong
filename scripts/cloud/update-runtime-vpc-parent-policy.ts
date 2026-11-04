import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { runtimeParentNetworkPolicy as runtimeComputePolicy } from "./runtime-identity";
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
    previousParent = structuredClone(next);
  const extraRead = [
    "ec2:DescribeVpcAttribute",
    "ec2:DescribeNetworkAcls",
    "ec2:DescribeVpcEncryptionControls",
    "ec2:DescribeSecurityGroupRules",
  ];
  const regional = previousParent.Statement.find(
    (s) => s.Sid === "RegionalMetadata",
  )!;
  regional.Action = regional.Action.filter((a) => !extraRead.includes(a));
  const oldNetwork = [
    "vpc",
    "subnet",
    "internet-gateway",
    "route-table",
    "security-group",
  ].map((type) => `arn:aws:ec2:us-west-1:${account}:${type}/*`);
  for (const sid of ["CreateTaggedNetworkOnly", "TagNewNetworkOnly"])
    previousParent.Statement.find((s) => s.Sid === sid)!.Resource = oldNetwork;
  const ecs = previousParent.Statement.find(
    (s) => s.Sid === "OnlyPilotEcsFamilies",
  )!;
  ecs.Action = ecs.Action.filter(
    (a) =>
      ![
        "ecs:DescribeServiceDeployments",
        "ecs:ListServiceDeployments",
        "ecs:ListTagsForResource",
      ].includes(a),
  );
  ecs.Resource = (ecs.Resource as string[]).filter(
    (r) => !r.includes(":service-deployment/"),
  );
  const previous = structuredClone(previousParent);
  previous.Statement.find((s) => s.Sid === "RegionalMetadata")!.Sid =
    "RegionalInfrastructureMetadata";
  const children = [
    "ec2:CreateSubnet",
    "ec2:CreateSecurityGroup",
    "ec2:CreateRouteTable",
  ];
  const owned = previous.Statement.find(
    (s) => s.Sid === "ManageOwnedNetworkOnly",
  )!;
  owned.Action = owned.Action.filter((a) => !children.includes(a));
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
    console.log("Exact owned-VPC parent policy already active.");
    return;
  }
  if (
    !isDeepStrictEqual(current.Document, previous) &&
    !isDeepStrictEqual(current.Document, previousParent)
  )
    throw new Error(
      "Existing compute policy differs from reviewed previous version",
    );
  const folder = ".tooling/cloud-runtime";
  const save = (name: string, value: unknown) =>
    writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  save("runtime-compute-before-parent-fix", current);
  save("runtime-compute-parent-fix", next);
  save("runtime-compute-parent-input-list", [JSON.stringify(next)]);
  const validation = aws([
    "accessanalyzer",
    "validate-policy",
    "--policy-type",
    "IDENTITY_POLICY",
    "--policy-document",
    `file://${folder}/runtime-compute-parent-fix.json`,
  ]);
  save("runtime-compute-parent-validation", validation);
  if (
    !Array.isArray(validation.findings) ||
    validation.findings.some((f) =>
      ["ERROR", "SECURITY_WARNING"].includes(f.findingType),
    )
  )
    throw new Error("Policy analyzer refused");
  const cases = [
    ...[true, false].flatMap((own) => [
      {
        name: `service-read-${own}`,
        actions: ["ecs:ListServiceDeployments", "ecs:ListTagsForResource"],
        resource: `arn:aws:ecs:us-west-1:${account}:service/${own ? "abasong-pilot-dev/abasong-pilot-dev-api" : "foreign/foreign"}`,
        project: "",
        tag: "ResourceTag",
        expected: own ? "allowed" : "implicitDeny",
      },
      {
        name: `deployment-read-${own}`,
        actions: ["ecs:DescribeServiceDeployments"],
        resource: `arn:aws:ecs:us-west-1:${account}:service-deployment/${own ? "abasong-pilot-dev/abasong-pilot-dev-api" : "foreign/foreign"}/test-id`,
        project: "",
        tag: "ResourceTag",
        expected: own ? "allowed" : "implicitDeny",
      },
    ]),
    ...["us-west-1", "us-east-1"].map((region) => ({
      name: `regional-read-${region}`,
      actions: ["ec2:DescribeSecurityGroupRules"],
      resource: "*",
      project: "",
      tag: "ResourceTag",
      region,
      expected: region === "us-west-1" ? "allowed" : "implicitDeny",
    })),
    ...["Abasong", "Other", ""].map((project) => ({
      name: `parent-${project || "untagged"}`,
      actions: children,
      resource: `arn:aws:ec2:us-west-1:${account}:vpc/vpc-0123456789abcdef0`,
      project,
      tag: "ResourceTag",
      expected: project === "Abasong" ? "allowed" : "implicitDeny",
    })),
    ...["subnet", "security-group", "route-table"].flatMap((kind, index) =>
      [true, false].map((tagged) => ({
        name: `new-${kind}-${tagged}`,
        actions: [children[index]!],
        resource: `arn:aws:ec2:us-west-1:${account}:${kind}/test-id`,
        project: tagged ? "Abasong" : "",
        tag: "RequestTag",
        expected: tagged ? "allowed" : "implicitDeny",
      })),
    ),
  ];
  const simulations = cases.map((c) => {
    const contexts = c.project
      ? [
          {
            ContextKeyName: `aws:${c.tag}/Project`,
            ContextKeyValues: [c.project],
            ContextKeyType: "string",
          },
          {
            ContextKeyName: `aws:${c.tag}/Environment`,
            ContextKeyValues: ["pilot-dev"],
            ContextKeyType: "string",
          },
        ]
      : [];
    if ("region" in c)
      contexts.push({
        ContextKeyName: "aws:RequestedRegion",
        ContextKeyValues: [String(c.region)],
        ContextKeyType: "string",
      });
    const result = aws([
      "iam",
      "simulate-custom-policy",
      "--policy-input-list",
      `file://${folder}/runtime-compute-parent-input-list.json`,
      "--action-names",
      ...c.actions,
      "--resource-arns",
      c.resource,
      ...(contexts.length
        ? ["--context-entries", JSON.stringify(contexts)]
        : []),
    ]);
    const rows = result.EvaluationResults as Array<{ EvalDecision: string }>;
    if (
      rows.length !== c.actions.length ||
      rows.some((r) => r.EvalDecision !== c.expected)
    )
      throw new Error("Owned-VPC simulation refused");
    return { name: c.name, passed: true };
  });
  save("runtime-compute-parent-simulations", simulations);
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
    `file://${folder}/runtime-compute-parent-fix.json`,
    "--set-as-default",
  ]);
  const version = (result.PolicyVersion as Record<string, unknown>).VersionId;
  const actual = aws([
    "iam",
    "get-policy-version",
    "--policy-arn",
    arn,
    "--version-id",
    String(version),
  ]).PolicyVersion as Record<string, unknown>;
  if (
    actual.IsDefaultVersion !== true ||
    !isDeepStrictEqual(actual.Document, next)
  )
    throw new Error("Policy read-back refused");
  save("runtime-compute-parent-receipt", {
    applied_at: new Date().toISOString(),
    previous: info.DefaultVersionId,
    current: version,
    verified: true,
    old_version_retained: true,
  });
  console.log(
    "Owned-VPC parent authorization applied; new child resources still require project tags; foreign/untagged VPCs remain refused.",
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
