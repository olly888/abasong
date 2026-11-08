import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon } from "./Icon";
import { metrics, typeStyles } from "./foundation";

export function CheckField(p: {
  label: string;
  accessibilityLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={p.accessibilityLabel ?? p.label}
      accessibilityState={{ checked: p.checked, disabled: !!p.disabled }}
      aria-checked={p.checked}
      aria-disabled={!!p.disabled}
      disabled={p.disabled}
      onPress={() => p.onChange(!p.checked)}
      style={({ pressed }) => [s.row, pressed && !p.disabled && s.pressed]}
    >
      <View style={[s.box, p.checked && s.selected, p.disabled && s.disabled]}>
        {p.checked ? (
          <Icon
            name="check"
            size={16}
            color={
              p.disabled ? tokens.color.disabledText : tokens.color.onBrand
            }
          />
        ) : null}
      </View>
      <Text
        style={[
          typeStyles.secondary,
          s.label,
          p.disabled && { color: tokens.color.disabledText },
        ]}
      >
        {p.label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: metrics.touch,
    paddingVertical: 8,
    borderRadius: metrics.controlRadius,
    flexShrink: 1,
  },
  pressed: { backgroundColor: tokens.color.surfaceMuted },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: tokens.color.controlBorder,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    backgroundColor: tokens.color.brandPrimary,
    borderColor: tokens.color.brandPrimary,
  },
  disabled: {
    backgroundColor: tokens.color.disabledSurface,
    borderColor: tokens.color.border,
  },
  label: { color: tokens.color.ink, flexShrink: 1 },
});
