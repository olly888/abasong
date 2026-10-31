import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Linking,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import HomeMap from "../components/HomeMap";
import type { HomeMode } from "../components/HomeChrome";
import { readDevicePosition } from "./device-position";
import { acquireForegroundLocation } from "./foreground-location";
import {
  assessArrival,
  startForegroundRefresh,
  type ArrivalState,
} from "./arrival-policy";
import { MapTools } from "../components/HomeChrome";
import { Icon } from "../ui/Icon";
import { ListRow } from "../ui/Primitives";
import { ApartmentSheet } from "./ApartmentSheet";
import { useAuth } from "../auth/AuthProvider";
import { AccountError } from "../auth/api-client";
import { dataRequest } from "./client";
type S = components["schemas"];
export function HomeApartments({
  toolbar,
  apartmentId,
  mode = "公寓",
  list = false,
}: {
  toolbar: ReactNode;
  apartmentId?: string;
  mode?: HomeMode;
  list?: boolean;
}) {
  const auth = useAuth();
  const [focused, setFocused] = useState(false),
    [active, setActive] = useState(AppState.currentState !== "background"),
    [obscured, setObscured] = useState(AppState.currentState !== "active");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      setActive(s !== "background");
      setObscured(s !== "active");
    });
    return () => sub.remove();
  }, []);
  if (!focused || !active || auth.phase !== "ready" || !auth.session)
    return (
      <View style={styles.root}>
        <HomeMap />
        {toolbar}
        <MapTools bottom={344} />
        <View style={styles.panel}>
          <View style={styles.handleSpace}>
            <View style={styles.handle} />
          </View>
          <View style={{ paddingHorizontal: 22 }}>
            <EmptyApartment
              title="登录后使用公寓资料"
              action="登录"
              onPress={() => router.push("/auth/phone")}
            />
          </View>
        </View>
      </View>
    );
  return (
    <View style={styles.root}>
      <View
        style={styles.root}
        accessibilityElementsHidden={obscured}
        importantForAccessibility={obscured ? "no-hide-descendants" : "auto"}
      >
        <Content
          key={auth.session.access_token + ":" + (apartmentId ?? "")}
          toolbar={toolbar}
          apartmentId={apartmentId}
          mode={mode}
          list={list}
        />
      </View>
      {obscured ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tokens.color.surface },
          ]}
        />
      ) : null}
    </View>
  );
}

function Content({
  toolbar,
  apartmentId,
  mode = "公寓",
  list = false,
}: {
  toolbar: ReactNode;
  apartmentId?: string;
  mode?: HomeMode;
  list?: boolean;
}) {
  const auth = useAuth(),
    session = auth.session!;
  const control = useRef(new AbortController()),
    generation = useRef(0),
    locationGeneration = useRef(0),
    fixPending = useRef(false),
    manualLocked = useRef(!!apartmentId),
    arrival = useRef<ArrivalState>(null);
  const [point, setPoint] = useState<S["Point"]>(),
    [cameraTarget, setCameraTarget] = useState<S["Point"]>(),
    [cameraRevision, setCameraRevision] = useState(0),
    [blocked, setBlocked] = useState(false),
    [locationNotice, setLocationNotice] = useState<string | null>(null),
    [candidates, setCandidates] = useState<S["Apartment"][]>([]),
    [selected, setSelected] = useState<S["Apartment"] | null>(null),
    [mapContext, setMapContext] = useState<S["ApartmentMapContext"] | null>(
      null,
    ),
    [records, setRecords] = useState<S["AccessRecord"][]>([]),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [loaded, setLoaded] = useState(false),
    [favorite, setFavorite] = useState<S["LibraryEntry"] | null>(null),
    [bookmarkKnown, setBookmarkKnown] = useState(false),
    [bookmarkBusy, setBookmarkBusy] = useState(false),
    [feedbackBusy, setFeedbackBusy] = useState<string | null>(null),
    [readError, setReadError] = useState(false),
    [panelHeight, setPanelHeight] = useState(210),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("定位查看附近公寓");
  const request = <T,>(
    path: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, {
      ...options,
      signal: control.current.signal,
    });
  const alive = () => !control.current.signal.aborted;
  useEffect(() => {
    control.current = new AbortController();
    if (apartmentId)
      void request<S["Apartment"]>(
        "/v1/apartments/" + encodeURIComponent(apartmentId),
      )
        .then((p) => {
          if (alive()) return select(p);
        })
        .catch(() => {
          if (alive()) {
            setNotice("公寓已不可用，请搜索地址");
            setError(null);
          }
        });
    else void locate(false);
    return () => {
      control.current.abort();
      locationGeneration.current++;
      generation.current++;
    };
  }, []);
  const refresh = useRef<() => Promise<void>>(async () => {});
  refresh.current = () => locate(false, false);
  useEffect(() => {
    if (!point || expanded || (list && mode !== "公寓")) return;
    return startForegroundRefresh(
      () => refresh.current(),
      () => AppState.currentState === "active",
    );
  }, [!!point, expanded, list, mode]);
  function invalidateAutomaticCard() {
    arrival.current = null;
    if (manualLocked.current || expanded || !selected) return;
    generation.current++;
    setSelected(null);
    setMapContext(null);
    setRecords([]);
    setLoaded(false);
    setBusy(false);
    setError(null);
  }
  async function locate(ask: boolean, follow = true) {
    if (fixPending.current) return;
    fixPending.current = true;
    const current = ++locationGeneration.current;
    const valid = () => alive() && current === locationGeneration.current;
    if (follow) setLocating(true);
    setLocationNotice(null);
    try {
      const result = await acquireForegroundLocation(
        {
          permission: Location.getForegroundPermissionsAsync,
          request: Location.requestForegroundPermissionsAsync,
          enabled: Location.hasServicesEnabledAsync,
          fix: () => readDevicePosition(control.current.signal),
        },
        ask,
      );
      if (!valid()) return;
      if (result.status !== "fix") {
        invalidateAutomaticCard();
        const isBlocked = result.status === "permission" && result.blocked;
        setBlocked(isBlocked);
        const message =
          result.status === "services_off"
            ? "请开启系统定位服务"
            : isBlocked
              ? "位置权限已关闭"
              : "开启定位，或搜索公寓地址";
        setLocationNotice(message);
        setNotice(message);
        return;
      }
      setBlocked(false);
      const { fix, approximate } = result;
      const p = { lng: fix.coords.longitude, lat: fix.coords.latitude };
      setPoint(p);
      if (follow) {
        setCameraTarget(p);
        setCameraRevision((v) => v + 1);
      }
      if (
        fix.coords.accuracy === null ||
        !Number.isFinite(fix.coords.accuracy) ||
        fix.coords.accuracy < 0
      ) {
        invalidateAutomaticCard();
        setNotice("定位精度不足，请搜索地址");
        setLocationNotice("定位精度不足，请搜索地址");
        return;
      }
      if (!follow && manualLocked.current) return;
      // A device fix is already available. Lookup failures must not erase its dot.
      try {
        const lookup = await request<S["ResolveResult"]>(
          "/v1/apartments/resolve",
          {
            method: "POST",
            body: {
              point: p,
              observed_at: new Date(fix.timestamp).toISOString(),
              accuracy_m: fix.coords.accuracy,
              accuracy_permission: approximate ? "approximate" : "precise",
            },
          },
        );
        if (!valid()) return;
        setCandidates(lookup.candidates);
        const decision = assessArrival(
          arrival.current,
          lookup,
          fix.timestamp,
          Date.now(),
          manualLocked.current || expanded,
        );
        arrival.current = decision.state;
        if (selected && lookup.matched_id !== selected.id)
          invalidateAutomaticCard();
        if (decision.apartment && decision.apartment.id !== selected?.id)
          void select(decision.apartment, "automatic");
        setNotice(
          lookup.status === "stale_location"
            ? "位置已过期，请重新定位"
            : lookup.candidates.length
              ? "确认你所在的公寓"
              : "附近暂无已收录公寓，请搜索地址",
        );
      } catch (e) {
        if (!valid()) return;
        invalidateAutomaticCard();
        setNotice("附近公寓资料暂不可用，请搜索地址");
        if (e instanceof AccountError && e.status < 500) setError(e.message);
      }
    } catch (e) {
      if (valid()) {
        invalidateAutomaticCard();
        const message =
          e instanceof Error && e.message === "location_timeout"
            ? "定位超时，请重试或搜索地址"
            : "暂时无法获取位置";
        setNotice(message);
        setLocationNotice(message);
      }
    } finally {
      fixPending.current = false;
      if (alive()) setLocating(false);
    }
  }
  async function openLocationSettings() {
    try {
      await Linking.openSettings();
    } catch {
      setLocationNotice("无法打开设置，请在系统设置中开启位置权限");
    }
  }
  function returnToPosition() {
    manualLocked.current = false;
    arrival.current = null;
    if (blocked) {
      void openLocationSettings();
      return;
    }
    if (point) {
      setCameraTarget({ ...point });
      setCameraRevision((v) => v + 1);
    }
    if (!locating) void locate(true);
  }
  async function select(
    p: S["Apartment"],
    origin: "manual" | "automatic" = "manual",
  ) {
    if (origin === "manual") manualLocked.current = true;
    const version = ++generation.current;
    locationGeneration.current++;
    setLocating(false);
    setSelected(p);
    setCameraTarget(p.point);
    setCameraRevision((v) => v + 1);
    setRecords([]);
    setMapContext(null);
    setLoaded(false);
    setReadError(false);
    setExpanded(false);
    setError(null);
    setBusy(true);
    setFavorite(null);
    setBookmarkKnown(false);
    await Promise.all([
      (async () => {
        try {
          const context = await request<S["ApartmentMapContext"]>(
            `/v1/apartments/${p.id}/map-context`,
          );
          if (
            alive() &&
            version === generation.current &&
            context.apartment_id === p.id
          )
            setMapContext(context);
        } catch {
          /* Geometry failure cannot invent an outline or block code lookup. */
        }
      })(),
      (async () => {
        try {
          if (auth.me?.capabilities.includes("access.read")) {
            const result = await request<S["AccessList"]>(
              `/v1/apartments/${p.id}/access-records`,
            );
            if (alive() && version === generation.current) {
              setRecords(result.items);
              setLoaded(true);
            }
          }
        } catch (e) {
          if (alive() && version === generation.current) {
            setReadError(true);
            setError(e instanceof Error ? e.message : "读取失败");
          }
        } finally {
          if (alive() && version === generation.current) setBusy(false);
        }
      })(),
      (async () => {
        try {
          const page = await request<S["LibraryPage"]>(
            `/v1/me/apartment-library?apartment_id=${p.id}&limit=1`,
          );
          if (alive() && version === generation.current) {
            setFavorite(page.items[0] ?? null);
            setBookmarkKnown(true);
          }
        } catch {
          if (alive() && version === generation.current)
            setError("收藏状态暂不可用，请重新读取");
        }
      })(),
    ]);
  }
  async function feedback(
    r: S["AccessRecord"],
    value: "useful" | "not_useful",
  ): Promise<boolean> {
    if (feedbackBusy) return false;
    const version = generation.current;
    setFeedbackBusy(r.id);
    setError(null);
    try {
      await request(`/v1/access-records/${r.id}/feedback`, {
        method: "PUT",
        body: { client_event_id: randomUUID(), value },
      });
      if (selected && alive() && version === generation.current) {
        const result = await request<S["AccessList"]>(
          `/v1/apartments/${selected.id}/access-records`,
        );
        if (alive() && version === generation.current) {
          setRecords(result.items);
          return true;
        }
      }
      return false;
    } catch (e) {
      if (alive() && version === generation.current) {
        if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
          setRecords([]);
          setReadError(true);
        }
        setError(e instanceof Error ? e.message : "反馈失败");
      }
      return false;
    } finally {
      if (alive() && version === generation.current) setFeedbackBusy(null);
    }
  }
  async function save() {
    if (!selected || !bookmarkKnown || bookmarkBusy) return;
    const version = generation.current;
    setBookmarkBusy(true);
    setError(null);
    try {
      let entry = favorite;
      if (!entry)
        entry = await request<S["LibraryEntry"]>("/v1/me/apartment-library", {
          method: "POST",
          key: randomUUID(),
          body: { apartment_id: selected.id },
        });
      else
        entry = await request<S["LibraryEntry"]>(
          `/v1/me/apartment-library/${entry.id}`,
          {
            method: "PATCH",
            key: randomUUID(),
            body: {
              expected_version: entry.version,
              favorite: !entry.favorite,
            },
          },
        );
      if (entry && !favorite && !entry.favorite)
        entry = await request<S["LibraryEntry"]>(
          `/v1/me/apartment-library/${entry.id}`,
          {
            method: "PATCH",
            key: randomUUID(),
            body: { expected_version: entry.version, favorite: true },
          },
        );
      if (alive() && version === generation.current) setFavorite(entry);
    } catch (e) {
      if (alive() && version === generation.current) {
        setError(e instanceof Error ? e.message : "收藏失败");
        try {
          const page = await request<S["LibraryPage"]>(
            `/v1/me/apartment-library?apartment_id=${selected.id}&limit=1`,
          );
          if (alive() && version === generation.current)
            setFavorite(page.items[0] ?? null);
        } catch {
          /* preserve previous state, do not guess success */
        }
      }
    } finally {
      if (alive() && version === generation.current) setBookmarkBusy(false);
    }
  }
  const canRead = auth.me?.capabilities.includes("access.read");
  const add = () =>
    selected &&
    router.push({
      pathname: "/apartments/contribute",
      params: { apartment_id: selected.id },
    });
  const clearSelection = () => {
    manualLocked.current = true;
    arrival.current = null;
    generation.current++;
    setSelected(null);
    setMapContext(null);
    setRecords([]);
    setBusy(false);
    setExpanded(false);
    setNotice("确认你所在的公寓");
  };
  const hideMap = (list && mode !== "公寓") || (expanded && mode === "公寓");
  return (
    <View style={styles.root}>
      <View
        style={[StyleSheet.absoluteFill, hideMap ? { opacity: 0 } : undefined]}
        pointerEvents={hideMap ? "none" : "auto"}
      >
        <HomeMap
          point={cameraTarget}
          cameraRevision={cameraRevision}
          bottomInset={mode === "公寓" ? panelHeight : 148}
          location={point}
          apartments={mode === "公寓" ? candidates : []}
          selectedId={selected?.id}
          mapContext={mode === "公寓" ? mapContext : null}
          onSelect={(p) => void select(p)}
        />
      </View>
      {toolbar}
      {(!expanded || mode !== "公寓") && !(list && mode !== "公寓") ? (
        <MapTools
          bottom={(mode === "公寓" ? panelHeight : 148) + 16}
          locating={locating}
          canRecenter={!!point}
          onLocate={returnToPosition}
        />
      ) : null}
      {mode !== "公寓" ? (
        <View
          style={[
            styles.panel,
            { padding: 22, minHeight: 148 },
            list ? { top: 132, maxHeight: "100%" } : undefined,
          ]}
        >
          <Text style={styles.title}>
            {mode === "找活" ? "附近临时支援" : "附近可用司机"}
          </Text>
          <Text style={styles.muted}>暂未开放</Text>
          {locationNotice ? (
            <Pressable
              accessibilityRole="button"
              style={{ minHeight: 48, justifyContent: "center" }}
              onPress={() =>
                void (blocked ? openLocationSettings() : locate(true))
              }
            >
              <Text style={styles.link}>
                {blocked ? "打开系统设置" : locationNotice}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : selected ? (
        <ApartmentSheet
          apartment={selected}
          records={records}
          status={
            !canRead
              ? "denied"
              : readError
                ? "error"
                : !loaded && busy
                  ? "loading"
                  : "ready"
          }
          expanded={expanded}
          saved={!!favorite?.favorite}
          bookmarkBusy={bookmarkBusy || !bookmarkKnown}
          feedbackBusy={feedbackBusy}
          error={error ?? locationNotice}
          onExpand={(value) => {
            if (value) manualLocked.current = true;
            setExpanded(value);
          }}
          onAdd={add}
          onOther={clearSelection}
          onRetry={() => void select(selected)}
          onBookmark={() => void save()}
          onFeedback={feedback}
          onHeight={setPanelHeight}
        />
      ) : (
        <View
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          style={styles.panel}
        >
          <View style={styles.handleSpace}>
            <View style={styles.handle} />
          </View>
          <ScrollView contentContainerStyle={styles.inner}>
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            {candidates.length ? (
              <>
                <Text style={styles.title}>你在哪栋公寓？</Text>
                <Text style={styles.muted}>选择对应地址</Text>
                {candidates.map((p) => (
                  <ListRow
                    key={p.id}
                    title={p.name ?? "公寓"}
                    subtitle={`${p.address_line1}, ${p.city}, ${p.state}`}
                    onPress={() => void select(p)}
                  />
                ))}
              </>
            ) : (
              <EmptyApartment
                title={
                  locating
                    ? "正在查找当前公寓"
                    : notice === "定位查看附近公寓" ||
                        notice === "开启定位，或搜索公寓地址"
                      ? "开启位置，找到当前公寓"
                      : notice
                }
                action={
                  locating
                    ? "定位中…"
                    : blocked
                      ? "打开系统设置"
                      : notice === "开启定位，或搜索公寓地址" ||
                          notice === "定位查看附近公寓"
                        ? "使用当前位置"
                        : "搜索公寓地址"
                }
                busy={locating}
                onPress={() =>
                  blocked
                    ? void openLocationSettings()
                    : notice === "开启定位，或搜索公寓地址" ||
                        notice === "定位查看附近公寓"
                      ? void locate(true)
                      : router.push("/apartments")
                }
                retryLabel={blocked ? "搜索公寓地址" : undefined}
                onRetry={
                  blocked
                    ? () => router.push("/apartments")
                    : !locating &&
                        notice !== "开启定位，或搜索公寓地址" &&
                        notice !== "定位查看附近公寓"
                      ? () => void locate(true)
                      : undefined
                }
              />
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
function EmptyApartment({
  title,
  action,
  busy = false,
  onPress,
  onRetry,
  retryLabel = "重新定位",
}: {
  title: string;
  action: string;
  busy?: boolean;
  onPress: () => void;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.mapEmpty}>
      <View style={styles.emptyIcon}>
        <Icon name="box" color="#6D829E" />
      </View>
      <Text style={styles.emptyHeading}>{title}</Text>
      <Text style={styles.emptySubtitle}>也可以直接搜索地址。</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onPress}
        style={styles.emptyAction}
      >
        {busy ? (
          <ActivityIndicator color={tokens.color.ink} />
        ) : (
          <Text
            style={{ fontSize: 16, fontWeight: "600", color: tokens.color.ink }}
          >
            {action}
          </Text>
        )}
      </Pressable>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={styles.link}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  mapEmpty: {
    paddingVertical: 38,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: "#F1F4F8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  emptyHeading: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "600",
    color: tokens.color.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 24,
    color: tokens.color.textMuted,
    marginTop: 10,
    marginBottom: 18,
    textAlign: "center",
  },
  emptyAction: {
    minHeight: 52,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  root: { flex: 1 },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "72%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.surface,
    zIndex: 20,
    shadowColor: "#1B2D44",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 5,
    paddingBottom: 12,
  },
  expanded: { height: "86%", maxHeight: "86%", zIndex: 30 },
  handleSpace: { height: 25, alignItems: "center", justifyContent: "center" },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#D9DDE2" },
  inner: { paddingHorizontal: 22, paddingBottom: 8 },
  empty: { paddingTop: 12, paddingBottom: 12, gap: 14 },
  emptyTitle: { fontSize: 22, fontWeight: "600", color: tokens.color.ink },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: tokens.color.ink,
  },
  address: { fontSize: 14, lineHeight: 21, color: tokens.color.textSecondary },
  muted: { color: tokens.color.textMuted, fontSize: 14, lineHeight: 22 },
  code: {
    fontSize: 40,
    lineHeight: 52,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontVariant: ["tabular-nums"],
    color: tokens.color.ink,
    paddingTop: 9,
    paddingBottom: 2,
  },
  headingRow: { flexDirection: "row", alignItems: "flex-start" },
  expandRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  link: { fontSize: 14, color: tokens.color.brandPrimary },
  record: {
    paddingTop: 12,
    paddingBottom: 15,
    borderTopWidth: 1,
    borderColor: "#E8EBEF",
    gap: 4,
  },
  recordTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  recordCode: {
    fontSize: 29,
    lineHeight: 38,
    letterSpacing: 1,
    fontWeight: "600",
    color: tokens.color.ink,
    flexShrink: 1,
  },
  status: {
    fontSize: 12,
    color: tokens.color.success,
    backgroundColor: "#EDF5F0",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  feedbackRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  feedback: {
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C8CDD5",
    borderRadius: 9,
  },
  feedbackSelected: {
    borderColor: tokens.color.brandPrimary,
    backgroundColor: tokens.color.brandSurface,
  },
  feedbackLabel: { fontSize: 14, color: tokens.color.ink },
  error: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 22,
    paddingVertical: 8,
  },
});
