import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iconPaths, tokens } from "../../packages/ui/src";

function luminance(hex: string): number {
  const weights = [0.2126, 0.7152, 0.0722];
  return weights.reduce((total, weight, index) => {
    const value =
      Number.parseInt(hex.slice(1 + 2 * index, 3 + 2 * index), 16) / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return total + weight * linear;
  }, 0);
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("Abasong brand baseline", () => {
  it("locks the supplied artwork colors and accessible action roles", () => {
    expect(tokens.brand).toEqual({
      blue: "#1769FF",
      black: "#000000",
      white: "#FFFFFF",
    });
    expect(tokens.semantic.actionPrimary).toBe(tokens.brand.blue);
    const pairs = [
      [tokens.semantic.actionPrimaryText, tokens.semantic.actionPrimary],
      [tokens.semantic.actionPrimaryText, tokens.semantic.actionPrimaryPressed],
      [tokens.semantic.actionHighlightText, tokens.semantic.actionHighlight],
      [tokens.color.brandText, tokens.color.surface],
      [tokens.color.brandText, tokens.color.canvas],
      [tokens.color.danger, tokens.color.dangerSoft],
      [tokens.color.success, tokens.color.successSoft],
      [tokens.color.warning, tokens.color.warningSoft],
    ] as const;
    for (const [foreground, background] of pairs) {
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ships the same official SVG bytes on both web surfaces", () => {
    const original = readFileSync(
      "docs/design/brand/abasong_wordmark_primary.svg",
    );
    expect(
      readFileSync(
        "design/abasong-independent-v1/assets/brand/abasong_wordmark_primary.svg",
      ),
    ).toEqual(original);
    expect(
      readFileSync(
        "deploy/invitation/invite/assets/brand/abasong_wordmark_primary.svg",
      ),
    ).toEqual(original);
  });

  it("keeps the native and prototype icon paths aligned", () => {
    const webIcons = readFileSync(
      "design/abasong-independent-v1/v12.1-experience/icons.js",
      "utf8",
    );
    const json = webIcons.slice(
      webIcons.indexOf("{"),
      webIcons.lastIndexOf("}") + 1,
    );
    expect(JSON.parse(json)).toEqual(iconPaths);
    expect(tokens.size.touchMin.value).toBeGreaterThanOrEqual(48);
  });
});
