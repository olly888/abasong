import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { assessImageScan } from "./image-scan";
import {
  assertRuntimeCaller,
  awsRuntime,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";
import { buildRuntimeTemplates } from "./runtime-templates";

const stack = "abasong-pilot-dev-runtime";
const folder = ".tooling/cloud-runtime";
const receiptPath = `${folder}/image-update.json`;
const imageParameters = { api: "ApiImageDigest", worker: "WorkerImageDigest" };
const digestPattern = /^sha256:[a-f0-9]{64}$/;

type Parameter = { ParameterKey: string; ParameterValue: string };
type ResourceChange = {
  ResourceChange: {
    Action: string;
    LogicalResourceId: string;
    Replacement?: string;
  };
};

function assertTemplate(raw: unknown) {
  const body = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isDeepStrictEqual(body, buildRuntimeTemplates().runtime)) {
    throw new Error(
      "The existing and proposed templates must match the reviewed runtime",
    );
  }
}

function imageParameterValues(aws: ReturnType<typeof awsRuntime>) {
  const { source_commit, exact_images_runtime_verified, images } = JSON.parse(
    readFileSync(`${folder}/published-images.json`, "utf8"),
  ) as {
    source_commit: string;
    exact_images_runtime_verified: boolean;
    images: Array<{
      kind: string;
      repository: string;
      tag: string;
      digest: string;
      source_image_id: string;
    }>;
  };
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (
    source_commit !== revision ||
    !exact_images_runtime_verified ||
    images.length !== 2
  ) {
    throw new Error(
      "Both exact images must come from the current tested commit",
    );
  }
  const values: Record<string, string> = {};
  for (const [kind, parameter] of Object.entries(imageParameters)) {
    const image = images.find((entry) => entry.kind === kind);
    if (
      !image ||
      image.repository !== `abasong-pilot-dev-${kind}` ||
      image.tag !== `git-${revision.slice(0, 12)}` ||
      !digestPattern.test(image.digest) ||
      !digestPattern.test(image.source_image_id)
    )
      throw new Error("Image receipt refused");
    const repository = ["--repository-name", image.repository];
    const manifest = aws([
      "ecr",
      "batch-get-image",
      ...repository,
      "--image-ids",
      `imageTag=${image.tag}`,
    ]).images as Array<{
      imageId: { imageDigest: string };
      imageManifest: string;
    }>;
    if (
      manifest.length !== 1 ||
      manifest[0]!.imageId.imageDigest !== image.digest ||
      JSON.parse(manifest[0]!.imageManifest).config?.digest !==
        image.source_image_id
    )
      throw new Error("Immutable image manifest differs from tested receipt");
    assessImageScan(
      aws([
        "ecr",
        "describe-image-scan-findings",
        ...repository,
        "--image-id",
        `imageDigest=${image.digest}`,
      ]),
    );
    values[parameter] = image.digest.slice("sha256:".length);
  }
  return values;
}

function parametersByKey(parameters: Parameter[]) {
  return Object.fromEntries(
    parameters.map((p) => [p.ParameterKey, p.ParameterValue]),
  );
}

export function assertImageChangeSet(
  proposed: Record<string, unknown>,
  expected: {
    stackId: string;
    id: string;
    before: Record<string, string>;
    after: Record<string, string>;
  },
) {
  const changes = proposed.Changes as ResourceChange[] | undefined;
  const allowed = ["ApiService", "ApiTask", "WorkerService", "WorkerTask"];
  if (
    proposed.StackId !== expected.stackId ||
    proposed.ChangeSetId !== expected.id ||
    proposed.Status !== "CREATE_COMPLETE" ||
    proposed.ExecutionStatus !== "AVAILABLE" ||
    proposed.NextToken ||
    !changes ||
    !isDeepStrictEqual(
      changes.map(({ ResourceChange: c }) => c.LogicalResourceId).sort(),
      allowed,
    ) ||
    changes.some(
      ({ ResourceChange: c }) =>
        c.Action !== "Modify" ||
        (c.LogicalResourceId.endsWith("Service") && c.Replacement !== "False"),
    )
  )
    throw new Error(
      "Change set must modify only the two task definitions and their existing services",
    );
  const parameters = proposed.Parameters as Array<{
    ParameterKey: string;
    ParameterValue?: string;
    UsePreviousValue?: boolean;
  }>;
  if (
    !isDeepStrictEqual(
      parameters.map((p) => p.ParameterKey).sort(),
      Object.keys(expected.after).sort(),
    )
  )
    throw new Error("Unexpected parameter keys");
  for (const {
    ParameterKey: key,
    ParameterValue: value,
    UsePreviousValue,
  } of parameters) {
    if (Object.values(imageParameters).includes(key)) {
      if (value !== expected.after[key] || UsePreviousValue)
        throw new Error("Unexpected image parameter");
    } else if (
      value === undefined
        ? UsePreviousValue !== true
        : value !== expected.before[key]
    ) {
      throw new Error("Unexpected retained parameter");
    }
  }
}

function main() {
  const { account, mode } = runtimeTarget();
  if (
    ![
      "--prepare-image-update",
      "--check-image-update",
      "--execute-image-update",
    ].includes(mode)
  ) {
    throw new Error("Explicit image rollout mode required");
  }
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const [live] = aws([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stack,
  ]).Stacks as Array<{
    StackId: string;
    StackStatus: string;
    Parameters: Parameter[];
  }>;
  if (
    !live ||
    ![
      "CREATE_COMPLETE",
      "UPDATE_COMPLETE",
      "UPDATE_ROLLBACK_COMPLETE",
    ].includes(live.StackStatus)
  ) {
    throw new Error("Stable runtime stack required");
  }
  assertTemplate(
    aws(["cloudformation", "get-template", "--stack-name", stack]).TemplateBody,
  );
  const before = parametersByKey(live.Parameters);
  const nextImages = imageParameterValues(aws);
  const after = { ...before, ...nextImages };
  for (const key of Object.values(imageParameters)) {
    if (
      !/^[a-f0-9]{64}$/.test(before[key] ?? "") ||
      before[key] === after[key]
    ) {
      throw new Error(
        "Two new image digests and two known rollback digests required",
      );
    }
  }
  if (mode === "--prepare-image-update") {
    for (const [kind, parameter] of Object.entries(imageParameters)) {
      const prior = aws([
        "ecr",
        "describe-images",
        "--repository-name",
        `abasong-pilot-dev-${kind}`,
        "--image-ids",
        `imageDigest=sha256:${before[parameter]}`,
      ]).imageDetails as Array<{ imageDigest: string }>;
      if (
        prior.length !== 1 ||
        prior[0]!.imageDigest !== `sha256:${before[parameter]}`
      ) {
        throw new Error("Prior image must remain available for rollback");
      }
    }
    const parameters = live.Parameters.map(({ ParameterKey }) =>
      Object.hasOwn(nextImages, ParameterKey)
        ? { ParameterKey, ParameterValue: nextImages[ParameterKey] }
        : { ParameterKey, UsePreviousValue: true },
    );
    const result = aws([
      "cloudformation",
      "create-change-set",
      "--stack-name",
      stack,
      "--change-set-name",
      `${stack}-images-${randomUUID()}`,
      "--change-set-type",
      "UPDATE",
      "--use-previous-template",
      "--parameters",
      JSON.stringify(parameters),
    ]);
    if (result.StackId !== live.StackId || typeof result.Id !== "string") {
      throw new Error("Unexpected change set receipt");
    }
    writeFileSync(
      receiptPath,
      JSON.stringify(
        { account, stackId: live.StackId, id: result.Id, before, after },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Image change set prepared. No service update has been executed.",
    );
    return;
  }

  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (
    receipt.account !== account ||
    receipt.stackId !== live.StackId ||
    typeof receipt.id !== "string" ||
    !isDeepStrictEqual(receipt.before, before) ||
    !isDeepStrictEqual(receipt.after, after)
  )
    throw new Error("Runtime stack changed after preparation");
  const changeArgs = ["--stack-name", stack, "--change-set-name", receipt.id];
  const proposed = aws([
    "cloudformation",
    "describe-change-set",
    ...changeArgs,
  ]);
  assertImageChangeSet(proposed, {
    stackId: live.StackId,
    id: receipt.id,
    before,
    after,
  });
  assertTemplate(
    aws(["cloudformation", "get-template", ...changeArgs]).TemplateBody,
  );
  if (mode === "--check-image-update") {
    console.log(
      "Both image scans, the exact template and the four allowed resource changes passed review.",
    );
    return;
  }
  aws(["cloudformation", "execute-change-set", ...changeArgs]);
  console.log("Existing API and worker image update requested.");
}

if (process.argv[1]?.endsWith("/update-runtime-images.ts")) {
  try {
    main();
  } catch (error) {
    safeFailure(error);
  }
}
