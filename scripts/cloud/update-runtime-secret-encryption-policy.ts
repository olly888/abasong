import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { runtimeSecretEncryptionPolicy as runtimeSetupPolicy } from "./runtime-identity";
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
  const policyArn = `arn:aws:iam::${account}:policy/abasong-pilot-dev-runtime-setup`;
  const next = runtimeSetupPolicy(account, approval.alert_email);
  const previous = structuredClone(next);
  previous.Statement = previous.Statement.filter(
    (s) => !["NoDirectKms", "NoNonSecretsManagerKey"].includes(s.Sid),
  );
  previous.Statement.find(
    (s) => s.Sid === "NoCredentialReadOrDataKeyAccess",
  )!.Action.splice(2, 0, "kms:*");
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
    console.log("Exact reviewed Secrets Manager policy already active.");
    return;
  }
  if (!isDeepStrictEqual(current.Document, previous))
    throw new Error("Policy differs from exact reviewed previous version");
  const folder = ".tooling/cloud-runtime";
  const save = (name: string, value: unknown) =>
    writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  save("runtime-setup-before-secrets-fix", {
    policyArn,
    version: info.DefaultVersionId,
    document: current.Document,
  });
  save("runtime-setup-secrets-fix", next);
  const validation = aws([
    "accessanalyzer",
    "validate-policy",
    "--policy-type",
    "IDENTITY_POLICY",
    "--policy-document",
    `file://${folder}/runtime-setup-secrets-fix.json`,
  ]);
  save("runtime-setup-secrets-fix-validation", validation);
  if (
    !Array.isArray(validation.findings) ||
    validation.findings.some((f) =>
      ["ERROR", "SECURITY_WARNING"].includes(f.findingType),
    )
  )
    throw new Error("Policy analyzer refused");
  const key = `arn:aws:kms:us-west-1:${account}:key/11111111-1111-4111-8111-111111111111`;
  const cases = [
    {
      name: "direct-secret-key-denied",
      aliases: ["alias/aws/secretsmanager"],
      via: undefined,
      expected: "explicitDeny",
    },
    {
      name: "direct-business-key-denied",
      aliases: ["alias/abasong-pilot-dev-data"],
      via: undefined,
      expected: "explicitDeny",
    },
    {
      name: "business-key-through-service-denied",
      aliases: ["alias/abasong-pilot-dev-data"],
      via: "secretsmanager.us-west-1.amazonaws.com",
      expected: "explicitDeny",
    },
    {
      name: "missing-alias-denied",
      aliases: [],
      via: "secretsmanager.us-west-1.amazonaws.com",
      expected: "explicitDeny",
    },
    {
      name: "wrong-service-denied",
      aliases: ["alias/aws/secretsmanager"],
      via: "s3.us-west-1.amazonaws.com",
      expected: "explicitDeny",
    },
    // AWS-managed key policy supplies service authorization. This identity policy adds no KMS Allow.
    {
      name: "only-managed-secret-service-not-explicitly-denied",
      aliases: ["alias/aws/secretsmanager"],
      via: "secretsmanager.us-west-1.amazonaws.com",
      expected: "implicitDeny",
    },
  ];
  const simulations = cases.map((c) => {
    const contexts = [
      ...(c.aliases.length
        ? [
            {
              ContextKeyName: "kms:ResourceAliases",
              ContextKeyValues: c.aliases,
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
      JSON.stringify(next),
      "--action-names",
      "kms:GenerateDataKey",
      "kms:Decrypt",
      "--resource-arns",
      key,
      ...(contexts.length
        ? ["--context-entries", JSON.stringify(contexts)]
        : []),
    ]);
    const rows = result.EvaluationResults as Array<{ EvalDecision: string }>;
    if (rows.length !== 2 || rows.some((r) => r.EvalDecision !== c.expected))
      throw new Error("Policy simulation refused");
    return { name: c.name, passed: true };
  });
  const reads = aws([
    "iam",
    "simulate-custom-policy",
    "--policy-input-list",
    JSON.stringify(next),
    "--action-names",
    "secretsmanager:GetSecretValue",
    "secretsmanager:BatchGetSecretValue",
    "iam:PutRolePolicy",
    "acm:ExportCertificate",
    "--resource-arns",
    "*",
  ]);
  if (
    (reads.EvaluationResults as Array<{ EvalDecision: string }>).some(
      (r) => r.EvalDecision !== "explicitDeny",
    )
  )
    throw new Error("No-read boundary changed");
  save("runtime-setup-secrets-fix-simulations", {
    simulations,
    credential_read_denied: true,
  });
  if (mode === "--check") {
    console.log(
      JSON.stringify({
        policy_findings: validation.findings.length,
        simulations: 7,
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
    `file://${folder}/runtime-setup-secrets-fix.json`,
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
    throw new Error("Updated version not verified");
  save("runtime-setup-secrets-fix-receipt", {
    completed_at: new Date().toISOString(),
    previous: info.DefaultVersionId,
    current: version,
    verified: true,
    old_version_retained: true,
  });
  console.log(
    "Reviewed service-only AWS-managed secret encryption exception applied; direct KMS/business key/secret reads remain denied.",
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
