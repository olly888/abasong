type Scan = {
  imageScanStatus?: { status?: string };
  imageScanFindings?: {
    findingSeverityCounts?: Record<string, number>;
    findings?: Array<{
      name?: string;
      severity?: string;
      attributes?: Array<{ key: string; value: string }>;
    }>;
  };
};
const reviewed = new Map([
  ["CVE-2026-84243", ["glibc", "2.36-9+deb12u14"]],
  ["CVE-2026-78410", ["util-linux", "2.38.1-5+deb12u3"]],
  ["CVE-2026-53613", ["util-linux", "2.38.1-5+deb12u3"]],
  ["CVE-2026-53615", ["util-linux", "2.38.1-5+deb12u3"]],
  ["CVE-2026-85091", ["zlib", "1.2.13.dfsg-1"]],
]);

/** Limited pilot assessment, never a claim that these upstream flaws are fixed.
 * Deploying also requires the exact hardened image's real runtime checks and
 * unchanged reviewed Fargate capabilities/volumes/user. No generic HIGH bypass. */
export function assessImageScan(value: Scan, now = Date.now()) {
  if (value.imageScanStatus?.status !== "COMPLETE")
    throw new Error("Completed image scan required");
  const findings = value.imageScanFindings?.findings;
  const counts = value.imageScanFindings?.findingSeverityCounts;
  if (
    !findings ||
    !counts ||
    (counts.CRITICAL ?? 0) !== 0 ||
    findings.some((f) => f.severity === "CRITICAL")
  )
    throw new Error("Image scan refused");
  const high = findings.filter((f) => f.severity === "HIGH");
  if (high.length !== (counts.HIGH ?? 0))
    throw new Error("Incomplete scan details refused");
  if (
    high.length &&
    (!Number.isFinite(now) || now >= Date.parse("2026-11-18T00:00:00Z"))
  )
    throw new Error("Pilot scan assessment expired");
  for (const finding of high) {
    const packageInfo = reviewed.get(finding.name ?? "");
    const attrs = Object.fromEntries(
      (finding.attributes ?? []).map((a) => [a.key, a.value]),
    );
    if (
      !packageInfo ||
      attrs.package_name !== packageInfo[0] ||
      attrs.package_version !== packageInfo[1]
    )
      throw new Error("Unreviewed high finding refused");
  }
  return {
    critical: 0,
    high: high.length,
    status: high.length ? "pilot-mitigated-not-fixed" : "no-critical-or-high",
    review_expires: high.length ? "2026-11-18T00:00:00Z" : null,
  };
}
