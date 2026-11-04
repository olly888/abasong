import { laInstant, localDateTime } from "../requests/presentation";
export type PickerMode = "date" | "time";
export function pickerDate(
  mode: PickerMode,
  value: string,
  date: string,
  now = Date.now(),
) {
  const current = localDateTime(null, now);
  try {
    return new Date(
      mode === "date"
        ? laInstant(value || current.date, "12:00")
        : laInstant(date || current.date, value || current.time),
    );
  } catch {
    return new Date(
      laInstant(current.date, mode === "date" ? "12:00" : current.time),
    );
  }
}
export function pickedValue(mode: PickerMode, date: Date) {
  return localDateTime(date.toISOString())[mode];
}
export function pickerLabel(mode: PickerMode, value: string, date: string) {
  if (!value) return "请选择";
  const d = pickerDate(mode, value, date);
  return new Intl.DateTimeFormat(mode === "date" ? "zh-CN" : "en-US", {
    timeZone: "America/Los_Angeles",
    ...(mode === "date"
      ? { year: "numeric", month: "short", day: "numeric", weekday: "short" }
      : { hour: "numeric", minute: "2-digit", hour12: true }),
  }).format(d);
}
