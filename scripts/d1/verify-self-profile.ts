import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { components } from "../../packages/contracts/src/generated";
import {
  createProfileSession,
  profileFields,
  type ProfileRequest,
  type SelfProfile,
} from "../../apps/mobile/src/profile/profile-session";
import { AccountError } from "../../apps/mobile/src/auth/errors";
type S = components["schemas"];
let calls = 0,
  checks = 0;
const check = (v: unknown) => {
  assert(v);
  checks++;
};
const transport =
  (actor: "owner" | "driver"): ProfileRequest =>
  async <T>(path: string, o?: Parameters<ProfileRequest>[1]) => {
    calls++;
    const r = await fetch("http://127.0.0.1:3028" + path, {
      method: o?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Abasong-Test-Actor": actor,
        ...(o?.key ? { "Idempotency-Key": o.key } : {}),
      },
      body: o?.body === undefined ? undefined : JSON.stringify(o.body),
      signal: o?.signal ?? AbortSignal.timeout(15000),
    });
    const v = await r.json();
    if (!r.ok) throw new AccountError(r.status, v.code, "TEST request failed");
    return v as T;
  };
async function main() {
  const own = transport("owner"),
    other = transport("driver");
  const f = await own<{ owner: string; driver: string; region: string }>(
    "/fixture",
  );
  const reject = async (p: Promise<unknown>, code: string) => {
    await assert.rejects(
      p,
      (e: unknown) => e instanceof AccountError && e.code === code,
    );
    checks++;
  };
  const get = () => own<SelfProfile>("/v1/me/profile");
  const start = await get();
  check(
    start.version === 0 &&
      !start.private_contact.phone &&
      !start.purposes.length,
  );
  const body = {
    ...profileFields(start),
    expected_version: start.version,
    display_name: "TEST 本人",
    purposes: ["delivery", "dsp"],
    experience: [
      { carrier: "GOFO", region_label: "TEST", description: "本人填写" },
    ],
    familiar_region_ids: [f.region],
    private_contact: { phone: "+1 202 555 0101", wechat: "TEST-private-owner" },
  };
  for (const extra of [
    { user_id: f.driver },
    { capabilities: ["ops.user_manage"] },
    { experience: [{ ...body.experience[0], source: "verified" }] },
    { private_contact: { ...body.private_contact, public: true } },
  ])
    await reject(
      own("/v1/me/profile", {
        method: "PATCH",
        body: { ...body, ...extra },
        key: randomUUID(),
      }),
      "INVALID_INPUT",
    );
  await reject(own("/v1/me/profile?user_id=" + f.driver), "INVALID_INPUT");
  await reject(
    own("/v1/me/profile", {
      method: "PATCH",
      body: { ...body, familiar_region_ids: [randomUUID()] },
      key: randomUUID(),
    }),
    "INVALID_INPUT",
  );
  const key = randomUUID();
  const p = await own<SelfProfile>("/v1/me/profile", {
    method: "PATCH",
    body,
    key,
  });
  check(p.version === 1 && p.profile.display_name === "TEST 本人");
  check(p.profile.experience[0]?.source === "self_reported");
  check(p.private_contact.wechat === "TEST-private-owner");
  check(p.profile.familiar_regions?.[0]?.id === f.region);
  const replay = await own<SelfProfile>("/v1/me/profile", {
    method: "PATCH",
    body,
    key,
  });
  check(replay.version === 1);
  await reject(
    own("/v1/me/profile", {
      method: "PATCH",
      body: { ...body, bio: "changed" },
      key,
    }),
    "IDEMPOTENCY_CONFLICT",
  );
  await reject(
    own("/v1/me/profile", { method: "PATCH", body, key: randomUUID() }),
    "VERSION_CONFLICT",
  );
  const peer = await other<SelfProfile>("/v1/me/profile");
  check(peer.version === 0 && !peer.private_contact.wechat);
  const publicProfile = await other<S["Driver"]>("/v1/drivers/" + f.owner);
  check(!JSON.stringify(publicProfile).includes("TEST-private-owner"));
  check(
    !("private_contact" in publicProfile.profile) &&
      !("purposes" in publicProfile.profile),
  );
  const snapshot = await own<{
    isolated_contact: boolean;
    owner_rls: boolean;
    no_extra_caps: boolean;
  }>("/fixture/profile-checks");
  check(
    snapshot.isolated_contact && snapshot.owner_rls && snapshot.no_extra_caps,
  );
  const av = await own<S["Availability"]>("/v1/me/availability", {
    method: "PUT",
    body: {
      expected_version: 0,
      enabled: true,
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      ends_at: new Date(Date.now() + 7200000).toISOString(),
      region_ids: [f.region],
    },
  });
  check(av.enabled && !av.currently_available);
  const closedBody = {
    ...profileFields(p),
    purposes: ["dsp"],
    expected_version: 1,
    close_availability_expected_version: av.version + 1,
  };
  await reject(
    own("/v1/me/profile", {
      method: "PATCH",
      body: closedBody,
      key: randomUUID(),
    }),
    "VERSION_CONFLICT",
  );
  check((await get()).version === 1);
  check((await own<S["Availability"]>("/v1/me/availability")).enabled);
  const closed = await own<SelfProfile>("/v1/me/profile", {
    method: "PATCH",
    body: { ...closedBody, close_availability_expected_version: av.version },
    key: randomUUID(),
  });
  check(closed.version === 2 && !closed.purposes.includes("delivery"));
  check(!(await own<S["Availability"]>("/v1/me/availability")).enabled);
  await own("/fixture/control", {
    method: "POST",
    body: { action: "fault", operation: "profile", after: true },
  });
  const editor = createProfileSession(own, f.owner, randomUUID);
  const loaded = await editor.load();
  assert(loaded);
  const draft = {
    ...profileFields(loaded),
    bio: "TEST response lost",
    private_contact: { phone: "", wechat: "" },
  };
  await reject(editor.save(draft), "TEST_RESPONSE_UNCONFIRMED");
  const retried = await editor.save(draft);
  assert(retried);
  check(retried.version === 3);
  check(!retried.private_contact.phone && !retried.private_contact.wechat);
  check(!(await get()).private_contact.wechat);
  console.log(
    `PASS: B5-01 ${checks} assertions / ${calls} real HTTP-PG calls; owner/private/encrypted/version/consent/retry protections.`,
  );
}
main().catch(() => {
  console.error("B5-01 verification failed; private details omitted.");
  process.exitCode = 1;
});
