import { localDateTime, requestTime } from "../requests/presentation";

export function homeAvailabilityLabel(start: string, end: string) {
  const a = requestTime(start),
    b = requestTime(end);
  return localDateTime(start).date === localDateTime(end).date
    ? `${a}–${b.slice(b.indexOf(" ") + 1)}`
    : `${a}–\n${b}`;
}
