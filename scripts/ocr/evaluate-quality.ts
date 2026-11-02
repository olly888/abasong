import {
  readFileSync,
  realpathSync,
  lstatSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateDataset, evaluateDataset } from "./quality";
const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return r !== "" && !r.startsWith("..") && !isAbsolute(r);
};
function main() {
  if (process.argv.length !== 3) throw new Error("OCR_DATASET_INVALID");
  const tooling = realpathSync(".tooling"),
    input = resolve(process.argv[2]!),
    stat = lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
    throw new Error("OCR_DATASET_INVALID");
  const file = realpathSync(input),
    folder = realpathSync(dirname(file));
  if (!inside(tooling, file) || !inside(tooling, folder))
    throw new Error("OCR_DATASET_INVALID");
  const data = validateDataset(JSON.parse(readFileSync(file, "utf8")));
  if (data.samples.some((s) => s.kind === "real") && (stat.mode & 0o077) !== 0)
    throw new Error("OCR_DATASET_INVALID");
  for (const sample of data.samples) {
    const image = realpathSync(resolve(folder, sample.image)),
      meta = lstatSync(image);
    if (
      !inside(folder, image) ||
      !meta.isFile() ||
      meta.size <= 0 ||
      meta.size > 10 * 1024 * 1024
    )
      throw new Error("OCR_DATASET_INVALID");
    if (
      createHash("sha256").update(readFileSync(image)).digest("hex") !==
      sample.image_sha256
    )
      throw new Error("OCR_IMAGE_MISMATCH");
  }
  const report = evaluateDataset(data),
    temp = resolve(folder, `.summary-${randomUUID()}.json`);
  try {
    writeFileSync(temp, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temp, resolve(folder, "summary.json"));
  } finally {
    rmSync(temp, { force: true });
  }
  console.log(JSON.stringify(report));
}
try {
  main();
} catch {
  console.error(
    "OCR quality replay refused or failed: check local manifest, consent/redaction declarations, image hashes and input shape. Source text omitted.",
  );
  process.exitCode = 1;
}
