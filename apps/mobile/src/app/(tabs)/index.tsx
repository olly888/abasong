import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import HomeMap from "../../components/HomeMap";
import {
  HomeChrome,
  MapTools,
  type HomeMode,
} from "../../components/HomeChrome";
import { HomeApartments } from "../../apartments/HomeApartments";
export default function Home() {
  const [mode, setMode] = useState<HomeMode>("公寓");
  const toolbar = <HomeChrome mode={mode} onMode={setMode} />;
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {mode === "公寓" ? (
        <HomeApartments toolbar={toolbar} />
      ) : (
        <View style={styles.map}>
          <HomeMap />
          {toolbar}
          <MapTools bottom={178} />
          <View style={styles.panel}>
            <View style={styles.handle} />
            <Text style={styles.title}>
              {mode === "找活" ? "附近临时支援" : "附近可用司机"}
            </Text>
            <Text style={styles.secondary}>暂无信息</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  map: { flex: 1 },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 22,
    paddingBottom: 28,
    gap: 12,
  },
  handle: {
    width: 35,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#D9DDE2",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "600", color: tokens.color.ink },
  secondary: { fontSize: 14, color: tokens.color.textMuted, paddingBottom: 8 },
});
