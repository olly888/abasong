import {
  extractCandidates,
  type Extracted,
  type OcrLine,
} from "../../apps/mobile/src/imports/extract";
export type Expected = {
  address: string;
  value: string | null;
  issues: string[];
};
export type Capture = {
  platform: "ios" | "android" | "macos";
  runtime: "physical" | "simulator" | "host";
  engine: "apple-vision" | "mlkit-latin";
  image_sha256: string;
  milliseconds: number;
  lines: OcrLine[];
};
export type QualitySample = {
  id: string;
  kind: "real" | "synthetic";
  carrier: "gofo" | "swiftx" | "speedx" | "uniuni" | "other" | "synthetic";
  image: string;
  image_sha256: string;
  authorized: boolean;
  redacted: boolean;
  truth_checked: boolean;
  expected: Expected[];
  observations: Capture[];
};
export type QualityDataset = { version: 1; samples: QualitySample[] };
const hints = ["缺少地址", "地址对应不明", "请核对地址", "请核对字符"];
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("OCR_DATASET_INVALID");
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const short = (v: unknown, n: number): v is string =>
  typeof v === "string" && v.length <= n;
const oneOf = (v: unknown, allowed: readonly string[]) =>
  typeof v === "string" && allowed.includes(v);
const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function validateDataset(raw: unknown): QualityDataset {
  requireValid(
    object(raw) &&
      raw.version === 1 &&
      Array.isArray(raw.samples) &&
      raw.samples.length > 0 &&
      raw.samples.length <= 50,
  );
  const ids = new Set<string>(),
    hashes = new Set<string>();
  for (const s of raw.samples) {
    requireValid(
      object(s) &&
        oneOf(s.kind, ["real", "synthetic"]) &&
        short(s.id, 8) &&
        /^(REAL|SYN)-\d{3}$/.test(s.id),
    );
    requireValid(
      s.id.startsWith(s.kind === "real" ? "REAL-" : "SYN-") && !ids.has(s.id),
    );
    ids.add(s.id);
    requireValid(
      short(s.image, 100) &&
        /^[A-Za-z0-9_-]+\.(png|jpe?g|heic)$/i.test(s.image),
    );
    requireValid(
      short(s.image_sha256, 64) &&
        /^[a-f0-9]{64}$/.test(s.image_sha256) &&
        !hashes.has(s.image_sha256),
    );
    hashes.add(s.image_sha256);
    requireValid(
      s.authorized === true && s.redacted === true && s.truth_checked === true,
    );
    requireValid(
      s.kind === "synthetic"
        ? s.carrier === "synthetic"
        : oneOf(s.carrier, ["gofo", "swiftx", "speedx", "uniuni", "other"]),
    );
    requireValid(Array.isArray(s.expected) && s.expected.length <= 100);
    for (const e of s.expected) {
      requireValid(
        object(e) &&
          short(e.address, 300) &&
          (e.value === null ||
            (short(e.value, 32) &&
              e.value.length > 0 &&
              e.value === e.value.trim())) &&
          Array.isArray(e.issues) &&
          e.issues.every((i) => oneOf(i, hints)) &&
          new Set(e.issues).size === e.issues.length,
      );
      requireValid(e.value !== null || e.issues.includes("请核对字符"));
    }
    requireValid(
      Array.isArray(s.observations) &&
        s.observations.length > 0 &&
        s.observations.length <= 5,
    );
    const captures = new Set<string>();
    for (const c of s.observations) {
      requireValid(
        object(c) &&
          oneOf(c.platform, ["ios", "android", "macos"]) &&
          oneOf(c.runtime, ["physical", "simulator", "host"]),
      );
      requireValid((c.platform === "macos") === (c.runtime === "host"));
      requireValid(
        c.engine ===
          (c.platform === "android" ? "mlkit-latin" : "apple-vision") &&
          c.image_sha256 === s.image_sha256 &&
          number(c.milliseconds) &&
          c.milliseconds >= 0 &&
          c.milliseconds <= 300000,
      );
      const key = String(c.platform) + ":" + String(c.runtime);
      requireValid(!captures.has(key));
      captures.add(key);
      requireValid(Array.isArray(c.lines) && c.lines.length <= 600);
      for (const l of c.lines)
        requireValid(
          object(l) &&
            short(l.text, 500) &&
            ["x", "y", "width", "height", "confidence"].every((k) =>
              number(l[k]),
            ),
        );
    }
  }
  return raw as unknown as QualityDataset;
}
const address = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
const issueKey = (s: readonly string[]) => [...s].sort().join("\u0000");
// Multiset matching: duplicate candidates count, unknown truth values are not
// treated as correct passwords, and a wildcard cannot steal a known match.
function pairing(expected: Expected[], actual: Extracted[]) {
  if (expected.length !== actual.length) return false;
  const assigned = new Map<number, number>();
  const matches = (e: Expected, a: Extracted) =>
    address(e.address) === address(a.address) &&
    (e.value === null || e.value === a.value) &&
    issueKey(e.issues) === issueKey(a.issues);
  function assign(e: number, seen: Set<number>): boolean {
    for (let a = 0; a < actual.length; a++)
      if (!seen.has(a) && matches(expected[e]!, actual[a]!)) {
        seen.add(a);
        const old = assigned.get(a);
        if (old === undefined || assign(old, seen)) {
          assigned.set(a, e);
          return true;
        }
      }
    return false;
  }
  return expected.every((_, i) => assign(i, new Set()));
}
export function measure(expected: Expected[], actual: Extracted[]) {
  const eligible =
    expected.length > 0 && expected.every((e) => e.value !== null);
  return {
    expected_count: expected.length,
    actual_count: actual.length,
    code_exact: eligible
      ? JSON.stringify(expected.map((e) => e.value).sort()) ===
        JSON.stringify(actual.map((a) => a.value).sort())
      : null,
    pairing_and_review_exact: pairing(expected, actual),
    negative_false_positive: expected.length === 0 && actual.length > 0,
    negative_candidate_count: expected.length === 0 ? actual.length : 0,
  };
}
function percentile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]!
    : null;
}
export function evaluateDataset(data: QualityDataset) {
  const details = data.samples.flatMap((sample) =>
    sample.observations.map((c) => ({
      id: sample.id,
      kind: sample.kind,
      carrier: sample.carrier,
      platform: c.platform,
      runtime: c.runtime,
      milliseconds: c.milliseconds,
      ...measure(sample.expected, extractCandidates(c.lines)),
    })),
  );
  const keys = [
    ...new Set(details.map((d) => [d.kind, d.platform, d.runtime].join(":"))),
  ];
  const groups = keys.map((key) => {
    const rows = details.filter(
        (d) => [d.kind, d.platform, d.runtime].join(":") === key,
      ),
      known = rows.filter((r) => r.code_exact !== null);
    return {
      group: key,
      samples: rows.length,
      known_code_samples: known.length,
      code_exact_samples: known.filter((r) => r.code_exact).length,
      pairing_and_review_exact_samples: rows.filter(
        (r) => r.pairing_and_review_exact,
      ).length,
      negative_samples: rows.filter((r) => r.expected_count === 0).length,
      negative_false_positive_samples: rows.filter(
        (r) => r.negative_false_positive,
      ).length,
      negative_candidate_count: rows.reduce(
        (n, r) => n + r.negative_candidate_count,
        0,
      ),
      p50_ms: percentile(
        rows.map((r) => r.milliseconds),
        0.5,
      ),
      p95_ms: percentile(
        rows.map((r) => r.milliseconds),
        0.95,
      ),
    };
  });
  return {
    scope:
      "Offline replay of the production parser; capture labels/consent are supplied metadata, not independent device or authorization attestation. No publication.",
    unique_images: data.samples.length,
    real_images: data.samples.filter((s) => s.kind === "real").length,
    synthetic_images: data.samples.filter((s) => s.kind === "synthetic").length,
    groups,
    details,
  };
}
