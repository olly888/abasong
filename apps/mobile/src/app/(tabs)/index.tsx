import { useState } from "react";
import { router } from "expo-router";
import { View, Text, StyleSheet, Pressable } from "react-native";
import HomeMap from "../../components/HomeMap";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
const modes = ["公寓", "找活", "找人"] as const;
export default function Home() {
  const [mode, setMode] = useState<(typeof modes)[number]>("公寓");
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Text style={styles.brand}>Abasong</Text>
      <View style={styles.switcher}>
        {modes.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === item }}
            onPress={() => setMode(item)}
            style={[styles.mode, mode === item && styles.selected]}
          >
            <Text style={[styles.label, mode === item && styles.active]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.map}>
        <HomeMap />
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>
          {mode === "公寓"
            ? "附近公寓"
            : mode === "找活"
              ? "附近临时支援"
              : "附近可用司机"}
        </Text>
        {mode === "公寓" ? (
          <Pressable
            accessibilityRole="button"
            style={styles.search}
            onPress={() => router.push("/apartments")}
          >
            <Text style={styles.searchLabel}>搜索公寓或地址</Text>
          </Pressable>
        ) : (
          <Text style={styles.secondary}>暂无信息</Text>
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  brand: {
    fontSize: 26,
    fontWeight: "700",
    color: tokens.color.ink,
    margin: 20,
  },
  switcher: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  mode: {
    minHeight: 48,
    paddingHorizontal: 24,
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: tokens.color.surfaceMuted,
  },
  selected: { backgroundColor: tokens.color.ink },
  label: { color: tokens.color.ink, fontWeight: "600" },
  active: { color: tokens.color.surface },
  map: {
    flex: 1,
    backgroundColor: tokens.color.canvas,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: { color: tokens.color.textSecondary },
  card: {
    padding: 24,
    gap: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.surface,
  },
  search: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: tokens.color.brandPrimary,
  },
  searchLabel: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  heading: { fontSize: 20, fontWeight: "600", color: tokens.color.ink },
  secondary: { color: tokens.color.textSecondary },
});
