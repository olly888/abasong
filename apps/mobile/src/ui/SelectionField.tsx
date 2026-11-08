import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaModal } from "./SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { Icon } from "./Icon";
import { ActionButton } from "./Controls";
export function SelectionField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "请选择",
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selected = options.find((x) => x[0] === value);
  function show() {
    if (disabled) return;
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: label,
          options: [
            ...options.map(([id, text]) => (id === value ? "✓ " : "") + text),
            "取消",
          ],
          cancelButtonIndex: options.length,
          userInterfaceStyle: "light",
        },
        (index) => {
          if (mounted.current && index >= 0 && index < options.length)
            onChange(options[index]![0]);
        },
      );
    } else setOpen(true);
  }
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}，${selected?.[1] ?? placeholder}`}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={show}
        style={({ pressed }) => ({
          minHeight: 52,
          borderWidth: 1,
          borderColor: tokens.color.controlBorder,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: disabled
            ? tokens.color.disabledSurface
            : pressed
              ? tokens.color.surfaceMuted
              : tokens.color.surface,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: 24,
            color: disabled
              ? tokens.color.disabledText
              : selected
                ? tokens.color.ink
                : tokens.color.textSecondary,
          }}
        >
          {selected?.[1] ?? placeholder}
        </Text>
        <Icon name="down" size={18} color={tokens.color.textSecondary} />
      </Pressable>
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
              backgroundColor: tokens.color.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "80%",
              padding: 20,
              gap: 16,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: tokens.color.ink,
              }}
            >
              {label}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map(([id, text]) => (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: id === value }}
                  onPress={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    padding: 14,
                    borderBottomWidth: 1,
                    borderColor: tokens.color.border,
                    backgroundColor:
                      pressed || value === id
                        ? tokens.color.brandSurface
                        : tokens.color.surface,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color:
                        id === value
                          ? tokens.color.brandText
                          : tokens.color.ink,
                    }}
                  >
                    {text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ActionButton
              label="取消"
              variant="text"
              onPress={() => setOpen(false)}
            />
          </SafeAreaView>
        </View>
      </SafeAreaModal>
    </View>
  );
}
