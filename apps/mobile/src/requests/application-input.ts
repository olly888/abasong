import type { DeliveryRequest } from "./presentation";
import {
  exactQuantity,
  isV2,
  laInstant,
  localDateTime,
  requestTime,
} from "./presentation";
import { laDayEnd } from "./delivery-fields";

export class ApplicationFieldError extends Error {
  constructor(
    public readonly field: "arrival" | "capacity",
    message: string,
  ) {
    super(message);
  }
}

export function initialApplication(r: DeliveryRequest, now = Date.now()) {
  const minute = 60000;
  const start = Date.parse(r.starts_at ?? "");
  const pickupEnd = Date.parse(r.pickup_deadline_at ?? "");
  const expires = Date.parse(r.expires_at ?? "");
  const date = isV2(r) ? r.handoff_date : null;
  const lower = Math.max(
    Math.floor(now / minute) * minute,
    Number.isFinite(start) ? Math.ceil(start / minute) * minute : 0,
    date ? Date.parse(laInstant(date, "00:00")) : 0,
  );
  const upper = Math.min(
    Number.isFinite(pickupEnd) ? pickupEnd : Infinity,
    date ? Date.parse(laDayEnd(date)) : Infinity,
    !isV2(r) && Number.isFinite(expires) ? expires : Infinity,
  );
  const preferred = Math.max(
    lower,
    Math.ceil((now + 15 * minute) / minute) * minute,
  );
  const time = Math.min(preferred, Math.floor(upper / minute) * minute);
  const local = time >= lower ? localDateTime(null, time) : null;
  return {
    date: local?.date ?? date ?? localDateTime(null, now).date,
    time: local?.time ?? "",
    capacity:
      !r.accepts_partial && exactQuantity(r)
        ? String(r.remaining_parcels ?? r.parcel_count ?? "")
        : "",
  };
}

export function applicationInput(
  r: DeliveryRequest,
  date: string,
  time: string,
  capacity: string,
) {
  let arrival: string;
  if (!time) throw new ApplicationFieldError("arrival", "请选择预计到场时间");
  try {
    arrival = laInstant(date, time);
  } catch (e) {
    throw new ApplicationFieldError(
      "arrival",
      e instanceof Error ? e.message : "请核对预计到场时间",
    );
  }
  const ms = Date.parse(arrival);
  if (isV2(r) && r.handoff_date) {
    if (date !== r.handoff_date)
      throw new ApplicationFieldError(
        "arrival",
        `请选择接手日 ${r.handoff_date} 的到场时间`,
      );
    if (r.starts_at && ms < Date.parse(r.starts_at))
      throw new ApplicationFieldError(
        "arrival",
        `预计到场不能早于 ${requestTime(r.starts_at)}`,
      );
  }
  if (r.pickup_deadline_at && ms > Date.parse(r.pickup_deadline_at))
    throw new ApplicationFieldError(
      "arrival",
      `预计到场不能晚于 ${requestTime(r.pickup_deadline_at)}`,
    );
  if (!isV2(r) && r.expires_at && ms > Date.parse(r.expires_at))
    throw new ApplicationFieldError("arrival", "预计到场须在本次有效时段内");

  const delivery = r.kind !== "vehicle_help" && r.kind !== "other_help";
  const required = delivery && exactQuantity(r);
  let qty: number | undefined;
  if (delivery && (capacity.trim() || required)) {
    if (
      !/^\d+$/.test(capacity) ||
      Number(capacity) < 1 ||
      Number(capacity) > 2147483647
    )
      throw new ApplicationFieldError("capacity", "请填写本次可接件数的正整数");
    qty = Number(capacity);
    if (r.minimum_parcels && qty < r.minimum_parcels)
      throw new ApplicationFieldError(
        "capacity",
        `本次至少承接 ${r.minimum_parcels} 件`,
      );
    if (
      exactQuantity(r) &&
      r.remaining_parcels !== null &&
      qty > r.remaining_parcels
    )
      throw new ApplicationFieldError(
        "capacity",
        "可接件数不能超过当前剩余件数",
      );
    if (!r.accepts_partial && exactQuantity(r) && qty !== r.remaining_parcels)
      throw new ApplicationFieldError("capacity", "这条需求需整批接手");
  }
  return {
    expected_arrival_at: arrival,
    observed_request_version: r.version,
    ...(qty !== undefined ? { capacity_parcels: qty } : {}),
  };
}
