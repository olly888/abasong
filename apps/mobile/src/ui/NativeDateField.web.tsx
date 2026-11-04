import { View, Text } from "react-native";
import { tokens } from "@abasong/ui";
import type { DateFieldProps } from "./NativeDateField";
export function NativeDateField({
  label,
  mode,
  value,
  disabled = false,
  onChange,
}: DateFieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}
      >
        {label}
      </Text>
      <input
        aria-label={label}
        type={mode}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={{
          boxSizing: "border-box",
          width: "100%",
          minHeight: 52,
          border: `1px solid ${tokens.color.controlBorder}`,
          borderRadius: 10,
          padding: "12px 14px",
          font: "inherit",
          fontSize: 16,
          color: tokens.color.ink,
          background: tokens.color.surface,
        }}
      />
    </View>
  );
}
