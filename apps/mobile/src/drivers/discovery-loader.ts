import type { components } from "@abasong/contracts";
import {
  discoveryPath,
  type DiscoveryItem,
  type Filters,
  type SupportMode,
} from "./discovery-model";
type S = components["schemas"];
export type DiscoveryResult =
  | {
      status: "ready";
      rows: DiscoveryItem[];
      regions: S["Region"][];
      next: string | null;
      pages: number;
    }
  | { status: "error"; message: string };
// Each component owns one loader. No cache, location or cross-account state.
export function createDiscoveryLoader(
  read: (path: string, signal: AbortSignal) => Promise<unknown>,
) {
  let generation = 0,
    controller: AbortController | null = null;
  return {
    cancel() {
      generation++;
      controller?.abort();
    },
    async load(
      mode: SupportMode,
      filters: Filters,
      count: number,
    ): Promise<DiscoveryResult | null> {
      const epoch = ++generation;
      controller?.abort();
      const c = new AbortController();
      controller = c;
      const valid = () => epoch === generation && !c.signal.aborted;
      const f = { ...filters };
      try {
        const regions = (await read(
          "/v1/regions?limit=100",
          c.signal,
        )) as S["RegionPage"];
        if (!valid()) return null;
        const rows: DiscoveryItem[] = [];
        let next: string | null = null,
          pages = 0;
        for (let i = 0; i < Math.min(5, Math.max(1, count)); i++) {
          const result = (await read(
            discoveryPath(mode, f, next ?? undefined),
            c.signal,
          )) as S["RequestPageV2"] | S["DriverPage"];
          if (!valid()) return null;
          rows.push(
            ...(mode === "找活"
              ? (result as S["RequestPageV2"]).items.map((request) => ({
                  kind: "request" as const,
                  request,
                }))
              : (result as S["DriverPage"]).items.map((driver) => ({
                  kind: "driver" as const,
                  driver,
                }))),
          );
          next = result.next_cursor;
          pages++;
          if (!next) break;
        }
        return { status: "ready", rows, regions: regions.items, next, pages };
      } catch (e) {
        return valid()
          ? {
              status: "error",
              message: e instanceof Error ? e.message : "暂时无法加载，请重试",
            }
          : null;
      }
    },
  };
}
