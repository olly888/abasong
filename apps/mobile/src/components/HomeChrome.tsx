import { View, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { useInboxCount } from "../messages/useInboxCount";
import { MapControl, MapModeSwitch, MapSearchButton } from "../ui/MapControls";
import { BrandWordmark } from "../ui/BrandWordmark";

const modes = ["公寓", "找活", "找人"] as const;
export type HomeMode = (typeof modes)[number];

export function HomeChrome({
  mode,
  onMode,
  list = false,
  onToggleList,
  onSearch,
  workspace = false,
}: {
  mode: HomeMode;
  onMode: (m: HomeMode) => void;
  list?: boolean;
  onToggleList?: () => void;
  onSearch?: () => void;
  workspace?: boolean;
}) {
  const unread = useInboxCount();
  const { height } = useWindowDimensions();
  const apartment = mode === "公寓";
  if (workspace)
    return (
      <View style={[styles.toolbar, styles.brandPanel]}>
        {height > 650 ? (
          <View style={styles.brandRow}>
            <BrandWordmark compact />
            <MapControl
              icon="message"
              label="消息"
              unread={unread ?? 0}
              onPress={() => router.push("/inbox")}
            />
          </View>
        ) : null}
        <View style={styles.searchRow}>
          <MapSearchButton
            embedded
            label={
              apartment
                ? "搜索公寓或地址"
                : mode === "找人"
                  ? "搜索区域或配送经验"
                  : "搜索区域或承运商"
            }
            onPress={() =>
              apartment ? router.push("/apartments") : onSearch?.()
            }
          />
          {height <= 650 ? (
            <MapControl
              icon="message"
              label="消息"
              unread={unread ?? 0}
              onPress={() => router.push("/inbox")}
            />
          ) : null}
        </View>
      </View>
    );
  return (
    <View style={styles.toolbar} pointerEvents="box-none">
      <View style={styles.searchRow}>
        <MapSearchButton
          label={apartment ? "搜索公寓或地址" : "搜索区域或承运商"}
          disabled={!apartment && !onSearch}
          onPress={() =>
            apartment ? router.push("/apartments") : onSearch?.()
          }
        />
        <MapControl
          icon="message"
          label="消息"
          onPress={() => router.push("/inbox")}
          unread={unread ?? 0}
        />
      </View>
      <View style={styles.modeRow}>
        <MapModeSwitch items={modes} selected={mode} onSelect={onMode} />
        {!apartment && onToggleList ? (
          <MapControl
            icon={list ? "map" : "list"}
            label={list ? "地图" : "列表"}
            accessibilityLabel={list ? "切换为地图" : "切换为列表"}
            showLabel
            onPress={onToggleList}
          />
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
    <View style={[styles.tools, { bottom }]} pointerEvents="box-none">
      <MapControl
        icon="plus"
        label="发需求"
        showLabel
        primary
        onPress={() => router.push("/requests/new")}
      />
      <MapControl
        icon="locate"
        label="我的位置"
        onPress={onLocate}
        busy={locating}
        disabled={(locating && !canRecenter) || !onLocate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  brandPanel: {
    backgroundColor: tokens.color.surface,
    borderRadius: 20,
    padding: 8,
    gap: 4,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolbar: {
    position: "absolute",
    top: tokens.space[12].value,
    left: tokens.space[16].value,
    right: tokens.space[16].value,
    zIndex: 10,
  },
  searchRow: { flexDirection: "row", gap: tokens.space[8].value },
  modeRow: {
    marginTop: tokens.space[8].value,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space[8].value,
  },
  tools: {
    position: "absolute",
    right: tokens.space[16].value,
    alignItems: "flex-end",
    gap: tokens.space[8].value,
    zIndex: 8,
  },
});
