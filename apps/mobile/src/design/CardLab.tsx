import { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ApartmentSheet } from "../apartments/ApartmentSheet";
import HomeMap from "../components/HomeMap";
import { HomeChrome } from "../components/HomeChrome";
import { Icon } from "../ui/Icon";
type S = components["schemas"];
const scenarios = [
  "有密码",
  "多条记录",
  "无密码",
  "无固定码",
  "无资格",
  "读取失败",
  "长地址",
  "时段限制",
  "反馈失败",
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
    contributed_at: n === 1 ? "2026-10-29T16:20:00Z" : "2026-10-30T17:10:00Z",
    last_success_at: useful ? "2026-10-30T16:45:00Z" : null,
    last_failure_at: null,
    effective_useful: useful,
    my_feedback: null,
    verification_label: "community_contribution",
    contributor_display_name: "合成测试司机",
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
    [expanded, setExpanded] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<string | null>(null),
    [records, setRecords] = useState<S["AccessRecord"][]>([record(1, true)]),
    [status, setStatus] = useState<"ready" | "denied" | "error">("ready");
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
    if (s === "无固定码")
      rows = [
        { ...record(1), method: "front_desk", value: "合成场景：到前台登记" },
      ];
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
      history: "多条记录",
      empty: "无密码",
      noncode: "无固定码",
      denied: "无资格",
      error: "读取失败",
      long: "长地址",
      schedule: "时段限制",
      failure: "反馈失败",
    };
    if (params.case && map[params.case]) choose(map[params.case]);
  }, [params.case]);
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: tokens.color.surface }}
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
        <HomeMap />
        <HomeChrome mode="公寓" onMode={() => {}} />
        <ApartmentSheet
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
