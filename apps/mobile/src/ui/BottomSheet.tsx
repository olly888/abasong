import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaModal } from "./SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { metrics } from "./foundation";

export function BottomSheet({
  children,
  onRequestClose,
}: {
  children: ReactNode;
  onRequestClose: () => void;
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: metrics.inset, gap: 16 }}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaModal>
  );
}
