import { addressIdentity, type components } from "@abasong/contracts";
type S = components["schemas"];
export type SearchResult =
  | { kind: "apartment"; apartment: S["Apartment"] }
  | { kind: "address"; suggestion: S["AddressSuggestion"] };
export function mergeSearchResults(
  local: S["Apartment"][],
  external: S["AddressSuggestion"][],
): SearchResult[] {
  const keys = new Set(local.map(addressIdentity).filter(Boolean));
  const ids = new Set<string>();
  return [
    ...local.map((apartment) => ({ kind: "apartment" as const, apartment })),
    ...external
      .filter((s) => {
        const key = addressIdentity(s.address);
        if (ids.has(s.provider_result_id) || (key && keys.has(key)))
          return false;
        ids.add(s.provider_result_id);
        if (key) keys.add(key);
        return true;
      })
      .map((suggestion) => ({ kind: "address" as const, suggestion })),
  ];
}
