import { SharedContributionCard } from "../apartments/SharedContributions";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import type { NearbyCardCandidate } from "../apartments/distance-presentation";
import type { DiscoveryObservation } from "../apartments/nearby-policy";
import { ApartmentSheet } from "../apartments/ApartmentSheet";
import HomeMap from "../components/HomeMap";
import MapBuildingLab from "./MapBuildingLab";
import { HomeChrome } from "../components/HomeChrome";
import { Icon } from "../ui/Icon";
type S = components["schemas"];
const scenarios = [
  "有密码",
  "符号密码",
  "多条记录",
  "无密码",
  "无固定码",
  "无资格",
  "读取失败",
  "长地址",
  "时段限制",
  "反馈失败",
  "建筑高亮",
  "距离粗略",
  "距离过期",
  "门别未知",
] as const;
type Scene = (typeof scenarios)[number];
const apartment: S["Apartment"] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "TEST Apartments",
  address_line1: "100 Example Ave",
  city: "Test City",
  state: "CA",
  postal_code: null,
  point: { lng: -118.2437, lat: 34.0522 },
  confidence: "unverified",
};
function record(n: number, useful = false): S["AccessRecord"] {
  return {
    id: `22222222-2222-4222-8222-22222222222${n}`,
    apartment_id: apartment.id,
    method: "keypad",
    value: `TEST-0${n}#`,
    scope: {
      label: n === 1 ? "行人门" : "侧门",
      timezone: "America/Los_Angeles",
    },
    contributed_at: new Date(Date.now() - n * 60000).toISOString(),
    last_success_at: useful ? "2026-10-30T16:45:00Z" : null,
    last_failure_at: null,
    effective_useful: useful,
    my_feedback: null,
    verification_label: "community_contribution",
    contributor_display_name: "TEST 阿杰",
  };
}
export default function CardLab() {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) =>
      setActive(x === "active"),
    );
    return () => s.remove();
  }, []);
  if (!__DEV__) return <Redirect href="/" />;
  return active ? <Lab /> : <View />;
}
function Lab() {
  const params = useLocalSearchParams<{ case?: string }>();
  const [scene, setScene] = useState<Scene>("有密码"),
    [mapInset, setMapInset] = useState(210),
    [expanded, setExpanded] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<string | null>(null),
    [records, setRecords] = useState<S["AccessRecord"][]>([record(1, true)]),
    [status, setStatus] = useState<"ready" | "denied" | "error">("ready");
  const metric = useMemo(() => {
    const t = Date.now(),
      stamp = scene === "距离过期" ? t - 21000 : t;
    const observation: DiscoveryObservation = {
      approximate: scene === "距离粗略",
      fix: {
        timestamp: t,
        coords: {
          longitude: apartment.point.lng,
          latitude: apartment.point.lat,
          accuracy: 5,
        },
      },
    };
    const candidate: NearbyCardCandidate = {
      key: apartment.id,
      source: "catalog",
      apartment,
      address: apartment,
      point: apartment.point,
      distance_m: 23,
      distance_basis: "community_boundary",
      classification: "catalog_community",
      requires_address_confirmation: false,
      distance_reference: {
        origin: apartment.point,
        context: {
          observation_id: null,
          observed_at: new Date(stamp).toISOString(),
          valid_until: new Date(stamp + 20000).toISOString(),
          accuracy_m: 5,
          accuracy_permission: "precise",
        },
      },
    };
    return { observation, candidate };
  }, [scene, params.case]);
  function choose(s: Scene) {
    setScene(s);
    setExpanded(["多条记录", "时段限制", "反馈失败"].includes(s));
    setSaved(false);
    setError(null);
    setStatus(s === "无资格" ? "denied" : s === "读取失败" ? "error" : "ready");
    let rows =
      s === "无密码"
        ? []
        : s === "多条记录" || s === "反馈失败"
          ? [record(1, true), record(2)]
          : [record(1, true)];
    // Invented keypad examples only; no real building or credential data.
    if (s === "符号密码")
      rows = ["#0123", "*00456", "012345#", "*012345*"].map((value, i) => ({
        ...record(i + 1),
        value,
      }));
    if (s === "长地址")
      rows = [
        {
          ...record(1),
          value: "TEST-" + "X".repeat(26) + "#",
          contributor_display_name: "TEST 这是一位用户名较长的合成贡献司机",
        },
      ];
    if (s === "无固定码")
      rows = [
        { ...record(1), method: "front_desk", value: "合成场景：到前台登记" },
      ];
    if (s === "门别未知") rows = [{ ...record(1), scope: { label: "大门" } }];
    if (s === "时段限制")
      rows = [
        {
          ...record(1),
          scope: {
            label: "行人门",
            timezone: "America/Los_Angeles",
            weekdays: [1, 2, 3, 4, 5],
            start_local: "08:00",
            end_local: "18:00",
          },
        },
      ];
    setRecords(rows);
  }
  useEffect(() => {
    const map: Record<string, Scene> = {
      active: "有密码",
      symbols: "符号密码",
      history: "多条记录",
      empty: "无密码",
      noncode: "无固定码",
      denied: "无资格",
      error: "读取失败",
      long: "长地址",
      narrow: "长地址",
      schedule: "时段限制",
      failure: "反馈失败",
      building: "建筑高亮",
      coarse: "距离粗略",
      expired: "距离过期",
      unknownscope: "门别未知",
    };
    if (params.case && map[params.case]) choose(map[params.case]);
  }, [params.case]);
  if (params.case === "contributions") return <ContributionLab />;
  if (params.case === "map-query") return <MapBuildingLab />;
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: tokens.color.surface,
        ...(params.case === "narrow"
          ? { width: 320, alignSelf: "center" as const }
          : {}),
      }}
    >
      <Text
        style={{
          fontSize: 12,
          textAlign: "center",
          color: tokens.color.warning,
          padding: 6,
        }}
      >
        设计验收 · 合成资料 · 不连接业务接口
      </Text>
      <View style={{ height: 48 }}>
        <ScrollView
          horizontal
          contentContainerStyle={{
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
          }}
        >
          {scenarios.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: scene === s }}
              onPress={() => choose(s)}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 10,
                justifyContent: "center",
                backgroundColor:
                  scene === s
                    ? tokens.color.brandSurface
                    : tokens.color.surfaceMuted,
              }}
            >
              <Text style={{ fontSize: 14 }}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        <HomeMap
          bottomInset={mapInset}
          point={scene === "建筑高亮" ? apartment.point : undefined}
          selectedId={scene === "建筑高亮" ? apartment.id : undefined}
          mapContext={
            scene === "建筑高亮"
              ? {
                  apartment_id: apartment.id,
                  buildings: [
                    {
                      id: "33333333-3333-4333-8333-333333333333",
                      street_number: "TEST",
                      verified_at: "2026-10-30T00:00:00Z",
                      label_point: apartment.point,
                      geometry: {
                        type: "MultiPolygon",
                        coordinates: [
                          [
                            [
                              [-118.244, 34.052],
                              [-118.2434, 34.052],
                              [-118.2434, 34.0524],
                              [-118.244, 34.0524],
                              [-118.244, 34.052],
                            ],
                          ],
                        ],
                      },
                    },
                  ],
                }
              : null
          }
        />
        <HomeChrome mode="公寓" onMode={() => {}} />
        <ApartmentSheet
          key={scene}
          distanceCandidate={metric.candidate}
          observation={metric.observation}
          apartment={
            scene === "长地址"
              ? {
                  ...apartment,
                  name: "TEST Very Long Apartment Building Name",
                  address_line1:
                    "100 Example Avenue Building North Entrance - SYNTHETIC ONLY",
                }
              : apartment
          }
          records={records}
          status={status}
          expanded={expanded}
          onHeight={setMapInset}
          saved={saved}
          error={error}
          onExpand={setExpanded}
          onAdd={() => setError("合成添加动作已触发，未保存任何资料")}
          onOther={() => choose("有密码")}
          onRetry={() => {
            setStatus("ready");
            setError(null);
          }}
          onBookmark={() => setSaved((x) => !x)}
          onFeedback={async (r, v) => {
            if (scene === "反馈失败") {
              setError("反馈失败，请重试");
              return false;
            }
            setError(null);
            setRecords((rows) =>
              rows
                .map((x) =>
                  x.id === r.id
                    ? { ...x, my_feedback: v, effective_useful: v === "useful" }
                    : x,
                )
                .sort(
                  (a, b) =>
                    Number(b.effective_useful) - Number(a.effective_useful) ||
                    Date.parse(b.contributed_at) - Date.parse(a.contributed_at),
                ),
            );
            return true;
          }}
        />
      </View>
      <View
        style={{
          height: 60,
          borderTopWidth: 1,
          borderColor: tokens.color.border,
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        {(["home", "people", "person"] as const).map((n, i) => (
          <View key={n} style={{ alignItems: "center", gap: 3 }}>
            <Icon
              name={n}
              color={
                i === 0 ? tokens.color.brandPrimary : tokens.color.textMuted
              }
            />
            <Text style={{ fontSize: 12 }}>
              {["首页", "司机圈", "我的"][i]}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function ContributionLab() {
  const [action, setAction] = useState("");
  const source: S["ContributionSummary"] = {
    id: "22222222-2222-4222-8222-222222222221",
    record_id: "22222222-2222-4222-8222-222222222222",
    apartment_id: apartment.id,
    address_label: "100 TEST Management Ave",
    event_type: "created",
    record_status: "active",
    occurred_at: "2026-11-01T16:20:00Z",
    status: "active",
    version: 1,
    scope_label: "TEST 行人门",
    can_correct: true,
    other_source_count: 1,
    useful_count: 2,
    not_useful_count: 1,
    last_feedback_at: "2026-11-01T17:20:00Z",
    views_count: null,
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <Text style={{ padding: 12, color: tokens.color.warning }}>
        设计验收 · TEST合成资料 · 不连接业务接口
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "600", paddingHorizontal: 20 }}>
        我共享的
      </Text>
      <Text
        accessibilityRole="alert"
        style={{ minHeight: 32, paddingHorizontal: 20, paddingTop: 6 }}
      >
        {action || "TEST · 点纠正密码验证操作"}
      </Text>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <SharedContributionCard
          source={source}
          value="TEST-CARD#"
          canRead
          onCorrect={() => setAction("TEST · 纠正操作已触发")}
          onMap={() => setAction("TEST · 地图操作已触发")}
        />
        <SharedContributionCard
          source={{
            ...source,
            status: "corrected",
            event_type: "corrected",
            can_correct: false,
          }}
          canRead
          onCorrect={() => {}}
          onMap={() => setAction("TEST · 历史地图操作已触发")}
        />
        <SharedContributionCard
          source={{
            ...source,
            status: "withdrawn",
            event_type: "withdrawn",
            can_correct: false,
          }}
          canRead
          onCorrect={() => {}}
          onMap={() => setAction("TEST · 停显历史地图操作已触发")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
