import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { PageHeader } from "../ui/PageFrame";
import { IconButton } from "../ui/Primitives";
export function ConversationLayout({
  title,
  onBack,
  onReload,
  children,
  headerRight,
}: {
  title: string;
  onBack: () => void;
  onReload: () => void;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <PageHeader
          title={title}
          onBack={onBack}
          right={
            headerRight ?? (
              <IconButton name="refresh" label="刷新会话" onPress={onReload} />
            )
          }
        />
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
