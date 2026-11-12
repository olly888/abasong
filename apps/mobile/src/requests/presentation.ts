import type { components } from "@abasong/contracts";
export type DeliveryRequest =
  components["schemas"]["Request"] | components["schemas"]["RequestDetailV2"];
export type DeliverySummary =
  components["schemas"]["Request"] | components["schemas"]["RequestSummaryV2"];
export const scenarioLabels = {
  warehouse_shortage: "仓库缺人，找司机",
  delivery_handoff: "送不完，找人代送",
} as const;
export const isV2 = (
  r: DeliverySummary,
): r is components["schemas"]["RequestSummaryV2"] =>
  "request_schema_version" in r && r.request_schema_version === 2;
export function requestTitle(r: DeliverySummary) {
  return isV2(r) ? scenarioLabels[r.scenario] : kindLabels[r.kind];
}
export function deliveryQuantity(
  mode: "exact" | "estimate" | "unknown" | null,
  count: number | null,
  remaining: number | null = null,
) {
  if (mode === "unknown") return "数量待确认";
  if (mode === "estimate")
    return count === null ? "数量待确认" : `约 ${count} 件`;
  if (remaining !== null && remaining !== count) return `剩余 ${remaining} 件`;
  return count === null ? "数量待确认" : `${count} 件`;
}
export function requestQuantity(r: DeliverySummary) {
  if (isV2(r))
    return deliveryQuantity(
      r.quantity_mode,
      r.parcel_count,
      r.remaining_parcels,
    );
  return r.remaining_parcels !== null
    ? `剩余 ${r.remaining_parcels} 件`
    : r.parcel_count !== null
      ? `${r.parcel_count} 件`
      : "件数待确认";
}
type Arrival = {
  handoff_mode?: string | null;
  handoff_date?: string | null;
  starts_at?: string | null;
};
export function requestArrival(r: Arrival) {
  if (r.handoff_mode === "asap")
    return r.handoff_date ? `${r.handoff_date} · 尽快到场` : "尽快到场";
  return requestTime(r.starts_at ?? null);
}
export function deliveryArrival(r: DeliverySummary) {
  return requestArrival(isV2(r) ? r : { starts_at: r.starts_at });
}
export function requestPickupRegion(
  r: DeliveryRequest,
  regions: Record<string, string>,
) {
  return regions[r.pickup_region_id ?? ""] ?? r.pickup_area ?? "联系确认";
}
export function requestDriverNeed(r: DeliverySummary) {
  if (r.drivers_needed === null) return null;
  return {
    label:
      r.remaining_drivers === null || r.remaining_drivers === r.drivers_needed
        ? "需要司机"
        : "还需司机",
    value: `${r.remaining_drivers ?? r.drivers_needed} 人`,
  };
}
export function requestHandoffRequirement(
  r: Pick<DeliverySummary, "handoff_requirement">,
) {
  const requirement = r.handoff_requirement;
  return requirement && Object.hasOwn(handoffLabels, requirement)
    ? handoffLabels[requirement as keyof typeof handoffLabels]
    : null;
}
export const handoffLabels = {
  contact_confirm: "联系确认",
  carrier_account: "需已有该快递公司账号",
  dsp_approval: "需 DSP 确认转派",
};
export const completionLabels = {
  contact: "送完时间联系确认",
  same_day: "当天送完",
  next_day: "可次日送完",
};
export const scopeLabels = {
  partial: "可分担部分包裹",
  whole_route: "整条线路接手",
};
export const experienceLabels = {
  any: "不限",
  delivery_experience: "有配送经验",
  carrier_experience: "熟悉该快递公司",
};
export const sortedLabels = {
  unknown: "待确认",
  sorted: "已理货",
  unsorted: "未理货",
};
export function canApplyTo(r: DeliverySummary) {
  if (
    r.status !== "open" ||
    !r.expires_at ||
    Date.parse(r.expires_at) <= Date.now()
  )
    return false;
  if (r.remaining_drivers === 0) return false;
  if (isV2(r) && r.quantity_mode !== "exact") return true;
  return (
    ["vehicle_help", "other_help"].includes(r.kind) ||
    (Number(r.remaining_parcels) > 0 &&
      Number(r.remaining_parcels) >= (r.minimum_parcels ?? 1))
  );
}
export const exactQuantity = (r: DeliverySummary) =>
  !isV2(r) || r.quantity_mode === "exact";
export const hasEditableGap = (r: DeliverySummary) =>
  (exactQuantity(r) && r.parcel_count !== null) || r.drivers_needed !== null;
export const kindLabels = {
  partial_route: "部分包裹代跑",
  whole_route: "整条线路代跑",
  extra_drivers: "临时增加司机",
  vehicle_help: "车辆求助",
  other_help: "其他配送求助",
} as const;
export const statusLabels = {
  draft: "草稿",
  open: "正在找人",
  found: "已找到",
  closed: "已关闭",
  expired: "已到期",
} as const;
export function publishedRequestCounts(r: DeliverySummary) {
  const quantity = deliveryQuantity(
    isV2(r) ? r.quantity_mode : null,
    r.parcel_count,
  );
  if (r.status === "draft") {
    return [
      quantity,
      r.drivers_needed === null ? null : `计划找 ${r.drivers_needed} 人`,
    ];
  }
  if (r.status !== "open") return [quantity];
  return [
    exactQuantity(r) && r.remaining_parcels !== null
      ? `剩余 ${r.remaining_parcels} 件`
      : quantity,
    r.remaining_drivers !== null
      ? `还需 ${r.remaining_drivers} 人`
      : r.drivers_needed !== null
        ? "司机缺口待确认"
        : null,
  ];
}
export function publishedRequestTimestamp(r: DeliverySummary) {
  if (isV2(r) && r.updated_at) return `更新于 ${requestTime(r.updated_at)}`;
  if (isV2(r) && r.handoff_mode === "asap") return deliveryArrival(r);
  return r.starts_at ? `到场 ${requestTime(r.starts_at)}` : null;
}
export function applicationSourceStatus({
  request_summary: request,
  observed_request_version: observed,
}: Pick<
  components["schemas"]["Application"],
  "request_summary" | "observed_request_version"
>) {
  if (!request) return "来源需求当前不可见";
  if (request.status === "found") return "需求已找到司机";
  if (request.status === "closed") return "需求已关闭";
  if (request.status === "expired") return "需求已到期";
  return request.status === "open" && observed !== request.version
    ? "需求条件已更新"
    : null;
}
export function requestPrice(
  r: Pick<DeliveryRequest, "price_cents"> & { price_unit: string | null },
) {
  if (r.price_unit === "negotiable") return "联系议价";
  if (
    r.price_cents === null ||
    !["per_parcel", "per_route"].includes(r.price_unit ?? "")
  )
    return "报价未填写";
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(r.price_cents / 100) +
    (r.price_unit === "per_parcel" ? "/件" : "/线路")
  );
}
function parts(ms: number) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  );
}
export function localDateTime(iso: string | null, now = Date.now()) {
  const p = parts(iso ? Date.parse(iso) : now);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
export function laInstant(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("日期格式为 YYYY-MM-DD，时间为 HH:mm");
  const target = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(target)) throw new Error("日期或时间无效");
  let candidate = target + 8 * 3600000;
  for (let i = 0; i < 3; i++) {
    const p = parts(candidate);
    const shown = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`,
    );
    candidate += target - shown;
  }
  const matches = (ms: number) => {
    const p = localDateTime(new Date(ms).toISOString());
    return p.date === date && p.time === time;
  };
  if (
    !matches(candidate) ||
    matches(candidate - 3600000) ||
    matches(candidate + 3600000)
  )
    throw new Error("这个时间处于夏令时切换，请选择其他时间");
  return new Date(candidate).toISOString();
}
export function centsInput(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("报价最多保留两位小数");
  const v = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(v) || v > 2147483647)
    throw new Error("请检查报价金额");
  return v;
}
export function requestTime(iso: string | null) {
  if (!iso) return "时间未填写";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  // Compose only locale-independent separators. Native ICU implementations may
  // otherwise return different punctuation or Chinese AM/PM markers.
  return `${p.month}/${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}`;
}
