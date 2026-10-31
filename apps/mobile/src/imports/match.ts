import type { components } from "@abasong/contracts";
type Apartment = components["schemas"]["Apartment"];
const normalize = (s: string) =>
  s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
// Only full street + exact city/state matches may be preselected; never GPS/name-only.
export function exactApartment(
  address: string,
  items: Apartment[],
): Apartment | null {
  const parts = address.split(",").map(normalize);
  if (parts.length < 2) return null;
  const zip = /\b(\d{5})(?:-\d{4})?$/.exec(address.trim())?.[1];
  const tail = parts
    .slice(1)
    .join(" ")
    .replace(/\s+\d{5}(?:-\d{4})?$/, "");
  const matches = items.filter(
    (p) =>
      normalize(p.address_line1) === parts[0] &&
      tail === normalize(p.city + " " + p.state) &&
      (!zip || !p.postal_code || p.postal_code.slice(0, 5) === zip),
  );
  return matches.length === 1 ? matches[0] : null;
}
