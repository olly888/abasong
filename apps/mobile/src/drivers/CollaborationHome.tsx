import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import HomeMap from "../components/HomeMap";
import { MapTools } from "../components/HomeChrome";
import { ActionButton, FormError } from "../ui/Controls";
import { RequestCard } from "../requests/RequestUi";
import { typeStyles } from "../ui/foundation";
import { DriverSummary } from "./DriverSummary";
import { DiscoveryFilters } from "./DiscoveryFilters";
import {
  areaMarkers,
  discoveryPath,
  itemId,
  itemRegions,
  validItem,
  type DiscoveryItem,
  type DiscoveryMemory,
  type Filters,
  type SupportMode,
} from "./discovery-model";
type S = components["schemas"];
export type DiscoveryAdapter = {
  read: (path: string, signal: AbortSignal) => Promise<unknown>;
  onOpen?: (item: DiscoveryItem) => void;
  testMapStyle?: string;
};
export function CollaborationHome(p: {
  mode: SupportMode;
  list: boolean;
  toolbar: ReactNode;
  memory: DiscoveryMemory;
  filtersOpen: boolean;
  onCloseFilters: () => void;
  onToggleList: () => void;
  point?: S["Point"];
  cameraPoint?: S["Point"];
  cameraRevision: number;
  onLocate: () => void;
  locating: boolean;
  locationNotice?: string | null;
  onLocationRetry: () => void;
  testAdapter?: DiscoveryAdapter;
  onSetAvailability?: () => void;
}) {
  const { session } = useAuth();
  const read = useMemo(
    () =>
      p.testAdapter && __DEV__
        ? p.testAdapter.read
        : (path: string, signal: AbortSignal) => {
            if (!session) throw new Error("请先登录");
            return dataRequest(session, path, { signal });
          },
    [session?.access_token, p.testAdapter],
  );
  const current = p.memory[p.mode],
    filters = current.filters,
    signature = JSON.stringify(filters),
    scopeKey = `${session?.user.id ?? "test"}:${p.mode}:${signature}`;
  const [rows, setRows] = useState<DiscoveryItem[]>([]),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [busy, setBusy] = useState(true),
    [loadedKey, setLoadedKey] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [selectedId, setSelectedId] = useState(current.selectedId),
    [focusPoint, setFocusPoint] = useState<S["Point"] | undefined>(
      current.focusPoint ?? p.point ?? p.cameraPoint,
    ),
    [revision, setRevision] = useState(0),
    [height, setHeight] = useState(220),
    [clock, setClock] = useState(Date.now());
  const control = useRef<AbortController | null>(null),
    generation = useRef(0),
    working = useRef(false),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const load = useCallback(
    async (more = false) => {
      const g = ++generation.current;
      control.current?.abort();
      const c = new AbortController();
      control.current = c;
      working.current = true;
      setBusy(true);
      setError(null);
      const view = p.memory[p.mode],
        count = Math.min(5, view.pages + (more ? 1 : 0)),
        f = { ...view.filters };
      try {
        const regionPage = (await read(
          "/v1/regions?limit=100",
          c.signal,
        )) as S["RegionPage"];
        const all: DiscoveryItem[] = [];
        let next: string | null = null;
        for (let i = 0; i < count; i++) {
          const result = (await read(
            discoveryPath(p.mode, f, next ?? undefined),
            c.signal,
          )) as S["RequestPage"] | S["DriverPage"];
          all.push(
            ...(p.mode === "找活"
              ? (result as S["RequestPage"]).items.map((request) => ({
                  kind: "request" as const,
                  request,
                }))
              : (result as S["DriverPage"]).items.map((driver) => ({
                  kind: "driver" as const,
                  driver,
                }))),
          );
          next = result.next_cursor;
          if (!next) break;
        }
        if (g !== generation.current || c.signal.aborted) return;
        const unique = [
          ...new Map(all.map((r) => [itemId(r), r])).values(),
        ].filter((r) => validItem(r));
        setRegions(regionPage.items);
        setRows(unique);
        setLoadedKey(scopeKey);
        setCursor(next);
        view.pages = count;
        view.selectedId = unique.some((r) => itemId(r) === view.selectedId)
          ? view.selectedId
          : unique[0]
            ? itemId(unique[0])
            : null;
        setSelectedId(view.selectedId);
      } catch (e) {
        if (g === generation.current && !c.signal.aborted) {
          setError(e instanceof Error ? e.message : "暂时无法加载，请重试");
          setRows([]);
          setCursor(null);
          setLoadedKey(scopeKey);
        }
      } finally {
        if (g === generation.current) {
          working.current = false;
          setBusy(false);
        }
      }
    },
    [read, p.mode, p.memory, signature, scopeKey],
  );
  useFocusEffect(
    useCallback(() => {
      setSelectedId(p.memory[p.mode].selectedId);
      void load();
      const timer = setInterval(() => {
        setClock(Date.now());
        if (AppState.currentState === "active" && !working.current) void load();
      }, 15000);
      const app = AppState.addEventListener("change", (s) => {
        if (s !== "active") {
          generation.current++;
          control.current?.abort();
          working.current = false;
        } else void load();
      });
      return () => {
        generation.current++;
        control.current?.abort();
        working.current = false;
        clearInterval(timer);
        app.remove();
      };
    }, [load]),
  );
  const previousCamera = useRef(p.cameraRevision);
  useEffect(() => {
    if (previousCamera.current === p.cameraRevision) return;
    previousCamera.current = p.cameraRevision;
    current.focusPoint = undefined;
    setFocusPoint(undefined);
    setRevision((v) => v + 1);
  }, [p.cameraRevision]);
  useEffect(() => {
    const now = Date.now();
    const boundaries = rows
      .flatMap((r) =>
        r.kind === "request"
          ? [Date.parse(r.request.expires_at ?? "")]
          : [
              Date.parse(r.driver.availability?.starts_at ?? ""),
              Date.parse(r.driver.availability?.ends_at ?? ""),
            ],
      )
      .filter((t) => Number.isFinite(t) && t > now);
    if (!boundaries.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.min(...boundaries) - now + 25),
    );
    return () => clearTimeout(timer);
  }, [rows, clock]);
  const scopeReady = loadedKey === scopeKey,
    loading = busy || !scopeReady,
    scopedError = scopeReady ? error : null,
    visible = scopeReady
      ? rows.filter(
          (r) =>
            r.kind === (p.mode === "找活" ? "request" : "driver") &&
            validItem(r, clock),
        )
      : [],
    selected = visible.find((r) => itemId(r) === selectedId) ?? visible[0],
    markers = areaMarkers(visible, regions),
    selectedRegions = selected ? itemRegions(selected) : [];
  function choose(r: DiscoveryItem) {
    current.selectedId = itemId(r);
    setSelectedId(itemId(r));
    const region = regions.find((x) => itemRegions(r).includes(x.id));
    if (region) {
      current.focusPoint = region.display_point;
      setFocusPoint(region.display_point);
      setRevision((v) => v + 1);
    }
  }
  function open(r: DiscoveryItem) {
    choose(r);
    if (__DEV__ && p.testAdapter?.onOpen) {
      p.testAdapter.onOpen(r);
      return;
    }
    router.push(
      r.kind === "request"
        ? { pathname: "/requests/[id]", params: { id: r.request.id } }
        : {
            pathname: "/drivers/[id]",
            params: { id: r.driver.profile.user_id },
          },
    );
  }
  function apply(f: Filters) {
    current.filters = f;
    current.selectedId = null;
    current.scroll = 0;
    current.pages = 1;
    current.focusPoint = regions.find((r) => r.id === f.region)?.display_point;
    setFocusPoint(current.focusPoint ?? p.point);
    setRows([]);
    setCursor(null);
    setSelectedId(null);
    p.onCloseFilters();
    setRevision((v) => v + 1);
  }
  function card(r: DiscoveryItem) {
    return r.kind === "request" ? (
      <RequestCard
        request={r.request}
        region={regions.find((x) => x.id === r.request.region_id)?.label}
        pickupRegion={
          regions.find((x) => x.id === r.request.pickup_region_id)?.label
        }
        onPress={() => open(r)}
      />
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看${r.driver.profile.display_name}的资料`}
        onPress={() => open(r)}
        style={s.card}
      >
        <DriverSummary driver={r.driver} compact />
      </Pressable>
    );
  }
  const empty = !loading && !scopedError && !visible.length;
  return (
    <View style={{ flex: 1 }}>
      <View
        style={[StyleSheet.absoluteFill, p.list ? { opacity: 0 } : undefined]}
        pointerEvents={p.list ? "none" : "auto"}
      >
        <HomeMap
          point={focusPoint ?? p.cameraPoint ?? p.point}
          location={p.point}
          cameraRevision={p.cameraRevision + revision}
          cameraZoom={14}
          bottomInset={height}
          topInset={218}
          areaMarkers={markers}
          selectedAreaIds={selectedRegions}
          onAreaSelect={(id) => {
            const item = visible.find((r) => itemRegions(r).includes(id));
            if (item) choose(item);
          }}
          testMapStyle={__DEV__ ? p.testAdapter?.testMapStyle : undefined}
        />
      </View>
      {p.toolbar}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 132,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            typeStyles.metadata,
            {
              backgroundColor: tokens.color.surface,
              padding: 8,
              borderRadius: 8,
              flexShrink: 1,
            },
          ]}
        >
          {regions.find((r) => r.id === filters.region)?.label ?? "全部区域"}
          {filters.day ? ` · ${filters.day}` : ""}
          {filters.text ? ` · ${filters.text}` : ""}
        </Text>
        {p.mode === "找人" ? (
          <ActionButton
            label="我能接活"
            variant="secondary"
            onPress={
              p.onSetAvailability ??
              (() => router.push("/account/availability"))
            }
          />
        ) : null}
      </View>
      {!p.list ? (
        <MapTools
          bottom={height + 16}
          locating={p.locating}
          canRecenter={!!p.point}
          onLocate={() => {
            current.focusPoint = undefined;
            setFocusPoint(undefined);
            p.onLocate();
          }}
        />
      ) : null}
      <View
        onLayout={(e) => {
          if (!p.list) setHeight(e.nativeEvent.layout.height);
        }}
        style={[
          s.panel,
          p.list ? { top: 192, maxHeight: undefined } : undefined,
        ]}
      >
        {scopedError ? (
          <>
            <FormError message={scopedError} />
            <ActionButton
              label="重新加载"
              disabled={busy}
              variant="text"
              onPress={() => void load()}
            />
          </>
        ) : loading && !visible.length ? (
          <Text style={typeStyles.secondary}>
            正在加载{p.mode === "找活" ? "临时支援" : "可用司机"}
          </Text>
        ) : empty ? (
          <Text style={typeStyles.body}>
            {p.mode === "找活"
              ? "当前筛选下暂无开放需求"
              : "当前筛选下暂无可用司机"}
          </Text>
        ) : p.list ? (
          <ScrollView
            ref={scroll}
            onContentSizeChange={() =>
              scroll.current?.scrollTo({ y: current.scroll, animated: false })
            }
            onScroll={(e) => {
              current.scroll = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={100}
            contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
          >
            {visible.map((r) => (
              <View
                key={itemId(r)}
                style={
                  itemId(r) === selectedId
                    ? {
                        borderLeftWidth: 3,
                        borderColor: tokens.color.brandPrimary,
                        paddingLeft: 5,
                      }
                    : undefined
                }
              >
                {card(r)}
              </View>
            ))}
            {cursor && current.pages < 5 ? (
              <ActionButton
                label="加载更多"
                secondary
                busy={busy}
                onPress={() => void load(true)}
              />
            ) : cursor ? (
              <Text style={typeStyles.secondary}>请选择区域缩小范围</Text>
            ) : null}
          </ScrollView>
        ) : selected ? (
          <>
            {card(selected)}
            <ActionButton
              label={p.mode === "找活" ? "查看需求列表" : "查看司机列表"}
              variant="text"
              onPress={p.onToggleList}
            />
          </>
        ) : null}
        {p.mode === "找人" && !p.list ? (
          <Text style={typeStyles.metadata}>
            地图按声明区域展示，不代表司机当前位置。
          </Text>
        ) : null}
        {p.locationNotice && !p.list ? (
          <ActionButton
            label={p.locationNotice}
            variant="text"
            onPress={p.onLocationRetry}
          />
        ) : null}
      </View>
      {p.filtersOpen ? (
        <DiscoveryFilters
          key={p.mode + signature}
          mode={p.mode}
          filters={filters}
          regions={regions}
          onApply={apply}
          onClose={p.onCloseFilters}
        />
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 8,
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "65%",
  },
  card: {
    padding: 16,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  link: { ...typeStyles.label, color: tokens.color.brandPrimary },
});
