import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { brandWordmark } from "@abasong/ui";

// The approved light-background asset. The frame includes optical clear space.
export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Abasong，阿巴送"
      accessible
      style={{ padding: compact ? 6 : 14, alignSelf: "flex-start" }}
    >
      <SvgXml
        xml={brandWordmark}
        width={compact ? 116 : 144}
        height={(compact ? 116 : 144) * (518 / 1870)}
        accessible={false}
        importantForAccessibility="no"
      />
    </View>
  );
}
