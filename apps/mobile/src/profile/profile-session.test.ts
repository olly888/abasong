import { describe, it, expect } from "vitest";
import {
  createProfileSession,
  profileFields,
  clearProfileDraft,
  readProfileDraft,
  rememberProfileDraft,
  type SelfProfile,
  type ProfileRequest,
} from "./profile-session";
const base: SelfProfile = {
  profile: {
    user_id: "owner",
    display_name: "TEST",
    bio: null,
    vehicle_type: null,
    experience: [
      {
        carrier: "TEST",
        region_label: "",
        description: "",
        source: "self_reported",
      },
      {
        carrier: "OTHER",
        region_label: "",
        description: "",
        source: "verified",
      },
    ],
  },
  version: 0,
  purposes: [],
  familiar_region_ids: [],
  private_contact: { phone: "", wechat: "" },
};
describe("owner profile protections", () => {
  it("edits only self-reported experience and keeps private contact separate", () => {
    expect(profileFields(base).experience).toHaveLength(1);
    expect(profileFields(base).private_contact).toEqual({
      phone: "",
      wechat: "",
    });
  });
  it("reuses an uncertain intent but creates a new key when content changes", async () => {
    const calls: unknown[] = [];
    let n = 0;
    const request: ProfileRequest = async <T>(
      _p: string,
      o?: Parameters<ProfileRequest>[1],
    ) => {
      if (!o?.body) return base as T;
      calls.push(o);
      throw new Error("lost");
    };
    const c = createProfileSession(request, "owner", () => String(++n));
    await c.load();
    const f = profileFields(base);
    await expect(c.save(f)).rejects.toThrow();
    await expect(c.save(f)).rejects.toThrow();
    await expect(c.save({ ...f, bio: "changed" })).rejects.toThrow();
    expect(calls.map((x) => (x as { key: string }).key)).toEqual([
      "1",
      "1",
      "2",
    ]);
  });
  it("rejects a response from another account", async () => {
    const c = createProfileSession(
      async <T>() => base as T,
      "other",
      () => "key",
    );
    await expect(c.load()).rejects.toThrow("账号不一致");
  });
  it("discards late loads after leaving the account", async () => {
    let resolve!: (p: SelfProfile) => void;
    const c = createProfileSession(
      (async () =>
        new Promise<SelfProfile>((r) => {
          resolve = r;
        })) as ProfileRequest,
      "owner",
      () => "key",
    );
    const run = c.load();
    c.cancel();
    resolve(base);
    expect(await run).toBeNull();
  });
  it("keeps drafts only within the owner session and clears on logout", () => {
    rememberProfileDraft("owner", 0, profileFields(base));
    expect(readProfileDraft("other")).toBeUndefined();
    const f = readProfileDraft("owner")!;
    f.fields.display_name = "mutated";
    expect(readProfileDraft("owner")?.fields.display_name).toBe("TEST");
    clearProfileDraft();
    expect(readProfileDraft("owner")).toBeUndefined();
  });
  it("includes close consent in the same idempotent intent", async () => {
    let payload: unknown;
    const c = createProfileSession(
      async <T>(_p: string, o?: Parameters<ProfileRequest>[1]) => {
        payload = o?.body;
        return base as T;
      },
      "owner",
      () => "key",
    );
    await c.load();
    await c.save(profileFields(base), 2);
    expect(payload).toMatchObject({ close_availability_expected_version: 2 });
  });
});
