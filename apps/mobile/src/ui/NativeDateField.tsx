import { useState } from "react";
import { Keyboard, Modal, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { Icon } from "./Icon";
import { ActionButton } from "../auth/AuthControls";
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
  onChange: (value: string) => void;
};
export function NativeDateField({
  label,
  mode,
  value,
  date = "",
  disabled = false,
  optional = false,
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
            <Text style={{ fontSize: 14, color: tokens.color.brandPrimary }}>
              清除
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}，${value ? pickerLabel(mode, value, date) : optional ? "选填" : "请选择"}`}
        accessibilityState={{ disabled }}
        onPress={choose}
        style={({ pressed }) => ({
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: tokens.color.controlBorder,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: pressed
            ? tokens.color.surfaceMuted
            : tokens.color.surface,
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: 24,
            color: value ? tokens.color.ink : tokens.color.textSecondary,
          }}
        >
          {value
            ? pickerLabel(mode, value, date)
            : optional
              ? "选填"
              : "请选择"}
        </Text>
        <Icon name="down" size={18} color={tokens.color.textSecondary} />
      </Pressable>
      {Platform.OS === "ios" ? (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: "rgba(0,0,0,.3)",
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
        </Modal>
      ) : null}
    </View>
  );
}
