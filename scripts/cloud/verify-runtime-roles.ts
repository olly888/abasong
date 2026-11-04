import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { serviceRoleTemplate } from "./runtime-identity";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

function main() {
  const { account, mode } = runtimeTarget();
  if (mode !== "--verify") throw new Error("Read-only verification required");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const folder = ".tooling/cloud-runtime";
  const parameters = JSON.parse(
    readFileSync(`${folder}/service-roles-parameters.json`, "utf8"),
  ) as Array<{ ParameterKey: string; ParameterValue: string }>;
  const bindings: Record<string, string> = {
    ...Object.fromEntries(
      parameters.map((p) => [p.ParameterKey, p.ParameterValue]),
    ),
    "AWS::AccountId": account,
    "AWS::Partition": "aws",
    "AWS::Region": "us-west-1",
  };
  function resolve(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(resolve);
    if (!value || typeof value !== "object") return value;
    const r = value as Record<string, unknown>;
    if (typeof r.Ref === "string") {
      if (!bindings[r.Ref]) throw new Error("Unknown runtime role reference");
      return bindings[r.Ref];
    }
    if (typeof r["Fn::Sub"] === "string")
      return r["Fn::Sub"].replace(/\$\{([^}]+)\}/g, (_, key) => {
        if (!bindings[key])
          throw new Error("Unknown runtime role substitution");
        return bindings[key]!;
      });
    return Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, resolve(v)]),
    );
  }
  const results = [];
  for (const resource of Object.values(serviceRoleTemplate().Resources)) {
    const desired = resolve(
      (resource as { Properties: unknown }).Properties,
    ) as {
      RoleName: string;
      AssumeRolePolicyDocument: unknown;
      MaxSessionDuration: number;
      Tags: unknown;
      Policies: Array<{ PolicyName: string; PolicyDocument: unknown }>;
    };
    const actual = aws(["iam", "get-role", "--role-name", desired.RoleName])
      .Role as Record<string, unknown>;
    const tags = actual.Tags as Array<{ Key: string; Value: string }>;
    if (
      actual.Arn !== `arn:aws:iam::${account}:role/${desired.RoleName}` ||
      actual.Path !== "/" ||
      actual.MaxSessionDuration !== desired.MaxSessionDuration ||
      !isDeepStrictEqual(
        actual.AssumeRolePolicyDocument,
        desired.AssumeRolePolicyDocument,
      ) ||
      !isDeepStrictEqual(
        tags.slice().sort((a, b) => a.Key.localeCompare(b.Key)),
        (desired.Tags as typeof tags)
          .slice()
          .sort((a, b) => a.Key.localeCompare(b.Key)),
      )
    )
      throw new Error("Runtime role trust/target differs");
    const attached = aws([
      "iam",
      "list-attached-role-policies",
      "--role-name",
      desired.RoleName,
    ]).AttachedPolicies as unknown[];
    const inline = aws([
      "iam",
      "list-role-policies",
      "--role-name",
      desired.RoleName,
    ]).PolicyNames as string[];
    if (attached.length || inline.length !== 1 || inline[0] !== "PilotOnly")
      throw new Error("Unexpected runtime permissions");
    const doc = aws([
      "iam",
      "get-role-policy",
      "--role-name",
      desired.RoleName,
      "--policy-name",
      "PilotOnly",
    ]).PolicyDocument;
    if (!isDeepStrictEqual(doc, desired.Policies[0]!.PolicyDocument))
      throw new Error("Runtime role policy differs");
    results.push({ role: desired.RoleName, trust_and_policy_verified: true });
  }
  writeFileSync(
    `${folder}/service-roles-verification.json`,
    JSON.stringify({ verified_at: new Date().toISOString(), results }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      roles: results.length,
      exact_trust_policy_and_tags: true,
      unexpected_permissions: false,
      writes: false,
    }),
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
