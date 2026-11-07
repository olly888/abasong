import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type SelfProfile = S["SelfProfile"];
export type ProfileFields = Omit<
  S["ProfilePatch"],
  "expected_version" | "close_availability_expected_version"
>;
export type ProfileRequest = <T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  },
) => Promise<T>;
export const profileFields = (p: SelfProfile): ProfileFields => ({
  display_name: p.profile.display_name,
  bio: p.profile.bio ?? "",
  vehicle_type: p.profile.vehicle_type ?? "",
  experience: p.profile.experience
    .filter((x) => x.source === "self_reported")
    .map(({ carrier, region_label, description }) => ({
      carrier,
      region_label,
      description,
    })),
  purposes: [...p.purposes],
  familiar_region_ids: [...p.familiar_region_ids],
  private_contact: { ...p.private_contact },
});
export function createProfileSession(
  request: ProfileRequest,
  owner: string,
  newKey: () => string,
) {
  let version: number | undefined,
    epoch = 0,
    controller: AbortController | undefined,
    intent: { fingerprint: string; key: string } | undefined;
  const begin = () => {
    controller?.abort();
    controller = new AbortController();
    const e = ++epoch;
    return {
      signal: controller.signal,
      valid: () => e === epoch && !controller!.signal.aborted,
    };
  };
  const check = (p: SelfProfile) => {
    if (p.profile.user_id !== owner)
      throw new Error("资料账号不一致，请重新登录");
    return p;
  };
  return {
    cancel() {
      epoch++;
      controller?.abort();
    },
    async load() {
      const run = begin(),
        p = check(
          await request<SelfProfile>("/v1/me/profile", { signal: run.signal }),
        );
      if (!run.valid()) return null;
      version = p.version;
      intent = undefined;
      return p;
    },
    async save(f: ProfileFields, closeAvailabilityVersion?: number) {
      if (version === undefined) throw new Error("请先读取个人资料");
      const body = {
          expected_version: version,
          ...f,
          ...(closeAvailabilityVersion === undefined
            ? {}
            : {
                close_availability_expected_version: closeAvailabilityVersion,
              }),
        },
        fingerprint = JSON.stringify(body);
      if (intent?.fingerprint !== fingerprint)
        intent = { fingerprint, key: newKey() };
      const run = begin();
      const p = check(
        await request<SelfProfile>("/v1/me/profile", {
          method: "PATCH",
          body,
          key: intent.key,
          signal: run.signal,
        }),
      );
      if (!run.valid()) return null;
      version = p.version;
      intent = undefined;
      return p;
    },
  };
}
// A single session-owned draft. Never written to disk or shared between accounts.
let draft:
  { owner: string; version: number; fields: ProfileFields } | undefined;
export function clearProfileDraft() {
  draft = undefined;
}
export function rememberProfileDraft(
  owner: string,
  version: number,
  fields: ProfileFields,
) {
  draft = { owner, version, fields: structuredClone(fields) };
}
export function readProfileDraft(owner: string) {
  return draft?.owner === owner ? structuredClone(draft) : undefined;
}
