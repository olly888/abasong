import { StyleSheet, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Field } from "../ui/Controls";
import { metrics } from "../ui/foundation";
import { DoorScopeField } from "./DoorScopeField";

// Keep access codes as text: a number-pad excludes #/* and coercion loses zeros.
export function AccessCodeFields(p: {
  value: string;
  scope: string;
  onValueChange: (value: string) => void;
  onScopeChange: (scope: string) => void;
  disabled?: boolean;
  correction?: boolean;
}) {
  return (
    <View style={s.group}>
      <Field
        label={p.correction ? "正确门禁码" : "门禁码"}
        placeholder="例如 0012#"
        accessibilityHint="保留开头的零及井号、星号"
        value={p.value}
        editable={!p.disabled}
        onChangeText={p.onValueChange}
        maxLength={32}
        keyboardType="default"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={s.code}
      />
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
  code: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minHeight: 60,
  },
});
