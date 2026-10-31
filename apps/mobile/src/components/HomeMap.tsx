import Mapbox from "@rnmapbox/maps";
import { Text, StyleSheet, View } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import type { Camera } from "@rnmapbox/maps";
import type { HomeMapProps } from "./HomeMap.types";
const INITIAL_CAMERA = {
  centerCoordinate: [-118.2437, 34.0522],
  zoomLevel: 12,
};
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (token) Mapbox.setAccessToken(token);
export default function HomeMap({
  point,
  location,
  apartments = [],
  selectedId,
  onSelect,
  cameraRevision = 0,
  bottomInset = 210,
}: HomeMapProps = {}) {
  const camera = useRef<Camera>(null);
  const center = useMemo(
    () => (point ? [point.lng, point.lat] : [-118.2437, 34.0522]),
    [point?.lng, point?.lat],
  );
  const padding = useMemo(
    () => ({
      paddingTop: 140,
      paddingBottom: bottomInset + 12,
      paddingLeft: 24,
      paddingRight: 24,
    }),
    [bottomInset],
  );
  const command = useRef({ center, padding, zoomLevel: point ? 16 : 12 });
  command.current = { center, padding, zoomLevel: point ? 16 : 12 };
  const applyCamera = () => {
    const current = command.current;
    camera.current?.setCamera({
      centerCoordinate: current.center,
      zoomLevel: current.zoomLevel,
      padding: current.padding,
      animationMode: "easeTo",
      animationDuration: 300,
    });
  };
  useEffect(() => {
    applyCamera();
  }, [point?.lng, point?.lat, cameraRevision]);
  if (!token) return <Text style={{ color: "#53565B" }}>地图暂不可用</Text>;
  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={Mapbox.StyleURL.Light}
      scaleBarEnabled={false}
      compassEnabled={false}
      logoPosition={{ bottom: bottomInset + 8, left: 16 }}
      attributionPosition={{ bottom: bottomInset + 8, left: 106 }}
      onDidFinishLoadingMap={applyCamera}
    >
      <Mapbox.Camera
        ref={camera}
        defaultSettings={INITIAL_CAMERA}
        padding={padding}
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
