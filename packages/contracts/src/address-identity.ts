export type AddressIdentity = {
  address_line1: string;
  city: string;
  state: string;
};
const aliases: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  street: "st",
  avenue: "ave",
  boulevard: "blvd",
  road: "rd",
  drive: "dr",
  court: "ct",
  lane: "ln",
  parkway: "pkwy",
  highway: "hwy",
  place: "pl",
  terrace: "ter",
};
// Conservative address identity for dedupe/manual search only. Unit numbers
// are retained; a shared street address is not proof of apartment membership.
export function addressIdentity(
  value: AddressIdentity | null | undefined,
): string | null {
  if (
    !value ||
    !value.address_line1 ||
    !value.city ||
    !/^[a-z]{2}$/i.test(value.state)
  )
    return null;
  const words = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const street = words(value.address_line1);
  if (!street.length || !/^\d/.test(street[0]!)) return null;
  return [
    street.map((w) => aliases[w] ?? w).join(" "),
    words(value.city).join(" "),
    value.state.toLowerCase(),
  ].join("|");
}
