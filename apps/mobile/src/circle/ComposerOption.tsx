import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/Primitives";
import { typeStyles } from "../ui/foundation";

export function ComposerOption(p: {
  title: string;
  summary?: string;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <View style={s.group}>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.title}
          accessibilityState={{ expanded: p.open, disabled: p.disabled }}
          aria-expanded={p.open}
          disabled={p.disabled}
          onPress={p.onToggle}
          style={s.toggle}
        >
          <Icon
            name={p.open ? "down" : "plus"}
            size={18}
            color={tokens.color.textSecondary}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={[
                typeStyles.body,
                p.disabled && { color: tokens.color.disabledText },
              ]}
            >
              {p.title}
            </Text>
            {p.summary ? (
              <Text style={typeStyles.secondary}>{p.summary}</Text>
            ) : null}
          </View>
        </Pressable>
        {p.summary ? (
          <IconButton
            name="close"
            label={`清除${p.title}`}
            disabled={p.disabled}
            onPress={p.onClear}
          />
        ) : null}
      </View>
      {p.open ? <View style={s.body}>{p.children}</View> : null}
    </View>
  );
}
const s = StyleSheet.create({
  group: { borderTopWidth: 1, borderColor: tokens.color.border },
  row: { flexDirection: "row", alignItems: "center" },
  toggle: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  body: { gap: 8, paddingBottom: 16 },
});
