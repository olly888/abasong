import { expect, test } from "vitest";
import { assessImageScan } from "./image-scan";
const now = Date.parse("2026-11-04T00:00:00Z");
function scan() {
  return {
    imageScanStatus: { status: "COMPLETE" },
    imageScanFindings: {
      findingSeverityCounts: { HIGH: 1, CRITICAL: 0 },
      findings: [
        {
          name: "CVE-2026-84243",
          severity: "HIGH",
          attributes: [
            { key: "package_name", value: "glibc" },
            { key: "package_version", value: "2.36-9+deb12u14" },
          ],
        },
      ],
    },
  };
}
test("known pilot mitigation stays visibly unfixed and expires", () => {
  expect(assessImageScan(scan(), now)).toEqual({
    critical: 0,
    high: 1,
    status: "pilot-mitigated-not-fixed",
    review_expires: "2026-11-18T00:00:00Z",
  });
  expect(() =>
    assessImageScan(scan(), Date.parse("2026-11-18T00:00:00Z")),
  ).toThrow("expired");
});
test("new, critical, incomplete or changed-package findings cannot inherit an assessment", () => {
  const critical = scan();
  critical.imageScanFindings.findingSeverityCounts.CRITICAL = 1;
  const unknown = scan();
  unknown.imageScanFindings.findings[0]!.name = "CVE-UNREVIEWED";
  const version = scan();
  version.imageScanFindings.findings[0]!.attributes[1]!.value = "unreviewed";
  const partial = scan();
  partial.imageScanFindings.findings = [];
  const pending = scan();
  pending.imageScanStatus.status = "IN_PROGRESS";
  for (const value of [critical, unknown, version, partial, pending])
    expect(() => assessImageScan(value, now)).toThrow();
});
