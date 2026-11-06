import type { DeliveryRequest } from "./presentation";
import { exactQuantity, laInstant, localDateTime } from "./presentation";
export function initialApplication(r: DeliveryRequest, now = Date.now()) {
  const start = Date.parse(r.starts_at ?? "");
  return {
    ...localDateTime(
      new Date(
        Math.max(now + 15 * 60000, Number.isFinite(start) ? start : 0),
      ).toISOString(),
    ),
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
  const delivery = !["vehicle_help", "other_help"].includes(r.kind),
    required = delivery && exactQuantity(r);
  let qty: number | undefined;
  if (capacity.trim() || required) {
    if (
      !/^\d+$/.test(capacity) ||
      Number(capacity) < 1 ||
      Number(capacity) > 2147483647
    )
      throw new Error("请填写本次可接件数的正整数");
    qty = Number(capacity);
    if (r.minimum_parcels && qty < r.minimum_parcels)
      throw new Error(`本次至少承接 ${r.minimum_parcels} 件`);
    if (
      exactQuantity(r) &&
      r.remaining_parcels !== null &&
      qty > r.remaining_parcels
    )
      throw new Error("可接件数不能超过当前剩余件数");
    if (!r.accepts_partial && exactQuantity(r) && qty !== r.remaining_parcels)
      throw new Error("这条需求需整批接手");
  }
  return {
    expected_arrival_at: laInstant(date, time),
    observed_request_version: r.version,
    ...(delivery && qty !== undefined ? { capacity_parcels: qty } : {}),
  };
}
