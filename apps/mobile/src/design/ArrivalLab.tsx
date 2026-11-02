import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { HomeApartmentContent } from "../apartments/HomeApartments";
import { HomeChrome } from "../components/HomeChrome";
import { distanceM } from "../apartments/nearby-policy";

type S = components["schemas"];
// Explicitly synthetic adapter. Real OS observations still drive the very same
// stream/queue/nearby-card component. Server geometry has separate HTTP tests.
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
  "离开慢网",
  "资料慢网",
  "轮廓失败",
  "无密码",
  "多候选",
  "快切慢网",
  "地址待核对",
  "无候选",
  "读取失败",
  "重试恢复",
  "查询失败",
  "无资格",
  "发现慢网",
  "范围边缘",
  "地图故障",
] as const;
type Scene = (typeof scenes)[number];
// Synthetic delayed completions, no real network/account fault injection.
function delay(signal?: AbortSignal, milliseconds = 9000) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new Error("TEST request cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}
function adapter(scene: Scene, onAccessRead: () => void) {
  let reads = 0;
  let discoveries = 0;
  return {
    canRead: scene !== "无资格",
    read: async (
      path: string,
      options: { body?: unknown; signal?: AbortSignal } = {},
    ): Promise<unknown> => {
      if (path.endsWith("/discover/mapbox")) {
        if (scene === "地图故障")
          throw new Error("TEST optional map unavailable");
        if (scene === "地址待核对") await delay(options.signal, 4000);
        return {
          items:
            scene === "地址待核对"
              ? [
                  {
                    key: "TEST-temporary",
                    source: "mapbox",
                    apartment: null,
                    address: null,
                    point: apartment.point,
                    distance_m: 10,
                    classification: "apartments",
                    requires_address_confirmation: true,
                  },
                ]
              : [],
          radius_m: 200,
          expires_at: new Date(Date.now() + 60000).toISOString(),
          truncated: false,
          provider_status: "ok",
          attribution: "TEST",
          use_mode: "temporary",
        };
      }
      if (path.endsWith("/discover")) {
        if (scene === "范围边缘" && discoveries++ > 0)
          await delay(options.signal);
        if (scene === "发现慢网") await delay(options.signal, 3000);
        if (scene === "查询失败") throw new Error("TEST lookup unavailable");
        const { point } = options.body as S["ResolveInput"];
        const empty =
          scene === "无候选" ||
          scene === "地址待核对" ||
          Math.abs(point.lng + 118.2437) > 0.002 ||
          Math.abs(point.lat - 34.0522) > 0.002;
        if (scene === "离开慢网" && empty) await delay(options.signal);
        const edgeApartment = {
          ...apartment,
          point: { lng: apartment.point.lng, lat: 34.05391 },
        };
        const list =
          scene === "范围边缘"
            ? distanceM(point, edgeApartment.point) <= 200
              ? [edgeApartment]
              : []
            : empty
              ? []
              : scene === "多候选" || scene === "快切慢网"
                ? [
                    apartment,
                    {
                      ...apartment,
                      id: "11111111-1111-4111-8111-111111111112",
                      address_line1: "102 TEST Arrival Ave",
                      point: { lng: -118.2435, lat: 34.0522 },
                    },
                    {
                      ...apartment,
                      id: "11111111-1111-4111-8111-111111111113",
                      address_line1: "104 TEST Arrival Ave",
                      point: { lng: -118.2433, lat: 34.0522 },
                    },
                  ]
                : [apartment];
        return {
          items: list.map((a, i) => ({
            key: a.id,
            source: "catalog",
            apartment: a,
            address: {
              address_line1: a.address_line1,
              city: a.city,
              state: a.state,
              postal_code: a.postal_code,
            },
            point: a.point,
            distance_m:
              scene === "范围边缘" ? distanceM(point, a.point) : i * 20,
            classification: "catalog_community",
            requires_address_confirmation: false,
          })),
          radius_m: 200,
          expires_at: new Date(Date.now() + 20000).toISOString(),
          truncated: false,
          provider_status: "not_requested",
          attribution: "",
          use_mode: "temporary",
        };
      }
      if (path.endsWith("/map-context")) {
        if (scene === "轮廓失败") throw new Error("TEST geometry unavailable");
        if (
          (scene === "资料慢网" || scene === "快切慢网") &&
          !path.includes("111111111112")
        )
          await delay(options.signal, 9000);
        const number = path.includes("111111111113")
          ? 104
          : path.includes("111111111112")
            ? 102
            : 100;
        const lng = apartment.point.lng + (number - 100) * 0.0001;
        const lat = scene === "范围边缘" ? 34.05391 : apartment.point.lat;
        return {
          apartment_id: path.split("/")[3] ?? apartment.id,
          buildings: [
            {
              id: `33333333-3333-4333-8333-33333333333${(number - 100) / 2 + 1}`,
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [lng - 0.00007, lat - 0.00009],
                      [lng + 0.00007, lat - 0.00009],
                      [lng + 0.00007, lat + 0.00009],
                      [lng - 0.00007, lat + 0.00009],
                      [lng - 0.00007, lat - 0.00009],
                    ],
                  ],
                ],
              },
              label_point: { lng, lat },
              street_number: `TEST${number}`,
              verified_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (path.endsWith("/access-records")) {
        onAccessRead();
        if (
          (scene === "资料慢网" || scene === "快切慢网") &&
          !path.includes("111111111112")
        )
          await delay(options.signal, 9000);
        reads++;
        if (scene === "读取失败" || (scene === "重试恢复" && reads === 1))
          throw new Error("资料暂时无法加载");
        return {
          items:
            scene === "无密码" ||
            path.includes("111111111113") ||
            scene === "无资格"
              ? []
              : [
                  {
                    id: "22222222-2222-4222-8222-222222222221",
                    apartment_id: path.split("/")[3] ?? apartment.id,
                    method: "keypad",
                    value: path.includes("111111111112")
                      ? "TEST-02#"
                      : "TEST-01#",
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
  const params = useLocalSearchParams<{ scene?: string; run?: string }>();
  const [observations, setObservations] = useState(0);
  const [accessReads, setAccessReads] = useState(0);
  const [scene, setScene] = useState<Scene>(
    scenes.includes(params.scene as Scene) ? (params.scene as Scene) : "有密码",
  );
  useEffect(() => {
    if (scenes.includes(params.scene as Scene)) setScene(params.scene as Scene);
  }, [params.scene, params.run]);
  const sceneAdapter = useMemo(
    () => adapter(scene, () => setAccessReads((n) => n + 1)),
    [scene],
  );

  if (!focused || !active)
    return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 12, textAlign: "center", padding: 6 }}>
        TEST · 合成资料 · 位置 {observations} · 查码 {accessReads}
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
        key={scene + ":" + (params.run ?? "")}
        testData={{
          ...sceneAdapter,
          userId: "99999999-9999-4999-8999-999999999999",
          onObservation: () => setObservations((n) => n + 1),
        }}
        toolbar={<HomeChrome mode="公寓" onMode={() => {}} />}
      />
    </SafeAreaView>
  );
}
