import type { components } from "@abasong/contracts";
import {
  discoveryPath,
  itemId,
  type DiscoveryItem,
  type Filters,
  type SupportMode,
} from "./discovery-model";
type S = components["schemas"];
export const DISCOVERY_PAGE_LIMIT = 5;
type Ready = {
  status: "ready";
  rows: DiscoveryItem[];
  regions: S["Region"][];
  next: string | null;
  pages: number;
  moreError?: string;
  moreRecovery?: "retry" | "reload";
};
export type DiscoveryResult = Ready | { status: "error"; message: string };
class PageChangedError extends Error {}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "暂时无法加载，请重试";
const denied = (e: unknown) =>
  !!e &&
  typeof e === "object" &&
  "status" in e &&
  (e.status === 401 || e.status === 403);
// A component/session-local snapshot, cleared on leave, refresh and access denial.
// Only next-page failures retain already verified rows. No persistent/location cache.
export function createDiscoveryLoader(
  read: (path: string, signal: AbortSignal) => Promise<unknown>,
) {
  let generation = 0,
    controller: AbortController | null = null;
  let snapshot: { key: string; result: Ready; cursors: Set<string> } | null =
    null;
  const key = (mode: SupportMode, filters: Filters) =>
    JSON.stringify([mode, filters]);
  function begin() {
    const epoch = ++generation;
    controller?.abort();
    const c = new AbortController();
    controller = c;
    return {
      signal: c.signal,
      valid: () => epoch === generation && !c.signal.aborted,
    };
  }
  async function page(
    mode: SupportMode,
    filters: Filters,
    cursor: string | null,
    signal: AbortSignal,
  ) {
    const r = (await read(
      discoveryPath(mode, filters, cursor ?? undefined),
      signal,
    )) as S["RequestPageV2"] | S["DriverPage"];
    if (
      !r ||
      !Array.isArray(r.items) ||
      !(
        r.next_cursor === null ||
        (typeof r.next_cursor === "string" && r.next_cursor.length > 0)
      )
    )
      throw new Error("查询结果不完整，请重新加载");
    const rows: DiscoveryItem[] =
      mode === "找活"
        ? (r as S["RequestPageV2"]).items.map((request) => ({
            kind: "request",
            request,
          }))
        : (r as S["DriverPage"]).items.map((driver) => ({
            kind: "driver",
            driver,
          }));
    return { rows, next: r.next_cursor };
  }
  function append(old: DiscoveryItem[], fresh: DiscoveryItem[]) {
    return [
      ...new Map([...old, ...fresh].map((row) => [itemId(row), row])).values(),
    ];
  }
  function checkCursor(next: string | null, seen: Set<string>) {
    if (next && seen.has(next))
      throw new PageChangedError("分页结果已变化，请重新加载");
    if (next) seen.add(next);
  }
  return {
    cancel() {
      generation++;
      controller?.abort();
      snapshot = null;
    },
    async load(
      mode: SupportMode,
      filters: Filters,
      count: number,
    ): Promise<DiscoveryResult | null> {
      const run = begin(),
        f = { ...filters };
      snapshot = null;
      try {
        const regions = (await read(
          "/v1/regions?limit=100",
          run.signal,
        )) as S["RegionPage"];
        if (!run.valid()) return null;
        // The service catalog fits one page today; never silently omit future regions.
        if (!regions || !Array.isArray(regions.items) || regions.next_cursor)
          throw new Error("区域资料不完整，请重新加载");
        const result: Ready = {
          status: "ready",
          rows: [],
          regions: regions.items,
          next: null,
          pages: 0,
        };
        const cursors = new Set<string>();
        for (
          let i = 0;
          i < Math.min(DISCOVERY_PAGE_LIMIT, Math.max(1, count));
          i++
        ) {
          const r = await page(mode, f, result.next, run.signal);
          if (!run.valid()) return null;
          checkCursor(r.next, cursors);
          result.rows = append(result.rows, r.rows);
          result.next = r.next;
          result.pages++;
          if (!r.next) break;
        }
        snapshot = { key: key(mode, f), result, cursors };
        return result;
      } catch (e) {
        return run.valid() ? { status: "error", message: message(e) } : null;
      }
    },
    async more(
      mode: SupportMode,
      filters: Filters,
    ): Promise<DiscoveryResult | null> {
      const prior = snapshot;
      if (!prior || prior.key !== key(mode, filters)) return null;
      if (!prior.result.next || prior.result.pages >= DISCOVERY_PAGE_LIMIT)
        return prior.result;
      const run = begin(),
        f = { ...filters };
      try {
        const r = await page(mode, f, prior.result.next, run.signal);
        if (!run.valid()) return null;
        const cursors = new Set(prior.cursors);
        checkCursor(r.next, cursors);
        const result: Ready = {
          ...prior.result,
          rows: append(prior.result.rows, r.rows),
          next: r.next,
          pages: prior.result.pages + 1,
          moreError: undefined,
          moreRecovery: undefined,
        };
        snapshot = { key: prior.key, result, cursors };
        return result;
      } catch (e) {
        if (!run.valid()) return null;
        if (denied(e)) {
          snapshot = null;
          return { status: "error", message: message(e) };
        }
        return {
          ...prior.result,
          moreError: message(e),
          moreRecovery:
            e instanceof PageChangedError ||
            (e &&
              typeof e === "object" &&
              "status" in e &&
              [404, 409].includes(Number(e.status)))
              ? "reload"
              : "retry",
        };
      }
    },
  };
}
