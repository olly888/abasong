import type { components } from "@abasong/contracts";
import type { AccessRowState } from "./visible-access-reader";
import { contributionMeta, methodLabel } from "./presentation";
type S = components["schemas"];

export function apartmentCardStatus(
  pendingAddress: boolean,
  status: AccessRowState["status"],
) {
  if (pendingAddress) return "核对地址后共享门禁码";
  return {
    loading: "正在读取门禁码",
    error: "门禁码暂时无法加载",
    denied: "暂未开通资料查看资格",
    paused: "该公寓暂不共享门禁码",
    ready: "暂无共享门禁码",
  }[status];
}

/** Only the currently authorized, visible record is exposed to assistive tech.
 * Spell keypad symbols explicitly: readers may otherwise omit #/* or merge zeros.
 */
export function apartmentCardLabel(p: {
  address: string;
  distance: string | null;
  pendingAddress: boolean;
  state?: AccessRowState;
}) {
  const status = p.state?.status ?? "loading";
  const record: S["AccessRecord"] | undefined =
    status === "ready" ? p.state?.records[0] : undefined;
  const body = record
    ? [
        record.scope.label,
        record.method === "keypad"
          ? `门禁码 ${Array.from(record.value)
              .map((c) => (c === "#" ? "井号" : c === "*" ? "星号" : c))
              .join("，")}`
          : `${methodLabel(record)}，${record.value}`,
        contributionMeta(record),
        `${p.state!.records.length} 条进入资料`,
      ]
        .filter(Boolean)
        .join("；")
    : apartmentCardStatus(p.pendingAddress, status);
  return [p.address, p.distance, body].filter(Boolean).join("；");
}
