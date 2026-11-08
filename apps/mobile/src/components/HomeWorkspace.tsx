import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { ActionButton } from "../ui/Controls";
import { MapControl } from "../ui/MapControls";

export type WorkspaceControls = {
  modes: ReactNode;
  onFilter: () => void;
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
}) {
  return (
    <View style={s.root}>
      <View style={s.map}>
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
      <View style={s.panel}>
        <View style={s.modes}>{p.controls.modes}</View>
        <View style={s.heading}>
          <Text style={s.title}>
            {p.title}
            {p.count !== undefined ? ` · ${p.count}` : ""}
          </Text>
          {p.apartment ? (
            <ActionButton
              label="共享门禁码"
              variant="text"
              onPress={() => p.onContribute?.()}
            />
          ) : (
            <View style={s.actions}>
              <ActionButton
                label="筛选"
                variant="text"
                onPress={p.controls.onFilter}
              />
              <ActionButton
                label="＋ 发需求"
                variant="text"
                onPress={() => router.push("/requests/new")}
              />
            </View>
          )}
        </View>
        {p.statusNote ? <Text style={s.note}>{p.statusNote}</Text> : null}
        <View style={s.body}>{p.children}</View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surfaceMuted },
  map: { height: "42%", overflow: "hidden" },
  panel: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
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
