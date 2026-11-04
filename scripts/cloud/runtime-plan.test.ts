import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { buildRuntimeTemplates } from "./runtime-templates";
import {
  assertDependencyGraph,
  assertRuntimeParameters,
  assertRuntimePlan,
} from "./runtime-plan";

const plan = () => JSON.parse(JSON.stringify(buildRuntimeTemplates()));
it("uses external DNS certificate request without an incomplete domain validation option", () => {
  const p = plan().certificate.Resources.ApiCertificate.Properties;
  expect(p.DomainName).toBe("api-dev.abasong.com");
  expect(p.ValidationMethod).toBe("DNS");
  expect(p.CertificateExport).toBe("DISABLED");
  expect(p.DomainValidationOptions).toBeUndefined();
});
it("does not print private input excerpts or stack traces when binding JSON is invalid", () => {
  const directory = mkdtempSync(join(tmpdir(), "abasong-plan-"));
  const input = join(directory, "bindings.json");
  try {
    writeFileSync(input, "TEST-PRIVATE-INPUT invalid JSON", { mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/cloud/prepare-runtime.ts",
        "--parameters",
        input,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("input details omitted");
    expect(result.stdout + result.stderr).not.toMatch(
      /TEST-PRIVATE|SyntaxError|postgres:| at /,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("keeps generated artifacts current and validates every resource dependency", () => {
  const t = plan();
  for (const name of Object.keys(t))
    expect(
      JSON.parse(readFileSync(`deploy/pilot-dev/${name}.json`, "utf8")),
    ).toEqual(t[name]);
  expect(assertRuntimePlan(t)).toMatchObject({ services: 2, secrets: 5 });
});
it("rejects cycles and unknown logical resource references", () => {
  const t = plan().runtime;
  t.Resources.ApiSecurity.DependsOn = "EdgeSecurity";
  expect(() => assertDependencyGraph(t)).toThrow("cycle");
  t.Resources.ApiSecurity.DependsOn = "WrongSecurity";
  expect(() => assertDependencyGraph(t)).toThrow("Unknown");
});
it.each([
  "wildcard-kms",
  "worker-secret",
  "public-api",
  "plain-secret",
  "root",
  "capacity",
  "mutable-image",
  "extra-resource",
])("rejects unsafe runtime mutation: %s", (mutation) => {
  const t = plan(),
    r = t.runtime.Resources;
  const container = r.ApiTask.Properties.ContainerDefinitions[0];
  if (mutation === "wildcard-kms")
    t.identities.Resources.ApiTaskRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource =
      "*";
  if (mutation === "worker-secret")
    t.identities.Resources.WorkerExecutionRole.Properties.Policies[0].PolicyDocument.Statement[3].Resource.push(
      { Ref: "SensitiveDatabase" },
    );
  if (mutation === "public-api")
    r.ApiIngress.Properties.SourceSecurityGroupId = "sg-public";
  if (mutation === "plain-secret")
    container.Environment.push({ Name: "DATA_HMAC_KEY", Value: "TEST" });
  if (mutation === "root") container.User = "0";
  if (mutation === "capacity") r.ApiService.Properties.DesiredCount = 2;
  if (mutation === "mutable-image")
    container.Image = { "Fn::Sub": "test:latest" };
  if (mutation === "extra-resource")
    r.UnreviewedNat = { Type: "AWS::EC2::NatGateway" };
  expect(() => assertRuntimePlan(t)).toThrow();
});
function bindings() {
  const account = "111122223333",
    uuid = "11111111-1111-4111-8111-111111111111";
  const v: Record<string, string> = {
    CertificateArn: `arn:aws:acm:us-west-1:${account}:certificate/${uuid}`,
    BusinessKeyArn: `arn:aws:kms:us-west-1:${account}:key/${uuid}`,
    DatabaseHost: "db.mxlmemaunzoramgemiju.supabase.co",
    ApiImageDigest: "a".repeat(64),
    WorkerImageDigest: "b".repeat(64),
    AlertTopicArn: `arn:aws:sns:us-west-1:${account}:abasong-pilot-dev-alerts`,
  };
  for (const [key, suffix] of Object.entries({
    ApiExecutionRole: "api-execution",
    WorkerExecutionRole: "worker-execution",
    ApiTaskRole: "api-task",
    WorkerTaskRole: "worker-task",
  }))
    v[`${key}Arn`] = `arn:aws:iam::${account}:role/abasong-pilot-dev-${suffix}`;
  for (const [key, suffix] of Object.entries({
    ApiDatabase: "api-db",
    SensitiveDatabase: "sensitive-db",
    WorkerDatabase: "worker-db",
    DataHmac: "data-hmac",
    MapboxSearch: "mapbox-search",
  }))
    v[`${key}Arn`] =
      `arn:aws:secretsmanager:us-west-1:${account}:secret:abasong/pilot-dev/${suffix}-ABC123`;
  return v;
}
it("accepts only matching account/region, exact role names and immutable image digests", () => {
  expect(() =>
    assertRuntimeParameters(bindings(), "111122223333"),
  ).not.toThrow();
  for (const [field, value] of Object.entries({
    DatabaseHost: "db.other.supabase.co",
    ApiImageDigest: "latest",
    ApiTaskRoleArn: "arn:aws:iam::111122223333:role/AdministratorAccess",
    BusinessKeyArn:
      "arn:aws:kms:us-east-1:111122223333:key/11111111-1111-4111-8111-111111111111",
    ApiDatabaseArn:
      "arn:aws:secretsmanager:us-west-1:999999999999:secret:abasong/pilot-dev/api-db-ABC123",
  })) {
    expect(() =>
      assertRuntimeParameters(
        { ...bindings(), [field]: value },
        "111122223333",
      ),
    ).toThrow();
  }
  expect(() =>
    assertRuntimeParameters(
      { ...bindings(), DATABASE_URL: "TEST" },
      "111122223333",
    ),
  ).toThrow();
});
