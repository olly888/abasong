import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assertRuntimeParameters } from "./runtime-plan";
import { awsRuntime } from "./runtime-aws";
import { assessImageScan } from "./image-scan";

type Stack = {
  StackStatus: string;
  Outputs: Array<{ OutputKey: string; OutputValue: string }>;
};
export function prepareRuntimeBindings(
  account: string,
  approval: Record<string, unknown>,
  aws: ReturnType<typeof awsRuntime>,
) {
  const folder = ".tooling/cloud-runtime";
  const stack = (name: string, call = aws): Stack => {
    const value = (
      call([
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        `abasong-pilot-dev-${name}`,
      ]).Stacks as Stack[]
    )[0]!;
    if (
      !value ||
      !["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(value.StackStatus) ||
      !Array.isArray(value.Outputs)
    )
      throw new Error("Runtime dependency stack not ready");
    return value;
  };
  const values: Record<string, string> = {};
  const foundation = stack("foundation", awsRuntime("abasong-pilot"));
  values.BusinessKeyArn = foundation.Outputs.find(
    (o) => o.OutputKey === "DataKeyArn",
  )!.OutputValue;
  for (const output of stack("secrets").Outputs) {
    if (
      !/^(ApiDatabase|SensitiveDatabase|WorkerDatabase|DataHmac|MapboxSearch)Arn$/.test(
        output.OutputKey,
      )
    )
      throw new Error("Secret output refused");
    const described = aws([
      "secretsmanager",
      "describe-secret",
      "--secret-id",
      output.OutputValue,
    ]);
    if (
      described.DeletedDate ||
      described.KmsKeyId ||
      !Object.values(described.VersionIdsToStages ?? {}).some((stages) =>
        (stages as string[]).includes("AWSCURRENT"),
      )
    )
      throw new Error("Runtime secret not initialized");
    values[output.OutputKey] = output.OutputValue;
  }
  for (const output of stack("notifications").Outputs)
    values[output.OutputKey] = output.OutputValue;
  for (const output of stack("certificate").Outputs)
    values[output.OutputKey] = output.OutputValue;
  const certificate = aws([
    "acm",
    "describe-certificate",
    "--certificate-arn",
    values.CertificateArn!,
  ]).Certificate as Record<string, unknown>;
  if (
    certificate.Status !== "ISSUED" ||
    certificate.DomainName !== "api-dev.abasong.com" ||
    certificate.Type !== "AMAZON_ISSUED" ||
    (certificate.Options as Record<string, unknown>)?.Export !== "DISABLED"
  )
    throw new Error("Issued non-exportable API certificate required");
  const roleReceipt = JSON.parse(
    readFileSync(`${folder}/service-roles-verification.json`, "utf8"),
  );
  if (
    roleReceipt.results?.length !== 4 ||
    Date.now() - Date.parse(roleReceipt.verified_at) > 3600000
  )
    throw new Error("Recent exact runtime role verification required");
  for (const [name, suffix] of Object.entries({
    ApiExecutionRoleArn: "api-execution",
    WorkerExecutionRoleArn: "worker-execution",
    ApiTaskRoleArn: "api-task",
    WorkerTaskRoleArn: "worker-task",
  })) {
    const role = aws([
      "iam",
      "get-role",
      "--role-name",
      `abasong-pilot-dev-${suffix}`,
    ]).Role as Record<string, unknown>;
    if (role.Arn !== `arn:aws:iam::${account}:role/abasong-pilot-dev-${suffix}`)
      throw new Error("Runtime role ARN refused");
    values[name] = String(role.Arn);
  }
  if (typeof approval.database_host !== "string")
    throw new Error("Reviewed database host required");
  values.DatabaseHost = approval.database_host;
  const published = JSON.parse(
    readFileSync(`${folder}/published-images.json`, "utf8"),
  );
  if (
    !/^[a-f0-9]{40}$/.test(published.source_commit) ||
    published.images?.length !== 2 ||
    published.exact_images_runtime_verified !== true
  )
    throw new Error("Tested immutable image receipt required");
  const ancestry = spawnSync("git", [
    "merge-base",
    "--is-ancestor",
    published.source_commit,
    "HEAD",
  ]);
  const changed = spawnSync(
    "git",
    [
      "diff",
      "--exit-code",
      published.source_commit,
      "--",
      "Dockerfile",
      ".dockerignore",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      ".npmrc",
      "apps/api",
      "apps/worker",
      "packages/runtime",
      "packages/contracts",
    ],
    { encoding: "utf8" },
  );
  if (ancestry.status !== 0 || changed.status !== 0)
    throw new Error("Published image does not match current build inputs");
  const scans = [];
  for (const kind of ["api", "worker"]) {
    const image = published.images.find(
      (i: { kind: string }) => i.kind === kind,
    );
    if (
      image?.repository !== `abasong-pilot-dev-${kind}` ||
      !/^sha256:[a-f0-9]{64}$/.test(image.digest)
    )
      throw new Error("Published image binding refused");
    const actual = aws([
      "ecr",
      "batch-get-image",
      "--repository-name",
      image.repository,
      "--image-ids",
      `imageDigest=${image.digest}`,
    ]).images as Array<{ imageManifest: string }>;
    if (
      actual.length !== 1 ||
      JSON.parse(actual[0]!.imageManifest).config?.digest !==
        image.source_image_id
    )
      throw new Error("Remote image differs from tested image");
    const scan = aws([
      "ecr",
      "describe-image-scan-findings",
      "--repository-name",
      image.repository,
      "--image-id",
      `imageDigest=${image.digest}`,
    ]);
    scans.push({ kind, digest: image.digest, ...assessImageScan(scan) });
    values[kind === "api" ? "ApiImageDigest" : "WorkerImageDigest"] =
      image.digest.slice(7);
  }
  assertRuntimeParameters(values, account);
  writeFileSync(
    `${folder}/runtime-scan-assessment.json`,
    JSON.stringify({ assessed_at: new Date().toISOString(), scans }, null, 2),
    { mode: 0o600 },
  );
  writeFileSync(
    `${folder}/runtime-bound-parameters.json`,
    JSON.stringify(
      Object.entries(values).map(([ParameterKey, ParameterValue]) => ({
        ParameterKey,
        ParameterValue,
      })),
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return values;
}
