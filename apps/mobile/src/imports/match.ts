import type { components } from "@abasong/contracts";
type Apartment = components["schemas"]["Apartment"];
const normalize = (s: string) =>
  s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const streetPattern =
  /^(\d{1,6}\s+.{1,170}?\b(?:avenue|ave|street|st|boulevard|blvd|road|rd|way|drive|dr|lane|ln|court|ct|place|pl)\b\.?)(?=[\s,]|$)/i;
const localityPattern =
  /^([\p{L} .'’-]+?)[ ,]+([A-Z]{2})(?:[ ,]+(\d{5}(?:-\d{4})?))?$/iu;

export function buildingAddress(text: string) {
  const cleaned = text.trim().replace(/，/g, ",").replace(/\s+/g, " ");
  const street = streetPattern.exec(cleaned)?.[1] ?? "";
  if (!street) return { street, address: "", needsReview: !!cleaned };
  const rest = cleaned.slice(street.length).replace(/^[ ,]+|[ ,]+$/g, "");
  const unit =
    /(?:^|[ ,]+)(?:apt\.?|unit|suite|ste\.?)\s+[a-z0-9-]{1,12}(?=[ ,]|$)/gi;
  let tail = rest.replace(unit, " ").replace(/^[ ,]+|[ ,]+$/g, "");
  tail = tail.replace(/[ ,]+US$/i, "").trim();
  const unexplainedNumber = /^\d+[a-z]?(?:[ ,]+|$)/i.exec(tail);
  if (unexplainedNumber) tail = tail.slice(unexplainedNumber[0].length);
  const repeated = /^(.+?[ ,]+[A-Z]{2}[ ,]+\d{5}(?:-\d{4})?)[ ,]+(.+)$/i.exec(
    tail,
  );
  if (repeated && normalize(repeated[1]!) === normalize(repeated[2]!))
    tail = repeated[1]!;
  const locality = localityPattern.exec(tail);
  const address = locality
    ? `${street}, ${locality[1]!.trim()}, ${locality[2]!.toUpperCase()}${locality[3] ? " " + locality[3] : ""}`
    : street;
  return {
    street,
    address,
    needsReview: !!unexplainedNumber || (!!tail && !locality),
  };
}

// Only full street + exact city/state matches may be preselected; never GPS/name-only.
export function exactApartment(
  address: string,
  items: Apartment[],
): Apartment | null {
  const parsed = buildingAddress(address);
  if (parsed.needsReview) return null;
  const parts = parsed.address.split(",").map(normalize);
  if (parts.length < 2) return null;
  const zip = /\b(\d{5})(?:-\d{4})?$/.exec(parsed.address)?.[1];
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
