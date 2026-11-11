export const entranceScopes = ["社区通用", "楼栋门", "车库入口"] as const;
export type EntranceScope = (typeof entranceScopes)[number];
export const unconfirmedEntrance = "入口待确认";

export function isEntranceScope(label: string): label is EntranceScope {
  return entranceScopes.some((scope) => scope === label);
}

export function appliesToEntrance(
  label: string | undefined,
  entrance: Exclude<EntranceScope, "社区通用">,
) {
  return (
    label === "社区通用" ||
    label === entrance ||
    (entrance === "车库入口" && label === "车库门")
  );
}
