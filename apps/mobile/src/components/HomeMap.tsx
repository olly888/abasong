import Mapbox from "@rnmapbox/maps";
import { tokens } from "@abasong/ui";
import { Text, StyleSheet, View } from "react-native";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import type { Camera } from "@rnmapbox/maps";
import type { HomeMapProps } from "./HomeMap.types";
import { buildingCamera } from "./building-camera";
import {
  selectedBuildingGeometry,
  candidateForBuilding,
  type BuildingTarget,
} from "./building-query";
import { serialLatest } from "../apartments/serial-latest";
import { cameraSnapshot } from "./map-camera";
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
  selectedPoint,
  providerFeatureId,
  nearbyCandidates = [],
  onNearbySelect,
  cameraRevision = 0,
  cameraIntent = "explicit",
  cameraZoom = 17,
  frameSelected = false,
  bottomInset = 210,
  topInset = 164,
  overlay,
  areaMarkers = [],
  selectedAreaIds = [],
  filteredAreaId,
  onAreaSelect,
  cameraState,
  onCameraSnapshot,
  testMapStyle,
  onTestBuildingResult,
}: HomeMapProps = {}) {
  const camera = useRef<Camera>(null);
  const map = useRef<Mapbox.MapView>(null);
  const areaAnnotations = useRef(
    new Map<string, ComponentRef<typeof Mapbox.PointAnnotation>>(),
  );
  const areaAppearance = JSON.stringify(
    areaMarkers.map((r) => [
      r.id,
      r.count,
      selectedAreaIds.includes(r.id),
      filteredAreaId === r.id,
    ]),
  );
  useEffect(() => {
    // PointAnnotation snapshots its child view. Refresh after native layout so
    // switching cards actually updates the rendered region color/count.
    const frame = requestAnimationFrame(() =>
      areaAnnotations.current.forEach((a) => a.refresh()),
    );
    return () => cancelAnimationFrame(frame);
  }, [areaAppearance]);
  const mapAlive = useRef(true);
  const latestCandidates = useRef(nearbyCandidates);
  latestCandidates.current = nearbyCandidates;
  const [mapReady, setMapReady] = useState(false);
  const [sdkSelected, setSdkSelected] = useState<{
    key: string;
    shape: ReturnType<typeof selectedBuildingGeometry>;
  } | null>(null);
  const sdkSignature = useRef("");
  const latestTarget = useRef<BuildingTarget | null>(null);
  latestTarget.current =
    selectedId && selectedPoint
      ? {
          key: selectedId,
          point: selectedPoint,
          ...(providerFeatureId ? { featureId: providerFeatureId } : {}),
        }
      : null;
  const sdkQueue = useRef<ReturnType<
    typeof serialLatest<BuildingTarget, GeoJSON.FeatureCollection>
  > | null>(null);
  const refreshBuildings = () => {
    if (
      mapReady &&
      latestTarget.current &&
      !(
        mapContext &&
        mapContext.apartment_id === selectedId &&
        mapContext.buildings.length
      )
    )
      sdkQueue.current?.offer(latestTarget.current);
  };
  useEffect(() => {
    mapAlive.current = true;
    const queue = serialLatest<BuildingTarget, GeoJSON.FeatureCollection>(
      async () => {
        if (!map.current) throw Error("MAP_NOT_READY");
        return map.current.querySourceFeatures("composite", [], ["building"]);
      },
      (target, raw) => {
        const shape = selectedBuildingGeometry(raw, target);
        const signature = target.key + ":" + JSON.stringify(shape);
        // Updating an unchanged ShapeSource can itself cause another map-idle
        // event. Keep identical loaded-tile results from creating a render loop.
        if (signature === sdkSignature.current) return;
        sdkSignature.current = signature;
        setSdkSelected({ key: target.key, shape });
        if (__DEV__) onTestBuildingResult?.(target.key, shape.features.length);
      },
      () => {
        sdkSignature.current = "";
        setSdkSelected(null);
      },
      (a, b) =>
        a.key === b.key &&
        a.point.lng === b.point.lng &&
        a.point.lat === b.point.lat &&
        a.featureId === b.featureId,
      250,
    );
    sdkQueue.current = queue;
    return () => {
      mapAlive.current = false;
      queue.dispose();
      sdkQueue.current = null;
    };
  }, []);
  useEffect(() => {
    sdkQueue.current?.invalidate();
    sdkSignature.current = "";
    setSdkSelected(null);
    refreshBuildings();
  }, [
    selectedId,
    selectedPoint?.lng,
    selectedPoint?.lat,
    providerFeatureId,
    mapReady,
  ]);
  const touched = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const center = useMemo(
    () => (point ? [point.lng, point.lat] : [-118.2437, 34.0522]),
    [point?.lng, point?.lat],
  );
  const padding = useMemo(
    () => ({
      paddingTop: topInset,
      paddingBottom: bottomInset + 12,
      paddingLeft: 24,
      paddingRight: 24,
    }),
    [bottomInset, topInset],
  );
  const buildings = useMemo(
    () =>
      mapContext?.apartment_id === selectedId
        ? (mapContext?.buildings ?? [])
        : [],
    [mapContext, selectedId],
  );
  const sdkShape =
    sdkSelected && sdkSelected.key === selectedId && !buildings.length
      ? sdkSelected.shape
      : null;
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
    center: cameraState
      ? [cameraState.center.lng, cameraState.center.lat]
      : (fitted?.centerCoordinate ?? center),
    padding,
    zoomLevel:
      cameraState?.zoom ?? fitted?.zoomLevel ?? (point ? cameraZoom : 12),
  };
  const applyCamera = () => {
    const current = command.current;
    camera.current?.setCamera({
      centerCoordinate: current.center,
      zoomLevel: current.zoomLevel,
      padding: current.padding,
      pitch: cameraState?.pitch ?? 0,
      heading: cameraState?.heading ?? 0,
      animationMode: "moveTo",
      animationDuration: 0,
    });
  };
  useEffect(() => {
    // Automatic arrival can bring the nearby building into view once, but must
    // not steal the map from a driver who already panned or zoomed it.
    if (cameraIntent === "arrival" && touched.current) return;
    touched.current = false;
    applyCamera();
  }, [point?.lng, point?.lat, cameraRevision, cameraZoom, cameraIntent]);
  useEffect(() => {
    if (frameSelected && buildings.length && !touched.current) applyCamera();
  }, [frameSelected, buildings, size]);
  if (!token) return <Text style={{ color: "#53565B" }}>地图暂不可用</Text>;
  return (
    <Mapbox.MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      styleURL={
        __DEV__ && testMapStyle ? undefined : "mapbox://styles/mapbox/light-v11"
      }
      styleJSON={__DEV__ ? testMapStyle : undefined}
      scaleBarEnabled
      scaleBarPosition={{ top: Math.max(12, topInset - 28), left: 16 }}
      scaleBarUnits="metric"
      compassEnabled={false}
      logoPosition={{ bottom: bottomInset + 8, left: 16 }}
      attributionPosition={{ bottom: bottomInset + 8, left: 106 }}
      onDidFinishLoadingMap={() => {
        setMapReady(true);
        if (!touched.current) applyCamera();
      }}
      onCameraChanged={(state) => {
        if (!onCameraSnapshot) return;
        const snapshot = cameraSnapshot(state.properties);
        if (snapshot) onCameraSnapshot(snapshot);
      }}
      onMapIdle={(state) => {
        refreshBuildings();
        if (!onCameraSnapshot) return;
        const snapshot = cameraSnapshot(state.properties);
        if (snapshot) onCameraSnapshot(snapshot);
      }}
      onPress={async (feature) => {
        if (!onNearbySelect || !map.current) return;
        const { screenPointX: x, screenPointY: y } = feature.properties;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const key = latestTarget.current?.key;
        const snapshot = latestCandidates.current;
        try {
          const raw = await map.current.queryRenderedFeaturesAtPoint(
            [x, y],
            [],
            ["building"],
          );
          if (
            !mapAlive.current ||
            key !== latestTarget.current?.key ||
            snapshot !== latestCandidates.current
          )
            return;
          const candidate = candidateForBuilding(raw, snapshot);
          if (candidate) onNearbySelect(candidate);
        } catch {
          /* SDK/source not ready: existing card/marker remains usable. */
        }
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
      {!(__DEV__ && testMapStyle) ? (
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
      ) : null}
      {sdkShape?.features.length ? (
        <Mapbox.ShapeSource id="selected-sdk-building" shape={sdkShape}>
          <Mapbox.FillLayer
            id="selected-sdk-building-fill"
            belowLayerID="abasong-house-numbers"
            style={{ fillColor: tokens.color.brandPrimary, fillOpacity: 0.22 }}
          />
          <Mapbox.LineLayer
            id="selected-sdk-building-line"
            belowLayerID="abasong-house-numbers"
            style={{ lineColor: tokens.color.brandPrimary, lineWidth: 2 }}
          />
        </Mapbox.ShapeSource>
      ) : null}
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
                fillColor: tokens.color.brandPrimary,
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
              style={{ lineColor: tokens.color.brandPrimary, lineWidth: 2 }}
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
              borderColor: tokens.color.brandPrimary,
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
              backgroundColor: tokens.color.brandPrimary,
            }}
          />
        </Mapbox.PointAnnotation>
      ) : null}
      {apartments
        .filter(
          (p) =>
            p.id !== selectedId ||
            !(buildings.length || sdkShape?.features.length),
        )
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
                backgroundColor: p.id === selectedId ? tokens.color.brandPrimary : "#111111",
              }}
            />
          </Mapbox.PointAnnotation>
        ))}
      {areaMarkers.map((r) => (
        <Mapbox.PointAnnotation
          anchor={{ x: 0.5, y: 1 }}
          key={`support-${r.id}`}
          ref={(annotation) => {
            if (annotation) areaAnnotations.current.set(r.id, annotation);
            else areaAnnotations.current.delete(r.id);
          }}
          id={`support-${r.id}`}
          coordinate={[r.point.lng, r.point.lat]}
          onSelected={() => onAreaSelect?.(r.id)}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 2,
              borderColor:
                filteredAreaId === r.id
                  ? tokens.color.brandPrimary
                  : tokens.color.surface,
              backgroundColor: selectedAreaIds.includes(r.id)
                ? tokens.color.brandPrimary
                : tokens.color.ink,
            }}
          >
            <Text
              style={{
                color: tokens.color.onBrand,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {r.label}
              {r.count > 1 ? ` · ${r.count}` : ""}
            </Text>
          </View>
        </Mapbox.PointAnnotation>
      ))}
      {overlay}
    </Mapbox.MapView>
  );
}
