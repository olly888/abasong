import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { tokens } from "@abasong/ui";
import { metrics, typeStyles } from "./foundation";

export function MapStatusRow({
  title,
  state = "empty",
  action,
}: {
  title: string;
  state?: "empty" | "loading" | "error" | "unavailable";
  action?: { label: string; onPress: () => void };
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={[s.row, fontScale > 1.3 && action && s.stacked]}>
      <View style={s.status}>
        {state === "loading" ? (
          <ActivityIndicator
            color={tokens.color.brandPrimary}
            accessible={false}
          />
        ) : null}
        <Text
          accessibilityRole={state === "error" ? "alert" : undefined}
          accessibilityLiveRegion={state === "error" ? undefined : "polite"}
          style={[s.title, state === "error" && s.error]}
        >
          {title}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [s.action, pressed && s.pressed]}
        >
          <Text style={s.link}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[8].value,
    minHeight: metrics.touch,
  },
  stacked: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    flexGrow: 1,
    gap: tokens.space[8].value,
  },
  title: {
    ...typeStyles.label,
    color: tokens.color.textSecondary,
    flexShrink: 1,
    paddingVertical: tokens.space[8].value,
  },
  error: { color: tokens.color.danger },
  action: {
    minHeight: metrics.touch,
    minWidth: metrics.touch,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: metrics.controlRadius,
    paddingHorizontal: tokens.space[8].value,
  },
  pressed: { backgroundColor: tokens.color.brandSurface },
  link: { ...typeStyles.label, color: tokens.color.brandText },
});
