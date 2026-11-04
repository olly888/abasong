import type { components } from "@abasong/contracts";
export type DeliveryRequest = components["schemas"]["Request"];
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
export function requestPrice(
  r: Pick<DeliveryRequest, "price_cents" | "price_unit">,
) {
  if (r.price_unit === "negotiable") return "联系议价";
  if (r.price_cents === null || !r.price_unit) return "报价未填写";
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
  return iso
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "America/Los_Angeles",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso))
    : "时间未填写";
}
