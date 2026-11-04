import type { OcrLine } from "../imports/extract";

export type LabelAddress = {
  street: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  searchText: string;
  issues: (
    | "recipient_uncertain"
    | "incomplete_address"
    | "check_characters"
    | "multiple_addresses"
  )[];
};

const recipient = /^(?:ship\s*to|deliver\s*to|recipient|to)\s*(?::|\b)/i;
const sender =
  /^(?:ship\s*from|return\s*(?:to|address)|sender|from)\s*(?::|\b)/i;
const streetPattern =
  /^(\d{1,6}[A-Z]?(?:\s+1\/2)?\s+[A-Z0-9][A-Z0-9 .'’-]{0,100}\s(?:AVENUE|AVE|STREET|ST|BOULEVARD|BLVD|ROAD|RD|PARKWAY|PKWY|HIGHWAY|HWY|WAY|DRIVE|DR|LANE|LN|COURT|CT|PLACE|PL|CIRCLE|CIR|TERRACE|TER|TRAIL|TRL)(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?)(?=\s|,|\.|$)\.?\s*(.*)$/i;
const localityPattern =
  /^([A-Z][A-Z .’'-]{0,60}?),?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+(\d{5})(?:-\d{4})?(?:\s+(?:US|USA))?$/i;
const unitPattern =
  /^(?:APT\.?|UNIT|SUITE|STE\.?|#)\s*#?\s*[A-Z0-9][A-Z0-9-]*\b\s*,?\s*/i;
const clean = (s: string) =>
  Array.from(s, (c) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c,
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
const sameColumn = (a: OcrLine, b: OcrLine) =>
  Math.abs(a.x - b.x) < 0.12 &&
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);

// Address-search experiment, separate from access-code contribution. This pure
// parser never uploads, logs, saves or geocodes OCR text. Even complete results
// must be confirmed before sending their minimal searchText to a provider.
export function extractLabelAddresses(input: OcrLine[]): LabelAddress[] {
  const lines = input
    .slice(0, 600)
    .filter(
      (l) =>
        l.text.length <= 256 &&
        [l.x, l.y, l.width, l.height, l.confidence].every(Number.isFinite) &&
        l.x >= 0 &&
        l.y >= 0 &&
        l.x <= 1 &&
        l.y <= 1 &&
        l.width > 0 &&
        l.width <= 1 &&
        l.height > 0 &&
        l.height <= 1 &&
        l.confidence >= 0 &&
        l.confidence <= 1,
    )
    .map((l) => ({ ...l, text: clean(l.text) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const anchors = lines.filter(
    (l) => recipient.test(l.text) || sender.test(l.text),
  );
  const hasRecipient = anchors.some((l) => recipient.test(l.text));
  const output = new Map<string, LabelAddress>();
  for (const line of lines) {
    const explicitRecipient = recipient.test(line.text);
    if (sender.test(line.text)) continue;
    const match = streetPattern.exec(line.text.replace(recipient, "").trim());
    if (!match || match[1] === undefined) continue;
    const preceding = anchors.filter(
      (a) => a.y <= line.y && line.y - a.y < 0.35 && sameColumn(a, line),
    );
    const anchor = preceding.at(-1);
    const isRecipient =
      explicitRecipient || (anchor && recipient.test(anchor.text));
    if (
      (!isRecipient && anchor && sender.test(anchor.text)) ||
      (hasRecipient && !isRecipient)
    )
      continue;
    const following = lines.filter(
      (l) => l.y > line.y && l.y - line.y < 0.13 && sameColumn(l, line),
    );
    const pieces: string[] = [];
    const tail = (match[2] ?? "").replace(/^,\s*/, "").replace(unitPattern, "");
    if (tail) pieces.push(tail);
    let confidence = line.confidence;
    let locality: RegExpExecArray | null = localityPattern.exec(
      pieces.join(" "),
    );
    for (const next of following) {
      if (locality || pieces.length >= 3) break;
      if (
        recipient.test(next.text) ||
        sender.test(next.text) ||
        streetPattern.test(next.text)
      )
        break;
      const text = next.text.replace(unitPattern, "");
      if (!text) continue;
      // Never append names, phone fields, tracking lines or arbitrary nearby text.
      if (
        !/^[A-Z][A-Z .’',-]{0,70}(?:\s+\d{5}(?:-\d{4})?)?(?:\s+(?:US|USA))?$/i.test(
          text,
        )
      )
        break;
      pieces.push(text);
      confidence = Math.min(confidence, next.confidence);
      locality = localityPattern.exec(pieces.join(" "));
    }
    const issues: LabelAddress["issues"] = [];
    if (!isRecipient) issues.push("recipient_uncertain");
    if (!locality) issues.push("incomplete_address");
    if (confidence < 0.8 || /^\d+[OIS]\b/i.test(match[1]))
      issues.push("check_characters");
    const street = match[1].trim();
    const city = locality?.[1]?.replace(/,$/, "").trim() ?? null;
    const state = locality?.[2]?.toUpperCase() ?? null;
    const postalCode = locality?.[3] ?? null;
    const searchText = locality
      ? `${street}, ${city}, ${state} ${postalCode}`
      : street;
    const key = searchText.toUpperCase().replace(/[.,]/g, "");
    const existing = output.get(key);
    const candidate = { street, city, state, postalCode, searchText, issues };
    if (!existing || issues.length < existing.issues.length)
      output.set(key, candidate);
  }
  const result = [...output.values()].slice(0, 5);
  if (output.size > 1)
    for (const address of result) address.issues.push("multiple_addresses");
  return result;
}
