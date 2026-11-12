import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { MapControl } from "../ui/MapControls";
import { homeMapHeight, homeResultLayout } from "../ui/home-result-layout";

export type WorkspaceControls = {
  modes: ReactNode;
  onFilter: () => void;
  measurements?: { key?: string; height?: number; chrome?: number };
};

/** The map has its own native viewport. The list never overlays its controls. */
export function HomeWorkspace(p: {
  header: ReactNode;
  controls: WorkspaceControls;
  map: ReactNode;
  children: ReactNode;
  title: string;
  statusNote?: string;
  count?: number;
  apartment?: boolean;
  onContribute?: () => void;
  onLocate?: () => void;
  locating?: boolean;
  canRecenter?: boolean;
  statusOnly?: boolean;
}) {
  const dimensions = useWindowDimensions();
  const { fontScale } = dimensions;
  const key = `${dimensions.width}:${dimensions.height}:${fontScale}`;
  const measurements = p.controls.measurements;
  const cached = measurements?.key === key ? measurements : undefined;
  const [height, setHeight] = useState(cached?.height ?? 0);
  const [chrome, setChrome] = useState<number>(
    cached?.chrome ?? homeResultLayout.chrome,
  );
  const mapHeight = homeMapHeight(height, chrome, fontScale);
  return (
    <View
      style={s.root}
      onLayout={(e) => {
        const value = e.nativeEvent.layout.height;
        setHeight(value);
        if (measurements) Object.assign(measurements, { key, height: value });
      }}
    >
      <View
        testID="home-map-viewport"
        style={[
          s.map,
          p.statusOnly
            ? s.expandedMap
            : height
              ? { height: mapHeight }
              : { height: "42%" },
        ]}
      >
        {p.map}
        {p.header}
        <View style={s.locate}>
          <MapControl
            round
            icon="locate"
            label="我的位置"
            onPress={p.onLocate}
            busy={p.locating}
            disabled={!p.onLocate || (!!p.locating && !p.canRecenter)}
          />
        </View>
      </View>
      {p.statusOnly ? (
        <ScrollView
          testID="home-status-panel"
          style={[s.panelSurface, s.compactPanel]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.modes}>{p.controls.modes}</View>
          <View style={s.statusBody}>{p.children}</View>
        </ScrollView>
      ) : (
        <View style={[s.panelSurface, s.panel]}>
          <View
            onLayout={(e) => {
              const value = e.nativeEvent.layout.height;
              setChrome(value);
              if (measurements)
                Object.assign(measurements, { key, chrome: value });
            }}
          >
            <View style={s.modes}>{p.controls.modes}</View>
            <View style={[s.heading, fontScale > 1.3 && s.headingLarge]}>
              <Text style={s.title}>
                {p.title}
                {p.count !== undefined ? ` · ${p.count}` : ""}
              </Text>
              {p.apartment ? (
                <WorkspaceAction
                  label="共享门禁码"
                  onPress={() => p.onContribute?.()}
                />
              ) : (
                <View style={s.actions}>
                  <WorkspaceAction label="筛选" onPress={p.controls.onFilter} />
                  <WorkspaceAction
                    label="＋ 发需求"
                    onPress={() => router.push("/requests/new")}
                  />
                </View>
              )}
            </View>
            {p.statusNote ? <Text style={s.note}>{p.statusNote}</Text> : null}
          </View>
          <View style={s.body}>{p.children}</View>
        </View>
      )}
    </View>
  );
}
function WorkspaceAction(p: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.label}
      onPress={p.onPress}
      style={({ pressed }) => [
        s.action,
        pressed && { backgroundColor: tokens.color.surfaceMuted },
      ]}
    >
      <Text style={s.actionText}>{p.label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surfaceMuted },
  map: { overflow: "hidden" },
  expandedMap: { flex: 1, minHeight: 0 },
  action: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: {
    fontSize: 13,
    lineHeight: 20,
    color: tokens.color.brandText,
    fontWeight: "600",
  },
  panel: { flex: 1 },
  panelSurface: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  compactPanel: { flexGrow: 0, flexShrink: 1, maxHeight: "64%" },
  statusBody: { paddingTop: 6, paddingBottom: 8 },
  modes: { paddingHorizontal: 16, paddingTop: 12 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 48,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: tokens.color.textSecondary,
    flexShrink: 1,
  },
  headingLarge: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingTop: 8,
    gap: 0,
  },
  actions: { flexDirection: "row" },
  note: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 12,
    color: tokens.color.textSecondary,
  },
  body: { flex: 1, minHeight: 0 },
  locate: { position: "absolute", right: 16, bottom: 24 },
});
