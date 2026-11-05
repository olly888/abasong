import { StyleSheet } from "react-native";
import { tokens } from "@abasong/ui";

// Numeric native values use logical points/dp. The canonical source also emits
// CSS for the prototype; no second hand-maintained palette or spacing table.
export const metrics = {
  inset: tokens.layout.pageInset.value,
  header: tokens.layout.header.value,
  sectionGap: tokens.layout.sectionGap.value,
  fieldGap: tokens.layout.fieldGap.value,
  touch: tokens.size.touchMin.value,
  button: tokens.size.button.value,
  controlRadius: tokens.radius.control.value,
  cardRadius: tokens.radius.card.value,
  sheetRadius: tokens.radius.sheet.value,
} as const;
export const typeStyles = StyleSheet.create({
  header: {
    fontSize: tokens.fontSize.pageHeader.value,
    lineHeight: 26,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  hero: {
    fontSize: tokens.fontSize.hero.value,
    lineHeight: tokens.lineHeight.hero.value,
    fontWeight: "700",
    color: tokens.color.ink,
  },
  title: {
    fontSize: tokens.fontSize.title.value,
    lineHeight: tokens.lineHeight.title.value,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  body: {
    fontSize: tokens.fontSize.body.value,
    lineHeight: tokens.lineHeight.body.value,
    color: tokens.color.ink,
  },
  secondary: {
    fontSize: tokens.fontSize.caption.value,
    lineHeight: tokens.lineHeight.caption.value,
    color: tokens.color.textSecondary,
  },
  label: {
    fontSize: tokens.fontSize.label.value,
    lineHeight: tokens.lineHeight.caption.value,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  metadata: {
    fontSize: tokens.fontSize.metadata.value,
    lineHeight: tokens.lineHeight.metadata.value,
    color: tokens.color.textSecondary,
  },
});
