import { expect, it } from "vitest";
import { assertDependencyGraph } from "./runtime-plan";
import {
  runtimeSetupPolicy,
  runtimeComputePolicy,
  assertRuntimeApproval,
  serviceRoleTemplate,
  serviceSecretTemplate,
} from "./runtime-identity";

it("keeps IAM initialization separate from billable secret creation without dropping outputs", () => {
  const iam = serviceRoleTemplate(),
    secrets = serviceSecretTemplate();
  expect(Object.keys(iam.Resources)).toHaveLength(4);
  expect(Object.keys(secrets.Resources)).toHaveLength(5);
  expect(Object.keys(iam.Outputs)).toHaveLength(4);
  expect(Object.keys(secrets.Outputs)).toHaveLength(5);
  assertDependencyGraph(iam);
  assertDependencyGraph(secrets);
  expect(
    Object.values(iam.Resources).every(
      (r) => (r as { Type: string }).Type === "AWS::IAM::Role",
    ),
  ).toBe(true);
  expect(
    Object.values(secrets.Resources).every(
      (r) => (r as { Type: string }).Type === "AWS::SecretsManager::Secret",
    ),
  ).toBe(true);
});

it("does not let the daily principal mutate IAM, pass a CFN role or decrypt service data", () => {
  const p = runtimeSetupPolicy("111122223333", "test@example.com");
  const pass = p.Statement.find((s) => s.Sid === "PassOnlyEcsRuntimeRoles")!;
  expect(pass.Resource).toHaveLength(4);
  expect(pass.Condition).toEqual({
    StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
  });
  expect(p.Statement.find((s) => s.Sid === "NoIamMutation")?.Effect).toBe(
    "Deny",
  );
  expect(
    p.Statement.find((s) => s.Sid === "NoCredentialReadOrDataKeyAccess")
      ?.Action,
  ).toContain("kms:*");
  const stacks = p.Statement.find((s) => s.Sid === "OnlyReviewedStacks")!;
  expect(JSON.stringify(stacks)).not.toMatch(/foundation|service-roles/);
  const secret = p.Statement.find((s) => s.Sid === "OnlyFiveSecrets")!;
  expect(secret.Resource).toHaveLength(5);
  expect(JSON.stringify(secret.Resource)).not.toContain("*");
});

it("refuses an absent account or an invalid notification address", () => {
  expect(() => runtimeSetupPolicy("ACCOUNT_ID", "test@example.com")).toThrow();
  expect(() =>
    runtimeSetupPolicy("111122223333", "test@example.com\nprivate"),
  ).toThrow();
});

it("requires specific IAM approval in addition to the approved resource costs", () => {
  const resourceOnly = {
    approved: true,
    region: "us-west-1",
    environment: "pilot-dev",
  };
  expect(() => assertRuntimeApproval(resourceOnly, false)).not.toThrow();
  expect(() => assertRuntimeApproval(resourceOnly, true)).toThrow("IAM");
  expect(() =>
    assertRuntimeApproval(
      { ...resourceOnly, iam_expansion_approved: true },
      true,
    ),
  ).not.toThrow();
  expect(() =>
    assertRuntimeApproval(
      { ...resourceOnly, region: "us-east-1", iam_expansion_approved: true },
      true,
    ),
  ).toThrow();
});

it("bounds compute to the pilot namespaces and keeps both policies within IAM quotas", () => {
  const compute = runtimeComputePolicy("111122223333");
  expect(JSON.stringify(compute).length).toBeLessThanOrEqual(6144);
  expect(
    JSON.stringify(runtimeSetupPolicy("111122223333", "test@example.com"))
      .length,
  ).toBeLessThanOrEqual(6144);
  const create = compute.Statement.find(
    (s) => s.Sid === "CreateTaggedNetworkOnly",
  )!;
  expect(create.Condition).toMatchObject({
    StringEquals: {
      "aws:RequestTag/Project": "Abasong",
      "aws:RequestTag/Environment": "pilot-dev",
    },
  });
  const repos = compute.Statement.find(
    (s) => s.Sid === "PublishOnlyTwoRepositories",
  )!;
  expect(repos.Resource).toHaveLength(2);
  expect(JSON.stringify(compute)).not.toMatch(
    /ec2:RunInstances|CreateNatGateway|rds:|iam:Put|iam:Create|ecr:DeleteRepository/,
  );
});
