import type { components } from "@abasong/contracts";
import type { ContributionRequest } from "../apartments/contribution-address-search";
type S = components["schemas"];
// A result belongs to the open row and query, not just to the last HTTP call.
export function createReviewSearch(request: ContributionRequest) {
  let epoch = 0;
  let active: AbortController | null = null;
  const cancel = () => {
    epoch++;
    active?.abort();
  };
  return {
    cancel,
    async search(rowId: string, query: string) {
      cancel();
      const version = epoch;
      const controller = new AbortController();
      active = controller;
      try {
        const page = await request<S["ApartmentPage"]>(
          "/v1/apartments?query=" + encodeURIComponent(query.trim()),
          { signal: controller.signal },
        );
        return version === epoch && !controller.signal.aborted
          ? { rowId, items: page.items }
          : null;
      } catch (e) {
        if (version !== epoch || controller.signal.aborted) return null;
        throw e;
      }
    },
  };
}
