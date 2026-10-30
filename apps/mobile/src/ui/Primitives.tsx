import { Pressable, Text, View, StyleSheet, TextInput } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon, type IconName } from "./Icon";
export function ListRow({
  title,
  subtitle,
  onPress,
  icon = "pin",
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: tokens.color.surfaceMuted },
      ]}
    >
      <View style={styles.symbol}>
        <Icon name={icon} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron" color={tokens.color.textMuted} size={20} />
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  name: IconName;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: tokens.color.surfaceMuted },
      ]}
    >
      <Icon
        name={name}
        color={selected ? tokens.color.brandPrimary : tokens.color.ink}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: tokens.color.border,
  },
  symbol: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: tokens.color.ink,
    lineHeight: 23,
  },
  subtitle: { fontSize: 14, lineHeight: 21, color: tokens.color.textSecondary },
  iconButton: {
    width: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
});

export function SearchBox({
  value,
  onChange,
  onSearch,
  busy = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  busy?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 52,
        borderRadius: 12,
        backgroundColor: tokens.color.canvas,
        borderWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="搜索"
        disabled={busy || value.trim().length < 2}
        onPress={onSearch}
        style={{
          width: 48,
          height: 52,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="search" color={tokens.color.textSecondary} size={21} />
      </Pressable>
      <TextInput
        accessibilityLabel="搜索公寓或地址"
        placeholder="搜索公寓或地址"
        placeholderTextColor={tokens.color.textMuted}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSearch}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          flex: 1,
          minHeight: 52,
          fontSize: 16,
          color: tokens.color.ink,
          paddingVertical: 10,
        }}
      />
      {value ? (
        <IconButton
          name="close"
          label="清空搜索"
          onPress={() => onChange("")}
        />
      ) : (
        <View style={{ width: 16 }} />
      )}
    </View>
  );
}
