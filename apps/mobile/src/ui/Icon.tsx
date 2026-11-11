import { SvgXml } from "react-native-svg";
import { Platform } from "react-native";
import { iconPaths, tokens } from "@abasong/ui";

export type IconName = keyof typeof iconPaths;

const glyphs = Object.fromEntries(
  Object.entries(iconPaths).map(([name, paths]) => [
    name,
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${tokens.size.iconStroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
  ]),
);

export function Icon({
  name,
  color = tokens.color.ink,
  size = tokens.size.icon.value,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <SvgXml
      xml={glyphs[name]!}
      width={size}
      height={size}
      color={color}
      {...(Platform.OS === "web"
        ? { "aria-hidden": true }
        : { accessible: false, importantForAccessibility: "no" as const })}
      pointerEvents="none"
    />
  );
}
