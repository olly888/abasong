import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
export type HomeMode = "公寓" | "找活" | "找人";
export function HomeChrome({
  mode,
  onMode,
  list = false,
  onToggleList,
}: {
  mode: HomeMode;
  onMode: (m: HomeMode) => void;
  list?: boolean;
  onToggleList?: () => void;
}) {
  return (
    <View style={styles.toolbar} pointerEvents="box-none">
      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            mode === "公寓" ? "搜索公寓或地址" : "搜索区域或承运商"
          }
          accessibilityState={{ disabled: mode !== "公寓" }}
          disabled={mode !== "公寓"}
          onPress={() => router.push("/apartments")}
          style={styles.search}
        >
          <Icon name="search" size={21} color={tokens.color.textSecondary} />
          <Text style={styles.searchText}>
            {mode === "公寓" ? "搜索公寓或地址" : "搜索区域或承运商"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="消息"
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.message, styles.unavailable]}
        >
          <Icon name="message" />
        </Pressable>
      </View>
      <View style={styles.modeRow}>
        <View style={styles.tabs}>
          {(["公寓", "找活", "找人"] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => onMode(m)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.tab, mode === m && styles.selected]}
            >
              <Text style={[styles.label, mode === m && styles.active]}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode !== "公寓" && onToggleList ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={list ? "切换为地图" : "切换为列表"}
            onPress={onToggleList}
            style={styles.viewToggle}
          >
            <Icon name={list ? "map" : "list"} size={20} />
            <Text style={styles.toggleLabel}>{list ? "地图" : "列表"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
export function MapTools({
  bottom,
  locating = false,
  onLocate,
  canRecenter = false,
}: {
  bottom: number;
  locating?: boolean;
  onLocate?: () => void;
  canRecenter?: boolean;
}) {
  return (
    <View style={[styles.tools, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="发需求"
        accessibilityState={{ disabled: true }}
        disabled
        style={[styles.help, styles.unavailable]}
      >
        <Icon name="plus" color={tokens.color.onBrand} size={20} />
        <Text style={styles.helpText}>发需求</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="我的位置"
        accessibilityState={{
          disabled: (locating && !canRecenter) || !onLocate,
          busy: locating,
        }}
        disabled={(locating && !canRecenter) || !onLocate}
        onPress={onLocate}
        style={styles.location}
      >
        {locating && !canRecenter ? (
          <ActivityIndicator color={tokens.color.brandPrimary} />
        ) : (
          <Icon
            name="locate"
            color={locating ? tokens.color.textMuted : tokens.color.ink}
          />
        )}
      </Pressable>
    </View>
  );
}
const shadow = {
  shadowColor: "#172B4B",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};
const styles = StyleSheet.create({
  toolbar: { position: "absolute", top: 12, left: 16, right: 16, zIndex: 10 },
  searchRow: { flexDirection: "row", gap: 8 },
  search: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: tokens.color.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
    ...shadow,
  },
  searchText: {
    fontSize: 15,
    color: tokens.color.textSecondary,
    flexShrink: 1,
  },
  message: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
    ...shadow,
  },
  modeRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  viewToggle: {
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: tokens.color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    ...shadow,
  },
  toggleLabel: { fontSize: 14, color: tokens.color.ink },
  tabs: {
    alignSelf: "flex-start",
    flexDirection: "row",
    padding: 4,
    gap: 2,
    borderRadius: 13,
    backgroundColor: tokens.color.surface,
    ...shadow,
  },
  tab: {
    minHeight: 40,
    paddingHorizontal: 15,
    borderRadius: 9,
    justifyContent: "center",
  },
  unavailable: { opacity: 0.42 },
  label: { fontSize: 15, color: tokens.color.textSecondary },
  selected: { backgroundColor: tokens.color.brandSurface },
  active: { color: tokens.color.brandPrimary, fontWeight: "600" },
  tools: {
    position: "absolute",
    right: 16,
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
    zIndex: 8,
  },
  location: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: tokens.color.surface,
    ...shadow,
  },
  help: {
    height: 48,
    paddingHorizontal: 17,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.color.brandPrimary,
    ...shadow,
  },
  helpText: { fontSize: 15, fontWeight: "600", color: tokens.color.onBrand },
});
