import type { components } from "@abasong/contracts";
import { mergeSearchResults, type SearchResult } from "./search-results";
type S = components["schemas"];
export type ContributionRequest = <T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  },
) => Promise<T>;
export type AddressChoices = {
  key: string;
  token: string;
  until: number;
  items: SearchResult[];
  attribution: string;
  localUnavailable: boolean;
  providerUnavailable: boolean;
};
// Per-open-form memory only. A suggestion is retrieved with its own session,
// never a later query's token. Cancellation also protects against late results
// from transports that ignore AbortSignal.
export function createContributionAddressSearch(
  request: ContributionRequest,
  makeKey: () => string,
  now = Date.now,
) {
  let version = 0,
    controller: AbortController | null = null,
    activeChoices: string | null = null;
  let session: {
    token: string;
    started: number;
    calls: number;
    used?: string;
  } | null = null;
  const begin = () => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal,
      epoch = ++version;
    return { signal, valid: () => !signal.aborted && epoch === version };
  };
  return {
    cancel() {
      controller?.abort();
      version++;
      activeChoices = null;
    },
    async search(query: string): Promise<AddressChoices | null> {
      const run = begin();
      activeChoices = null;
      if (query.trim().length < 2) return null;
      if (
        !session ||
        session.used ||
        now() - session.started >= 140000 ||
        session.calls >= 40
      )
        session = { token: makeKey(), started: now(), calls: 0 };
      const current = session;
      current.calls++;
      const [local, external] = await Promise.allSettled([
        request<S["ApartmentPage"]>(
          "/v1/apartments?limit=5&query=" + encodeURIComponent(query.trim()),
          { signal: run.signal },
        ),
        request<S["AddressSuggestions"]>("/v1/search/addresses/suggest", {
          method: "POST",
          signal: run.signal,
          body: { query: query.trim(), session_token: current.token },
        }),
      ]);
      if (!run.valid()) return null;
      const key = makeKey();
      activeChoices = key;
      return {
        key,
        token: current.token,
        until: current.started + 140000,
        items: mergeSearchResults(
          local.status === "fulfilled" ? local.value.items : [],
          external.status === "fulfilled" ? external.value.items : [],
        ),
        attribution:
          external.status === "fulfilled" ? external.value.attribution : "",
        localUnavailable: local.status === "rejected",
        providerUnavailable: external.status === "rejected",
      };
    },
    async retrieve(
      choice: Extract<SearchResult, { kind: "address" }>,
      choices: AddressChoices,
    ) {
      const id = choice.suggestion.provider_result_id;
      if (
        activeChoices !== choices.key ||
        now() >= choices.until ||
        (session?.token === choices.token &&
          session.used &&
          session.used !== id)
      )
        throw new Error("地址候选已过期，请重新搜索");
      const run = begin();
      if (session?.token === choices.token) session.used = id;
      try {
        const detail = await request<S["TemporaryAddress"]>(
          "/v1/search/addresses/retrieve",
          {
            method: "POST",
            signal: run.signal,
            body: { provider_result_id: id, session_token: choices.token },
          },
        );
        if (!run.valid()) return null;
        activeChoices = null;
        return detail;
      } catch (e) {
        if (!run.valid()) return null;
        throw e;
      }
    },
  };
}

export type ContributionAddress =
  | { kind: "pending" }
  | { kind: "apartment"; apartment: S["Apartment"] }
  | { kind: "address"; address: S["SearchAddress"] }
  | { kind: "private"; address: string };
export function validContributionAddress(
  a: ContributionAddress,
  isPrivate: boolean,
) {
  if (a.kind === "apartment") return true;
  if (a.kind === "private") return isPrivate && !!a.address.trim();
  return (
    a.kind === "address" &&
    !!a.address.address_line1.trim() &&
    !!a.address.city.trim() &&
    /^[A-Z]{2}$/.test(a.address.state) &&
    (!a.address.postal_code || /^\d{5}(?:-\d{4})?$/.test(a.address.postal_code))
  );
}
export function privateAddressText(a: ContributionAddress) {
  return a.kind === "private"
    ? a.address
    : a.kind === "address"
      ? [
          a.address.address_line1,
          a.address.city,
          a.address.state,
          a.address.postal_code,
        ]
          .filter(Boolean)
          .join(", ")
      : "";
}
