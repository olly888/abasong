import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { typeStyles } from "../ui/foundation";

// Shared visual grouping for delivery forms, review, details and application.
// No clipping/fixed height: long addresses and larger system text can wrap.
export function DeliverySection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heading: { ...typeStyles.title, fontSize: 18, lineHeight: 26, flexShrink: 1 },
});
