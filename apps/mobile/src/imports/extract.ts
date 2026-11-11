export type OcrLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};
export type CarrierDoorLabel = "社区门禁" | "楼门门禁";
export type Extracted = {
  address: string;
  value: string;
  issues: string[];
  carrierDoorLabel?: CarrierDoorLabel;
};
const addressPattern =
  /^\d{1,6}\s+.{1,170}\b(?:avenue|ave|street|st|boulevard|blvd|road|rd|way|drive|dr|lane|ln|court|ct|place|pl)\b/i;
const codePattern =
  /^(?:gate|access|entry|building|门禁|公寓|大门)?\s*(?:code|密码)\s*[:：]\s*(.{1,32})$/i;
const carrierStart =
  /^(?:[\p{Script=Han}\p{S}]\s+)?(?:社区门禁|杜区门禁|社杜区门禁|楼门门禁|模门门禁)/u;
const shortCode = /^(?=[A-Za-z0-9#*]*\d)[A-Za-z0-9#*]{3,12}$/;
const normalizeKeypadSymbols = (value: string) =>
  value.replace(/[＃＊]/g, (symbol) => (symbol === "＃" ? "#" : "*"));
const localityLine =
  /(?:[,，]\s*|\s+)[A-Z]{2}\s+\d{5}(?:-\d{4})?(?:\s+US)?\s*$/i;
const stateContinuation =
  /^[A-Z]{2}\s+\d{5}(?:-\d{4})?(?:\s+US|\s+(?:apt\.?|unit)\s+[a-z0-9-]+\s+[\p{L} .'’-]+\s+[A-Z]{2})?$/iu;
const zipContinuation = /^\d{5}(?:-\d{4})?(?:\s+US)?$/i;
function overlaps(a: OcrLine, b: OcrLine) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
}
function validLine(line: OcrLine) {
  return (
    typeof line.text === "string" &&
    [line.x, line.y, line.width, line.height].every(Number.isFinite) &&
    line.x >= -0.02 &&
    line.y >= -0.02 &&
    line.width > 0 &&
    line.height > 0 &&
    line.x + line.width > 0 &&
    line.y + line.height > 0 &&
    line.x + line.width <= 1.02 &&
    line.y + line.height <= 1.02
  );
}

type CodeField = {
  line: OcrLine;
  value: string;
  carrierDoorLabel?: CarrierDoorLabel;
  valueConfidence?: number;
  uncertainField?: boolean;
};

function isDeliveryOnlyList(lines: OcrLine[]) {
  // A carrier's nearby list can have a delivery address above unrelated rows.
  // OCR may split the heading or the usage restriction across text boxes.
  const text = lines
    .map((line) => line.text)
    .join("")
    .replace(/\s/g, "");
  return (
    /附近的?code|只用于本次派送/i.test(text) ||
    (/门禁code/i.test(text) && /附近|这是对的/.test(text)) ||
    (/上报新code/i.test(text) && text.includes("这是对的"))
  );
}

function sameRowValue(lines: OcrLine[], label: OcrLine) {
  const right = label.x + label.width;
  return lines
    .filter((row) => {
      const gap = row.x - right;
      const verticalOverlap =
        Math.min(row.y + row.height, label.y + label.height) -
        Math.max(row.y, label.y);
      return (
        gap >= -0.005 &&
        gap <= 0.1 &&
        verticalOverlap >= Math.min(row.height, label.height) / 2
      );
    })
    .sort((a, b) => a.x - b.x)[0];
}

function codeFields(lines: OcrLine[]) {
  return lines.flatMap<CodeField>((line, index) => {
    const labelled = codePattern.exec(line.text.trim());
    if (labelled?.[1]) return [{ line, value: labelled[1].trim() }];
    const text = line.text.trim();
    if (!carrierStart.test(text)) return [];
    const labels = [
      ...text.matchAll(/(社区门禁|杜区门禁|社杜区门禁|楼门门禁|模门门禁)/g),
    ];
    if (labels.length > 2) return [];
    return labels.flatMap<CodeField>((match, labelIndex) => {
      const recognizedLabel = match[0];
      const carrierDoorLabel: CarrierDoorLabel = recognizedLabel.endsWith(
        "区门禁",
      )
        ? "社区门禁"
        : "楼门门禁";
      const nextLabel = labels[labelIndex + 1];
      const segment = text
        .slice(match.index + recognizedLabel.length, nextLabel?.index)
        .trim();
      const hasSeparator = /[|｜]$/.test(segment);
      const inlineValue = segment
        .replace(/^[:：]\s*/, "")
        .replace(/[|｜]$/, "")
        .trim();
      if (inlineValue) {
        const value = normalizeKeypadSymbols(inlineValue);
        return /^[\x21-\x7e]{1,32}$/.test(value) && /\d/.test(value)
          ? [
              {
                line,
                value,
                carrierDoorLabel,
                uncertainField:
                  (!!nextLabel && !hasSeparator) ||
                  recognizedLabel !== carrierDoorLabel ||
                  value !== inlineValue,
              },
            ]
          : [];
      }
      // The recognizer can emit the label and its value as separate boxes.
      // Use the first adjacent box; never skip other text to find a number.
      if (labels.length !== 1 || hasSeparator) return [];
      const adjacent = sameRowValue(lines, line);
      const next =
        adjacent ??
        lines
          .slice(index + 1)
          .find((row) => row.y > line.y && overlaps(row, line));
      const rawValue = next?.text.trim() ?? "";
      const value = normalizeKeypadSymbols(rawValue);
      if (
        !next ||
        (!adjacent &&
          (next.y - line.y > 0.095 || Math.abs(next.x - line.x) > 0.08)) ||
        !shortCode.test(value)
      )
        return [];
      return [
        {
          line,
          value,
          carrierDoorLabel,
          valueConfidence: next.confidence,
          uncertainField:
            recognizedLabel !== carrierDoorLabel || value !== rawValue,
        },
      ];
    });
  });
}
// A conservative baseline: labelled access fields only; no free-number guessing.
export function inspectScreenshot(input: OcrLine[]): {
  deliveryOnly: boolean;
  candidates: Extracted[];
} {
  const bounded = input.slice(0, 600);
  const malformedGeometry = bounded.some((line) => !validLine(line));
  const lines = bounded
    .filter(validLine)
    .slice(0, 600)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (isDeliveryOnlyList(lines)) return { deliveryOnly: true, candidates: [] };
  const addresses = lines.filter((l) => addressPattern.test(l.text.trim()));
  const fields = codeFields(lines);
  const codeLines = fields.map((field) => field.line);
  const candidates = fields
    .slice(0, 100)
    .map(
      ({ line, value, carrierDoorLabel, valueConfidence, uncertainField }) => {
        const heading =
          carrierDoorLabel &&
          lines
            .filter(
              (row) =>
                row.y < line.y &&
                line.y - row.y < 0.42 &&
                overlaps(row, line) &&
                /^门禁信息\s*[(（]\d+[)）]$/.test(row.text.trim()),
            )
            .at(-1);
        const referenceY =
          heading &&
          !addresses.some(
            (a) => a.y > heading.y && a.y <= line.y && overlaps(a, line),
          )
            ? heading.y
            : line.y;
        let nearby = addresses.filter(
          (a) =>
            a.y <= referenceY && referenceY - a.y < 0.24 && overlaps(a, line),
        );
        // A new address after an earlier labelled code starts a new section in
        // this column. Multiple addresses within one section remain ambiguous;
        // repeated code fields without a new address retain that section.
        const latestAddressY = nearby.at(-1)?.y ?? -1;
        const boundaries = codeLines.filter(
          (previous) =>
            previous.y < line.y &&
            overlaps(previous, line) &&
            previous.y < latestAddressY,
        );
        if (boundaries.length) {
          const boundary = Math.max(
            ...boundaries.map((previous) => previous.y),
          );
          nearby = nearby.filter((address) => address.y > boundary);
        }
        const issues: string[] = [];
        const addr =
          !malformedGeometry && nearby.length === 1 ? nearby[0] : undefined;
        if (!addr) issues.push(nearby.length > 1 ? "地址对应不明" : "缺少地址");
        if (
          addr &&
          (!Number.isFinite(addr.confidence) ||
            addr.confidence < 0.8 ||
            addr.confidence > 1)
        )
          issues.push("请核对地址");
        if (
          /[OIlS]/.test(value) ||
          /[^A-Za-z0-9#*]/.test(value) ||
          uncertainField ||
          (carrierDoorLabel && /^[#*]*0+[#*]*$/.test(value)) ||
          (valueConfidence !== undefined &&
            (!Number.isFinite(valueConfidence) ||
              valueConfidence < 0.8 ||
              valueConfidence > 1)) ||
          !Number.isFinite(line.confidence) ||
          line.confidence < 0.8 ||
          line.confidence > 1
        )
          issues.push("请核对字符");
        let address = addr?.text.trim() ?? "";
        if (addr) {
          const continuations = lines.filter(
            (l) =>
              l.y > addr.y &&
              l.y < line.y &&
              l.y - addr.y < 0.07 &&
              Math.abs(l.x - addr.x) < 0.12 &&
              overlaps(l, addr),
          );
          const cities = continuations.filter(
            (l) =>
              localityLine.test(l.text) &&
              !stateContinuation.test(l.text.trim()),
          );
          const distinct = [
            ...new Map(
              cities.map((l) => [l.text.trim().toLowerCase(), l]),
            ).values(),
          ];
          const city = distinct.length === 1 ? distinct[0] : undefined;
          if (distinct.length > 1) issues.push("地址对应不明");
          if (city) {
            address += ", " + city.text.trim();
            if (
              (!Number.isFinite(city.confidence) ||
                city.confidence < 0.8 ||
                city.confidence > 1) &&
              !issues.includes("请核对地址")
            )
              issues.push("请核对地址");
          }
          if (carrierDoorLabel && !distinct.length) {
            for (const row of continuations.slice(0, 2)) {
              const text = row.text.trim();
              if (
                !stateContinuation.test(text) &&
                !(zipContinuation.test(text) && /\s[A-Z]{2}$/i.test(address))
              )
                break;
              address += ` ${text}`;
              if (
                (!Number.isFinite(row.confidence) ||
                  row.confidence < 0.8 ||
                  row.confidence > 1) &&
                !issues.includes("请核对地址")
              )
                issues.push("请核对地址");
            }
          }
        }
        return {
          address,
          value,
          issues,
          ...(carrierDoorLabel ? { carrierDoorLabel } : {}),
        };
      },
    );
  return { deliveryOnly: false, candidates };
}

export function extractCandidates(input: OcrLine[]): Extracted[] {
  return inspectScreenshot(input).candidates;
}
