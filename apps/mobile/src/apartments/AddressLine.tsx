import { Text } from "react-native";
import { tokens } from "@abasong/ui";
import { addressParts } from "./address-presentation";
export function AddressLine({
  line,
  expanded = false,
  compact = false,
  homeResult = false,
}: {
  line: string;
  expanded?: boolean;
  compact?: boolean;
  homeResult?: boolean;
}) {
  const parts = addressParts(line);
  return (
    <Text
      accessibilityLabel={line}
      numberOfLines={expanded ? undefined : 1}
      ellipsizeMode="tail"
      style={{
        fontSize: homeResult ? 16 : compact ? 17 : 20,
        lineHeight: homeResult ? 28 : compact ? 29 : 36,
        fontWeight: "400",
        color: tokens.color.inkSoft,
        minWidth: 0,
        flexShrink: 1,
      }}
    >
      {parts.number ? (
        <Text
          style={{
            fontSize: homeResult ? 22 : compact ? 21 : 28,
            fontWeight: "700",
            color: tokens.color.ink,
          }}
        >
          {parts.number}{" "}
        </Text>
      ) : null}
      {parts.rest}
    </Text>
  );
}
