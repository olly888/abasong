import type { components } from "@abasong/contracts";
type Destination = components["schemas"]["TemporaryAddress"];
let current:
  { key: string; owner: string; value: Destination; until: number } | undefined;
// One in-memory handoff. Only the random key enters navigation params, never
// the provider address/coordinates. Nothing is written to storage or history.
export function setSearchDestination(
  key: string,
  owner: string,
  value: Destination,
) {
  current = { key, owner, value, until: Date.now() + 600000 };
}
export function getSearchDestination(key: string | undefined, owner: string) {
  if (current && current.until <= Date.now()) current = undefined;
  return current && current.key === key && current.owner === owner
    ? current.value
    : undefined;
}
export function clearSearchDestination() {
  current = undefined;
}
