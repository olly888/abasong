import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
function fixture() {
  mkdirSync(".tooling", { recursive: true });
  const folder = mkdtempSync(resolve(".tooling/ocr-quality-test-"));
  folders.push(folder);
  const bytes = Buffer.from(
      "TEST synthetic file-binding fixture, not a recognized image",
    ),
    hash = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(folder, "TEST.png"), bytes);
  const dataset = {
    version: 1,
    samples: [
      {
        id: "SYN-001",
        kind: "synthetic",
        carrier: "synthetic",
        image: "TEST.png",
        image_sha256: hash,
        authorized: true,
        redacted: true,
        truth_checked: true,
        expected: [],
        observations: [
          {
            platform: "macos",
            runtime: "host",
            engine: "apple-vision",
            image_sha256: hash,
            milliseconds: 20,
            lines: [],
          },
        ],
      },
    ],
  };
  const file = join(folder, "manifest.json");
  writeFileSync(file, JSON.stringify(dataset), { mode: 0o600 });
  return { folder, file, dataset };
}
const run = (file: string) =>
  spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/ocr/evaluate-quality.ts", file],
    { cwd: process.cwd(), encoding: "utf8" },
  );
test("CLI binds source file hashes, emits counts only and replaces a summary link without touching its target", () => {
  const { folder, file } = fixture(),
    other = mkdtempSync(join(tmpdir(), "abasong-ocr-link-test-"));
  folders.push(other);
  const target = join(other, "keep.txt");
  writeFileSync(target, "TEST keep");
  symlinkSync(target, join(folder, "summary.json"));
  const result = run(file);
  expect(result.status).toBe(0);
  expect(readFileSync(target, "utf8")).toBe("TEST keep");
  const report = JSON.parse(result.stdout);
  expect(report.real_images).toBe(0);
  expect(report.groups[0].negative_samples).toBe(1);
  expect(result.stdout).not.toContain("TEST.png");
  expect(result.stdout).not.toContain("synthetic file-binding");
});
test("CLI refuses a changed image without printing its bytes or manifest content", () => {
  const { folder, file } = fixture();
  writeFileSync(join(folder, "TEST.png"), "TEST tampered content");
  const result = run(file);
  expect(result.status).toBe(1);
  expect(result.stderr).not.toContain("tampered content");
  expect(result.stdout).toBe("");
});
test("CLI refuses an image symlink escaping the supplied local folder", () => {
  const { folder, file } = fixture(),
    other = mkdtempSync(join(tmpdir(), "abasong-ocr-outside-"));
  folders.push(other);
  const image = join(other, "other.png");
  writeFileSync(image, "TEST outside");
  rmSync(join(folder, "TEST.png"));
  symlinkSync(image, join(folder, "TEST.png"));
  expect(run(file).status).toBe(1);
});
test("CLI requires protected real-data manifests and never accepts outside-tooling input", () => {
  const { file, dataset } = fixture();
  const s = dataset.samples[0]!;
  s.id = "REAL-001";
  s.kind = "real";
  s.carrier = "gofo";
  writeFileSync(file, JSON.stringify(dataset), { mode: 0o644 });
  // writeFile does not change an existing file's permissions; use a new file.
  const publicManifest = join(resolve(file, ".."), "readable.json");
  writeFileSync(publicManifest, JSON.stringify(dataset), { mode: 0o644 });
  expect(run(publicManifest).status).toBe(1);
  const other = mkdtempSync(join(tmpdir(), "abasong-ocr-outside-"));
  folders.push(other);
  const outside = join(other, "manifest.json");
  writeFileSync(outside, JSON.stringify(dataset), { mode: 0o600 });
  expect(run(outside).status).toBe(1);
});
