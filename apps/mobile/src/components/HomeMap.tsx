import Mapbox from "@rnmapbox/maps";
import { Text, StyleSheet, View } from "react-native";
import type { HomeMapProps } from "./HomeMap.types";
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (token) Mapbox.setAccessToken(token);
export default function HomeMap({
  point,
  location,
  apartments = [],
  selectedId,
  onSelect,
}: HomeMapProps = {}) {
  if (!token) return <Text style={{ color: "#53565B" }}>地图暂不可用</Text>;
  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={Mapbox.StyleURL.Light}
      scaleBarEnabled={false}
      compassEnabled={false}
      logoPosition={{ top: 144, left: 16 }}
      attributionPosition={{ top: 144, left: 106 }}
    >
      <Mapbox.Camera
        centerCoordinate={point ? [point.lng, point.lat] : [-118.2437, 34.0522]}
        zoomLevel={point ? 16 : 12}
        animationDuration={300}
      />
      {location ? (
        <Mapbox.PointAnnotation
          id="current-location"
          coordinate={[location.lng, location.lat]}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 3,
              borderColor: "#FFFFFF",
              backgroundColor: "#1467D8",
            }}
          />
        </Mapbox.PointAnnotation>
      ) : null}
      {apartments.map((p) => (
        <Mapbox.PointAnnotation
          key={p.id}
          id={p.id}
          coordinate={[p.point.lng, p.point.lat]}
          onSelected={() => onSelect?.(p)}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 3,
              borderColor: "#FFFFFF",
              backgroundColor: p.id === selectedId ? "#1467D8" : "#111111",
            }}
          />
        </Mapbox.PointAnnotation>
      ))}
    </Mapbox.MapView>
  );
}
