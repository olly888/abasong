import { SafeAreaModal } from "./SafeAreaModal";
import type { ComponentRef, ReactNode, Ref } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { metrics } from "./foundation";

export function BottomSheet({
  children,
  onRequestClose,
  footer,
  scrollRef,
}: {
  children: ReactNode;
  onRequestClose: () => void;
  footer?: ReactNode;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  return (
    <SafeAreaModal
      transparent
      animationType="slide"
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: tokens.color.overlay,
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          accessibilityViewIsModal
          style={{
            maxHeight: "95%",
            backgroundColor: tokens.color.surface,
            borderTopLeftRadius: metrics.sheetRadius,
            borderTopRightRadius: metrics.sheetRadius,
          }}
        >
          <ScrollView
            ref={scrollRef}
            style={footer ? { flexShrink: 1 } : undefined}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: metrics.inset, gap: 16 }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexShrink: 0,
                paddingHorizontal: metrics.inset,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: tokens.color.border,
              }}
            >
              {footer}
            </View>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaModal>
  );
}
