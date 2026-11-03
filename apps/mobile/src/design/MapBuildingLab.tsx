import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { components } from "@abasong/contracts";
import HomeMap from "../components/HomeMap";
type C = components["schemas"]["NearbyCandidate"];
const center = { lng: -118.2437, lat: 34.0522 };
const candidates: C[] = [-0.00028, 0.00028].map((offset, i) => ({
  key: "TEST-" + (100 + 2 * i),
  source: "mapbox",
  apartment: null,
  address: null,
  point: { lng: center.lng + offset, lat: center.lat },
  distance_m: 26,
  provider_feature_id: String(i + 1),
  classification: "apartments",
  requires_address_confirmation: true,
}));
const features = candidates.map((c, i) => {
  const { lng, lat } = c.point,
    w = 0.0001,
    h = 0.00015;
  return {
    type: "Feature",
    id: i + 1,
    properties: { type: "apartments" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - w, lat - h],
          [lng + w, lat - h],
          [lng + w, lat + h],
          [lng - w, lat + h],
          [lng - w, lat - h],
        ],
      ],
    },
  };
});
const style = JSON.stringify({
  version: 8,
  sources: {
    composite: {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#F4F4F2" },
    },
    {
      id: "building",
      type: "fill",
      source: "composite",
      paint: { "fill-color": "#C9CBCB", "fill-outline-color": "#A0A3A5" },
    },
    {
      id: "abasong-house-numbers",
      type: "circle",
      source: "composite",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 0 },
    },
  ],
});
export default function MapBuildingLab() {
  const [selected, setSelected] = useState<C | null>(candidates[0]!),
    [result, setResult] = useState<{ key: string; count: number } | null>(null);
  if (!__DEV__) return null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <Text style={{ fontSize: 18, padding: 16 }}>TEST · 原生建筑查询</Text>
      <View style={{ flex: 1 }}>
        <HomeMap
          point={center}
          cameraZoom={18}
          topInset={10}
          bottomInset={20}
          selectedId={selected?.key}
          selectedPoint={selected?.point}
          providerFeatureId={selected?.provider_feature_id}
          nearbyCandidates={candidates}
          onNearbySelect={setSelected}
          testMapStyle={style}
          onTestBuildingResult={(key, count) => setResult({ key, count })}
        />
      </View>
      <Text style={{ padding: 16, fontSize: 18 }}>
        {selected
          ? selected.key +
            " · " +
            (result?.key === selected.key
              ? "已查询 " + result.count + " 个图形片段"
              : "读取中")
          : "TEST · 无选择"}
      </Text>
      <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
        {candidates.map((c) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            onPress={() => setSelected(c)}
            style={{ padding: 14, backgroundColor: "#EAF1FC" }}
          >
            <Text>{c.key}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelected(null)}
          style={{ padding: 14 }}
        >
          <Text>清除选择</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
