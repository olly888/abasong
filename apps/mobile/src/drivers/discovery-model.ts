import type { components } from "@abasong/contracts";
import type { DeliverySummary } from "../requests/presentation";
import type { MapCameraSnapshot } from "../components/map-camera";
type S = components["schemas"];
export type SupportMode = "找活" | "找人";
export type Filters = {
  region: string;
  text: string;
  day: string;
  kind: string;
};
export type DiscoveryItem =
  | { kind: "request"; request: DeliverySummary }
  | { kind: "driver"; driver: S["Driver"] };
export type DiscoveryView = {
  filters: Filters;
  selectedId: string | null;
  scroll: number;
  pages: number;
  focusPoint?: S["Point"];
  camera?: MapCameraSnapshot;
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
export function discoveryFocusRegion(
  item: DiscoveryItem,
  regions: S["Region"][],
  preferred: string,
) {
  const ids = itemRegions(item);
  return (
    regions.find((r) => r.id === preferred && ids.includes(r.id)) ??
    regions.find((r) => ids.includes(r.id))
  );
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
    const count = new Set(
      items.filter((i) => itemRegions(i).includes(r.id)).map(itemId),
    ).size;
    return count
      ? [{ id: r.id, label: r.label, count, point: r.display_point }]
      : [];
  });
}
export function reconcileDiscovery(
  items: DiscoveryItem[],
  view: DiscoveryView,
  now = Date.now(),
) {
  const rows = [...new Map(items.map((r) => [itemId(r), r])).values()].filter(
    (r) =>
      validItem(r, now) &&
      (!view.filters.region || itemRegions(r).includes(view.filters.region)),
  );
  view.selectedId = rows.some((r) => itemId(r) === view.selectedId)
    ? view.selectedId
    : rows[0]
      ? itemId(rows[0])
      : null;
  return rows;
}
export function selectDiscoveryItem(view: DiscoveryView, item: DiscoveryItem) {
  view.selectedId = itemId(item);
}
export function filterDiscovery(view: DiscoveryView, filters: Filters) {
  if (JSON.stringify(view.filters) === JSON.stringify(filters)) return false;
  view.filters = { ...filters };
  view.selectedId = null;
  view.scroll = 0;
  view.pages = 1;
  return true;
}
export function discoveryPath(mode: SupportMode, f: Filters, cursor?: string) {
  const q = new URLSearchParams({ limit: "20" });
  if (mode === "找活") q.set("request_schema_version", "2");
  if (f.region) q.set("region_id", f.region);
  if (f.text.trim())
    q.set(mode === "找活" ? "query" : "carrier", f.text.trim());
  if (f.day) q.set("day", f.day);
  if (mode === "找活" && f.kind) q.set("kind", f.kind);
  if (cursor) q.set("cursor", cursor);
  return `/v1/${mode === "找活" ? "requests" : "drivers"}?${q}`;
}
