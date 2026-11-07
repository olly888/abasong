// Independent business Release. No install, upload, store submission or cloud
// changes. Uses the existing signing identity; never handles Apple credentials.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pilotBuildEnvironment } from "./prepare-pilot";
import { PILOT_API } from "../../apps/mobile/app.config";
async function main() {
  const target = process.argv[2];
  if (
    !["simulator", "device"].includes(target ?? "") ||
    process.argv.length !== 3 ||
    process.versions.node.split(".")[0] !== "24"
  )
    throw new Error("Choose simulator or device using Node24");
  const root = process.cwd(),
    output = resolve(".tooling/pilot-kit", target!);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  rmSync(resolve(output, "build-report.json"), { force: true });
  const acceptance = JSON.parse(
    readFileSync(
      ".tooling/cloud-runtime/acceptance/business-test-result.json",
      "utf8",
    ),
  );
  if (
    acceptance.real_sms_accounts !== 2 ||
    acceptance.actual_task_role_kms !== true ||
    acceptance.shared_private_import_roundtrips !== true
  )
    throw new Error(
      "A4 actual business acceptance required before native business Release",
    );
  const ready = await fetch(PILOT_API + "/health/ready", {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!ready.ok) throw new Error("Fixed HTTPS API is not ready");
  const env = {
    ...pilotBuildEnvironment(
      process.env,
      parseEnv(readFileSync("apps/mobile/.env.local", "utf8")),
    ),
    SOURCEMAP_FILE: resolve(output, "business.js.map"),
  };
  const run = (
    file: string,
    args: string[],
    executionEnv: NodeJS.ProcessEnv = env,
  ) => {
    const r = spawnSync(file, args, {
      cwd: root,
      env: executionEnv,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(
      resolve(
        output,
        file.split("/").pop()! +
          (args.includes("prebuild") ? "-prebuild.log" : "-build.log"),
      ),
      (r.stdout ?? "") + (r.stderr ?? ""),
      { mode: 0o600 },
    );
    if (r.error || r.status !== 0)
      throw new Error("Pilot build step failed; ignored logs retained");
    return r.stdout;
  };
  const prebuild = [
    "--filter",
    "@abasong/mobile",
    "exec",
    "expo",
    "prebuild",
    "--no-clean",
    "--platform",
    "ios",
    "--no-install",
  ];
  let prepared = false;
  try {
    prepared = true;
    run("./scripts/dev", prebuild);
    const entitlements = JSON.parse(
      run("plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        "apps/mobile/ios/Abasong/Abasong.entitlements",
      ]),
    );
    if (Object.hasOwn(entitlements, "aps-environment"))
      throw new Error("Unexpected APNs entitlement in local pilot build");
    const args = [
      "-workspace",
      "apps/mobile/ios/Abasong.xcworkspace",
      "-scheme",
      "Abasong",
      "-configuration",
      "Release",
      "-derivedDataPath",
      resolve(output, "derived"),
      "-sdk",
      target === "device" ? "iphoneos" : "iphonesimulator",
      "-destination",
      target === "device"
        ? "generic/platform=iOS"
        : "generic/platform=iOS Simulator",
      "build",
    ];
    if (target === "device") {
      const parsed = spawnSync(
        "/usr/bin/security",
        [
          "cms",
          "-D",
          "-i",
          ".tooling/ios-device-build/Build/Products/Debug-iphoneos/Abasong.app/embedded.mobileprovision",
        ],
        { encoding: "utf8" },
      );
      if (parsed.status !== 0)
        throw new Error("Existing local signing identity required");
      const team = spawnSync(
        "/usr/bin/python3",
        [
          "-c",
          "import sys,plistlib; p=plistlib.loads(sys.stdin.buffer.read()); print(p['TeamIdentifier'][0])",
        ],
        { input: parsed.stdout, encoding: "utf8" },
      ).stdout.trim();
      if (!/^[A-Z0-9]{10}$/.test(team)) throw new Error("Signing team refused");
      args.push(
        "CODE_SIGN_STYLE=Automatic",
        `DEVELOPMENT_TEAM=${team}`,
        "-allowProvisioningUpdates",
      );
    } else args.push("CODE_SIGNING_ALLOWED=NO", "ARCHS=arm64");
    console.log(
      "Building independent business Release with fixed HTTPS and embedded JS.",
    );
    run("xcodebuild", args);
    const app = resolve(
      output,
      "derived/Build/Products",
      target === "device" ? "Release-iphoneos" : "Release-iphonesimulator",
      "Abasong.app",
    );
    const plist = JSON.parse(
      run("plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        resolve(app, "Info.plist"),
      ]),
    );
    if (
      plist.CFBundleIdentifier !== "com.abasong.pilot" ||
      plist.CFBundleDisplayName !== "Abasong内测" ||
      plist.NSAppTransportSecurity?.NSAllowsArbitraryLoads ||
      plist.NSAppTransportSecurity?.NSAllowsLocalNetworking
    )
      throw new Error("Native identity or transport differs");
    const updates = JSON.parse(
      run("plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        resolve(app, "Expo.plist"),
      ]),
    );
    if (updates.EXUpdatesEnabled !== false)
      throw new Error("Unexpected OTA state");
    const bundle = readFileSync(resolve(app, "main.jsbundle")),
      map = JSON.parse(readFileSync(env.SOURCEMAP_FILE, "utf8"));
    if (
      bundle.length < 100000 ||
      !map.sources.some((s: string) => /src\/auth\/supabase/.test(s)) ||
      !map.sources.some((s: string) => /src\/app\//.test(s)) ||
      map.sources.some((s: string) => /src\/field\/FieldReview/.test(s))
    )
      throw new Error("Business module graph differs");
    if (target === "device")
      run("codesign", ["--verify", "--deep", "--strict", app]);
    writeFileSync(
      resolve(output, "build-report.json"),
      JSON.stringify({
        target,
        configuration: "Release",
        bundle_id: "com.abasong.pilot",
        app,
        embedded_business_js: true,
        remote_push_configured: false,
        bundle_bytes: bundle.length,
        bundle_sha256: createHash("sha256").update(bundle).digest("hex"),
        fixed_https: PILOT_API,
        native_compiled: true,
        signed: target === "device",
        installed: false,
        cellular_verified: false,
        built_at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    console.log(
      "Independent pilot Release built and checked; installation and cellular acceptance are separate.",
    );
  } finally {
    if (prepared) {
      const normal = {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        CI: "1",
        NODE_BINARY: process.execPath,
      };
      for (const k of [
        "ABASONG_BUILD_PROFILE",
        "ENTRY_FILE",
        "SOURCEMAP_FILE",
        "SKIP_BUNDLING",
      ])
        delete (normal as NodeJS.ProcessEnv)[k];
      console.log("Restoring normal development native configuration.");
      run("./scripts/dev", prebuild, normal);
    }
  }
}
void main().catch(() => {
  console.error(
    "Pilot native build stopped; private logs retained, no installation or cloud changes.",
  );
  process.exitCode = 1;
});
