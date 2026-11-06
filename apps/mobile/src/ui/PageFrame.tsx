import { useRef, useState, type ReactNode, type ComponentRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { IconButton } from "./Primitives";
import { metrics, typeStyles } from "./foundation";

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack ? (
        <IconButton name="back" label="返回" onPress={onBack} />
      ) : (
        <View style={{ width: metrics.touch }} />
      )}
      <Text
        numberOfLines={2}
        style={[
          typeStyles.header,
          { flex: 1, textAlign: "center", fontWeight: onBack ? "600" : "700" },
        ]}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: metrics.touch }} />}
    </View>
  );
}
export function PageFrame({
  title,
  subtitle,
  children,
  onBack,
  compact = false,
  footer,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  compact?: boolean;
  footer?: ReactNode;
  headerRight?: ReactNode;
}) {
  const frame = useRef<ComponentRef<typeof View>>(null),
    [keyboardOffset, setKeyboardOffset] = useState(0);
  const back =
    onBack ??
    (() => (router.canGoBack() ? router.back() : router.replace("/profile")));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <View
        ref={frame}
        style={{ flex: 1 }}
        onLayout={() => {
          frame.current?.measureInWindow((_x, y) => {
            if (Number.isFinite(y)) setKeyboardOffset(Math.max(0, y));
          });
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
        >
          {compact ? (
            <PageHeader title={title} onBack={back} right={headerRight} />
          ) : null}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: metrics.inset, flexGrow: 1 }}
          >
            {!compact ? (
              <>
                <IconButton name="back" label="返回" onPress={back} />
                <Text style={[typeStyles.hero, { marginTop: 28 }]}>
                  {title}
                </Text>
              </>
            ) : null}
            {subtitle ? (
              <Text
                style={[
                  typeStyles.body,
                  {
                    color: tokens.color.textSecondary,
                    marginTop: compact ? 0 : 12,
                    marginBottom: compact ? 20 : 0,
                  },
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
            <View
              style={{ gap: metrics.sectionGap, marginTop: compact ? 0 : 32 }}
            >
              {children}
            </View>
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  header: {
    minHeight: metrics.header,
    paddingVertical: 4,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: tokens.color.border,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: metrics.inset,
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
    gap: 4,
    backgroundColor: tokens.color.surface,
  },
});
