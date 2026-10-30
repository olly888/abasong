import { readFileSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const metadata = JSON.parse(
  readFileSync(new URL("./gitleaks-version.json", import.meta.url), "utf8"),
);
const platform =
  process.platform === "darwin"
    ? "darwin"
    : process.platform === "linux"
      ? "linux"
      : null;
const arch =
  process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
if (!platform || !arch) throw new Error("Unsupported scanner platform");
const version = metadata.version.replace(/^v/, ""),
  name = `gitleaks_${version}_${platform}_${arch}.tar.gz`,
  base = `https://github.com/gitleaks/gitleaks/releases/download/${metadata.version}`;
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Official scanner download failed");
  return Buffer.from(await response.arrayBuffer());
}
const checksums = (
  await download(`${base}/gitleaks_${version}_checksums.txt`)
).toString();
const digest = checksums
  .split("\n")
  .find((line) => line.trim().endsWith(" " + name))
  ?.trim()
  .split(/\s+/)[0];
const bytes = await download(`${base}/${name}`);
if (!digest || createHash("sha256").update(bytes).digest("hex") !== digest)
  throw new Error("Scanner checksum mismatch");
mkdirSync(".tooling/security", { recursive: true });
writeFileSync(".tooling/security/scanner.tar.gz", bytes);
// Extract a single vendor binary, not arbitrary archive paths.
execFileSync("tar", [
  "-xzf",
  ".tooling/security/scanner.tar.gz",
  "-C",
  ".tooling/security",
  "gitleaks",
]);
chmodSync(".tooling/security/gitleaks", 0o700);
console.log(
  `Verified official Gitleaks ${metadata.version} (${platform}/${arch})`,
);
