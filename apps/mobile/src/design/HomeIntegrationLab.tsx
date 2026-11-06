import { useMemo, useRef, useState } from "react";
import { Text, ScrollView } from "react-native";
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
import { ActionButton } from "../ui/Controls";
import { DiscoveryCardContent } from "../drivers/DiscoveryCardContent";
import { PageFrame } from "../ui/PageFrame";
import {
  createDiscoveryMemory,
  type DiscoveryItem,
} from "../drivers/discovery-model";
import { driverFixtures } from "../drivers/fixtures";
import { arrivalAdapter } from "./ArrivalLab";
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
  const params = useLocalSearchParams<{ scene?: string }>();
  return __DEV__ ? (
    <Lab key={params.scene ?? "normal"} scene={params.scene ?? "normal"} />
  ) : (
    <Redirect href="/" />
  );
}
function Lab({ scene }: { scene: string }) {
  const [mode, setMode] = useState<HomeMode>("公寓"),
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
  const memory = useRef(createDiscoveryMemory()),
    position = useRef({ ...point }),
    codes = useRef(new Map<string, S["AccessRecord"]>()),
    failedSave = useRef(false);
  const fixtures = useMemo(() => {
    const f = driverFixtures();
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
    return f;
  }, []);
  const base = useMemo(
    () =>
      arrivalAdapter(scene === "read-error" ? "读取失败" : "多候选", () =>
        setReads((n) => n + 1),
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
        if (path === "/v1/regions?limit=100")
          return { items: fixtures.regions, next_cursor: null } as T;
        if (
          path.startsWith("/v1/drivers?") ||
          path.startsWith("/v1/requests?")
        ) {
          const u = new URL(path, "http://test.invalid"),
            region = u.searchParams.get("region_id");
          return {
            items: path.includes("/drivers?")
              ? fixtures.drivers.filter(
                  (d) => !region || d.regions.some((r) => r.id === region),
                )
              : fixtures.requests.filter(
                  (r) => !region || r.region_id === region,
                ),
            next_cursor: null,
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
      <Text style={{ paddingHorizontal: 12, fontSize: 12 }}>
        TEST · R4-05组合 · 查码{reads} · {notice}
      </Text>
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
      <HomeApartmentContent
        key={revision}
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
    </SafeAreaView>
  );
}
