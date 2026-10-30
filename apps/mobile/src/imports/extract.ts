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
// A conservative baseline: labelled access fields only; no free-number guessing.
export function extractCandidates(input: OcrLine[]): Extracted[] {
  const lines = input
    .filter((l) => Number.isFinite(l.y) && Number.isFinite(l.x))
    .slice(0, 600)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const addresses = lines.filter((l) => addressPattern.test(l.text.trim()));
  return lines
    .flatMap((line) => {
      const match = codePattern.exec(line.text.trim());
      if (!match) return [];
      const nearby = addresses.filter(
        (a) =>
          a.y <= line.y &&
          line.y - a.y < 0.24 &&
          Math.min(a.x + a.width, line.x + line.width) - Math.max(a.x, line.x) >
            0,
      );
      const issues: string[] = [];
      const addr = nearby.length === 1 ? nearby[0] : undefined;
      if (!addr) issues.push(nearby.length > 1 ? "地址对应不明" : "缺少地址");
      const value = match[1].trim();
      if (/[OIlS]/.test(value) || line.confidence < 0.8)
        issues.push("请核对字符");
      let address = addr?.text.trim() ?? "";
      if (addr) {
        const city = lines.find(
          (l) =>
            l.y > addr.y &&
            l.y < line.y &&
            l.y - addr.y < 0.07 &&
            Math.abs(l.x - addr.x) < 0.12 &&
            /,?\s[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/.test(l.text),
        );
        if (city) address += ", " + city.text.trim();
      }
      return [{ address, value, issues }];
    })
    .slice(0, 100);
}
