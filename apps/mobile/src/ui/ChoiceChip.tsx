import { Pressable, StyleSheet, Text } from "react-native";
import { tokens } from "@abasong/ui";
import { metrics, typeStyles } from "./foundation";

export function ChoiceChip(p: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={p.label}
      accessibilityState={{ checked: p.selected, disabled: !!p.disabled }}
      aria-checked={p.selected}
      aria-disabled={!!p.disabled}
      disabled={p.disabled}
      onPress={p.onPress}
      style={({ pressed }) => [
        s.chip,
        p.selected && s.selected,
        pressed && !p.disabled && s.pressed,
        p.disabled && s.disabled,
      ]}
    >
      <Text
        style={[
          typeStyles.secondary,
          s.label,
          p.selected && s.activeText,
          p.disabled && { color: tokens.color.disabledText },
        ]}
      >
        {p.label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  chip: {
    minHeight: metrics.touch,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: metrics.controlRadius,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    backgroundColor: tokens.color.surface,
    justifyContent: "center",
    maxWidth: "100%",
  },
  label: { color: tokens.color.ink, fontWeight: "500", flexShrink: 1 },
  selected: {
    borderColor: tokens.color.brandPrimary,
    backgroundColor: tokens.color.brandSurface,
  },
  activeText: { color: tokens.color.brandText },
  pressed: { backgroundColor: tokens.color.surfaceMuted },
  disabled: { backgroundColor: tokens.color.disabledSurface },
});
