import { SafeAreaModal } from "./SafeAreaModal";
import type { ComponentRef, ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
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
  const { fontScale } = useWindowDimensions();
  const flowingActions = fontScale >= 1.6;
  const actions = footer ? (
    <View
      style={{
        flexShrink: 0,
        paddingHorizontal: flowingActions ? 0 : metrics.inset,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      {footer}
    </View>
  ) : null;
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
            {flowingActions ? actions : null}
          </ScrollView>
          {!flowingActions ? actions : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaModal>
  );
}
