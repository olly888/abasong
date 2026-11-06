import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) Mapbox.setAccessToken(token);
export function WarehouseMap({
  point,
}: {
  point: components["schemas"]["Point"];
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={{
        height: 280,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: tokens.color.surfaceMuted,
      }}
    >
      {token ? (
        <Mapbox.MapView
          style={StyleSheet.absoluteFill}
          styleURL="mapbox://styles/mapbox/light-v11"
          compassEnabled={false}
          scaleBarEnabled
          scaleBarUnits="metric"
          scaleBarPosition={{ top: 12, left: 12 }}
          logoPosition={{ left: 10, bottom: 10 }}
          attributionPosition={{ right: 10, bottom: 10 }}
          onMapLoadingError={() => setFailed(true)}
          onDidFinishLoadingMap={() => setFailed(false)}
        >
          <Mapbox.Camera
            defaultSettings={{
              centerCoordinate: [point.lng, point.lat],
              zoomLevel: 16,
              pitch: 0,
              heading: 0,
            }}
          />
          <Mapbox.PointAnnotation
            id="pickup-warehouse"
            coordinate={[point.lng, point.lat]}
          >
            <View
              style={{
                backgroundColor: tokens.color.brandPrimary,
                borderRadius: 22,
                padding: 12,
                borderColor: tokens.color.surface,
                borderWidth: 3,
              }}
            >
              <Text style={{ color: tokens.color.surface, fontWeight: "700" }}>
                仓
              </Text>
            </View>
          </Mapbox.PointAnnotation>
        </Mapbox.MapView>
      ) : null}
      {!token || failed ? (
        <View
          style={{
            backgroundColor: tokens.color.surface,
            padding: 12,
            margin: 12,
            borderRadius: 12,
          }}
        >
          <Text>地图暂时无法加载，可复制地址或导航</Text>
        </View>
      ) : null}
    </View>
  );
}
