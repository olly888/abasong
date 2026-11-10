import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
import { metrics, typeStyles } from "../ui/foundation";
import { DoorScopeField } from "./DoorScopeField";
import { AccessCodeKeypad } from "./AccessCodeKeypad";
import { spokenCodeCharacter } from "./access-code-edit";

export function AccessCodeFields(p: {
  value: string;
  scope: string;
  address?: string;
  onValueChange: (value: string) => void;
  onScopeChange: (scope: string) => void;
  disabled?: boolean;
  correction?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const label = p.correction ? "正确门禁码" : "门禁码";
  return (
    <View style={s.group}>
      <View style={s.field}>
        <Text style={typeStyles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.value ? "修改" + label : "输入" + label}
          accessibilityValue={
            p.value
              ? { text: Array.from(p.value, spokenCodeCharacter).join("，") }
              : undefined
          }
          accessibilityHint="打开门禁键盘"
          accessibilityState={{ disabled: !!p.disabled }}
          disabled={p.disabled}
          onPress={() => {
            Keyboard.dismiss();
            setEditing(true);
          }}
          style={({ pressed }) => [
            s.trigger,
            pressed && s.pressed,
            p.disabled && s.disabled,
          ]}
        >
          <Text style={p.value ? s.code : s.placeholder}>
            {p.value || "输入门禁码"}
          </Text>
          <Icon name="edit" color={tokens.color.textSecondary} />
        </Pressable>
      </View>
      {editing && !p.disabled ? (
        <AccessCodeKeypad
          value={p.value}
          label={label}
          address={p.address}
          onDone={(value) => {
            setEditing(false);
            if (value !== p.value) p.onValueChange(value);
          }}
        />
      ) : null}
      <DoorScopeField
        value={p.scope}
        disabled={p.disabled}
        onChange={p.onScopeChange}
      />
    </View>
  );
}
const s = StyleSheet.create({
  group: {
    gap: metrics.sectionGap,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
  },
  field: { gap: metrics.fieldGap },
  trigger: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: metrics.controlRadius,
    backgroundColor: tokens.color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: metrics.fieldGap,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: tokens.color.surfaceMuted },
  disabled: { backgroundColor: tokens.color.disabledSurface },
  placeholder: { ...typeStyles.body, color: tokens.color.textMuted, flex: 1 },
  code: {
    ...typeStyles.body,
    flex: 1,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
