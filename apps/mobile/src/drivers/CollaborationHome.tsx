import {
  HomeWorkspace,
  type WorkspaceControls,
} from "../components/HomeWorkspace";
import { HomeResultList } from "../ui/HomeResultList";
import { HomeResultCard } from "../ui/MapCardFrame";
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
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import HomeMap from "../components/HomeMap";
import { MapTools } from "../components/HomeChrome";
import { ActionButton } from "../ui/Controls";
import { MapStatusRow } from "../ui/MapStatusRow";
import { MapCardFrame } from "../ui/MapCardFrame";
import { MapCardCarousel } from "../ui/MapCardCarousel";
import { compactCardHeight, measuredCardHeight } from "../ui/map-card-layout";
import { cameraAt, type MapCameraSnapshot } from "../components/map-camera";
import { DiscoveryCardContent } from "./DiscoveryCardContent";
import {
  createDiscoveryLoader,
  DISCOVERY_PAGE_LIMIT,
} from "./discovery-loader";
import { typeStyles } from "../ui/foundation";
import { DiscoveryFilters } from "./DiscoveryFilters";
import {
  areaMarkers,
  reconcileDiscovery,
  filterDiscovery,
  defaultFilters,
  selectDiscoveryItem,
  discoveryFocusRegion,
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
  onCamera?: (camera: MapCameraSnapshot) => void;
  testMapStyle?: string;
};
type CollaborationProps = {
  workspace?: WorkspaceControls;
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
};
export function CollaborationHome(p: CollaborationProps) {
  const { session } = useAuth();
  return (
    <DiscoveryHome key={`${session?.user.id ?? "test"}:${p.mode}`} {...p} />
  );
}
function DiscoveryHome(p: CollaborationProps) {
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
  const dimensions = useWindowDimensions();
  const current = p.memory[p.mode],
    filters = current.filters,
    signature = JSON.stringify(filters),
    scopeKey = `${session?.user.id ?? "test"}:${p.mode}:${signature}`;
  const [rows, setRows] = useState<DiscoveryItem[]>([]),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [busy, setBusy] = useState(true),
    [loadedKey, setLoadedKey] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [moreError, setMoreError] = useState<string | null>(null),
    [moreRecovery, setMoreRecovery] = useState<"retry" | "reload">("retry"),
    [cursor, setCursor] = useState<string | null>(null),
    [selectedId, setSelectedId] = useState(current.selectedId),
    [camera, setCamera] = useState<MapCameraSnapshot | undefined>(
      current.camera ??
        ((current.focusPoint ?? p.point ?? p.cameraPoint)
          ? cameraAt((current.focusPoint ?? p.point ?? p.cameraPoint)!)
          : undefined),
    ),
    [revision, setRevision] = useState(0),
    [height, setHeight] = useState(212),
    [width, setWidth] = useState(0),
    [measurements, setMeasurements] = useState<Record<string, number>>({}),
    [clock, setClock] = useState(Date.now()),
    [focusRevision, setFocusRevision] = useState(0);
  const reader = useRef(read);
  reader.current = read;
  const loader = useRef(
      createDiscoveryLoader((path, signal) => reader.current(path, signal)),
    ),
    working = useRef(false),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const load = useCallback(
    async (more = false) => {
      if (more && working.current) return;
      working.current = true;
      setBusy(true);
      setError(null);
      setMoreError(null);
      const view = p.memory[p.mode],
        count = Math.min(DISCOVERY_PAGE_LIMIT, view.pages);
      const result = more
        ? await loader.current.more(p.mode, view.filters)
        : await loader.current.load(p.mode, view.filters, count);
      if (!result || JSON.stringify(view.filters) !== signature) return;
      working.current = false;
      setBusy(false);
      setLoadedKey(scopeKey);
      if (result.status === "error") {
        setError(result.message);
        setRows([]);
        setCursor(null);
        return;
      }
      const unique = reconcileDiscovery(result.rows, view);
      setMoreError(result.moreError ?? null);
      setMoreRecovery(result.moreRecovery ?? "retry");
      setRegions(result.regions);
      setRows(unique);
      setCursor(result.next);
      view.pages = result.pages;
      setSelectedId(view.selectedId);
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
          loader.current.cancel();
          working.current = false;
        } else void load();
      });
      return () => {
        loader.current.cancel();
        working.current = false;
        clearInterval(timer);
        app.remove();
      };
    }, [load]),
  );
  function moveCamera(point: S["Point"]) {
    const next = cameraAt(point, current.camera ?? camera);
    current.camera = next;
    setCamera(next);
    setRevision((v) => v + 1);
  }
  const previousCamera = useRef(p.cameraRevision);
  useEffect(() => {
    if (previousCamera.current === p.cameraRevision) return;
    previousCamera.current = p.cameraRevision;
    if (p.point) moveCamera(p.point);
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
  useEffect(() => {
    if (!scopeReady || scopedError || loading) return;
    const id = selected ? itemId(selected) : null;
    if (id !== current.selectedId) {
      current.selectedId = id;
      setSelectedId(id);
    }
  }, [scopeReady, scopedError, loading, selectedId, selected]);
  function choose(r: DiscoveryItem, focus = true) {
    selectDiscoveryItem(current, r);
    setSelectedId(itemId(r));
    if (focus) {
      const region = discoveryFocusRegion(r, regions, filters.region);
      if (region) moveCamera(region.display_point);
    }
  }
  function open(r: DiscoveryItem) {
    choose(r, false);
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
    if (filterDiscovery(current, f)) {
      const region = regions.find((r) => r.id === f.region);
      if (region) moveCamera(region.display_point);
      setRows([]);
      setCursor(null);
      setSelectedId(null);
      setRevision((v) => v + 1);
    }
    p.onCloseFilters();
  }
  const cardLabel = (r: DiscoveryItem) =>
    r.kind === "request"
      ? `查看${regions.find((x) => x.id === r.request.region_id)?.label ?? "配送"}需求`
      : `查看${r.driver.profile.display_name}的资料`;
  function content(r: DiscoveryItem, onPress = true) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cardLabel(r)}
        disabled={!onPress}
        onPress={onPress ? () => open(r) : undefined}
        style={[s.content, p.list ? { paddingTop: 16 } : { flex: 1 }]}
      >
        <DiscoveryCardContent item={r} regions={regions} />
      </Pressable>
    );
  }
  const measureKey = `${width}:${dimensions.fontScale}:${scopeKey}`;
  const compactHeight = Math.max(
    compactCardHeight(dimensions.fontScale),
    ...visible.map((r) => measurements[measureKey + ":" + itemId(r)] ?? 0),
  );
  const empty = !loading && !scopedError && !visible.length;
  const filtered = Boolean(
    filters.region ||
    filters.day ||
    filters.text.trim() ||
    (p.mode === "找活" && filters.kind),
  );
  const subject = p.mode === "找活" ? "配送需求" : "可接活司机";
  const statusRow = scopedError ? (
    <MapStatusRow
      state="error"
      title={`${subject}暂时无法加载`}
      action={{ label: "重新加载", onPress: () => void load() }}
    />
  ) : loading && !visible.length ? (
    <MapStatusRow state="loading" title={`正在加载${subject}`} />
  ) : empty ? (
    <MapStatusRow
      title={
        filtered
          ? `没有符合筛选的${subject}`
          : p.mode === "找活"
            ? "暂无开放配送需求"
            : "暂无可接活司机"
      }
      action={
        filtered
          ? { label: "清除筛选", onPress: () => apply(defaultFilters()) }
          : undefined
      }
    />
  ) : null;
  const statusCard = statusRow ? (
    <MapCardFrame
      onLayout={
        p.list ? undefined : (e) => setHeight(e.nativeEvent.layout.height + 12)
      }
      style={[s.status, p.list ? s.listStatus : s.mapStatus]}
    >
      {statusRow}
    </MapCardFrame>
  ) : null;
  const paginationFooter = cursor ? (
    current.pages >= DISCOVERY_PAGE_LIMIT ? (
      <Text style={typeStyles.secondary}>结果较多，请缩小筛选范围</Text>
    ) : (
      <View>
        {moreError ? (
          <Text accessibilityRole="alert" style={typeStyles.secondary}>
            {moreRecovery === "reload"
              ? "结果已变化，请重新加载"
              : "加载更多失败，已加载内容保留"}
          </Text>
        ) : null}
        <ActionButton
          label={
            moreError
              ? moreRecovery === "reload"
                ? "重新加载"
                : "重试加载更多"
              : "加载更多"
          }
          secondary
          busy={busy}
          onPress={() => void load(!(moreError && moreRecovery === "reload"))}
        />
      </View>
    )
  ) : null;
  if (p.workspace)
    return (
      <View style={{ flex: 1 }}>
        <HomeWorkspace
          header={p.toolbar}
          controls={p.workspace}
          title={subject}
          count={visible.length || undefined}
          locating={p.locating}
          canRecenter={!!p.point}
          onLocate={() => {
            if (p.point) moveCamera(p.point);
            p.onLocate();
          }}
          map={
            <HomeMap
              point={camera?.center ?? p.cameraPoint ?? p.point}
              cameraState={camera}
              onCameraSnapshot={(snapshot) => {
                current.camera = snapshot;
                if (!camera) setCamera(snapshot);
                if (__DEV__) p.testAdapter?.onCamera?.(snapshot);
              }}
              location={p.point}
              cameraRevision={p.cameraRevision + revision}
              cameraZoom={14}
              topInset={dimensions.height > 650 ? 168 : 108}
              bottomInset={12}
              areaMarkers={markers}
              selectedAreaIds={selectedRegions}
              filteredAreaId={filters.region}
              onAreaSelect={(id) => {
                apply({ ...filters, region: id });
                setFocusRevision((v) => v + 1);
              }}
              testMapStyle={__DEV__ ? p.testAdapter?.testMapStyle : undefined}
            />
          }
        >
          {statusRow ? (
            <View style={{ paddingHorizontal: 16 }}>{statusRow}</View>
          ) : (
            <HomeResultList
              items={visible}
              getKey={itemId}
              selectedKey={selected ? itemId(selected) : null}
              focusRevision={focusRevision}
              memory={current}
              onFocus={(r) => {
                if (itemId(r) !== selectedId) choose(r);
              }}
              header={
                <View>
                  {p.locationNotice ? (
                    <MapStatusRow
                      state="unavailable"
                      title={p.locationNotice}
                      action={{ label: "重新定位", onPress: p.onLocationRetry }}
                    />
                  ) : null}
                  {filtered ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text style={[typeStyles.metadata, { flex: 1 }]}>
                        {[
                          regions.find((r) => r.id === filters.region)?.label,
                          filters.day,
                          filters.text,
                          (
                            {
                              warehouse_shortage: "仓库找司机",
                              delivery_handoff: "途中找人代送",
                            } as Record<string, string>
                          )[filters.kind],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      <ActionButton
                        label="清除筛选"
                        variant="text"
                        onPress={() => apply(defaultFilters())}
                      />
                    </View>
                  ) : null}
                </View>
              }
              renderItem={(r) => (
                <HomeResultCard selected={itemId(r) === selectedId}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={cardLabel(r)}
                    accessibilityState={{ selected: itemId(r) === selectedId }}
                    onPress={() => open(r)}
                  >
                    <DiscoveryCardContent
                      item={r}
                      regions={regions}
                      workspace
                    />
                  </Pressable>
                </HomeResultCard>
              )}
              footer={paginationFooter}
            />
          )}
        </HomeWorkspace>
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
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={[StyleSheet.absoluteFill, p.list ? { opacity: 0 } : undefined]}
        pointerEvents={p.list ? "none" : "auto"}
      >
        <HomeMap
          point={camera?.center ?? p.cameraPoint ?? p.point}
          cameraState={camera}
          onCameraSnapshot={(snapshot) => {
            current.camera = snapshot;
            if (!camera) setCamera(snapshot);
            if (__DEV__) p.testAdapter?.onCamera?.(snapshot);
          }}
          location={p.point}
          cameraRevision={p.cameraRevision + revision}
          cameraZoom={14}
          bottomInset={height}
          topInset={218}
          areaMarkers={markers}
          selectedAreaIds={selectedRegions}
          filteredAreaId={filters.region}
          onAreaSelect={(id) => apply({ ...filters, region: id })}
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
          {!loading && !scopedError && visible.length > 0
            ? ` · 当前结果 ${visible.length}`
            : ""}
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
            if (p.point) moveCamera(p.point);
            p.onLocate();
          }}
        />
      ) : null}
      {p.locationNotice && !p.list ? (
        <View style={[s.locationNotice, { bottom: height + 16 }]}>
          <ActionButton
            label={p.locationNotice}
            variant="text"
            onPress={p.onLocationRetry}
          />
        </View>
      ) : null}
      {statusCard ? (
        p.list ? (
          <View style={s.list}>{statusCard}</View>
        ) : (
          statusCard
        )
      ) : p.list ? (
        <View style={s.list}>
          <ScrollView
            ref={scroll}
            onContentSizeChange={() =>
              scroll.current?.scrollTo({ y: current.scroll, animated: false })
            }
            onScroll={(e) => {
              current.scroll = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={100}
            contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 20 }}
          >
            {visible.map((r) => (
              <MapCardFrame
                key={itemId(r)}
                style={{
                  borderWidth: 1,
                  borderColor:
                    itemId(r) === selectedId
                      ? tokens.color.brandText
                      : tokens.color.border,
                }}
              >
                {content(r)}
              </MapCardFrame>
            ))}
            {paginationFooter}
          </ScrollView>
        </View>
      ) : selected ? (
        <MapCardCarousel
          items={visible}
          getKey={itemId}
          selectedKey={itemId(selected)}
          getAccessibilityLabel={(r, i, count) =>
            `${cardLabel(r)}，第${i + 1}项，共${count}项`
          }
          nextLabel={p.mode === "找活" ? "下一条需求" : "下一位司机"}
          previousLabel={p.mode === "找活" ? "上一条需求" : "上一位司机"}
          expandLabel={cardLabel(selected)}
          onSelect={choose}
          onSwipeStart={() => {}}
          onHeight={setHeight}
          onExpand={() => open(selected)}
          minimumHeight={compactHeight}
          renderPreview={(r) => content(r, false)}
        >
          {() => content(selected)}
        </MapCardCarousel>
      ) : null}
      {!p.list && width > 0 && visible.length ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            left: -10000,
            width: width - (visible.length > 1 ? 64 : 32),
            opacity: 0,
          }}
        >
          {visible.map((r) => (
            <View
              key={itemId(r)}
              style={s.content}
              onLayout={(e) => {
                const h = measuredCardHeight(
                  e.nativeEvent.layout.width,
                  e.nativeEvent.layout.height,
                  compactCardHeight(dimensions.fontScale),
                );
                if (h !== null)
                  setMeasurements((old) =>
                    old[measureKey + ":" + itemId(r)] === h
                      ? old
                      : { ...old, [measureKey + ":" + itemId(r)]: h },
                  );
              }}
            >
              <DiscoveryCardContent item={r} regions={regions} />
            </View>
          ))}
        </View>
      ) : null}
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
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 16, gap: 5 },
  status: {
    paddingHorizontal: tokens.space[16].value,
    paddingVertical: tokens.space[4].value,
  },
  mapStatus: {
    position: "absolute",
    bottom: tokens.space[12].value,
    left: tokens.space[16].value,
    right: tokens.space[16].value,
  },
  listStatus: { margin: tokens.space[16].value },
  list: {
    position: "absolute",
    top: 192,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.color.surface,
  },
  locationNotice: { position: "absolute", left: 16, right: 130 },
});
