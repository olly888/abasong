import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pilotAdmissionSql, type PilotAdmission } from "./pilot-admission";
import { cloudBusinessSql } from "./business-data";
const good = (): PilotAdmission => ({
  operation_id: randomUUID(),
  users: [randomUUID(), randomUUID()],
  valid_until: new Date(Date.now() + 3600000).toISOString(),
  operator_sha256: "a".repeat(64),
  project: "mxlmemaunzoramgemiju",
  environment: "pilot-dev",
});
it("restricts initial admission to exact two confirmed driver identities and a bounded expiry", () => {
  const sql = pilotAdmissionSql(good());
  expect(sql).toContain("interval '2 hours'");
  expect(sql).toContain("phone_confirmed_at IS NOT NULL");
  expect(sql).toContain("Replay never extends");
  expect(sql).not.toContain("ops.user_manage");
  for (const mutate of [
    (p: PilotAdmission) => (p.users[1] = p.users[0]),
    (p: PilotAdmission) => (p.operation_id = "';SELECT 1;--"),
    (p: PilotAdmission) => (p.valid_until = "now()"),
    (p: PilotAdmission) => (p.operator_sha256 = "not-a-principal-digest"),
  ]) {
    const p = good();
    mutate(p);
    expect(() => pilotAdmissionSql(p)).toThrow();
  }
});
it("prepares only a public provenance-backed apartment with no imported access data or automatic-arrival flag", () => {
  const sql = cloudBusinessSql({
    operation: randomUUID(),
    apartment: randomUUID(),
    source: randomUUID(),
    building: randomUUID(),
  });
  expect(sql).toContain("ODbL-1.0");
  expect(sql).toContain("2445 E Del Mar Blvd");
  expect(sql).not.toMatch(
    /INSERT INTO abasong\.(access_|capabilities)|auto_match|LOCAL_DATA_KEK/,
  );
});
