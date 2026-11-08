import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AuthPage, ActionButton } from "../auth/AuthControls";
import { AccountError } from "../auth/api-client";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { DeliveryEditor } from "../requests/DeliveryEditor";
import { DeliveryDetailBody } from "../requests/DeliveryDetailBody";
import { ApplicationSheet } from "../requests/ApplySheet";
import { deliveryFixture } from "../requests/delivery-fixtures";
import { driverFixtures } from "../drivers/fixtures";
type S = components["schemas"];
const scenes = [
  "入口",
  "仓库表单",
  "代送表单",
  "保存重试",
  "版本变化",
  "仓库详情",
  "报名重试",
  "地址失败",
  "长地址",
] as const;
type Scene = (typeof scenes)[number];
export default function DeliveryLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const params = useLocalSearchParams<{ scene?: string }>();
  const [scene, setScene] = useState<Scene>(
      scenes.includes(params.scene as Scene) ? (params.scene as Scene) : "入口",
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
            setRevision((v) => v + 1);
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
          <Text style={{ color: tokens.color.ink, fontSize: 13 }}>{value}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
  return (
    <SceneBody key={`${scene}:${revision}`} scene={scene} controls={controls} />
  );
}

function SceneBody({
  scene,
  controls,
}: {
  scene: Scene;
  controls: React.ReactNode;
}) {
  const seed = useMemo(() => {
    const r = deliveryFixture(
      scene === "代送表单" || scene === "报名重试"
        ? "delivery_handoff"
        : "warehouse_shortage",
    );
    if (["仓库详情", "地址失败", "报名重试", "长地址"].includes(scene))
      r.status = "open";
    if (scene === "长地址" && r.pickup?.kind === "warehouse") {
      r.pickup = {
        ...r.pickup,
        address_line1: "100 TEST Very Long Warehouse Boulevard Building Three",
        city: "TEST City With A Long Name",
        point: null,
        point_source: "unlocated",
      };
      r.price_cents = 123456;
      r.quantity_mode = "unknown";
      r.parcel_count = null;
      r.remaining_parcels = null;
    }
    if (scene === "地址失败" && r.pickup?.kind === "warehouse")
      r.pickup = { ...r.pickup, point: null, point_source: "unlocated" };
    if (scene === "报名重试") {
      r.quantity_mode = "unknown";
      r.parcel_count = null;
      r.remaining_parcels = null;
    }
    return r;
  }, [scene]);
  const [current, setCurrent] = useState(seed),
    [saved, setSaved] = useState(false),
    [applying, setApplying] = useState(scene === "报名重试"),
    [notice, setNotice] = useState(""),
    [reset, setReset] = useState(0);
  const regions = useMemo(
    () =>
      driverFixtures().regions.map((r) => ({
        ...r,
        label: r.label.replace("TEST · ", ""),
      })),
    [],
  );
  const transport = useMemo(() => {
    let record = seed,
      submits = 0,
      applications = 0;
    const run: ContributionRequest = async <T,>(
      path: string,
      options?: { method?: string; body?: unknown },
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const b = options?.body as S["RequestDraftInputV2"] | undefined;
      if (path.includes("/search/")) {
        if (scene === "地址失败") throw new Error("TEST · 地址服务暂不可用");
        const address = {
          address_line1: "2445 E Del Mar Blvd",
          city: "Pasadena",
          state: "CA",
          postal_code: "91107",
        };
        if (path.endsWith("/suggest"))
          return {
            items: [
              {
                provider_result_id: "TEST:warehouse",
                label: "2445 E Del Mar Blvd, Pasadena CA 91107",
                title: address.address_line1,
                subtitle: "Pasadena CA 91107",
                address,
              },
            ],
            attribution: "TEST · 地址候选",
            use_mode: "temporary",
          } as T;
        return {
          address,
          point: { lng: -118.0999, lat: 34.1425 },
          label: "TEST 仓库",
          title: "TEST",
          attribution: "TEST · 临时定位",
          use_mode: "temporary",
          match_status: "unmatched",
          apartments: [],
        } as T;
      }
      if (path.endsWith("/applications")) {
        if (applications++ === 0 && ["报名重试", "保存重试"].includes(scene))
          throw new Error("TEST · 报名未送出，请重试");
        return {
          id: "TEST-application",
          conversation_id: "TEST-conversation",
          status: "applied",
        } as T;
      }
      if (options?.method === "PATCH" || path === "/v1/requests") {
        submits++;
        if (scene === "保存重试" && submits === 1)
          throw new Error("TEST · 保存失败，填写内容已保留");
        if (scene === "版本变化")
          throw new AccountError(
            409,
            "VERSION_CONFLICT",
            "需求已更新，请重新读取后核对",
          );
        if (b) {
          const p = b.pickup;
          record = {
            ...record,
            ...b,
            request_schema_version: 2,
            scenario: b.scenario ?? record.scenario,
            version: record.version + 1,
            pickup:
              p?.kind === "warehouse"
                ? {
                    ...p,
                    address_source:
                      p.address_source === "mapbox_suggestion"
                        ? "provider_permanent"
                        : "publisher_entered",
                    address_version: 1,
                    point:
                      seed.pickup?.kind === "warehouse"
                        ? seed.pickup.point
                        : null,
                    point_source: "persistent_source",
                  }
                : (p ?? record.pickup),
          } as S["RequestDetailV2"];
        }
      }
      if (path.endsWith("/publish"))
        record = { ...record, status: "open", version: record.version + 1 };
      setCurrent(record);
      return record as T;
    };
    return run;
  }, [seed, scene]);
  if (!saved && !["仓库详情", "地址失败", "报名重试", "长地址"].includes(scene))
    return (
      <DeliveryEditor
        key={reset}
        identity="TEST 阿杰"
        testControls={controls}
        request={transport}
        regions={regions}
        initial={scene === "入口" ? null : seed}
        testNotice={`TEST · ${scene} · 仅内存，不发布`}
        onReload={() => {
          setReset((n) => n + 1);
          setNotice("TEST · 已请求重新读取");
        }}
        onDone={(r, published) => {
          setCurrent(r);
          setSaved(true);
          setNotice(published ? "TEST · 发布成功" : "TEST · 草稿已保存");
        }}
      />
    );
  return (
    <AuthPage
      compact
      title="需求详情"
      footer={
        <ActionButton label="报名接活" onPress={() => setApplying(true)} />
      }
    >
      {controls}
      <Text style={{ color: tokens.color.brandText }}>
        TEST · {notice || scene} · 仅内存
      </Text>
      <DeliveryDetailBody
        request={current}
        regions={Object.fromEntries(regions.map((r) => [r.id, r.label]))}
        transport={transport}
      />
      {applying ? (
        <ApplicationSheet
          request={current}
          regionLabel={regions[0]?.label}
          pickupRegionLabel={
            regions.find((r) => r.id === current.pickup_region_id)?.label
          }
          transport={transport}
          onClose={() => setApplying(false)}
          onRefresh={() => {
            setApplying(false);
            setNotice("TEST · 已刷新当前需求");
          }}
          onApplied={() => {
            setApplying(false);
            setNotice("TEST · 报名成功，进入联系");
          }}
        />
      ) : null}
    </AuthPage>
  );
}
