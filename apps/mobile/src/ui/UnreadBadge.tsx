import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { tokens } from "@abasong/ui";

// Parent controls expose the complete count in their accessibility label.
export function UnreadBadge({
  count,
  dot = false,
  style,
}: {
  count: number;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[s.badge, dot && s.dot, style]}
    >
      {!dot ? <Text style={s.text}>{count > 99 ? "99+" : count}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.brandPrimary,
  },
  text: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: tokens.color.onBrand,
  },
  dot: {
    minWidth: 8,
    minHeight: 8,
    width: 8,
    height: 8,
    paddingHorizontal: 0,
    borderRadius: 4,
  },
});
