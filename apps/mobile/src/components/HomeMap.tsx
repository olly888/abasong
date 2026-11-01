import Mapbox from "@rnmapbox/maps";
import { Text, StyleSheet, View } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Camera } from "@rnmapbox/maps";
import type { HomeMapProps } from "./HomeMap.types";
import { buildingCamera } from "./building-camera";
const INITIAL_CAMERA = {
  centerCoordinate: [-118.2437, 34.0522],
  zoomLevel: 12,
};
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (token) Mapbox.setAccessToken(token);
export default function HomeMap({
  point,
  location,
  destination,
  apartments = [],
  selectedId,
  mapContext,
  onSelect,
  cameraRevision = 0,
  cameraZoom = 17,
  frameSelected = false,
  bottomInset = 210,
}: HomeMapProps = {}) {
  const camera = useRef<Camera>(null);
  const touched = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const center = useMemo(
    () => (point ? [point.lng, point.lat] : [-118.2437, 34.0522]),
    [point?.lng, point?.lat],
  );
  const padding = useMemo(
    () => ({
      paddingTop: 164,
      paddingBottom: bottomInset + 12,
      paddingLeft: 24,
      paddingRight: 24,
    }),
    [bottomInset],
  );
  const buildings = useMemo(
    () =>
      mapContext?.apartment_id === selectedId
        ? (mapContext?.buildings ?? [])
        : [],
    [mapContext, selectedId],
  );
  // Suppress only a duplicate of our selected number inside its footprint.
  // Other numbers in a multi-building complex and courtyard labels must remain.
  const numberFilter = useMemo<
    NonNullable<React.ComponentProps<typeof Mapbox.SymbolLayer>["filter"]>
  >(
    () =>
      buildings.length
        ? [
            "!",
            [
              "all",
              [
                "within",
                {
                  type: "MultiPolygon",
                  coordinates: buildings.flatMap((b) => b.geometry.coordinates),
                },
              ],
              [
                "in",
                ["to-string", ["get", "house_num"]],
                [
                  "literal",
                  [...new Set(buildings.map((b) => b.street_number))],
                ],
              ],
            ],
          ]
        : ["has", "house_num"],
    [buildings],
  );
  const fitted = frameSelected
    ? buildingCamera(buildings, size.width, size.height, padding)
    : null;
  const command = useRef({
    center,
    padding,
    zoomLevel: point ? cameraZoom : 12,
  });
  command.current = {
    center: fitted?.centerCoordinate ?? center,
    padding,
    zoomLevel: fitted?.zoomLevel ?? (point ? cameraZoom : 12),
  };
  const applyCamera = () => {
    const current = command.current;
    camera.current?.setCamera({
      centerCoordinate: current.center,
      zoomLevel: current.zoomLevel,
      padding: current.padding,
      pitch: 0,
      heading: 0,
      animationMode: "moveTo",
      animationDuration: 0,
    });
  };
  useEffect(() => {
    touched.current = false;
    applyCamera();
  }, [point?.lng, point?.lat, cameraRevision, cameraZoom]);
  useEffect(() => {
    if (frameSelected && buildings.length && !touched.current) applyCamera();
  }, [frameSelected, buildings, size]);
  if (!token) return <Text style={{ color: "#53565B" }}>地图暂不可用</Text>;
  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL="mapbox://styles/mapbox/light-v11"
      scaleBarEnabled
      scaleBarPosition={{ top: 136, left: 16 }}
      scaleBarUnits="imperial"
      compassEnabled={false}
      logoPosition={{ bottom: bottomInset + 8, left: 16 }}
      attributionPosition={{ bottom: bottomInset + 8, left: 106 }}
      onDidFinishLoadingMap={() => {
        if (!touched.current) applyCamera();
      }}
      onTouchStart={() => {
        touched.current = true;
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }}
    >
      <Mapbox.Camera
        ref={camera}
        defaultSettings={INITIAL_CAMERA}
        padding={padding}
        animationDuration={0}
        maxZoomLevel={20}
      />
      {/* Light-v11 contains Streets v8 in composite but has no housenum layer.
          Reuse its vector source; don't geocode every visible building. */}
      <Mapbox.VectorSource id="composite" existing>
        <Mapbox.SymbolLayer
          id="abasong-house-numbers"
          sourceLayerID="housenum_label"
          minZoomLevel={16}
          filter={numberFilter}
          style={{
            textField: ["get", "house_num"],
            textFont: ["DIN Pro Regular", "Arial Unicode MS Regular"],
            textSize: [
              "interpolate",
              ["linear"],
              ["zoom"],
              16,
              11,
              17,
              13,
              19,
              15,
            ],
            textColor: "#53565B",
            textHaloColor: "#FFFFFF",
            textHaloWidth: 1.5,
            textAllowOverlap: false,
            textIgnorePlacement: false,
            textPadding: 3,
          }}
        />
      </Mapbox.VectorSource>
      {buildings.length ? (
        <>
          <Mapbox.ShapeSource
            id="selected-building-outline"
            shape={{
              type: "FeatureCollection",
              features: buildings.map((b) => ({
                type: "Feature",
                id: b.id,
                geometry: b.geometry as GeoJSON.MultiPolygon,
                properties: {},
              })),
            }}
          >
            <Mapbox.FillLayer
              id="selected-building-fill"
              belowLayerID="abasong-house-numbers"
              style={{
                fillColor: "#1467D8",
                fillOpacity: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  15,
                  0.12,
                  17,
                  0.22,
                  19,
                  0.3,
                ],
              }}
            />
            <Mapbox.LineLayer
              id="selected-building-line"
              belowLayerID="abasong-house-numbers"
              style={{ lineColor: "#1467D8", lineWidth: 2 }}
            />
          </Mapbox.ShapeSource>
          <Mapbox.ShapeSource
            id="selected-building-numbers"
            shape={{
              type: "FeatureCollection",
              features: buildings.map((b) => ({
                type: "Feature",
                id: b.id,
                geometry: {
                  type: "Point",
                  coordinates: [b.label_point.lng, b.label_point.lat],
                },
                properties: { street_number: b.street_number },
              })),
            }}
          >
            <Mapbox.SymbolLayer
              id="selected-building-label"
              minZoomLevel={16}
              style={{
                textField: ["get", "street_number"],
                textFont: ["DIN Pro Bold", "Arial Unicode MS Regular"],
                textSize: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  16,
                  16,
                  17,
                  18,
                  19,
                  22,
                ],
                textColor: "#104EAA",
                textHaloColor: "#FFFFFF",
                textHaloWidth: 2,
                textAllowOverlap: false,
                textPadding: 4,
              }}
            />
          </Mapbox.ShapeSource>
        </>
      ) : null}
      {destination ? (
        <Mapbox.PointAnnotation
          id="search-destination"
          coordinate={[destination.lng, destination.lat]}
        >
          <View
            style={{
              width: 22,
              height: 22,
              backgroundColor: "#FFFFFF",
              borderColor: "#1467D8",
              borderWidth: 4,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </Mapbox.PointAnnotation>
      ) : null}
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
      {apartments
        .filter((p) => p.id !== selectedId || !buildings.length)
        .map((p) => (
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
