import type { components } from "@abasong/contracts";
import type { DeliveryRequest } from "../requests/presentation";
type S = components["schemas"];
export type SupportMode = "找活" | "找人";
export type Filters = {
  region: string;
  text: string;
  day: string;
  kind: string;
};
export type DiscoveryItem =
  | { kind: "request"; request: DeliveryRequest }
  | { kind: "driver"; driver: S["Driver"] };
export type DiscoveryView = {
  filters: Filters;
  selectedId: string | null;
  scroll: number;
  pages: number;
  focusPoint?: S["Point"];
};
export type DiscoveryMemory = Record<SupportMode, DiscoveryView>;
export type AreaMarker = {
  id: string;
  label: string;
  count: number;
  point: S["Point"];
};
export const defaultFilters = (): Filters => ({
  region: "",
  text: "",
  day: "",
  kind: "",
});
export function createDiscoveryMemory(): DiscoveryMemory {
  return {
    找活: { filters: defaultFilters(), selectedId: null, scroll: 0, pages: 1 },
    找人: { filters: defaultFilters(), selectedId: null, scroll: 0, pages: 1 },
  };
}
export const itemId = (item: DiscoveryItem) =>
  item.kind === "request" ? item.request.id : item.driver.profile.user_id;
export function itemRegions(item: DiscoveryItem) {
  return item.kind === "request"
    ? item.request.region_id
      ? [item.request.region_id]
      : []
    : item.driver.regions.map((r) => r.id);
}
export function validItem(item: DiscoveryItem, now = Date.now()) {
  return item.kind === "request"
    ? item.request.status === "open" &&
        !!item.request.expires_at &&
        Date.parse(item.request.expires_at) > now
    : !!item.driver.availability?.enabled &&
        Date.parse(item.driver.availability.ends_at) > now;
}
export function areaMarkers(
  items: DiscoveryItem[],
  regions: S["Region"][],
): AreaMarker[] {
  return regions.flatMap((r) => {
    const count = items.filter((i) => itemRegions(i).includes(r.id)).length;
    return count
      ? [{ id: r.id, label: r.label, count, point: r.display_point }]
      : [];
  });
}
export function discoveryPath(mode: SupportMode, f: Filters, cursor?: string) {
  const q = new URLSearchParams({ limit: "20" });
  if (f.region) q.set("region_id", f.region);
  if (f.text.trim())
    q.set(mode === "找活" ? "query" : "carrier", f.text.trim());
  if (f.day) q.set("day", f.day);
  if (mode === "找活" && f.kind) q.set("kind", f.kind);
  if (cursor) q.set("cursor", cursor);
  return `/v1/${mode === "找活" ? "requests" : "drivers"}?${q}`;
}
