import type { components } from "@abasong/contracts";
import type { ProfileRequest } from "../profile/profile-session";

type S = components["schemas"];
export type OwnTeam = S["OwnTeam"];
export type OwnTeamSummary = S["OwnTeamSummary"];
export type TeamInput = S["OrganizationInput"];
export type TeamSummary = S["TeamSummary"];
export type TeamContact = S["TeamContact"];
export type TeamRequest = ProfileRequest;

export function teamError(e: unknown, code: string) {
  return !!e && typeof e === "object" && "code" in e && e.code === code;
}

export function ownTeam<T extends OwnTeamSummary>(
  request: TeamRequest,
  signal: AbortSignal,
  summary = false,
) {
  return request<T>(`/v1/me/organization${summary ? "/summary" : ""}`, {
    signal,
  }).catch((e) => {
    if (teamError(e, "NOT_FOUND")) return null;
    throw e;
  });
}

export function teamFields(team: OwnTeam | null): TeamInput {
  return {
    expected_version: team?.version ?? 0,
    name: team?.team.name ?? "",
    active: team?.active ?? true,
    carriers: [...(team?.team.carriers ?? [])],
    region_ids: team?.team.regions.map((region) => region.id) ?? [],
    contact_shared: team?.contact_shared ?? false,
    business_contact: {
      ...(team?.business_contact ?? { phone: "", wechat: "" }),
    },
  };
}

export function teamInput(form: TeamInput): TeamInput {
  const name = form.name.trim();
  const phone = form.business_contact.phone.trim();
  const wechat = form.business_contact.wechat.trim();
  const carriers = form.carriers
    .map((carrier) => carrier.trim())
    .filter(Boolean);
  if (!name) throw new Error("请填写团队名称");
  if (
    phone &&
    (!/^\+?[0-9 ()-]+$/.test(phone) ||
      !/^\d{7,15}$/.test(phone.replace(/\D/g, "")))
  )
    throw new Error("请填写有效的业务电话");
  if (
    new Set(carriers.map((carrier) => carrier.toLowerCase())).size !==
    carriers.length
  )
    throw new Error("合作快递公司不能重复");
  if (form.contact_shared && !phone && !wechat)
    throw new Error("分享前请填写业务电话或微信");
  return { ...form, name, carriers, business_contact: { phone, wechat } };
}
