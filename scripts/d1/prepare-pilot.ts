// Offline preparation only: no native mutation, signing, installation or cloud calls.
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import {
  PILOT_API,
  PILOT_AUTH,
  validatePilotEnvironment,
} from "../../apps/mobile/app.config";

export function pilotBuildEnvironment(
  shell: NodeJS.ProcessEnv,
  publicValues: NodeJS.ProcessEnv,
  remotePush = false,
): NodeJS.ProcessEnv {
  const env = { ...shell };
  // Do not inherit development endpoints, Metro entry overrides or unrelated
  // EXPO_PUBLIC values into a business Release. Expo's dotenv loading is disabled.
  for (const key of Object.keys(env))
    if (
      /^(?:EXPO_|ABASONG_BUILD_PROFILE$|ENTRY_FILE$|SOURCEMAP_FILE$|SKIP_BUNDLING$)/.test(
        key,
      )
    )
      delete env[key];
  const selected = {
    EXPO_PUBLIC_API_BASE_URL: PILOT_API,
    EXPO_PUBLIC_SUPABASE_URL: publicValues.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      publicValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_MAPBOX_TOKEN: publicValues.EXPO_PUBLIC_MAPBOX_TOKEN,
  };
  validatePilotEnvironment(selected);
  const projectId = publicValues.EXPO_PUBLIC_EXPO_PROJECT_ID;
  if (
    remotePush &&
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(projectId ?? "")
  )
    throw new Error(
      "Push build requires the pilot Expo project ID in .env.local",
    );
  return {
    ...env,
    ...selected,
    ...(remotePush ? { EXPO_PUBLIC_EXPO_PROJECT_ID: projectId } : {}),
    ABASONG_BUILD_PROFILE: "pilot-dev",
    EXPO_NO_DOTENV: "1",
    NODE_ENV: "production",
    CI: "1",
    NODE_BINARY: process.execPath,
  };
}

function main() {
  if (process.versions.node.split(".")[0] !== "24")
    throw new Error("Use scripts/dev with Node24");
  const root = process.cwd(),
    out = resolve(root, ".tooling/pilot-kit/preparation");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  // A failed new attempt must not leave a previous success report as its receipt.
  rmSync(resolve(out, "report.json"), { force: true });
  const publicValues = parseEnv(readFileSync("apps/mobile/.env.local", "utf8"));
  const env = pilotBuildEnvironment(process.env, publicValues);
  function run(args: string[], log: string) {
    const r = spawnSync(
      "./scripts/dev",
      ["--filter", "@abasong/mobile", "exec", "expo", ...args],
      { cwd: root, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    writeFileSync(resolve(out, log), (r.stdout ?? "") + (r.stderr ?? ""), {
      mode: 0o600,
    });
    if (r.error || r.status !== 0)
      throw new Error("Pilot preparation failed; inspect ignored local logs");
    return r.stdout;
  }
  const config = JSON.parse(
    run(["config", "--type", "public", "--json"], "public-config.json"),
  );
  if (
    config.ios?.bundleIdentifier !== "com.abasong.pilot" ||
    config.android?.package !== "com.abasong.pilot" ||
    config.updates?.enabled !== false
  )
    throw new Error("Pilot identity check failed");
  const exportDir = resolve(out, "export");
  run(
    ["export", "--platform", "all", "--source-maps", "--output-dir", exportDir],
    "export.log",
  );
  const outputs: Array<{ platform: string; bytes: number; sha256: string }> =
    [];
  for (const platform of ["ios", "android"]) {
    const dir = resolve(exportDir, "_expo/static/js", platform);
    const maps = readdirSync(dir).filter((n) => n.endsWith(".map"));
    if (!maps.length) throw new Error("Pilot source map missing");
    const sources = maps.flatMap(
      (n) =>
        JSON.parse(readFileSync(resolve(dir, n), "utf8")).sources as string[],
    );
    if (
      !sources.some((n) => /src\/auth\/supabase/.test(n)) ||
      !sources.some((n) => /src\/app\//.test(n)) ||
      sources.some((n) => /src\/field\/FieldReview/.test(n))
    )
      throw new Error("Pilot business entry check failed");
    for (const n of readdirSync(dir).filter((n) => /\.(?:hbc|js)$/.test(n))) {
      const bytes = readFileSync(resolve(dir, n));
      outputs.push({
        platform,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  if (
    !outputs.some((o) => o.platform === "ios") ||
    !outputs.some((o) => o.platform === "android")
  )
    throw new Error("Pilot bundles missing");
  const report = {
    prepared_at: new Date().toISOString(),
    profile: "pilot-dev",
    bundle_id: "com.abasong.pilot",
    api: PILOT_API,
    identity_project: PILOT_AUTH,
    outputs,
    native_compiled: false,
    installed: false,
    cloud_verified: false,
  };
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Pilot public config and three-platform production JS prepared; native compilation and HTTPS cloud acceptance remain pending.",
  );
}
if (process.argv[1]?.endsWith("prepare-pilot.ts")) {
  try {
    main();
  } catch {
    console.error(
      "Pilot preparation failed; no cloud/native changes. Sensitive details omitted.",
    );
    process.exitCode = 1;
  }
}
