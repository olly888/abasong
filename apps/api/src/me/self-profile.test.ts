import { it, expect } from "vitest";
import { selfProfileInput, SelfProfileService } from "./self-profile.service";
import type { SensitiveDatabase } from "../apartments/sensitive-database";
import type { EnvelopeCrypto } from "../encryption/envelope";
const body = {
  expected_version: 0,
  display_name: "TEST",
  bio: "",
  vehicle_type: "",
  purposes: ["dsp"],
  experience: [],
  familiar_region_ids: [],
  private_contact: { phone: "", wechat: "" },
};
it("rejects forged roles, verified experience and public contact flags", () => {
  for (const p of [
    { ...body, capabilities: ["ops.user_manage"] },
    { ...body, user_id: "other" },
    { ...body, private_contact: { phone: "", wechat: "", public: true } },
    {
      ...body,
      experience: [
        {
          carrier: "TEST",
          region_label: "",
          description: "",
          source: "verified",
        },
      ],
    },
    { ...body, purposes: ["dsp", "dsp"] },
    { ...body, display_name: "bad\nname" },
    { ...body, private_contact: { phone: "-------", wechat: "" } },
  ])
    expect(selfProfileInput.safeParse(p).success).toBe(false);
  expect(selfProfileInput.safeParse(body).success).toBe(true);
  expect(
    selfProfileInput.safeParse({ ...body, bio: "TEST\n第二行" }).success,
  ).toBe(true);
});
it("rolls back before any write if encryption fails", async () => {
  const sql: string[] = [];
  let released = false;
  const c = {
    query: async (q: string) => {
      sql.push(q);
      if (q.includes("SELECT status"))
        return { rows: [{ status: "active", session_invalid_before: null }] };
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      released = true;
    },
  };
  const service = new SelfProfileService(
    { connect: async () => c } as unknown as SensitiveDatabase,
    {
      hmacKey: () => Buffer.alloc(32),
      seal: async () => {
        throw new Error("KMS unavailable");
      },
    } as unknown as EnvelopeCrypto,
  );
  await expect(
    service.update(
      {
        userId: "11111111-1111-4111-8111-111111111111",
        issuedAt: Date.now() / 1000,
      } as never,
      body,
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ),
  ).rejects.toMatchObject({ code: "PROFILE_UNAVAILABLE" });
  expect(sql).toContain("ROLLBACK");
  expect(sql.some((s) => s.startsWith("UPDATE abasong.profiles"))).toBe(false);
  expect(released).toBe(true);
});
