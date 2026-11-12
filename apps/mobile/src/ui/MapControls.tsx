import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { tokens } from "@abasong/ui";
import { Icon, type IconName } from "./Icon";
import { metrics, typeStyles } from "./foundation";
import { UnreadBadge } from "./UnreadBadge";

export function MapSearchButton({
  label,
  onPress,
  disabled = false,
  embedded = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  embedded?: boolean;
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
        embedded && {
          backgroundColor: tokens.color.surfaceMuted,
          elevation: 0,
          shadowOpacity: 0,
          minHeight: 48,
        },
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
  round = false,
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
  round?: boolean;
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
        round && { borderRadius: tokens.radius.pill.value },
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
      <UnreadBadge
        count={unread}
        style={{ position: "absolute", top: 2, right: 2 }}
      />
    </Pressable>
  );
}

export function MapModeSwitch<T extends string>({
  items,
  selected,
  onSelect,
  fullWidth = false,
  icons,
  badges,
}: {
  items: readonly T[];
  selected: T;
  onSelect: (item: T) => void;
  fullWidth?: boolean;
  icons?: Partial<Record<T, IconName>>;
  badges?: Partial<Record<T, number>>;
}) {
  const { fontScale } = useWindowDimensions();
  const showIcons = !fullWidth || fontScale <= 1.6;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        s.surface,
        s.segments,
        fullWidth && {
          backgroundColor: tokens.color.surfaceMuted,
          elevation: 0,
          shadowOpacity: 0,
          padding: 4,
        },
      ]}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          aria-selected={selected === item}
          accessibilityLabel={
            badges?.[item] ? `${item}，${badges[item]}条未读` : item
          }
          accessibilityState={{ selected: selected === item }}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [
            s.segment,
            fullWidth && { flex: 1 },
            (icons || badges) && {
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 6,
            },
            pressed && s.surfacePressed,
            selected === item && s.selected,
            fullWidth &&
              selected === item && { backgroundColor: tokens.color.surface },
          ]}
        >
          {showIcons && icons?.[item] ? (
            <Icon
              name={icons[item]!}
              size={19}
              color={
                selected === item
                  ? tokens.color.brandText
                  : tokens.color.textSecondary
              }
            />
          ) : null}
          <Text
            style={[
              typeStyles.label,
              s.segmentText,
              selected === item && s.selectedText,
            ]}
          >
            {item}
          </Text>
          {badges ? <UnreadBadge count={badges[item] ?? 0} /> : null}
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
});
