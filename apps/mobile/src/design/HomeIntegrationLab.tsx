import { useMemo, useRef, useState } from "react";
import { Text, ScrollView, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import {
  HomeApartmentContent,
  type ApartmentReadingMemory,
} from "../apartments/HomeApartments";
import { ContributionForm } from "../apartments/ContributionForm";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { HomeChrome, type HomeMode } from "../components/HomeChrome";
import { MapModeSwitch } from "../ui/MapControls";
import { ActionButton } from "../ui/Controls";
import { DiscoveryCardContent } from "../drivers/DiscoveryCardContent";
import { PageFrame } from "../ui/PageFrame";
import {
  createDiscoveryMemory,
  type DiscoveryItem,
} from "../drivers/discovery-model";
import { AccountError } from "../auth/errors";
import { localDateTime } from "../requests/presentation";
import { driverFixtures } from "../drivers/fixtures";
import { arrivalAdapter } from "./ArrivalLab";
import { isM7DiscoveryScene, m7Discovery } from "./m7-discovery-fixtures";
type S = components["schemas"];
const point = { lng: -118.2437, lat: 34.0522 };
const ids = [1, 2, 3].map((n) => `11111111-1111-4111-8111-11111111111${n}`);
function apartment(id: string): S["Apartment"] {
  const n = Math.max(0, ids.indexOf(id));
  return {
    id,
    name: "TEST Apartments",
    address_line1: `${100 + n * 2} TEST Arrival Ave`,
    city: "Test City",
    state: "CA",
    postal_code: null,
    point: { lng: point.lng + n * 0.0002, lat: point.lat },
    confidence: "unverified",
  };
}
export default function HomeIntegrationLab() {
  const params = useLocalSearchParams<{
    scene?: string;
    layout?: string;
    mode?: string;
  }>();
  return __DEV__ ? (
    <Lab
      key={`${params.scene}:${params.layout}:${params.mode}`}
      scene={params.scene ?? "normal"}
      workspace={params.layout === "muse"}
      initialMode={
        params.mode === "jobs"
          ? "找活"
          : params.mode === "people"
            ? "找人"
            : "公寓"
      }
    />
  ) : (
    <Redirect href="/" />
  );
}
function Lab({
  scene,
  workspace,
  initialMode,
}: {
  scene: string;
  workspace: boolean;
  initialMode: HomeMode;
}) {
  const [mode, setMode] = useState<HomeMode>(initialMode),
    [list, setList] = useState(false),
    [filters, setFilters] = useState(false),
    [revision, setRevision] = useState(0),
    [reads, setReads] = useState(0),
    [formTarget, setFormTarget] = useState<S["Apartment"] | null>(null),
    [detail, setDetail] = useState<DiscoveryItem | null>(null),
    [returnId, setReturnId] = useState<string | undefined>(
      scene.startsWith("late-initial") ? ids[1] : undefined,
    ),
    [notice, setNotice] = useState("");
  const reading = useRef<ApartmentReadingMemory>({});
  const held = useRef<(() => void)[]>([]);
  const released = useRef(false);
  const mapReads = useRef(0);
  const positionStarts = useRef(0);
  const lastDiscoveryFailure = useRef<number | null>(null);
  const discoveryApartments = useRef(new Map<string, S["Apartment"]>());
  const memory = useRef(createDiscoveryMemory()),
    position = useRef({ ...point }),
    codes = useRef(new Map<string, S["AccessRecord"]>()),
    failedSave = useRef(false),
    failedMore = useRef(false);
  const fixtures = useMemo(() => {
    const f = driverFixtures();
    if (scene === "dtl-pressure") {
      f.drivers.forEach((d) => {
        if (d.availability) {
          d.availability.starts_at = "2026-11-11T07:00:00Z";
          d.availability.ends_at = "2026-11-11T09:00:00Z";
        }
      });
    }
    f.regions.forEach((r, i) => {
      r.label = `TEST 区域${i + 1}`;
      r.display_point = { lng: point.lng + i * 0.001, lat: point.lat + 0.0006 };
    });
    f.drivers = Array.from({ length: 12 }, (_, i) => {
      const d = f.drivers[i % 2]!,
        id = `45333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}`;
      return {
        ...d,
        profile: {
          ...d.profile,
          user_id: id,
          display_name: `TEST 司机${String(i + 1).padStart(2, "0")}`,
        },
        availability: { ...d.availability!, user_id: id },
        regions: i === 0 ? f.regions : [f.regions[i % 2]!],
      };
    });
    const requests = workspace
      ? f.requests.map((r, i): S["RequestSummaryV2"] => ({
          ...r,
          request_schema_version: 2,
          scenario: i ? "warehouse_shortage" : "delivery_handoff",
          task_scope: i ? null : "partial",
          quantity_mode: "exact",
          handoff_mode: "scheduled",
          handoff_date: localDateTime(r.starts_at).date,
          completion_mode: "contact",
          pickup_kind: i ? "warehouse" : "contact_handoff",
        }))
      : f.requests;
    return { ...f, requests };
  }, [workspace, scene]);
  const base = useMemo(
    () =>
      arrivalAdapter(
        scene === "empty"
          ? "无候选"
          : scene === "discovery-error"
            ? "查询失败"
            : scene === "read-retry"
              ? "重试恢复"
              : "多候选",
        () => setReads((n) => n + 1),
      ),
    [scene],
  );
  const request = useMemo<ContributionRequest>(
    () =>
      async <T,>(
        path: string,
        options?: Parameters<ContributionRequest>[1],
      ) => {
        if (options?.signal?.aborted) throw new Error("TEST cancelled");
        const recovery = scene === "discovery-retry";
        if (
          (isM7DiscoveryScene(scene) || recovery) &&
          path.includes("/discover")
        ) {
          const provider = path.endsWith("/mapbox");
          // A normal background retry is throttled to 30 seconds. Only an
          // explicit, earlier retry lifts the synthetic failure in this scene.
          const retryReceived =
            lastDiscoveryFailure.current !== null &&
            Date.now() - lastDiscoveryFailure.current < 28_000;
          const scenario = recovery
            ? provider && retryReceived
              ? "range-200"
              : "range-failed-empty"
            : scene;
          const response = m7Discovery(
            scenario,
            options?.body as S["NearbyInput"],
            provider,
          );
          response.items.forEach((candidate) => {
            if (candidate.apartment)
              discoveryApartments.current.set(
                candidate.apartment.id,
                candidate.apartment,
              );
          });
          if (provider) {
            mapReads.current++;
            if (recovery && !retryReceived)
              lastDiscoveryFailure.current = Date.now();
            setNotice(
              recovery
                ? `TEST 查找${mapReads.current}次 · 定位启动${positionStarts.current}次`
                : `TEST 扩围请求${mapReads.current} · ${response.expansion!.attempted_radii_m.join("→")}`,
            );
          }
          return response as T;
        }
        if (
          (isM7DiscoveryScene(scene) || recovery) &&
          path.endsWith("/map-context")
        ) {
          const id = path.split("/")[3]!;
          const target = discoveryApartments.current.get(id);
          if (!target) throw new Error("TEST · 未知公寓轮廓");
          const { lng, lat } = target.point;
          return {
            apartment_id: id,
            buildings: [
              {
                id: `TEST-building-${id}`,
                street_number: target.address_line1.split(" ")[0],
                label_point: target.point,
                verified_at: new Date().toISOString(),
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
              },
            ],
          } as T;
        }
        if (
          scene === "slow-switch" &&
          !released.current &&
          path.includes(ids[0]!) &&
          (path.endsWith("/access-records") || path.endsWith("/map-context"))
        ) {
          const response = await base.read(path, options);
          // Deliberately ignore cancellation: prove late responses are discarded
          // by the real production component, not by this test transport.
          await new Promise<void>((resolve) => {
            held.current.push(resolve);
            setNotice(`TEST 100响应等待释放 · ${held.current.length}`);
          });
          return response as T;
        }
        if (path.endsWith("/access-records") && options?.method !== "POST") {
          if (scene === "dtl-pressure") {
            const response = (await base.read(
              path,
              options,
            )) as S["AccessList"];
            return {
              ...response,
              items: response.items.map((r) => ({
                ...r,
                value: "*0000123456789012345678901234567#",
                scope: { label: "大堂门" },
              })),
            } as T;
          }
          if (scene === "read-error") throw new Error("TEST 读取失败");
          if (scene === "paused")
            return {
              config_version: 1,
              next_cursor: null,
              items: [],
              sharing_paused: true,
            } as T;
        }
        if (path === "/v1/regions?limit=100")
          return { items: fixtures.regions, next_cursor: null } as T;
        if (
          path.startsWith("/v1/drivers?") ||
          path.startsWith("/v1/requests?")
        ) {
          const u = new URL(path, "http://test.invalid"),
            region = u.searchParams.get("region_id");
          const isDriver = path.includes("/drivers?"),
            day = u.searchParams.get("day");
          let items: (S["Driver"] | S["Request"] | S["RequestSummaryV2"])[] =
            scene === "empty"
              ? []
              : isDriver
                ? fixtures.drivers.filter(
                    (d) =>
                      (!region || d.regions.some((r) => r.id === region)) &&
                      (!u.searchParams.get("carrier") ||
                        d.profile.experience.some((e) =>
                          e.carrier
                            .toLowerCase()
                            .includes(
                              u.searchParams.get("carrier")!.toLowerCase(),
                            ),
                        )) &&
                      (!day ||
                        localDateTime(d.availability?.starts_at ?? null)
                          .date === day),
                  )
                : fixtures.requests.filter(
                    (r) =>
                      (!region || r.region_id === region) &&
                      (!u.searchParams.get("scenario") ||
                        ("scenario" in r &&
                          r.scenario === u.searchParams.get("scenario"))) &&
                      (!day || localDateTime(r.starts_at).date === day) &&
                      (!u.searchParams.get("query") ||
                        (r.carrier ?? "")
                          .toLowerCase()
                          .includes(
                            u.searchParams.get("query")!.toLowerCase(),
                          )),
                  );
          if (scene.startsWith("pages-") && !isDriver)
            items = items
              .filter(
                (r): r is S["Request"] | S["RequestSummaryV2"] => "id" in r,
              )
              .flatMap((r) =>
                Array.from({ length: 6 }, (_, n) => ({
                  ...r,
                  id: `${r.id.slice(0, -3)}${((Number(r.id.slice(-3)) + n * 100) % 1000).toString().padStart(3, "0")}`,
                  route_label: `TEST 分页${n + 1}`,
                })),
              );
          const offset = Number(u.searchParams.get("cursor") ?? 0);
          if (scene === "pages-retry" && offset && !failedMore.current) {
            failedMore.current = true;
            throw new Error("TEST 下一页失败");
          }
          if (scene === "pages-denied" && offset)
            throw new AccountError(403, "FORBIDDEN", "TEST 无权查看");
          if (scene === "pages-slow" && offset)
            await new Promise((r) => setTimeout(r, 3500));
          const size = scene.startsWith("pages-") ? 2 : items.length;
          return {
            items: items.slice(offset, offset + size),
            next_cursor:
              offset + size < items.length ? String(offset + size) : null,
          } as T;
        }
        const id = path.split("/")[3]!;
        if (path.endsWith("/access-records") && options?.method === "POST") {
          if (scene === "save-retry" && !failedSave.current) {
            failedSave.current = true;
            throw new Error("TEST · 暂时无法保存，请重试");
          }
          const body = options.body as {
            value: string;
            scope?: { label: string };
          };
          const record: S["AccessRecord"] = {
            id: "22222222-2222-4222-8222-222222222229",
            apartment_id: id,
            method: "keypad",
            value: body.value,
            scope: body.scope ?? { label: "行人门" },
            contributed_at: new Date().toISOString(),
            last_success_at: null,
            last_failure_at: null,
            effective_useful: false,
            my_feedback: null,
            verification_label: "community_contribution",
            contributor_display_name: "TEST 本人",
          };
          codes.current.set(id, record);
          return {
            outcome: "created_active",
            access_record_id: record.id,
            contributed_at: record.contributed_at,
          } as T;
        }
        if (
          options?.method !== "POST" &&
          /^\/v1\/apartments\/[^/]+$/.test(path)
        ) {
          if (scene.startsWith("late-initial"))
            await new Promise((resolve) => setTimeout(resolve, 30000));
          return apartment(id) as T;
        }
        if (path.endsWith("/access-records") && codes.current.has(id)) {
          setReads((n) => n + 1);
          return { items: [codes.current.get(id)] } as T;
        }
        return (await base.read(path, options)) as T;
      },
    [base, fixtures, scene],
  );
  if (formTarget)
    return (
      <ContributionForm
        initialApartmentId={formTarget.id}
        canContribute
        request={request}
        onBack={() => {
          setReturnId(formTarget.id);
          setFormTarget(null);
        }}
        onPrivateSaved={() => {
          setFormTarget(null);
        }}
        onShared={(id) => {
          setReturnId(id);
          setMode("公寓");
          setList(false);
          setFormTarget(null);
          setRevision((n) => n + 1);
          setNotice(`TEST · 已回到${apartment(id).address_line1}`);
        }}
      />
    );
  if (detail)
    return (
      <PageFrame compact title="TEST · 详情回程" onBack={() => setDetail(null)}>
        <DiscoveryCardContent item={detail} regions={fixtures.regions} />
        <Text>仅内存测试，不报名、不联系。</Text>
      </PageFrame>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <Text
        maxFontSizeMultiplier={1}
        style={{ paddingHorizontal: 12, fontSize: 12 }}
      >
        TEST · {scene} · {workspace ? "V3.5 M7" : "R4-05组合"} · 查码{reads} ·{" "}
        {notice}
      </Text>
      {scene === "slow-switch" ? (
        <ActionButton
          label="释放100迟到响应"
          variant="text"
          onPress={() => {
            released.current = true;
            const pending = held.current.splice(0);
            pending.forEach((resolve) => resolve());
            setNotice(`TEST 已释放100响应${pending.length}`);
          }}
        />
      ) : null}
      {!workspace ? (
        <ScrollView horizontal style={{ maxHeight: 44 }}>
          <ActionButton
            label="移到街道"
            variant="text"
            onPress={() => {
              position.current = { ...point, lng: point.lng + 0.006 };
              setNotice("TEST 街道位置");
            }}
          />
          <ActionButton
            label="返回样本"
            variant="text"
            onPress={() => {
              position.current = { ...point };
              setNotice("TEST 样本位置");
            }}
          />
        </ScrollView>
      ) : null}
      <HomeApartmentContent
        key={revision}
        workspace={
          workspace
            ? {
                modes: (
                  <MapModeSwitch
                    fullWidth
                    icons={{ 查码: "key", 找活: "box", 找人: "people" }}
                    items={["查码", "找活", "找人"]}
                    selected={mode === "公寓" ? "查码" : mode}
                    onSelect={(v) => {
                      setMode(v === "查码" ? "公寓" : (v as HomeMode));
                      setFilters(false);
                    }}
                  />
                ),
                onFilter: () => setFilters(true),
              }
            : undefined
        }
        mode={mode}
        list={list}
        apartmentId={returnId}
        discoveryMemory={memory.current}
        readingMemory={reading.current}
        filtersOpen={filters}
        onCloseFilters={() => setFilters(false)}
        onToggleList={() => setList((v) => !v)}
        testData={{
          read: request,
          canRead: scene !== "denied",
          userId: "99999999-9999-4999-8999-999999999999",
          onAdd: setFormTarget,
          collaboration: {
            read: (path, signal) => request(path, { signal }),
            onOpen: (item) => {
              setDetail(item);
              setNotice("TEST · 详情返回");
            },
          },
          watchPosition: async (onFix, _onError, signal) => {
            positionStarts.current++;
            const emit = () => {
              if (!signal.aborted)
                onFix(
                  {
                    timestamp: Date.now(),
                    coords: {
                      longitude: position.current.lng,
                      latitude: position.current.lat,
                      accuracy: 5,
                    },
                  },
                  false,
                );
            };
            emit();
            const timer = setInterval(emit, 2000);
            signal.addEventListener("abort", () => clearInterval(timer), {
              once: true,
            });
          },
        }}
        toolbar={
          <HomeChrome
            workspace={workspace}
            mode={mode}
            list={list}
            onToggleList={() => setList((v) => !v)}
            onSearch={() => setFilters(true)}
            onMode={(m) => {
              setMode(m);
              setList(false);
              setFilters(false);
            }}
          />
        }
      />
      {workspace ? (
        <View
          style={{
            height: 60,
            flexDirection: "row",
            borderTopWidth: 1,
            borderColor: tokens.color.border,
            alignItems: "center",
          }}
        >
          {(
            [
              ["home", "首页"],
              ["people", "司机圈"],
              ["person", "我的"],
            ] as const
          ).map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <Icon
                name={icon}
                color={
                  i === 0 ? tokens.color.brandText : tokens.color.textSecondary
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  color:
                    i === 0
                      ? tokens.color.brandText
                      : tokens.color.textSecondary,
                }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
