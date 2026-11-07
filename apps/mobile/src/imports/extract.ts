export type OcrLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};
export type Extracted = { address: string; value: string; issues: string[] };
const addressPattern =
  /^\d{1,6}\s+.{1,170}\b(?:avenue|ave|street|st|boulevard|blvd|road|rd|way|drive|dr|lane|ln|court|ct|place|pl)\b/i;
const codePattern =
  /^(?:gate|access|entry|building|门禁|公寓|大门)?\s*(?:code|密码)\s*[:：]\s*(.{1,32})$/i;
function overlaps(a: OcrLine, b: OcrLine) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
}
function validLine(line: OcrLine) {
  return (
    typeof line.text === "string" &&
    [line.x, line.y, line.width, line.height].every(Number.isFinite) &&
    line.x >= 0 &&
    line.y >= 0 &&
    line.width > 0 &&
    line.height > 0 &&
    line.x + line.width <= 1.02 &&
    line.y + line.height <= 1.02
  );
}
// A conservative baseline: labelled access fields only; no free-number guessing.
export function extractCandidates(input: OcrLine[]): Extracted[] {
  const bounded = input.slice(0, 600);
  const malformedGeometry = bounded.some((line) => !validLine(line));
  const lines = bounded
    .filter(validLine)
    .slice(0, 600)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const addresses = lines.filter((l) => addressPattern.test(l.text.trim()));
  const codeLines = lines.filter((line) => codePattern.test(line.text.trim()));
  return codeLines
    .slice(0, 100)
    .flatMap((line) => {
      const match = codePattern.exec(line.text.trim());
      if (!match || match[1] === undefined) return [];
      let nearby = addresses.filter(
        (a) => a.y <= line.y && line.y - a.y < 0.24 && overlaps(a, line),
      );
      // A new address after an earlier labelled code starts a new section in
      // this column. Multiple addresses within one section remain ambiguous;
      // repeated code fields without a new address retain that section.
      const latestAddressY = nearby.at(-1)?.y ?? -1;
      const boundaries = codeLines.filter(
        (previous) =>
          previous.y < line.y &&
          codePattern.test(previous.text.trim()) &&
          overlaps(previous, line) &&
          previous.y < latestAddressY,
      );
      if (boundaries.length) {
        const boundary = Math.max(...boundaries.map((previous) => previous.y));
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
      const value = match[1].trim();
      if (
        /[OIlS]/.test(value) ||
        /[^A-Za-z0-9#*]/.test(value) ||
        !Number.isFinite(line.confidence) ||
        line.confidence < 0.8 ||
        line.confidence > 1
      )
        issues.push("请核对字符");
      let address = addr?.text.trim() ?? "";
      if (addr) {
        const cities = lines.filter(
          (l) =>
            l.y > addr.y &&
            l.y < line.y &&
            l.y - addr.y < 0.07 &&
            Math.abs(l.x - addr.x) < 0.12 &&
            overlaps(l, addr) &&
            /,?\s[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/.test(l.text),
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
      }
      return [{ address, value, issues }];
    })
    .slice(0, 100);
}
