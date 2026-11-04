// Display-only emphasis: never a geocoder, apartment matcher or code scope.
// Keep directional/unit text intact; uncertain forms render unchanged.
export function addressParts(line: string) {
  const value = line.trim().replace(/\s+/g, " ");
  const match =
    /^((?:\d+[A-Z]?|[A-Z]\d+)(?:-\d+[A-Z]?)?(?: \d+\/\d+)?) (.+)$/i.exec(value);
  return match
    ? { number: match[1]!, rest: match[2]! }
    : { number: null, rest: value };
}
export function locality(a: {
  city: string;
  state: string;
  postal_code?: string | null;
}) {
  return [a.city, [a.state, a.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}
