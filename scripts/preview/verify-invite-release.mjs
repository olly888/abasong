import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = new URL("../../apps/mobile/src/invitation/", import.meta.url);
const { testUrl } = JSON.parse(
  readFileSync(new URL("invite-local.json", source), "utf8"),
);
const expected = digest(readFileSync(new URL("assets/scene.png", source)));
const forbidden = new Set(
  ["abasong-invite-test.png", "qr-test.png"].map((file) =>
    digest(readFileSync(new URL(`assets/${file}`, source))),
  ),
);

const exports = process.argv.slice(2);
assert(exports.length > 0, "Pass Expo export directories");
const verified = new Set();
for (const directory of exports) {
  const assets = readdirSync(join(directory, "assets")).map((file) =>
    digest(readFileSync(join(directory, "assets", file))),
  );
  assert(assets.includes(expected), "Missing the normal invitation scene");
  assert(
    !assets.some((hash) => forbidden.has(hash)),
    "Synthetic invitation image is bundled",
  );
  const js = join(directory, "_expo", "static", "js");
  for (const platform of readdirSync(js)) {
    const files = readdirSync(join(js, platform)).filter((file) =>
      /\.(hbc|js)$/.test(file),
    );
    assert(files.length > 0, `No ${platform} JS bundle`);
    for (const file of files) {
      const bundle = readFileSync(join(js, platform, file));
      assert(
        !bundle.includes(testUrl),
        `Synthetic invitation link is bundled on ${platform}`,
      );
    }
    verified.add(platform);
  }
}
assert(
  verified.has("ios") && verified.has("android"),
  "Verify exports for both native platforms",
);
console.log(
  "iOS/Android release exports exclude the TEST invitation URL, QR and poster.",
);
