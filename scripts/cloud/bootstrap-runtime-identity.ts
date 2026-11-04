import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
  chmodSync,
} from "node:fs";
import {
  runtimeSetupPolicy,
  runtimeComputePolicy,
  assertRuntimeApproval,
  RUNTIME_DEPLOYER,
  serviceRoleTemplate,
  serviceSecretTemplate,
} from "./runtime-identity";
import { assertDependencyGraph } from "./runtime-plan";

type Doc = Record<string, unknown>;
class AwsError extends Error {
  constructor(readonly code: string) {
    super("AWS operation unavailable");
  }
}
function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--expected-account" ||
    !/^\d{12}$/.test(args[1]!) ||
    !["--prepare", "--apply"].includes(args[2]!)
  )
    throw new Error("Explicit target/mode required");
  const account = args[1]!,
    folder = ".tooling/cloud-runtime";
  const approval = JSON.parse(readFileSync(`${folder}/approval.json`, "utf8"));
  assertRuntimeApproval(approval, args[2] === "--apply");
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("AWS_")) delete env[k];
  const aws = (command: string[]): Doc => {
    // This bootstrap uses only IAM and read-only validation/identity calls.
    if (!["iam", "sts", "accessanalyzer"].includes(command[0]!))
      throw new Error("IAM bootstrap service refused");
    const r = spawnSync(
      "./scripts/aws",
      [
        "--profile",
        "abasong-bootstrap",
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
      throw new AwsError(
        /\(([A-Za-z0-9]+)\) when calling/.exec(r.stderr)?.[1] ?? "Unavailable",
      );
    return r.stdout.trim() ? JSON.parse(r.stdout) : {};
  };
  const identity = aws(["sts", "get-caller-identity"]);
  if (
    identity.Account !== account ||
    identity.Arn !== `arn:aws:iam::${account}:root`
  )
    throw new Error("Verified IAM bootstrap session required");
  const summary = aws(["iam", "get-account-summary"]).SummaryMap as Doc;
  if (summary.AccountMFAEnabled !== 1) throw new Error("Root MFA required");
  const mfa = aws([
    "iam",
    "list-mfa-devices",
    "--user-name",
    "abasong-pilot-operator",
  ]).MFADevices;
  if (!Array.isArray(mfa) || mfa.length === 0)
    throw new Error("Operator MFA required");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const policy = runtimeSetupPolicy(account, approval.alert_email);
  const compute = runtimeComputePolicy(account);
  const policies = [
    { name: "runtime-setup", document: policy },
    { name: "runtime-compute", document: compute },
  ];
  if (policies.some((p) => JSON.stringify(p.document).length > 6144))
    throw new Error("Managed policy exceeds IAM quota");
  const trust = JSON.parse(
    readFileSync("deploy/pilot-dev/deployer-trust.json", "utf8").replaceAll(
      "ACCOUNT_ID",
      account,
    ),
  );
  const roleArn = `arn:aws:iam::${account}:role/${RUNTIME_DEPLOYER}`;
  const policyArns = policies.map(
    (p) => `arn:aws:iam::${account}:policy/abasong-pilot-dev-${p.name}`,
  );
  const assume = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AssumeOnlyRuntimeWithMFA",
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: roleArn,
        Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } },
      },
    ],
  };
  const artifacts = {
    "runtime-setup-policy": policy,
    "runtime-compute-policy": compute,
    "runtime-trust": trust,
    "runtime-operator-assume": assume,
    "service-roles-template": serviceRoleTemplate(),
    "service-secrets-template": serviceSecretTemplate(),
  };
  assertDependencyGraph(artifacts["service-roles-template"]);
  assertDependencyGraph(artifacts["service-secrets-template"]);
  for (const [name, value] of Object.entries(artifacts))
    writeFileSync(
      `${folder}/${name}.json`,
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const findings = policies.flatMap((p) => {
    const validation = aws([
      "accessanalyzer",
      "validate-policy",
      "--policy-type",
      "IDENTITY_POLICY",
      "--policy-document",
      `file://${folder}/${p.name}-policy.json`,
    ]);
    writeFileSync(
      `${folder}/${p.name}-validation.json`,
      JSON.stringify(validation, null, 2),
      { mode: 0o600 },
    );
    const rows = validation.findings as Array<{ findingType: string }>;
    if (!Array.isArray(rows)) throw new Error("Policy validation unavailable");
    return rows;
  });
  if (
    findings.some((f) => ["ERROR", "SECURITY_WARNING"].includes(f.findingType))
  )
    throw new Error("Policy validation requires review");
  writeFileSync(
    `${folder}/runtime-policy-input-list.json`,
    JSON.stringify(policies.map((p) => JSON.stringify(p.document))),
    { mode: 0o600 },
  );
  const cases: Array<{
    name: string;
    actions: string[];
    resource: string;
    expected: string;
    service?: string;
    contexts?: Array<{ key: string; value: string }>;
  }> = [
    {
      name: "deny-data-and-iam",
      actions: [
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "secretsmanager:GetSecretValue",
        "iam:CreateUser",
        "iam:PutRolePolicy",
        "freetier:UpgradeAccountPlan",
      ],
      resource: "*",
      expected: "explicitDeny",
    },
    {
      name: "pass-ecs-role",
      actions: ["iam:PassRole"],
      resource: `arn:aws:iam::${account}:role/abasong-pilot-dev-api-task`,
      service: "ecs-tasks.amazonaws.com",
      expected: "allowed",
    },
    {
      name: "no-pass-cfn-role",
      actions: ["iam:PassRole"],
      resource: `arn:aws:iam::${account}:role/abasong-pilot-dev-api-task`,
      service: "cloudformation.amazonaws.com",
      expected: "implicitDeny",
    },
    {
      name: "no-pass-foundation-role",
      actions: ["iam:PassRole"],
      resource: `arn:aws:iam::${account}:role/abasong-pilot-dev-deployer`,
      service: "ecs-tasks.amazonaws.com",
      expected: "implicitDeny",
    },
    {
      name: "write-own-secret",
      actions: ["secretsmanager:PutSecretValue"],
      resource: `arn:aws:secretsmanager:us-west-1:${account}:secret:abasong/pilot-dev/api-db-ABC123`,
      expected: "allowed",
    },
    {
      name: "no-other-secret",
      actions: ["secretsmanager:PutSecretValue"],
      resource: `arn:aws:secretsmanager:us-west-1:${account}:secret:foreign/api-db-ABC123`,
      expected: "implicitDeny",
    },
    {
      name: "no-manage-iam-stack",
      actions: ["cloudformation:CreateStack"],
      resource: `arn:aws:cloudformation:us-west-1:${account}:stack/abasong-pilot-dev-service-roles/00000000-0000-0000-0000-000000000000`,
      expected: "implicitDeny",
    },
    {
      name: "no-untagged-network",
      actions: ["ec2:CreateVpc"],
      resource: `arn:aws:ec2:us-west-1:${account}:vpc/vpc-0123456789abcdef0`,
      expected: "implicitDeny",
    },
    {
      name: "create-tagged-network",
      actions: ["ec2:CreateVpc"],
      resource: `arn:aws:ec2:us-west-1:${account}:vpc/vpc-0123456789abcdef0`,
      contexts: [
        { key: "aws:RequestTag/Project", value: "Abasong" },
        { key: "aws:RequestTag/Environment", value: "pilot-dev" },
      ],
      expected: "allowed",
    },
    {
      name: "no-foreign-network",
      actions: ["ec2:DeleteVpc"],
      resource: `arn:aws:ec2:us-west-1:${account}:vpc/vpc-0123456789abcdef0`,
      contexts: [
        { key: "aws:ResourceTag/Project", value: "Other" },
        { key: "aws:ResourceTag/Environment", value: "pilot-dev" },
      ],
      expected: "implicitDeny",
    },
    {
      name: "push-own-repository",
      actions: ["ecr:PutImage"],
      resource: `arn:aws:ecr:us-west-1:${account}:repository/abasong-pilot-dev-api`,
      expected: "allowed",
    },
    {
      name: "no-other-repository",
      actions: ["ecr:PutImage"],
      resource: `arn:aws:ecr:us-west-1:${account}:repository/other`,
      expected: "implicitDeny",
    },
    {
      name: "no-other-cluster",
      actions: ["ecs:UpdateService"],
      resource: `arn:aws:ecs:us-west-1:${account}:service/other/other`,
      expected: "implicitDeny",
    },
  ];
  const simulations = cases.map((c) => {
    const result = aws([
      "iam",
      "simulate-custom-policy",
      "--policy-input-list",
      `file://${folder}/runtime-policy-input-list.json`,
      "--action-names",
      ...c.actions,
      "--resource-arns",
      c.resource,
      ...(c.service || c.contexts
        ? [
            "--context-entries",
            JSON.stringify([
              ...(c.service
                ? [
                    {
                      ContextKeyName: "iam:PassedToService",
                      ContextKeyValues: [c.service],
                      ContextKeyType: "string",
                    },
                  ]
                : []),
              ...(c.contexts ?? []).map((v) => ({
                ContextKeyName: v.key,
                ContextKeyValues: [v.value],
                ContextKeyType: "string",
              })),
            ]),
          ]
        : []),
    ]);
    const rows = result.EvaluationResults as Array<{ EvalDecision: string }>;
    return {
      case: c.name,
      passed:
        rows.length > 0 && rows.every((r) => r.EvalDecision === c.expected),
    };
  });
  writeFileSync(
    `${folder}/runtime-setup-simulation.json`,
    JSON.stringify(simulations, null, 2),
    { mode: 0o600 },
  );
  if (simulations.some((s) => !s.passed))
    throw new Error("Runtime policy simulation refused");
  if (args[2] === "--prepare") {
    console.log(
      JSON.stringify({
        prepared: true,
        policy_findings: findings.length,
        aws_writes: false,
      }),
    );
    return;
  }
  // Create-only or exact-match. Never overwrite an unrelated policy.
  for (const p of policies) {
    const policyArn = `arn:aws:iam::${account}:policy/abasong-pilot-dev-${p.name}`;
    try {
      const existing = aws(["iam", "get-policy", "--policy-arn", policyArn])
        .Policy as Doc;
      const version = aws([
        "iam",
        "get-policy-version",
        "--policy-arn",
        policyArn,
        "--version-id",
        String(existing.DefaultVersionId),
      ]).PolicyVersion as Doc;
      if (!isDeepStrictEqual(version.Document, p.document))
        throw new Error("Existing runtime policy differs");
    } catch (error) {
      if (!(error instanceof AwsError) || error.code !== "NoSuchEntity")
        throw error;
      aws([
        "iam",
        "create-policy",
        "--policy-name",
        `abasong-pilot-dev-${p.name}`,
        "--policy-document",
        `file://${folder}/${p.name}-policy.json`,
        "--tags",
        "Key=Project,Value=Abasong",
        "Key=Environment,Value=pilot-dev",
      ]);
    }
  }
  try {
    const existing = aws(["iam", "get-role", "--role-name", RUNTIME_DEPLOYER])
      .Role as Doc;
    if (
      !isDeepStrictEqual(existing.AssumeRolePolicyDocument, trust) ||
      existing.MaxSessionDuration !== 3600
    )
      throw new Error("Existing runtime trust differs");
  } catch (error) {
    if (!(error instanceof AwsError) || error.code !== "NoSuchEntity")
      throw error;
    aws([
      "iam",
      "create-role",
      "--role-name",
      RUNTIME_DEPLOYER,
      "--assume-role-policy-document",
      `file://${folder}/runtime-trust.json`,
      "--max-session-duration",
      "3600",
      "--tags",
      "Key=Project,Value=Abasong",
      "Key=Environment,Value=pilot-dev",
    ]);
  }
  const attached = aws([
    "iam",
    "list-attached-role-policies",
    "--role-name",
    RUNTIME_DEPLOYER,
  ]).AttachedPolicies as Array<{ PolicyArn: string }>;
  const inline = aws([
    "iam",
    "list-role-policies",
    "--role-name",
    RUNTIME_DEPLOYER,
  ]).PolicyNames as unknown[];
  if (inline.length || attached.some((p) => !policyArns.includes(p.PolicyArn)))
    throw new Error("Unexpected runtime permissions");
  for (const policyArn of policyArns)
    if (!attached.some((p) => p.PolicyArn === policyArn))
      aws([
        "iam",
        "attach-role-policy",
        "--role-name",
        RUNTIME_DEPLOYER,
        "--policy-arn",
        policyArn,
      ]);
  for (const [name, service] of [
    ["AWSServiceRoleForECS", "ecs.amazonaws.com"],
    [
      "AWSServiceRoleForElasticLoadBalancing",
      "elasticloadbalancing.amazonaws.com",
    ],
  ]) {
    try {
      aws(["iam", "get-role", "--role-name", name!]);
    } catch (error) {
      if (!(error instanceof AwsError) || error.code !== "NoSuchEntity")
        throw error;
      aws([
        "iam",
        "create-service-linked-role",
        "--aws-service-name",
        service!,
      ]);
    }
  }
  try {
    const existing = aws([
      "iam",
      "get-user-policy",
      "--user-name",
      "abasong-pilot-operator",
      "--policy-name",
      "AbasongRuntimeAssume",
    ]).PolicyDocument;
    if (!isDeepStrictEqual(existing, assume))
      throw new Error("Existing operator runtime policy differs");
  } catch (error) {
    if (!(error instanceof AwsError) || error.code !== "NoSuchEntity")
      throw error;
    aws([
      "iam",
      "put-user-policy",
      "--user-name",
      "abasong-pilot-operator",
      "--policy-name",
      "AbasongRuntimeAssume",
      "--policy-document",
      `file://${folder}/runtime-operator-assume.json`,
    ]);
  }
  const configPath = ".tooling/aws/config";
  const marker = "[profile abasong-runtime]";
  const existingConfig = existsSync(configPath)
    ? readFileSync(configPath, "utf8")
    : "";
  if (!existingConfig.includes(marker))
    appendFileSync(
      configPath,
      `\n${marker}\nrole_arn = ${roleArn}\nsource_profile = abasong-operator\nrole_session_name = abasong-pilot-runtime\nduration_seconds = 3600\nregion = us-west-1\noutput = json\n`,
      { mode: 0o600 },
    );
  chmodSync(configPath, 0o600);
  writeFileSync(
    `${folder}/runtime-identity-receipt.json`,
    JSON.stringify(
      {
        applied_at: new Date().toISOString(),
        account_suffix: account.slice(-4),
        role: RUNTIME_DEPLOYER,
        setup_policy_validated: true,
        service_linked_roles: 2,
        root_business_resources_created: false,
        compute_permissions_granted: true,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Project MFA runtime identity configured; compute, secrets and service roles remain pending verification.",
  );
}
try {
  main();
} catch (error) {
  console.error(
    `Runtime IAM bootstrap refused (${error instanceof AwsError ? error.code : "configuration"}); private details omitted.`,
  );
  process.exitCode = 1;
}
