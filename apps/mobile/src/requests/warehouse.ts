import { addressIdentity, type components } from "@abasong/contracts";
type S = components["schemas"];
export type Warehouse = S["WarehousePickupDetailV2"];
export function warehouseAddress(w: Warehouse) {
  return [
    w.address_line1,
    w.city,
    [w.state, w.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}
export function sameWarehouse(
  w: Warehouse,
  a: S["SearchAddress"] | null | undefined,
) {
  const id = addressIdentity({
    address_line1: w.address_line1 ?? "",
    city: w.city ?? "",
    state: w.state ?? "",
  });
  return (
    !!id &&
    id === addressIdentity(a) &&
    (!w.postal_code ||
      w.postal_code.slice(0, 5) === a?.postal_code?.slice(0, 5))
  );
}
export function warehouseNavigation(w: Warehouse) {
  if (!w.address_line1 || !w.city || !w.state)
    throw new Error("取件地址尚未完整，暂不能导航");
  // Universal Google Maps URL opens the installed app or its web fallback.
  // Never accept a navigation URL supplied by another driver or provider.
  return (
    "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" +
    encodeURIComponent(warehouseAddress(w))
  );
}
