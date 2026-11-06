import type { components } from "@abasong/contracts";
import {
  availabilityPayload,
  type AvailabilityFields,
} from "./availability-fields";
type S = components["schemas"];
export type AvailabilityRequest = <T>(
  path: string,
  options?: { method?: string; body?: unknown; signal?: AbortSignal },
) => Promise<T>;
export const availabilityConflict = (e: unknown) =>
  !!e && typeof e === "object" && "code" in e && e.code === "VERSION_CONFLICT";
// Scoped to one open editor/account. No persistent draft, renewal or retry loop.
export function createAvailabilitySession(
  request: AvailabilityRequest,
  now = Date.now,
) {
  let generation = 0,
    controller: AbortController | null = null;
  let saved: S["Availability"] | null | undefined;
  let availableRegions: Set<string> | null = null;
  function begin() {
    controller?.abort();
    controller = new AbortController();
    const epoch = ++generation,
      signal = controller.signal;
    return { signal, valid: () => epoch === generation && !signal.aborted };
  }
  return {
    cancel() {
      generation++;
      controller?.abort();
      saved = undefined;
      availableRegions = null;
    },
    async load() {
      const run = begin();
      saved = undefined;
      availableRegions = null;
      const [record, places] = await Promise.allSettled([
        request<S["Availability"]>("/v1/me/availability", {
          signal: run.signal,
        }).catch((e: unknown) => {
          if (
            e &&
            typeof e === "object" &&
            "status" in e &&
            e.status === 404 &&
            "code" in e &&
            e.code === "NOT_FOUND"
          )
            return null;
          throw e;
        }),
        request<S["RegionPage"]>("/v1/regions?limit=100", {
          signal: run.signal,
        }),
      ]);
      if (!run.valid()) return null;
      if (record.status === "rejected") throw record.reason;
      saved = record.value;
      availableRegions =
        places.status === "fulfilled"
          ? new Set(places.value.items.map((r) => r.id))
          : null;
      return {
        value: saved,
        regions: places.status === "fulfilled" ? places.value.items : [],
        regionError:
          places.status === "rejected"
            ? "区域暂时无法读取，可关闭当前时段或重新读取"
            : null,
      };
    },
    async save(form: AvailabilityFields) {
      if (saved === undefined) throw new Error("请先读取当前接活状态");
      if (
        form.enabled &&
        (!availableRegions ||
          form.regions.some((id) => !availableRegions!.has(id)))
      )
        throw new Error("请读取区域并重新选择可去区域");
      const body = availabilityPayload(form, saved?.version ?? 0, now()),
        run = begin();
      try {
        const value = await request<S["Availability"]>("/v1/me/availability", {
          method: "PUT",
          body,
          signal: run.signal,
        });
        if (!run.valid()) return null;
        saved = value;
        return value;
      } catch (e) {
        if (!run.valid()) return null;
        throw e;
      }
    },
  };
}
