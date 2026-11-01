import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { HomeApartmentContent } from "../apartments/HomeApartments";
import { HomeChrome } from "../components/HomeChrome";
import { useAuth } from "../auth/AuthProvider";
import { AuthResolution } from "../auth/AuthControls";
type S = components["schemas"];
// Explicitly synthetic adapter. Real OS observations still drive the very same
// stream/queue/arrival/card component. Server geometry has separate HTTP tests.
const apartment: S["Apartment"] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "TEST Apartments",
  address_line1: "100 TEST Arrival Ave",
  city: "Test City",
  state: "CA",
  postal_code: null,
  point: { lng: -118.2437, lat: 34.0522 },
  confidence: "field_verified",
};
const scenes = [
  "有密码",
  "无密码",
  "多候选",
  "无候选",
  "读取失败",
  "查询失败",
  "无资格",
] as const;
type Scene = (typeof scenes)[number];
function adapter(scene: Scene) {
  return {
    canRead: scene !== "无资格",
    read: async (
      path: string,
      options: { body?: unknown } = {},
    ): Promise<unknown> => {
      if (path.endsWith("/resolve")) {
        if (scene === "查询失败") throw new Error("TEST lookup unavailable");
        const { point } = options.body as S["ResolveInput"];
        const inside =
          point.lng >= -118.244 &&
          point.lng <= -118.2434 &&
          point.lat >= 34.0519 &&
          point.lat <= 34.05265;
        const empty =
          scene === "无候选" ||
          Math.abs(point.lng + 118.2437) > 0.002 ||
          Math.abs(point.lat - 34.0522) > 0.002;
        const matched = inside && scene !== "多候选" && !empty;
        return {
          status: matched ? "matched" : empty ? "unknown" : "candidates",
          matched_id: matched ? apartment.id : null,
          candidates: empty
            ? []
            : scene === "多候选"
              ? [
                  apartment,
                  {
                    ...apartment,
                    id: "11111111-1111-4111-8111-111111111112",
                    name: "TEST Neighbor",
                    address_line1: "102 TEST Arrival Ave",
                  },
                ]
              : [apartment],
          config_version: 1,
          reason: matched
            ? "matched"
            : scene === "多候选"
              ? "ambiguous"
              : empty
                ? "no_coverage"
                : "nearby",
          ...(matched
            ? { match_basis: point.lat > 34.0525 ? "entrance" : "boundary" }
            : {}),
        };
      }
      if (path.endsWith("/map-context"))
        return {
          apartment_id: apartment.id,
          buildings: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [-118.244, 34.0519],
                      [-118.2434, 34.0519],
                      [-118.2434, 34.0525],
                      [-118.244, 34.0525],
                      [-118.244, 34.0519],
                    ],
                  ],
                ],
              },
              label_point: apartment.point,
              street_number: "TEST100",
              verified_at: new Date().toISOString(),
            },
          ],
        };
      if (path.endsWith("/access-records")) {
        if (scene === "读取失败") throw new Error("资料暂时无法加载");
        return {
          items:
            scene === "无密码" || scene === "无资格"
              ? []
              : [
                  {
                    id: "22222222-2222-4222-8222-222222222221",
                    apartment_id: apartment.id,
                    method: "keypad",
                    value: "TEST-01#",
                    scope: { label: "行人门", timezone: "America/Los_Angeles" },
                    contributed_at: new Date().toISOString(),
                    last_success_at: null,
                    last_failure_at: null,
                    effective_useful: false,
                    my_feedback: null,
                    verification_label: "community_contribution",
                    contributor_display_name: "TEST",
                  },
                ],
        };
      }
      if (path.includes("apartment-library"))
        return { items: [], next_cursor: null };
      return apartment;
    },
  };
}
export default function ArrivalLab() {
  const auth = useAuth();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  const params = useLocalSearchParams<{ scene?: string }>();
  const [observations, setObservations] = useState(0);
  const [scene, setScene] = useState<Scene>(
    scenes.includes(params.scene as Scene) ? (params.scene as Scene) : "有密码",
  );
  if (auth.phase !== "ready" || !auth.session) return <AuthResolution />;
  if (!focused || !active)
    return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 12, textAlign: "center", padding: 6 }}>
        TEST · 合成公寓/资料 · 位置更新 {observations} 次
      </Text>
      <View style={{ height: 42 }}>
        <ScrollView horizontal>
          {scenes.map((s) => (
            <Pressable
              key={s}
              onPress={() => setScene(s)}
              style={{
                padding: 10,
                backgroundColor: scene === s ? "#eaf2ff" : "white",
              }}
            >
              <Text>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <HomeApartmentContent
        key={scene}
        testData={{
          ...adapter(scene),
          onObservation: () => setObservations((n) => n + 1),
        }}
        toolbar={<HomeChrome mode="公寓" onMode={() => {}} />}
      />
    </SafeAreaView>
  );
}
