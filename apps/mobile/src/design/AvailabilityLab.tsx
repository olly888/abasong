import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton } from "../ui/Controls";
import { driverFixtures } from "../drivers/fixtures";
import { AvailabilityFlow } from "../drivers/AvailabilityFlow";
import { availabilitySummary, nextDate } from "../drivers/availability-fields";
import type { AvailabilityRequest } from "../drivers/availability-session";
import { laInstant, localDateTime } from "../requests/presentation";
type S = components["schemas"];
const scenes = [
  "首次设置",
  "跨日",
  "保存重试",
  "关闭失败",
  "区域失败",
  "版本变化",
  "已到期",
] as const;
type Scene = (typeof scenes)[number];
export default function AvailabilityLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const params = useLocalSearchParams<{ scene?: string }>();
  const [scene, setScene] = useState<Scene>(
      scenes.includes(params.scene as Scene) ? (params.scene as Scene) : "跨日",
    ),
    [revision, setRevision] = useState(0);
  const controls = (
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6 }}
    >
      {scenes.map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityLabel={`TEST ${value}`}
          onPress={() => {
            setScene(value);
            setRevision((n) => n + 1);
          }}
          style={{
            padding: 10,
            minHeight: 44,
            borderRadius: 8,
            backgroundColor:
              scene === value
                ? tokens.color.brandSurface
                : tokens.color.surfaceMuted,
          }}
        >
          <Text>{value}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
  return (
    <Scenario key={`${scene}:${revision}`} scene={scene} controls={controls} />
  );
}
function Scenario({
  scene,
  controls,
}: {
  scene: Scene;
  controls: React.ReactNode;
}) {
  const data = useMemo(() => {
    const now = Date.now(),
      f = driverFixtures(now),
      today = localDateTime(null, now).date;
    const original = { ...f.drivers[0]!.availability!, capacity_parcels: 50 };
    let record: S["Availability"] | null =
      scene === "首次设置"
        ? null
        : scene === "跨日"
          ? {
              ...original,
              starts_at: laInstant(today, "23:00"),
              ends_at: laInstant(nextDate(today), "01:00"),
              currently_available: false,
            }
          : scene === "已到期"
            ? {
                ...original,
                starts_at: new Date(now - 7200000).toISOString(),
                ends_at: new Date(now - 3600000).toISOString(),
                currently_available: false,
              }
            : original;
    let writes = 0;
    const request: AvailabilityRequest = async <T,>(
      path: string,
      options?: { method?: string; body?: unknown },
    ) => {
      await new Promise((r) => setTimeout(r, 200));
      if (path.startsWith("/v1/regions")) {
        if (scene === "区域失败") throw new Error("TEST · 区域不可用");
        return {
          items: f.regions.map((r) => ({
            ...r,
            label: r.label.replace("TEST · ", ""),
          })),
        } as T;
      }
      if (options?.method === "PUT") {
        writes++;
        if (["保存重试", "关闭失败"].includes(scene) && writes === 1)
          throw new Error("TEST · 保存失败，原状态未变");
        if (scene === "版本变化" && writes === 1) {
          record = {
            ...original,
            version: original.version + 1,
            capacity_parcels: 80,
          };
          throw Object.assign(new Error("可接活状态已更新，请重新读取"), {
            status: 409,
            code: "VERSION_CONFLICT",
          });
        }
        const p = options.body as S["AvailabilityInput"];
        record = {
          ...(record ?? original),
          version: (record?.version ?? 0) + 1,
          enabled: p.enabled,
          ...(p.enabled
            ? {
                starts_at: p.starts_at!,
                ends_at: p.ends_at!,
                region_ids: p.region_ids!,
                capacity_parcels: p.capacity_parcels ?? null,
              }
            : {}),
          currently_available:
            p.enabled &&
            Date.parse(p.starts_at!) <= Date.now() &&
            Date.parse(p.ends_at!) > Date.now(),
        };
      }
      if (!record)
        throw Object.assign(new Error("尚未设置"), {
          status: 404,
          code: "NOT_FOUND",
        });
      return record as T;
    };
    return { request, read: () => record, count: () => writes };
  }, [scene]);
  const [editing, setEditing] = useState(true),
    [notice, setNotice] = useState("");
  const header = (
    <>
      {controls}
      <Text style={{ color: tokens.color.textSecondary }}>
        TEST · {scene} · 仅内存，不修改业务库
      </Text>
    </>
  );
  if (editing)
    return (
      <AvailabilityFlow
        request={data.request}
        testControls={header}
        onSaved={() => {
          setNotice("已保存");
          setEditing(false);
        }}
        onCancel={() => {
          setNotice("已取消");
          setEditing(false);
        }}
      />
    );
  const saved = data.read();
  return (
    <PageFrame compact title="TEST · 接活状态">
      {header}
      <Text>
        TEST · {notice} · 写入{data.count()}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>
        {availabilitySummary(saved)}
      </Text>
      {saved?.enabled ? (
        <Text>最多可接：{saved.capacity_parcels ?? "联系确认"}</Text>
      ) : null}
      <ActionButton label="重新设置" onPress={() => setEditing(true)} />
    </PageFrame>
  );
}
