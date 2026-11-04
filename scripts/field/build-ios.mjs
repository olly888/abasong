// Run through ./scripts/dev exec node scripts/field/build-ios.mjs simulator|device.
// Builds only; installs/launches are explicit. No cloud deployment or tunnel.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = process.argv[2] ?? "simulator";
if (!["simulator", "device"].includes(target))
  throw new Error("Choose simulator or device");
if (process.versions.node.split(".")[0] !== "24")
  throw new Error("Use scripts/dev with Node24");
const output = resolve(root, ".tooling/field-kit", target);
mkdirSync(output, { recursive: true });
const publicEnv = parseEnv(
  readFileSync(resolve(root, "apps/mobile/.env.local"), "utf8"),
);
if (!publicEnv.EXPO_PUBLIC_MAPBOX_TOKEN?.startsWith("pk."))
  throw new Error("Public Mapbox token required locally");
const env = {
  ...process.env,
  ABASONG_BUILD_PROFILE: "field-review",
  EXPO_NO_DOTENV: "1",
  CI: "1",
  NODE_ENV: "production",
  NODE_BINARY: process.execPath,
  ENTRY_FILE: resolve(root, "apps/mobile/src/field/entry.tsx"),
  EXPO_PUBLIC_MAPBOX_TOKEN: publicEnv.EXPO_PUBLIC_MAPBOX_TOKEN,
  SOURCEMAP_FILE: resolve(output, "field.js.map"),
};
for (const key of [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PACKAGER_PROXY_URL",
  "SKIP_BUNDLING",
])
  delete env[key];
function run(file, args, executionEnv = env) {
  const result = spawnSync(file, args, {
    cwd: root,
    env: executionEnv,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(
    resolve(
      output,
      `${file.split("/").pop()}-${args.includes("prebuild") ? "prebuild" : "build"}.log`,
    ),
    (result.stdout ?? "") + (result.stderr ?? ""),
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Field build command failed; inspect ignored logs in ${output}`,
    );
  return result.stdout;
}
let prepared = false;
try {
  console.log("Preparing isolated field-review native configuration");
  prepared = true;
  run("./scripts/dev", [
    "--filter",
    "@abasong/mobile",
    "exec",
    "expo",
    "prebuild",
    "--no-clean",
    "--platform",
    "ios",
    "--no-install",
  ]);
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
    let team = process.env.ABASONG_IOS_TEAM_ID;
    if (!team) {
      const profile = resolve(
        root,
        ".tooling/ios-device-build/Build/Products/Debug-iphoneos/Abasong.app/embedded.mobileprovision",
      );
      const parsed = spawnSync(
        "/usr/bin/security",
        ["cms", "-D", "-i", profile],
        { encoding: "utf8" },
      );
      if (parsed.status !== 0)
        throw new Error(
          "Existing signing profile unavailable; set ABASONG_IOS_TEAM_ID locally",
        );
      const read = spawnSync(
        "/usr/bin/python3",
        [
          "-c",
          "import sys,plistlib; p=plistlib.loads(sys.stdin.buffer.read()); print(p['TeamIdentifier'][0])",
        ],
        { input: parsed.stdout, encoding: "utf8" },
      );
      team = read.stdout?.trim();
    }
    if (!/^[A-Z0-9]{10}$/.test(team ?? ""))
      throw new Error("Local signing team required");
    args.push(
      "CODE_SIGN_STYLE=Automatic",
      `DEVELOPMENT_TEAM=${team}`,
      "-allowProvisioningUpdates",
    );
  } else args.push("CODE_SIGNING_ALLOWED=NO", "ARCHS=arm64");
  console.log("Compiling Release with embedded field entry");
  run("xcodebuild", args);
  const product = resolve(
    output,
    "derived/Build/Products",
    target === "device" ? "Release-iphoneos" : "Release-iphonesimulator",
    "Abasong.app",
  );
  const plist = JSON.parse(
    spawnSync(
      "plutil",
      ["-convert", "json", "-o", "-", resolve(product, "Info.plist")],
      { encoding: "utf8" },
    ).stdout,
  );
  if (plist.CFBundleIdentifier !== "com.abasong.fieldreview")
    throw new Error("Unexpected app identity");
  if (plist.CFBundleDisplayName !== "Abasong入口核对")
    throw new Error("Unexpected display name");
  if (
    plist.NSAppTransportSecurity?.NSAllowsArbitraryLoads ||
    plist.NSAppTransportSecurity?.NSAllowsLocalNetworking
  )
    throw new Error("Field app must not allow LAN/cleartext transport");
  const bundle = readFileSync(resolve(product, "main.jsbundle"));
  if (bundle.length < 100000) throw new Error("Embedded bundle missing");
  const map = JSON.parse(readFileSync(env.SOURCEMAP_FILE, "utf8"));
  if (
    !map.sources.some((x) => /src\/field\/FieldReview/.test(x)) ||
    map.sources.some((x) =>
      /src\/(?:auth|app)\/|src\/apartments\/client\.ts/.test(x),
    )
  )
    throw new Error("Unexpected field entry module graph");
  if (target === "device")
    run("codesign", ["--verify", "--deep", "--strict", product]);
  const report = {
    target,
    configuration: "Release",
    bundle_id: plist.CFBundleIdentifier,
    product,
    bundle_bytes: statSync(resolve(product, "main.jsbundle")).size,
    bundle_sha256: createHash("sha256").update(bundle).digest("hex"),
    business_auth_modules: 0,
    local_network_allowed: false,
    built_at: new Date().toISOString(),
  };
  writeFileSync(
    resolve(output, "build-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Field app built and verified; no install or cloud changes");
} finally {
  if (prepared) {
    const normal = {
      ...process.env,
      EXPO_NO_DOTENV: "1",
      CI: "1",
      NODE_BINARY: process.execPath,
    };
    delete normal.ABASONG_BUILD_PROFILE;
    delete normal.ENTRY_FILE;
    delete normal.SOURCEMAP_FILE;
    console.log("Restoring normal Abasong native configuration");
    run(
      "./scripts/dev",
      [
        "--filter",
        "@abasong/mobile",
        "exec",
        "expo",
        "prebuild",
        "--no-clean",
        "--platform",
        "ios",
        "--no-install",
      ],
      normal,
    );
  }
}
