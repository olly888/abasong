import { useEffect, useMemo, useRef, useState } from "react";
import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { tokens } from "@abasong/ui";
import { HomeChrome, type HomeMode } from "../components/HomeChrome";
import {
  CollaborationHome,
  type DiscoveryAdapter,
} from "../drivers/CollaborationHome";
import {
  createDiscoveryMemory,
  type DiscoveryItem,
} from "../drivers/discovery-model";
import { driverFixtures } from "../drivers/fixtures";
import { AvailabilityEditor } from "../drivers/AvailabilityEditor";
import { DriverProfileView } from "../drivers/DriverProfileView";
import {
  availabilityFields,
  availabilityPayload,
} from "../drivers/availability-fields";
import { ActionButton } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";
import { DiscoveryCardContent } from "../drivers/DiscoveryCardContent";
export default function DriverDiscoveryLab() {
  const params = useLocalSearchParams<{ case?: string; mode?: string }>(),
    fixtures = useMemo(() => {
      const f = driverFixtures();
      f.drivers[0]!.regions = f.regions;
      f.drivers[0]!.availability!.region_ids = f.regions.map((r) => r.id);
      f.drivers.push({
        ...f.drivers[1]!,
        profile: {
          ...f.drivers[1]!.profile,
          user_id: "45333333-3333-4333-8333-333333333339",
          display_name: "TEST Mia",
        },
        regions: [f.regions[0]!],
        availability: {
          ...f.drivers[1]!.availability!,
          user_id: "45333333-3333-4333-8333-333333333339",
          region_ids: [f.regions[0]!.id],
        },
      });
      f.requests.push({
        ...f.requests[0]!,
        id: "45444444-4444-4444-8444-444444444449",
        price_cents: 190,
        route_label: "TEST-03",
      });
      return f;
    }, []),
    memory = useRef(createDiscoveryMemory()),
    failure = useRef(false),
    slow = useRef(false),
    empty = useRef(false);
  const [selectedRequest, setSelectedRequest] = useState(fixtures.requests[0]!);
  const [queryNotice, setQueryNotice] = useState("全部区域");
  const [cameraNotice, setCameraNotice] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(fixtures.drivers[0]!);
  const [testRevision, setTestRevision] = useState(0);
  const [mode, setMode] = useState<HomeMode>("找人"),
    [list, setList] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(
      params.case === "availability"
        ? "availability"
        : params.case === "profile"
          ? "profile"
          : "home",
    ),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(() =>
      availabilityFields(fixtures.drivers[0]!.availability),
    ),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    slow.current = params.case === "slow";
    empty.current = params.case === "empty";
    failure.current = params.case === "error";
    setTestRevision((v) => v + 1);
  }, [params.case]);
  useEffect(() => {
    if (params.mode === "jobs") setMode("找活");
    if (params.mode === "people") setMode("找人");
  }, [params.mode]);
  const adapter = useMemo<DiscoveryAdapter>(
    () => ({
      testMapStyle: JSON.stringify({
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#F0F0F0" },
          },
        ],
      }),
      read: async (path) => {
        if (slow.current)
          await new Promise((resolve) => setTimeout(resolve, 3500));
        if (failure.current) throw new Error("TEST · 暂时无法加载，请重试");
        const u = new URL(path, "http://test.invalid");
        if (u.pathname === "/v1/regions")
          return { items: fixtures.regions, next_cursor: null };
        setQueryNotice(
          fixtures.regions.find((r) => r.id === u.searchParams.get("region_id"))
            ?.label ?? "全部区域",
        );
        if (empty.current) return { items: [], next_cursor: null };
        if (u.pathname === "/v1/requests")
          return {
            items: fixtures.requests.filter(
              (r) =>
                (!u.searchParams.get("region_id") ||
                  r.region_id === u.searchParams.get("region_id")) &&
                (!u.searchParams.get("kind") ||
                  r.kind === u.searchParams.get("kind")),
            ),
            next_cursor: null,
          };
        return {
          items: fixtures.drivers.filter(
            (d) =>
              (!u.searchParams.get("region_id") ||
                d.availability?.region_ids.includes(
                  u.searchParams.get("region_id")!,
                )) &&
              (!u.searchParams.get("carrier") ||
                d.profile.experience.some((e) =>
                  e.carrier
                    .toLowerCase()
                    .includes(u.searchParams.get("carrier")!.toLowerCase()),
                )),
          ),
          next_cursor: null,
        };
      },
      onOpen: (item: DiscoveryItem) => {
        setNotice(
          item.kind === "driver"
            ? "TEST · 已打开司机资料"
            : "TEST · 已打开需求详情",
        );
        if (item.kind === "driver") {
          setSelectedProfile(item.driver);
          setPage("profile");
        } else {
          setSelectedRequest(item.request);
          setPage("request");
        }
      },
      onCamera: (snapshot) => {
        const area = fixtures.regions.find(
          (r) =>
            Math.abs(r.display_point.lng - snapshot.center.lng) < 0.0001 &&
            Math.abs(r.display_point.lat - snapshot.center.lat) < 0.0001,
        );
        const nearMe =
          Math.abs(
            fixtures.regions[0]!.display_point.lng +
              0.002 -
              snapshot.center.lng,
          ) < 0.0001 &&
          Math.abs(
            fixtures.regions[0]!.display_point.lat - snapshot.center.lat,
          ) < 0.0001;
        setCameraNotice(
          `${nearMe ? "TEST蓝点" : (area?.label ?? "手动视角")} Z${snapshot.zoom.toFixed(2)} H${snapshot.heading.toFixed(0)}`,
        );
      },
    }),
    [fixtures, testRevision],
  );
  if (page === "availability")
    return (
      <AvailabilityEditor
        onBack={() => setPage("home")}
        form={form}
        regions={fixtures.regions}
        busy={false}
        error={error}
        status={notice}
        onChange={setForm}
        onReload={() => {
          setForm(availabilityFields(fixtures.drivers[0]!.availability));
          setNotice("TEST · 已重新读取");
        }}
        onSave={() => {
          try {
            availabilityPayload(form, 1);
            if (failure.current) throw new Error("TEST · 保存失败，内容已保留");
            setError(null);
            setNotice("TEST · 已保存，未写入服务");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    );
  if (page === "request")
    return (
      <PageFrame compact title="TEST · 需求详情" onBack={() => setPage("home")}>
        <DiscoveryCardContent
          item={{ kind: "request", request: selectedRequest }}
          regions={fixtures.regions}
        />
        <Text>仅核对详情返回，不报名、不联系任何人。</Text>
      </PageFrame>
    );
  if (page === "profile")
    return (
      <DriverProfileView
        onBack={() => setPage("home")}
        driver={selectedProfile}
        busy={false}
        error={notice || null}
        canContact
        onReload={() => {}}
        onContact={() => setNotice("TEST · 已触发联系，不创建会话")}
      />
    );
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: tokens.color.surface,
        width: params.case === "narrow" ? 320 : undefined,
        alignSelf: params.case === "narrow" ? "center" : "stretch",
      }}
    >
      <Text style={{ fontSize: 12, paddingHorizontal: 16 }}>
        TEST · R4-04 · 仅内存 · 查询{queryNotice} · {cameraNotice}
        {notice ? ` · ${notice}` : ""}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48 }}
        contentContainerStyle={{ paddingHorizontal: 8, flexDirection: "row" }}
      >
        <ActionButton
          label="正常"
          variant="text"
          onPress={() => {
            slow.current = false;
            failure.current = false;
            empty.current = false;
            setTestRevision((v) => v + 1);
          }}
        />
        <ActionButton
          label="慢网"
          variant="text"
          onPress={() => {
            slow.current = !slow.current;
            setNotice(slow.current ? "慢网3.5秒" : "正常速度");
            setTestRevision((v) => v + 1);
          }}
        />
        <ActionButton
          label="空结果"
          variant="text"
          onPress={() => {
            empty.current = !empty.current;
            setTestRevision((v) => v + 1);
          }}
        />
        <ActionButton
          label="设置时段"
          variant="text"
          onPress={() => setPage("availability")}
        />
        <ActionButton
          label="切换失败"
          variant="text"
          onPress={() => {
            failure.current = !failure.current;
            setNotice(
              failure.current ? "TEST · 下次读取失败" : "TEST · 已恢复",
            );
            setTestRevision((v) => v + 1);
          }}
        />
        <ActionButton
          label="3秒到期"
          variant="text"
          onPress={() => {
            fixtures.drivers.forEach((d) => {
              if (d.availability)
                d.availability.ends_at = new Date(
                  Date.now() + 3000,
                ).toISOString();
            });
            setNotice("TEST · 全部时段将在3秒后到期");
            setTestRevision((v) => v + 1);
          }}
        />
      </ScrollView>
      <CollaborationHome
        mode={mode === "找活" ? "找活" : "找人"}
        list={list}
        memory={memory.current}
        filtersOpen={filtersOpen}
        onCloseFilters={() => setFiltersOpen(false)}
        onToggleList={() => setList((v) => !v)}
        point={{
          lng: fixtures.regions[0]!.display_point.lng + 0.002,
          lat: fixtures.regions[0]!.display_point.lat,
        }}
        cameraPoint={fixtures.regions[0]!.display_point}
        cameraRevision={revision}
        onLocate={() => setRevision((v) => v + 1)}
        locating={false}
        onLocationRetry={() => {}}
        onSetAvailability={() => setPage("availability")}
        testAdapter={adapter}
        toolbar={
          <HomeChrome
            mode={mode}
            list={list}
            onMode={(m) => {
              if (m === "公寓") {
                setNotice("TEST · 公寓流程沿用原入口");
                return;
              }
              setMode(m);
              setList(false);
            }}
            onToggleList={() => setList((v) => !v)}
            onSearch={() => setFiltersOpen(true)}
          />
        }
      />
    </SafeAreaView>
  );
}
