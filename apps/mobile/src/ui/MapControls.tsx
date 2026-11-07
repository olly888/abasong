import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { tokens } from "@abasong/ui";
import { Icon, type IconName } from "./Icon";
import { metrics, typeStyles } from "./foundation";

export function MapSearchButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.surface,
        s.control,
        s.search,
        pressed && s.surfacePressed,
        disabled && s.disabled,
      ]}
    >
      <Icon
        name="search"
        size={tokens.size.iconSmall.value}
        color={tokens.color.textSecondary}
      />
      <Text numberOfLines={1} style={s.searchText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MapControl({
  icon,
  label,
  accessibilityLabel = label,
  onPress,
  showLabel = false,
  primary = false,
  busy = false,
  disabled = false,
  unread = 0,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  showLabel?: boolean;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  unread?: number;
}) {
  const color = disabled
    ? tokens.color.disabledText
    : primary
      ? tokens.color.onBrand
      : tokens.color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? `${accessibilityLabel}，${unread}条未读`
          : accessibilityLabel
      }
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.surface,
        s.control,
        showLabel ? s.withLabel : s.iconOnly,
        primary && s.primary,
        pressed && (primary ? s.primaryPressed : s.surfacePressed),
        disabled && s.disabled,
      ]}
    >
      {busy && disabled ? (
        <ActivityIndicator color={tokens.color.brandText} />
      ) : (
        <Icon
          name={icon}
          size={
            showLabel ? tokens.size.iconSmall.value : tokens.size.icon.value
          }
          color={color}
        />
      )}
      {showLabel ? (
        <Text style={[typeStyles.label, { color }]}>{label}</Text>
      ) : null}
      {unread > 0 ? (
        <View
          style={s.badge}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={s.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function MapModeSwitch<T extends string>({
  items,
  selected,
  onSelect,
}: {
  items: readonly T[];
  selected: T;
  onSelect: (item: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={[s.surface, s.segments]}>
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === item }}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [
            s.segment,
            pressed && s.surfacePressed,
            selected === item && s.selected,
          ]}
        >
          <Text
            style={[
              typeStyles.label,
              s.segmentText,
              selected === item && s.selectedText,
            ]}
          >
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  surface: {
    borderRadius: metrics.cardRadius,
    backgroundColor: tokens.color.surface,
    shadowColor: tokens.color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  control: {
    minHeight: metrics.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space[8].value,
  },
  search: {
    flex: 1,
    minHeight: metrics.button,
    justifyContent: "flex-start",
    paddingHorizontal: tokens.space[16].value,
  },
  searchText: {
    ...typeStyles.body,
    color: tokens.color.textSecondary,
    flexShrink: 1,
  },
  iconOnly: { width: metrics.button, minHeight: metrics.button },
  withLabel: {
    paddingHorizontal: tokens.space[12].value,
    paddingVertical: tokens.space[8].value,
  },
  primary: { backgroundColor: tokens.color.brandPrimary },
  primaryPressed: { backgroundColor: tokens.color.brandPressed },
  surfacePressed: { backgroundColor: tokens.color.surfaceMuted },
  disabled: { backgroundColor: tokens.color.disabledSurface },
  segments: {
    flexDirection: "row",
    flexShrink: 1,
    paddingHorizontal: tokens.space[4].value,
    gap: tokens.space[2].value,
  },
  segment: {
    minHeight: metrics.touch,
    minWidth: metrics.touch,
    flexShrink: 1,
    paddingHorizontal: tokens.space[12].value,
    paddingVertical: tokens.space[4].value,
    borderRadius: metrics.controlRadius,
    justifyContent: "center",
    alignItems: "center",
  },
  segmentText: { color: tokens.color.textSecondary, textAlign: "center" },
  selected: { backgroundColor: tokens.color.brandSurface },
  selectedText: { color: tokens.color.brandText },
  badge: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 19,
    paddingHorizontal: 4,
    borderRadius: tokens.radius.pill.value,
    backgroundColor: tokens.color.brandPrimary,
    alignItems: "center",
  },
  badgeText: {
    fontSize: tokens.fontSize.metadata.value,
    fontWeight: "600",
    color: tokens.color.onBrand,
  },
});
