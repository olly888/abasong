import { useContext, type ReactNode } from "react";
import { HomeCoreMeasurement } from "./HomeCoreMeasurement";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { tokens } from "@abasong/ui";
import { homeResultLayout as layout } from "./home-result-layout";
// Shared surface only; apartment/request/driver contents keep their own meaning.
export function MapCardFrame({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.frame, style]} />;
}
// Standard rows have equal slots. Larger text/long codes grow, never clip.
export function HomeResultCard({
  selected,
  title,
  core,
  footer,
  action,
  label,
  onOpen,
  compactTitle = false,
}: {
  selected: boolean;
  title: ReactNode;
  core: ReactNode;
  footer: ReactNode;
  action?: { label: string; onPress: () => void };
  label: string;
  onOpen: () => void;
  compactTitle?: boolean;
}) {
  const reportCore = useContext(HomeCoreMeasurement);
  return (
    <View
      style={[
        styles.result,
        compactTitle && styles.compactResult,
        selected && styles.selected,
      ]}
      testID="home-result-card"
    >
      <Pressable
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          pressed && {
            borderRadius: 16,
            backgroundColor: tokens.color.surfaceMuted,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="查看详情"
        accessibilityState={{ selected }}
        onPress={onOpen}
      />
      <View
        style={[styles.title, compactTitle && styles.compactTitle]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {title}
      </View>
      <View
        style={styles.core}
        pointerEvents="box-none"
        onLayout={(event) => reportCore?.(event.nativeEvent.layout)}
      >
        <View
          style={styles.coreContent}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {core}
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.action,
              pressed && { backgroundColor: tokens.color.brandSurface },
            ]}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={styles.footer}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {footer}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  title: { minHeight: layout.title, justifyContent: "center" },
  compactTitle: { minHeight: layout.compactTitle },
  core: {
    minHeight: layout.core,
    borderRadius: 10,
    backgroundColor: tokens.color.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  coreContent: { flex: 1, minWidth: 0, paddingVertical: 2 },
  footer: {
    minHeight: layout.footer,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  action: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    color: tokens.color.brandText,
  },
  result: {
    paddingHorizontal: layout.inset,
    paddingVertical: layout.blockInset,
    gap: layout.slotGap,
    minHeight: layout.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  compactResult: {
    paddingVertical: layout.compactBlockInset,
    gap: layout.compactSlotGap,
  },
  selected: {
    borderColor: tokens.color.brandPrimary,
    backgroundColor: tokens.color.brandSurface,
  },
  frame: {
    borderRadius: 24,
    backgroundColor: tokens.color.surface,
    shadowColor: "#1B2D44",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
