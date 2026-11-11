import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  runtimeSecretEncryptionPolicy,
  runtimeSetupPolicy,
} from "./runtime-identity";
import { awsRuntime, runtimeTarget, safeFailure } from "./runtime-aws";

function main() {
  const { account, mode, approval } = runtimeTarget();
  if (!["--check", "--apply"].includes(mode)) throw new Error("Mode refused");
  const aws = awsRuntime("abasong-bootstrap");
  const identity = aws(["sts", "get-caller-identity"]);
  if (
    identity.Account !== account ||
    identity.Arn !== `arn:aws:iam::${account}:root` ||
    (aws(["iam", "get-account-summary"]).SummaryMap as Record<string, unknown>)
      .AccountMFAEnabled !== 1
  )
    throw new Error("Isolated IAM bootstrap with owner MFA required");
  const managed = aws(["kms", "describe-key", "--key-id", "alias/aws/acm"])
    .KeyMetadata as Record<string, unknown>;
  if (
    managed.KeyManager !== "AWS" ||
    managed.Enabled !== true ||
    typeof managed.Arn !== "string" ||
    !managed.Arn.startsWith(`arn:aws:kms:us-west-1:${account}:key/`)
  )
    throw new Error("Verified AWS-managed ACM key required");
  const policyArn = `arn:aws:iam::${account}:policy/abasong-pilot-dev-runtime-setup`;
  const next = runtimeSetupPolicy(account, approval.alert_email),
    previous = runtimeSecretEncryptionPolicy(account, approval.alert_email);
  const previousMetadata = {
    ...previous,
    Statement: [
      ...previous.Statement.map((s) => {
        if (!["NoDirectKms", "NoNonSecretsManagerKey"].includes(s.Sid))
          return s;
        const { Action: _action, Sid, ...rest } = s;
        void _action;
        return {
          ...rest,
          ...(Sid === "NoDirectKms" ? { Sid } : {}),
          NotAction: "kms:DescribeKey",
          Resource: "arn:aws:kms:*:*:key/*",
        };
      }),
      {
        Effect: "Allow",
        Action: ["kms:DescribeKey"],
        Resource: `arn:aws:kms:us-west-1:${account}:key/*`,
        Condition: {
          "ForAnyValue:StringEquals": {
            "kms:ResourceAliases": ["alias/aws/acm"],
          },
        },
      },
    ],
  };
  if (JSON.stringify(next).length > 6144) throw new Error("IAM quota exceeded");
  const info = aws(["iam", "get-policy", "--policy-arn", policyArn])
    .Policy as Record<string, unknown>;
  const current = aws([
    "iam",
    "get-policy-version",
    "--policy-arn",
    policyArn,
    "--version-id",
    String(info.DefaultVersionId),
  ]).PolicyVersion as Record<string, unknown>;
  if (isDeepStrictEqual(current.Document, next)) {
    console.log("Exact reviewed ACM metadata exception already active.");
    return;
  }
  if (
    !isDeepStrictEqual(current.Document, previous) &&
    !isDeepStrictEqual(current.Document, previousMetadata)
  )
    throw new Error(
      "Current policy differs from exact reviewed previous version",
    );
  const folder = ".tooling/cloud-runtime";
  const save = (name: string, value: unknown) =>
    writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  save("runtime-setup-before-acm-fix", current);
  save("runtime-setup-acm-fix", next);
  save("runtime-setup-acm-fix-input-list", [JSON.stringify(next)]);
  const validation = aws([
    "accessanalyzer",
    "validate-policy",
    "--policy-type",
    "IDENTITY_POLICY",
    "--policy-document",
    `file://${folder}/runtime-setup-acm-fix.json`,
  ]);
  save("runtime-setup-acm-fix-validation", validation);
  if (
    !Array.isArray(validation.findings) ||
    validation.findings.some((f) =>
      ["ERROR", "SECURITY_WARNING"].includes(f.findingType),
    )
  )
    throw new Error("Policy analyzer refused");
  const key = managed.Arn;
  const cases = [
    {
      name: "acm-key-metadata-only",
      actions: ["kms:DescribeKey"],
      alias: "alias/aws/acm",
      via: undefined,
      expected: "implicitDeny",
      resource: key,
    },
    {
      name: "business-key-metadata-not-granted",
      actions: ["kms:DescribeKey"],
      alias: "alias/abasong-pilot-dev-data",
      via: undefined,
      expected: "implicitDeny",
      resource: key,
    },
    {
      name: "direct-acm-crypto-denied",
      actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"],
      alias: "alias/aws/acm",
      via: undefined,
      expected: "explicitDeny",
      resource: key,
    },
    {
      name: "direct-business-crypto-denied",
      actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:DisableKey"],
      alias: "alias/abasong-pilot-dev-data",
      via: undefined,
      expected: "explicitDeny",
      resource: key,
    },
    {
      name: "service-business-crypto-denied",
      actions: ["kms:Decrypt", "kms:GenerateDataKey"],
      alias: "alias/abasong-pilot-dev-data",
      via: "secretsmanager.us-west-1.amazonaws.com",
      expected: "explicitDeny",
      resource: key,
    },
    {
      name: "managed-secret-encryption-no-explicit-deny",
      actions: ["kms:GenerateDataKey"],
      alias: "alias/aws/secretsmanager",
      via: "secretsmanager.us-west-1.amazonaws.com",
      expected: "implicitDeny",
      resource: key,
    },
    {
      name: "acm-managed-service-grant-uses-aws-key-policy",
      actions: ["kms:CreateGrant", "kms:Decrypt"],
      alias: "alias/aws/acm",
      via: "acm.us-west-1.amazonaws.com",
      expected: "implicitDeny",
      resource: key,
    },
    {
      name: "acm-service-business-key-denied",
      actions: ["kms:CreateGrant", "kms:Decrypt"],
      alias: "alias/abasong-pilot-dev-data",
      via: "acm.us-west-1.amazonaws.com",
      expected: "explicitDeny",
      resource: key,
    },
    {
      name: "credential-read-and-iam-denied",
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:BatchGetSecretValue",
        "iam:PutRolePolicy",
        "acm:ExportCertificate",
      ],
      alias: undefined,
      via: undefined,
      expected: "explicitDeny",
      resource: "*",
    },
  ];
  const simulations = cases.map((c) => {
    const contexts = [
      ...(c.alias
        ? [
            {
              ContextKeyName: "kms:ResourceAliases",
              ContextKeyValues: [c.alias],
              ContextKeyType: "stringList",
            },
          ]
        : []),
      ...(c.via
        ? [
            {
              ContextKeyName: "kms:ViaService",
              ContextKeyValues: [c.via],
              ContextKeyType: "string",
            },
          ]
        : []),
    ];
    const result = aws([
      "iam",
      "simulate-custom-policy",
      "--policy-input-list",
      `file://${folder}/runtime-setup-acm-fix-input-list.json`,
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
      throw new Error("Policy simulation refused");
    return { name: c.name, passed: true };
  });
  save("runtime-setup-acm-fix-simulations", simulations);
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
    policyArn,
    "--policy-document",
    `file://${folder}/runtime-setup-acm-fix.json`,
    "--set-as-default",
  ]);
  const version = (result.PolicyVersion as Record<string, unknown>).VersionId;
  const check = aws([
    "iam",
    "get-policy-version",
    "--policy-arn",
    policyArn,
    "--version-id",
    String(version),
  ]).PolicyVersion as Record<string, unknown>;
  if (
    check.IsDefaultVersion !== true ||
    !isDeepStrictEqual(check.Document, next)
  )
    throw new Error("Policy read-back refused");
  save("runtime-setup-acm-fix-receipt", {
    applied_at: new Date().toISOString(),
    previous: info.DefaultVersionId,
    current: version,
    verified: true,
    previous_retained: true,
  });
  console.log(
    "Standard AWS-managed ACM service exception applied; no identity-policy crypto Allow, direct crypto/business key/secret reads remain restricted.",
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
