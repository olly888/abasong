import type { ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
export function ConversationLayout({
  title,
  onBack,
  onReload,
  children,
}: {
  title: string;
  onBack: () => void;
  onReload: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            height: 64,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={onBack}
            style={{ width: 48, height: 48, justifyContent: "center" }}
          >
            <Icon name="back" />
          </Pressable>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 19,
              fontWeight: "600",
              color: tokens.color.ink,
            }}
          >
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新会话"
            onPress={onReload}
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="refresh" />
          </Pressable>
        </View>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
