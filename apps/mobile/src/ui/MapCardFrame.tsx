import { StyleSheet, View, type ViewProps } from "react-native";
import { tokens } from "@abasong/ui";
// Shared surface only; apartment/request/driver contents keep their own meaning.
export function MapCardFrame({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.frame, style]} />;
}
const styles = StyleSheet.create({
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
