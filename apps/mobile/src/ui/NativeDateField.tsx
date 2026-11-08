import { SafeAreaModal } from "./SafeAreaModal";
import { useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { Icon } from "./Icon";
import { ActionButton } from "./Controls";
import {
  pickerDate,
  pickedValue,
  pickerLabel,
  type PickerMode,
} from "./date-picker-value";
export type DateFieldProps = {
  label: string;
  mode: PickerMode;
  value: string;
  date?: string;
  disabled?: boolean;
  optional?: boolean;
  compactDate?: boolean;
  inlineLabel?: string;
  inlineSelected?: boolean;
  onChange: (value: string) => void;
};
export function NativeDateField({
  label,
  mode,
  value,
  date = "",
  disabled = false,
  optional = false,
  compactDate = false,
  inlineLabel,
  inlineSelected = false,
  onChange,
}: DateFieldProps) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(() => pickerDate(mode, value, date));
  function choose() {
    if (disabled) return;
    Keyboard.dismiss();
    const current = pickerDate(mode, value, date);
    if (Platform.OS === "android")
      DateTimePickerAndroid.open({
        mode,
        value: current,
        timeZoneName: "America/Los_Angeles",
        is24Hour: false,
        onValueChange: (_e, d) => onChange(pickedValue(mode, d)),
      });
    else {
      setDraft(current);
      setOpen(true);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      {!inlineLabel ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}
          >
            {label}
          </Text>
          {optional && value ? (
            <Pressable
              onPress={() => onChange("")}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`清除${label}`}
              hitSlop={12}
            >
              <Text style={{ fontSize: 14, color: tokens.color.brandText }}>
                清除
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}，${value ? pickerLabel(mode, value, date) : optional ? "选填" : "请选择"}`}
        accessibilityState={{
          disabled,
          ...(inlineLabel ? { selected: inlineSelected } : {}),
        }}
        onPress={choose}
        style={({ pressed }) => ({
          minHeight: inlineLabel ? 48 : 52,
          paddingHorizontal: inlineLabel ? 12 : 14,
          paddingVertical: inlineLabel ? 8 : 12,
          borderWidth: 1,
          borderColor: inlineSelected
            ? tokens.color.brandPrimary
            : tokens.color.controlBorder,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: disabled
            ? tokens.color.disabledSurface
            : inlineSelected
              ? tokens.color.brandSurface
              : pressed
                ? tokens.color.surfaceMuted
                : tokens.color.surface,
        })}
      >
        <Text
          style={{
            flex: inlineLabel ? undefined : 1,
            fontSize: inlineLabel ? 14 : 16,
            lineHeight: 24,
            color: disabled
              ? tokens.color.disabledText
              : inlineSelected
                ? tokens.color.brandText
                : value
                  ? tokens.color.ink
                  : tokens.color.textSecondary,
          }}
        >
          {inlineLabel ??
            (value
              ? pickerLabel(mode, value, date, compactDate)
              : optional
                ? "选填"
                : "请选择")}
        </Text>
        <Icon name="down" size={18} color={tokens.color.textSecondary} />
      </Pressable>
      {Platform.OS === "ios" ? (
        <SafeAreaModal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: tokens.color.overlay,
            }}
          >
            <SafeAreaView
              edges={["bottom"]}
              style={{
                padding: 20,
                backgroundColor: tokens.color.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                gap: 12,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <ActionButton
                    label="取消"
                    variant="text"
                    onPress={() => setOpen(false)}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "600",
                    color: tokens.color.ink,
                  }}
                >
                  {label}
                </Text>
                <View style={{ flex: 1 }}>
                  <ActionButton
                    label="完成"
                    variant="text"
                    onPress={() => {
                      onChange(pickedValue(mode, draft));
                      setOpen(false);
                    }}
                  />
                </View>
              </View>
              {open ? (
                <DateTimePicker
                  value={draft}
                  mode={mode}
                  display="spinner"
                  locale="en-US"
                  timeZoneName="America/Los_Angeles"
                  themeVariant="light"
                  onValueChange={(_event, d) => setDraft(d)}
                  style={{ height: 216 }}
                />
              ) : null}
            </SafeAreaView>
          </View>
        </SafeAreaModal>
      ) : null}
    </View>
  );
}
