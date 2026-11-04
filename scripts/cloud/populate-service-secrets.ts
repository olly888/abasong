import {
  lstatSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import {
  PILOT_PROJECT,
  pilotDatabaseOptions,
  type DatabaseKey,
} from "../../packages/runtime/src/index";
import { SECRET_STACK } from "./runtime-identity";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

function privateJson(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Owner-only local file required");
  return JSON.parse(readFileSync(path, "utf8"));
}
function main() {
  const { account, mode, approval } = runtimeTarget();
  if (!["--prepare", "--apply", "--status"].includes(mode))
    throw new Error("Mode refused");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const folder = ".tooling/cloud-runtime",
    directory = `${folder}/values`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stack = (
    aws(["cloudformation", "describe-stacks", "--stack-name", SECRET_STACK])
      .Stacks as Array<{
      StackStatus: string;
      Outputs: Array<{ OutputKey: string; OutputValue: string }>;
    }>
  )[0]!;
  if (stack.StackStatus !== "CREATE_COMPLETE" || stack.Outputs.length !== 5)
    throw new Error("Five managed secrets required");
  const expected = {
    ApiDatabaseArn: "api-db",
    SensitiveDatabaseArn: "sensitive-db",
    WorkerDatabaseArn: "worker-db",
    DataHmacArn: "data-hmac",
    MapboxSearchArn: "mapbox-search",
  };
  const manifestPath = `${folder}/secret-value-manifest.json`;
  let manifest: Record<string, { arn: string; token: string; path: string }>;
  if (existsSync(manifestPath)) manifest = privateJson(manifestPath);
  else {
    if (mode !== "--prepare") throw new Error("Prepare sealed values first");
    const verification = privateJson(
      `${folder}/service-login-verification.json`,
    );
    if (
      verification.results.length !== 3 ||
      Date.now() - Date.parse(verification.verified_at) > 3600000
    )
      throw new Error("Recent real TLS verification required");
    const credentials = privateJson(`${folder}/service-logins.json`);
    const keys = [
      "DATABASE_URL",
      "DATABASE_SENSITIVE_URL",
      "WORKER_DATABASE_URL",
    ] as const;
    const roles = [
      "abasong_api_dev",
      "abasong_sensitive_dev",
      "abasong_worker_dev",
    ];
    if (
      Object.keys(credentials).sort().join() !== [...roles].sort().join() ||
      Object.values(credentials).some(
        (v) => typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v),
      )
    )
      throw new Error("Sealed credential inventory refused");
    const values: Record<string, string> = {};
    ["ApiDatabaseArn", "SensitiveDatabaseArn", "WorkerDatabaseArn"].forEach(
      (name, index) => {
        const url = new URL(
          `postgresql://${approval.database_host}:5432/postgres?sslmode=verify-full`,
        );
        url.username = `${roles[index]}.${PILOT_PROJECT}`;
        url.password = credentials[roles[index]!];
        pilotDatabaseOptions(
          url.href,
          approval.database_host,
          keys[index] as DatabaseKey,
        );
        values[name] = url.href;
      },
    );
    values.DataHmacArn = randomBytes(32).toString("hex");
    const local = readFileSync("apps/mobile/.env.local", "utf8");
    const token =
      /^EXPO_PUBLIC_MAPBOX_TOKEN\s*=\s*["']?(pk\.[A-Za-z0-9._-]+)["']?\s*$/m.exec(
        local,
      )?.[1];
    if (!token) throw new Error("Reviewed public Mapbox token required");
    values.MapboxSearchArn = token;
    manifest = {};
    for (const output of stack.Outputs) {
      if (!(output.OutputKey in expected))
        throw new Error("Secret output inventory refused");
      const suffix = expected[output.OutputKey as keyof typeof expected];
      const arn = output.OutputValue;
      if (
        !new RegExp(
          `^arn:aws:secretsmanager:us-west-1:${account}:secret:abasong/pilot-dev/${suffix}-[A-Za-z0-9]{6}$`,
        ).test(arn)
      )
        throw new Error("Secret target refused");
      const path = `${directory}/${suffix}.txt`;
      writeFileSync(path, values[output.OutputKey]!, {
        mode: 0o600,
        flag: "wx",
      });
      manifest[output.OutputKey] = { arn, token: randomUUID(), path };
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  }
  if (
    Object.keys(manifest).sort().join() !== Object.keys(expected).sort().join()
  )
    throw new Error("Manifest inventory refused");
  const statuses = [];
  for (const [name, suffix] of Object.entries(expected)) {
    const entry = manifest[name]!;
    const actual = stack.Outputs.find((o) => o.OutputKey === name)?.OutputValue;
    if (
      entry.arn !== actual ||
      entry.path !== `${directory}/${suffix}.txt` ||
      !/^[a-f0-9-]{36}$/.test(entry.token)
    )
      throw new Error("Manifest binding refused");
    const stat = lstatSync(entry.path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
      throw new Error("Protected value file required");
    const described = aws([
      "secretsmanager",
      "describe-secret",
      "--secret-id",
      entry.arn,
    ]);
    if (described.KmsKeyId || described.DeletedDate)
      throw new Error("AWS-managed secret key and active secret required");
    const versions = (described.VersionIdsToStages ?? {}) as Record<
      string,
      string[]
    >;
    const initialized = versions[entry.token]?.includes("AWSCURRENT") === true;
    if (Object.keys(versions).length && !initialized)
      throw new Error("Unknown secret version; no overwrites permitted");
    if (mode === "--apply" && !initialized) {
      aws([
        "secretsmanager",
        "put-secret-value",
        "--secret-id",
        entry.arn,
        "--client-request-token",
        entry.token,
        "--secret-string",
        `file://${entry.path}`,
      ]);
      const check = aws([
        "secretsmanager",
        "describe-secret",
        "--secret-id",
        entry.arn,
      ]).VersionIdsToStages as Record<string, string[]>;
      if (!check[entry.token]?.includes("AWSCURRENT"))
        throw new Error("Secret write not confirmed");
    }
    statuses.push({
      name: suffix,
      initialized: initialized || mode === "--apply",
    });
  }
  writeFileSync(
    `${folder}/secret-values-status.json`,
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        mode,
        statuses,
        plaintext_output: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      mode,
      secrets: 5,
      initialized: statuses.filter((s) => s.initialized).length,
      plaintext_output: false,
    }),
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
