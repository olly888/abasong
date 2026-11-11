import type { components } from "@abasong/contracts";
let item:
  | {
      key: string;
      owner: string;
      value: {
        address: components["schemas"]["SearchAddress"] | null;
        key?: string;
      };
      until: number;
    }
  | undefined;
export function setNearbyContribution(
  key: string,
  owner: string,
  value: {
    address: components["schemas"]["SearchAddress"] | null;
    key?: string;
  },
) {
  item = { key, owner, value, until: Date.now() + 600000 };
}
export function getNearbyContribution(key: string | undefined, owner: string) {
  if (item && item.until <= Date.now()) item = undefined;
  return item && item.key === key && item.owner === owner
    ? item.value
    : undefined;
}
