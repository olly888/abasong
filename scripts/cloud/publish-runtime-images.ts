import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

function main() {
  const { account, mode } = runtimeTarget();
  if (mode !== "--publish") throw new Error("Explicit publish mode required");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const command = (
    program: string,
    args: string[],
    timeout = 30000,
    env = process.env,
    input?: string,
  ) => {
    const r = spawnSync(program, args, {
      env,
      input,
      encoding: "utf8",
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.error || r.status !== 0)
      throw new Error(
        "Image build/publication failed; command output withheld",
      );
    return r.stdout.trim();
  };
  const revision = command("git", ["rev-parse", "HEAD"]);
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    command("git", ["status", "--porcelain"])
  )
    throw new Error("Clean reviewed source commit required");
  const baseEnv = { ...process.env };
  for (const key of Object.keys(baseEnv))
    if (
      key.startsWith("AWS_") ||
      key.startsWith("DOCKER_") ||
      key === "BUILDX_BUILDER"
    )
      delete baseEnv[key];
  const context = command("docker", ["context", "show"], 30000, baseEnv);
  const endpoint = command(
    "docker",
    ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"],
    30000,
    baseEnv,
  );
  if (!/^unix:\/\/\/[A-Za-z0-9_./-]+\.sock$/.test(endpoint))
    throw new Error("Reviewed local Docker engine required");
  const tag = `git-${revision.slice(0, 12)}`;
  const images: Record<string, { local: string; source_image_id: string }> = {};
  for (const kind of ["api", "worker"]) {
    const local = `abasong-${kind}:${tag}`;
    console.log(`Building ${kind} from committed source.`);
    command(
      "docker",
      [
        "build",
        "--platform",
        "linux/amd64",
        "--target",
        kind,
        "--label",
        `org.opencontainers.image.revision=${revision}`,
        "-t",
        local,
        ".",
      ],
      300000,
      baseEnv,
    );
    const image = JSON.parse(
      command("docker", ["image", "inspect", local], 30000, baseEnv),
    )[0];
    if (
      image.Architecture !== "amd64" ||
      image.Os !== "linux" ||
      image.Config.User !== "node" ||
      image.Config.Labels?.["org.opencontainers.image.revision"] !== revision
    )
      throw new Error("Image source/platform/user refused");
    images[kind] = { local, source_image_id: image.Id };
  }
  command(
    process.execPath,
    [
      "scripts/cloud/verify-containers.mjs",
      images.api!.local,
      images.worker!.local,
    ],
    120000,
    baseEnv,
  );
  console.log(
    "Both exact release images passed isolated production runtime checks.",
  );
  const folder = ".tooling/cloud-runtime",
    dockerConfig = mkdtempSync(`${folder}/docker-push-`);
  writeFileSync(`${dockerConfig}/config.json`, JSON.stringify({ auths: {} }), {
    mode: 0o600,
  });
  const env = {
    ...baseEnv,
    DOCKER_CONFIG: `${process.cwd()}/${dockerConfig}`,
    DOCKER_HOST: endpoint,
  };
  const registry = `${account}.dkr.ecr.us-west-1.amazonaws.com`;
  const receipt: Array<Record<string, unknown>> = [];
  try {
    const authorization = aws(["ecr", "get-authorization-token"])
      .authorizationData as Array<{
      proxyEndpoint: string;
      authorizationToken: string;
    }>;
    const item = authorization.find(
      (v) => v.proxyEndpoint === `https://${registry}`,
    );
    if (!item) throw new Error("Exact ECR registry authorization required");
    const token = Buffer.from(item.authorizationToken, "base64").toString(
      "utf8",
    );
    if (!token.startsWith("AWS:") || token.includes("\n"))
      throw new Error("Registry token format refused");
    command(
      "docker",
      ["login", "--username", "AWS", "--password-stdin", registry],
      30000,
      env,
      token.slice(4),
    );
    for (const kind of ["api", "worker"]) {
      const repository = `abasong-pilot-dev-${kind}`,
        destination = `${registry}/${repository}:${tag}`;
      command("docker", ["tag", images[kind]!.local, destination], 30000, env);
      console.log(`Publishing ${kind} to its fixed immutable repository.`);
      command("docker", ["push", destination], 300000, env);
      const details = aws([
        "ecr",
        "describe-images",
        "--repository-name",
        repository,
        "--image-ids",
        `imageTag=${tag}`,
      ]).imageDetails as Array<{
        imageDigest: string;
        imageSizeInBytes: number;
        imageScanStatus?: unknown;
      }>;
      const image = details[0];
      if (
        details.length !== 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(image?.imageDigest ?? "")
      )
        throw new Error("Registry digest unavailable");
      const remote = aws([
        "ecr",
        "batch-get-image",
        "--repository-name",
        repository,
        "--image-ids",
        `imageDigest=${image!.imageDigest}`,
      ]).images as Array<{ imageManifest: string }>;
      if (
        remote.length !== 1 ||
        JSON.parse(remote[0]!.imageManifest).config?.digest !==
          images[kind]!.source_image_id
      )
        throw new Error(
          "Published image config does not match exact tested image",
        );
      const entry = {
        kind,
        repository,
        tag,
        digest: image!.imageDigest,
        size: image!.imageSizeInBytes,
        scan: image!.imageScanStatus ?? { status: "PENDING_VERIFICATION" },
        ...images[kind],
      };
      receipt.push(entry);
      writeFileSync(
        `${folder}/published-images.json`,
        JSON.stringify(
          {
            published_at: new Date().toISOString(),
            source_commit: revision,
            exact_images_runtime_verified: true,
            images: receipt,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
  } finally {
    // Only this generated temporary auth directory, never global Docker credentials.
    rmSync(dockerConfig, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      images: receipt.length,
      source_commit: revision,
      immutable_digests: true,
      scan_acceptance_pending: true,
      credentials_output: false,
    }),
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
