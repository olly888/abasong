import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { metrics, typeStyles } from "../ui/foundation";

const doors = ["行人门", "车库门", "大堂门"] as const;
export const unspecifiedDoor = "门别未注明";

export function DoorScopeField({
  value,
  onChange,
  disabled = false,
  optional = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  const hasLegacyLabel =
    !!value &&
    !doors.some((door) => door === value) &&
    !["大门", unspecifiedDoor, "门别未标注"].includes(value);
  return (
    <View style={styles.field}>
      <Text style={typeStyles.label}>{optional ? "门别（选填）" : "门别"}</Text>
      {hasLegacyLabel ? (
        <Text style={typeStyles.secondary}>原门别 · {value}</Text>
      ) : null}
      <View style={styles.choices}>
        {doors.map((door) => {
          const selected = door === value;
          return (
            <Pressable
              key={door}
              accessibilityRole={optional ? "togglebutton" : "radio"}
              accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => {
                if (!selected) onChange(door);
                else if (optional) onChange("");
              }}
              style={({ pressed }) => [
                styles.choice,
                (pressed || selected) && styles.selected,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  typeStyles.label,
                  styles.choiceLabel,
                  selected && { color: tokens.color.brandText },
                  disabled && { color: tokens.color.disabledText },
                ]}
              >
                {door}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: metrics.fieldGap },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: metrics.fieldGap },
  choice: {
    flexGrow: 1,
    minHeight: metrics.touch,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: metrics.controlRadius,
    backgroundColor: tokens.color.surface,
  },
  choiceLabel: { textAlign: "center" },
  selected: {
    borderColor: tokens.color.brandText,
    backgroundColor: tokens.color.brandSurface,
  },
  disabled: { backgroundColor: tokens.color.disabledSurface },
});
