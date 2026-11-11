import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { tokens } from "@abasong/ui";
import { metrics, typeStyles } from "./foundation";

export function ActionButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  variant,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  variant?: "primary" | "secondary" | "text" | "danger";
}) {
  const kind = variant ?? (secondary ? "secondary" : "primary");
  const color = disabled
    ? tokens.color.disabledText
    : kind === "primary" || kind === "danger"
      ? tokens.color.onBrand
      : kind === "text"
        ? tokens.color.brandText
        : tokens.color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        kind === "secondary" && s.secondary,
        kind === "text" && s.textButton,
        kind === "danger" && { backgroundColor: tokens.color.danger },
        pressed &&
          !disabled &&
          !busy && {
            backgroundColor:
              kind === "primary"
                ? tokens.color.brandPressed
                : kind === "danger"
                  ? tokens.color.dangerPressed
                  : tokens.color.surfaceMuted,
          },
        disabled && {
          backgroundColor:
            kind === "text" ? "transparent" : tokens.color.disabledSurface,
          borderColor: tokens.color.border,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={color} /> : null}
      <Text
        style={[
          typeStyles.body,
          { color, fontWeight: "600", textAlign: "center", flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  const disabled = props.editable === false;
  return (
    <View style={{ gap: metrics.fieldGap }}>
      <Text style={typeStyles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error ?? props.accessibilityHint}
        placeholderTextColor={tokens.color.textMuted}
        underlineColorAndroid="transparent"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          s.input,
          props.multiline && { minHeight: 104, textAlignVertical: "top" },
          disabled && {
            backgroundColor: tokens.color.disabledSurface,
            color: tokens.color.disabledText,
          },
          props.style,
          focused && {
            borderColor: tokens.color.focus,
            borderWidth: 2,
            paddingHorizontal: 13,
          },
          error && { borderColor: tokens.color.danger },
        ]}
      />
      <FormError message={error ?? null} />
    </View>
  );
}
export function FormError({ message }: { message: string | null }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      style={[typeStyles.secondary, { color: tokens.color.danger }]}
    >
      {message}
    </Text>
  ) : null;
}
const s = StyleSheet.create({
  button: {
    minHeight: metrics.button,
    borderRadius: metrics.controlRadius,
    backgroundColor: tokens.color.brandPrimary,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondary: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
  },
  textButton: { backgroundColor: "transparent", borderWidth: 0 },
  input: {
    ...typeStyles.body,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: metrics.controlRadius,
    minHeight: metrics.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tokens.color.surface,
  },
});
