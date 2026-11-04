import type { components } from "@abasong/contracts";
type S = components["schemas"];
export function localTime(value: string, timezone = "America/Los_Angeles") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return "时间未知";
  }
}
export function methodLabel(record: S["AccessRecord"]) {
  return {
    keypad: "密码",
    front_desk: "前台登记",
    digital_access: "数字通行",
    no_fixed_code: "无固定密码",
    other: "进入方式",
  }[record.method];
}
export function scopeLabel(scope: S["AccessScope"]) {
  const days = scope.weekdays
    ?.map((d) => ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d])
    .join("、");
  const schedule =
    scope.start_local && scope.end_local
      ? `${scope.start_local}–${scope.end_local}`
      : null;
  return [
    scope.label || "门别未注明",
    days,
    schedule,
    schedule
      ? scope.timezone === "America/Los_Angeles"
        ? "洛杉矶时间"
        : scope.timezone || "时区未注明"
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
export type Anchor = { id: string; viewportY: number };
export function anchorOffset(
  anchor: Anchor,
  positions: Record<string, number>,
) {
  const y = positions[anchor.id];
  return y === undefined ? null : Math.max(0, y - anchor.viewportY);
}

export function contributionMeta(
  record: Pick<
    S["AccessRecord"],
    "contributed_at" | "contributor_display_name" | "scope"
  >,
  now = Date.now(),
) {
  const timezone = record.scope.timezone || "America/Los_Angeles";
  let time = "时间未知";
  try {
    const date = new Date(record.contributed_at),
      current = new Date(now);
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const sameDay = day.format(date) === day.format(current);
    const year = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    });
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const part = (kind: string) =>
      parts.find((p) => p.type === kind)?.value || "";
    const prefix = sameDay
      ? "今天"
      : `${year.format(date) !== year.format(current) ? part("year") + "年" : ""}${part("month")}月${part("day")}日`;
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    time = `${prefix} ${clock}`;
  } catch {
    /* Invalid timestamps/timezones remain explicitly unknown. */
  }
  return `${time} 贡献 · ${record.contributor_display_name.trim() || "司机"}`;
}
