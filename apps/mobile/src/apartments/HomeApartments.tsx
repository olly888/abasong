import { NearbyCarousel } from "./NearbyCarousel";
import { mergeNearby, distanceM } from "./nearby-policy";
import { setNearbyContribution } from "./nearby-contribution";
import { AddressLine } from "./AddressLine";
import { locality } from "./address-presentation";
import {
  clearSearchDestination,
  getSearchDestination,
} from "./search-destination";
import { ListRow } from "../ui/Primitives";
import { ActionButton } from "../auth/AuthControls";
import { openContributionMenu } from "./contribution-entry";
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
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import HomeMap from "../components/HomeMap";
import type { HomeMode } from "../components/HomeChrome";
import { watchDevicePosition } from "./location-stream";
import type { ForegroundFix } from "./foreground-location";
import { serialLatest } from "./serial-latest";
import { HomeArrivalPanel } from "./HomeArrivalPanel";
import { MapTools } from "../components/HomeChrome";
import { Icon } from "../ui/Icon";
import { ApartmentSheet } from "./ApartmentSheet";
import { useAuth } from "../auth/AuthProvider";
import { AccountError } from "../auth/api-client";
import { dataRequest } from "./client";
type S = components["schemas"];
export function HomeApartments({
  toolbar,
  apartmentId,
  destinationKey,
  mode = "公寓",
  list = false,
}: {
  toolbar: ReactNode;
  apartmentId?: string;
  destinationKey?: string;
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
      if (s === "background") clearSearchDestination();
      setActive(s !== "background");
      setObscured(s !== "active");
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (auth.phase !== "ready") clearSearchDestination();
  }, [auth.phase]);
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
        <HomeApartmentContent
          key={
            auth.session.access_token +
            ":" +
            (apartmentId ?? "") +
            ":" +
            (destinationKey ?? "")
          }
          toolbar={toolbar}
          apartmentId={apartmentId}
          destinationKey={destinationKey}
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

export function HomeApartmentContent({
  toolbar,
  apartmentId,
  destinationKey,
  mode = "公寓",
  list = false,
  testData,
}: {
  toolbar: ReactNode;
  apartmentId?: string;
  destinationKey?: string;
  mode?: HomeMode;
  list?: boolean;
  testData?: {
    read: (
      path: string,
      options: Parameters<typeof dataRequest>[2],
    ) => Promise<unknown>;
    canRead: boolean;
    userId?: string;
    onObservation?: () => void;
  };
}) {
  const auth = useAuth(),
    session = auth.session!;
  const ownerId =
    (__DEV__ ? testData?.userId : undefined) ?? session?.user.id ?? "";
  const initialDestination = useRef(
    getSearchDestination(destinationKey, ownerId),
  );
  const [temporary, setTemporary] = useState(initialDestination.current);
  const control = useRef(new AbortController()),
    generation = useRef(0),
    stream = useRef<AbortController | null>(null),
    disposeLookup = useRef<(() => void) | null>(null),
    selectionRef = useRef<S["Apartment"] | null>(null),
    lastFixAt = useRef(0),
    manualLocked = useRef(!!apartmentId || !!initialDestination.current);
  const catalogRef = useRef<S["NearbyCandidate"][]>([]),
    providerRef = useRef<{
      items: S["NearbyCandidate"][];
      until: number;
      point: S["Point"];
    } | null>(null);
  const discoveryAnchor = useRef<{ point: S["Point"]; at: number } | null>(
      null,
    ),
    providerLast = useRef(0),
    providerEpoch = useRef(0);
  const [point, setPoint] = useState<S["Point"]>(),
    [cameraTarget, setCameraTarget] = useState<S["Point"]>(),
    [cameraZoom, setCameraZoom] = useState(17),
    [cameraIntent, setCameraIntent] = useState<"explicit" | "arrival">(
      "explicit",
    ),
    [frameSelected, setFrameSelected] = useState(false),
    [cameraRevision, setCameraRevision] = useState(0),
    [blocked, setBlocked] = useState(false),
    [locationNotice, setLocationNotice] = useState<string | null>(null),
    [nearbyItems, setNearbyItems] = useState<S["NearbyCandidate"][]>([]),
    [providerSelected, setProviderSelected] = useState<
      S["NearbyCandidate"] | null
    >(null),
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
    [notice, setNotice] = useState("正在定位"),
    [lookupState, setLookupState] = useState<
      "loading" | "nearby" | "ambiguous" | "empty" | "error"
    >("loading");
  const request = <T,>(
    path: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) =>
    __DEV__ && testData
      ? (testData.read(path, options) as Promise<T>)
      : dataRequest<T>(session, path, {
          ...options,
          signal: options.signal ?? control.current.signal,
        });
  const alive = () => !control.current.signal.aborted;
  useEffect(() => {
    control.current = new AbortController();
    if (initialDestination.current) {
      setCameraTarget(initialDestination.current.point);
      setCameraZoom(18);
      setCameraRevision((v) => v + 1);
      setCandidates(initialDestination.current.apartments);
    } else if (apartmentId)
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
    void locate(false, !apartmentId && !initialDestination.current);
    return () => {
      control.current.abort();
      stream.current?.abort();
      disposeLookup.current?.();
      generation.current++;
    };
  }, []);
  function updateNearby(items: S["NearbyCandidate"][]) {
    setNearbyItems(items);
    setCandidates(items.flatMap((c) => (c.apartment ? [c.apartment] : [])));
    setLookupState(items.length ? "nearby" : "empty");
    const current = selectionRef.current?.id;
    if (current && items.some((c) => c.apartment?.id === current)) return;
    if (items[0]) void chooseNearby(items[0], false);
    else invalidateAutomaticCard();
  }
  const onLookup = useRef<
    (fix: ForegroundFix, lookup: S["NearbyDiscovery"]) => void
  >(() => {});
  onLookup.current = (fix, lookup) => {
    if (Date.parse(lookup.expires_at) <= Date.now()) return;
    discoveryAnchor.current = {
      point: { lng: fix.coords.longitude, lat: fix.coords.latitude },
      at: Date.now(),
    };
    catalogRef.current = lookup.items;
    const cache = providerRef.current;
    if (
      cache &&
      (cache.until <= Date.now() ||
        distanceM(cache.point, discoveryAnchor.current.point) > 50)
    )
      providerRef.current = null;
    updateNearby(mergeNearby(lookup.items, providerRef.current?.items ?? []));
    if (Date.now() - providerLast.current < 30000) return;
    providerLast.current = Date.now();
    const epoch = ++providerEpoch.current;
    void request<S["NearbyDiscovery"]>("/v1/apartments/discover/mapbox", {
      method: "POST",
      signal: stream.current?.signal,
      body: {
        point: { lng: fix.coords.longitude, lat: fix.coords.latitude },
        observed_at: new Date(fix.timestamp).toISOString(),
        accuracy_m: fix.coords.accuracy,
        accuracy_permission: "precise",
      },
    })
      .then((extra) => {
        if (
          !alive() ||
          manualLocked.current ||
          epoch !== providerEpoch.current ||
          Date.parse(extra.expires_at) <= Date.now() ||
          !discoveryAnchor.current ||
          distanceM(discoveryAnchor.current.point, {
            lng: fix.coords.longitude,
            lat: fix.coords.latitude,
          }) > 50
        )
          return;
        if (extra.provider_status === "ok") {
          providerRef.current = {
            items: extra.items,
            until: Date.parse(extra.expires_at),
            point: { lng: fix.coords.longitude, lat: fix.coords.latitude },
          };
          updateNearby(mergeNearby(catalogRef.current, extra.items));
        }
      })
      .catch(() => {
        /* Catalog remains usable when optional map enrichment fails. */
      });
  };
  function chooseNearby(c: S["NearbyCandidate"], manual = true) {
    if (manual) manualLocked.current = true;
    if (c.apartment) {
      setProviderSelected(null);
      return select(c.apartment, manual ? "manual" : "automatic");
    }
    generation.current++;
    selectionRef.current = null;
    setSelected(null);
    setRecords([]);
    setMapContext(null);
    setLoaded(false);
    setReadError(false);
    setBusy(false);
    setProviderSelected(c);
    setExpanded(false);
    if (manual) {
      setCameraIntent("explicit");
      setFrameSelected(false);
      setCameraTarget(c.point);
      setCameraRevision((v) => v + 1);
    }
  }
  const onFailure = useRef<() => void>(() => {});
  onFailure.current = () => {
    providerEpoch.current++;
    invalidateAutomaticCard();
    setLookupState("error");
  };
  function invalidateAutomaticCard() {
    if (manualLocked.current) return;
    setProviderSelected(null);
    generation.current++;
    selectionRef.current = null;
    setSelected(null);
    setMapContext(null);
    setRecords([]);
    setLoaded(false);
    setBusy(false);
    setError(null);
  }
  async function locate(ask: boolean, follow = true) {
    stream.current?.abort();
    disposeLookup.current?.();
    const controller = new AbortController();
    stream.current = controller;
    const valid = () => alive() && !controller.signal.aborted;
    let first = follow;
    setLocating(true);
    setLocationNotice(null);
    setNotice("正在定位");
    const queue = serialLatest<
      { fix: ForegroundFix; approximate: boolean },
      S["NearbyDiscovery"]
    >(
      ({ fix, approximate }) =>
        request<S["NearbyDiscovery"]>("/v1/apartments/discover", {
          method: "POST",
          signal: controller.signal,
          body: {
            point: { lng: fix.coords.longitude, lat: fix.coords.latitude },
            observed_at: new Date(fix.timestamp).toISOString(),
            accuracy_m: fix.coords.accuracy,
            accuracy_permission: approximate ? "approximate" : "precise",
          },
        }),
      ({ fix }, lookup) => {
        if (valid() && !manualLocked.current) onLookup.current(fix, lookup);
      },
      () => {
        if (valid()) onFailure.current();
      },
      (a, b) =>
        a.fix.coords.longitude === b.fix.coords.longitude &&
        a.fix.coords.latitude === b.fix.coords.latitude &&
        a.approximate === b.approximate &&
        a.fix.coords.accuracy === b.fix.coords.accuracy,
      2000,
    );
    disposeLookup.current = () => queue.dispose();
    const resetUnconfirmedLookup = () => {
      providerEpoch.current++;
      queue.invalidate();
      invalidateAutomaticCard();
      setCandidates([]);
      setNearbyItems([]);
      setLookupState("empty");
    };
    const fail = (reason: string) => {
      if (!valid()) return;
      providerEpoch.current++;
      queue.invalidate();
      setLocating(false);
      setPoint(undefined);
      invalidateAutomaticCard();
      const message =
        reason === "blocked"
          ? "位置权限已关闭"
          : reason === "permission"
            ? "开启位置，查找公寓"
            : reason === "services_off"
              ? "请开启系统定位服务"
              : reason === "stale"
                ? "位置已过期"
                : "暂时无法获取位置";
      terminalError = ["blocked", "permission", "services_off"].includes(
        reason,
      );
      setBlocked(reason === "blocked");
      setNotice(message);
      setLocationNotice(message);
    };
    let staleReported = false,
      terminalError = false;
    const started = Date.now();
    const expiry = setInterval(() => {
      if (
        valid() &&
        !terminalError &&
        !staleReported &&
        Date.now() - Math.max(started, lastFixAt.current) > 20_000
      ) {
        staleReported = true;
        fail("stale");
      } else if (
        valid() &&
        !manualLocked.current &&
        !!discoveryAnchor.current &&
        Date.now() - discoveryAnchor.current.at > 20000
      ) {
        resetUnconfirmedLookup();
      }
    }, 2000);
    controller.signal.addEventListener(
      "abort",
      () => {
        clearInterval(expiry);
        queue.dispose();
      },
      { once: true },
    );
    try {
      await watchDevicePosition(
        (fix, approximate) => {
          if (!valid()) return;
          const { latitude, longitude, accuracy } = fix.coords;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            !Number.isFinite(fix.timestamp) ||
            Date.now() - fix.timestamp > 20_000 ||
            fix.timestamp > Date.now() + 1000
          )
            return;
          if (fix.timestamp < lastFixAt.current) return;
          staleReported = false;
          terminalError = false;
          lastFixAt.current = fix.timestamp;
          if (__DEV__) testData?.onObservation?.();
          const p = { lng: longitude, lat: latitude };
          setPoint(p);
          setBlocked(false);
          setLocating(false);
          setLocationNotice(null);
          if (first) {
            first = false;
            setCameraIntent("explicit");
            setCameraZoom(17);
            setFrameSelected(false);
            setCameraTarget(p);
            setCameraRevision((v) => v + 1);
          }
          if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0) {
            queue.invalidate();
            invalidateAutomaticCard();
            setLocationNotice("位置不够准确");
            return;
          }
          if (
            !manualLocked.current &&
            discoveryAnchor.current &&
            distanceM(discoveryAnchor.current.point, p) > 200
          )
            resetUnconfirmedLookup();
          if (approximate) {
            queue.invalidate();
            invalidateAutomaticCard();
            setNearbyItems([]);
            setCandidates([]);
            setLocationNotice("请开启精确位置，或搜索地址");
            return;
          }
          if (!manualLocked.current) queue.offer({ fix, approximate });
        },
        fail,
        controller.signal,
        ask,
      );
    } catch {
      fail("unavailable");
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
    clearSearchDestination();
    if (temporary) {
      setTemporary(undefined);
      setCandidates([]);
    }
    manualLocked.current = false;
    providerLast.current = 0;
    providerRef.current = null;
    providerEpoch.current++;
    setNearbyItems([]);
    invalidateAutomaticCard();
    if (blocked) {
      void openLocationSettings();
      return;
    }
    if (point && Date.now() - lastFixAt.current <= 20_000) {
      setCameraIntent("explicit");
      setCameraZoom(17);
      setFrameSelected(false);
      setCameraTarget({ ...point });
      setCameraRevision((v) => v + 1);
    }
    if (!locating) void locate(true);
  }
  async function select(
    p: S["Apartment"],
    origin: "manual" | "automatic" | "retry" = "manual",
    arrivalPoint?: S["Point"],
  ) {
    if (origin === "manual") {
      manualLocked.current = true;
      clearSearchDestination();
      setTemporary(undefined);
    }
    setProviderSelected(null);
    const version = ++generation.current;
    setLocating(false);
    selectionRef.current = p;
    setSelected(p);
    if (origin === "automatic" && arrivalPoint) {
      setCameraIntent("arrival");
      setCameraZoom(17);
      setFrameSelected(false);
      setCameraTarget(arrivalPoint);
      setCameraRevision((v) => v + 1);
    }
    if (origin === "manual") {
      setCameraIntent("explicit");
      setCameraZoom(18);
      setFrameSelected(true);
      setCameraTarget(p.point);
      setCameraRevision((v) => v + 1);
    }
    setRecords([]);
    setMapContext(null);
    setLoaded(false);
    setReadError(false);
    if (origin !== "retry") setExpanded(false);
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
          if (
            __DEV__ && testData
              ? testData.canRead
              : auth.me?.capabilities.includes("access.read")
          ) {
            const result = await request<S["AccessList"]>(
              `/v1/apartments/${p.id}/access-records`,
            );
            if (alive() && version === generation.current) {
              if (result.items.some((r) => r.apartment_id !== p.id))
                throw new Error("密码资料与地址不一致，请重试");
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
  const canRead =
    __DEV__ && testData
      ? testData.canRead
      : auth.me?.capabilities.includes("access.read");
  const add = () =>
    selected &&
    router.push({
      pathname: "/apartments/contribute",
      params: { apartment_id: selected.id },
    });
  const clearSelection = () => {
    setExpanded(false);
    const n = nearbyItems.findIndex((c) => c.apartment?.id === selected?.id);
    if (nearbyItems.length > 1)
      void chooseNearby(nearbyItems[(n + 1) % nearbyItems.length]!);
    else router.push("/apartments");
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
          cameraIntent={mode === "公寓" ? cameraIntent : "explicit"}
          cameraZoom={mode === "公寓" ? cameraZoom : 14}
          frameSelected={mode === "公寓" && frameSelected}
          bottomInset={mode === "公寓" ? panelHeight : 148}
          location={point}
          destination={
            mode === "公寓"
              ? (providerSelected?.point ?? temporary?.point)
              : undefined
          }
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
      ) : temporary ? (
        <View
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          style={styles.panel}
        >
          <View style={styles.handleSpace}>
            <View style={styles.handle} />
          </View>
          <ScrollView contentContainerStyle={[styles.inner, { gap: 12 }]}>
            <Text style={styles.title}>{temporary.title}</Text>
            <Text style={styles.address}>{temporary.label}</Text>
            <Text style={styles.muted}>
              {temporary.match_status === "ambiguous"
                ? "请选择对应公寓"
                : "暂未匹配到公寓资料"}
            </Text>
            {temporary.apartments.map((p) => (
              <ListRow
                key={p.id}
                title={<AddressLine line={p.address_line1} compact />}
                subtitle={[locality(p), p.name].filter(Boolean).join(" · ")}
                onPress={() => void select(p)}
              />
            ))}
            {temporary.address ? (
              <ActionButton
                label="添加密码"
                onPress={() => {
                  const key = randomUUID();
                  setNearbyContribution(key, ownerId, {
                    address: temporary.address!,
                  });
                  router.push({
                    pathname: "/apartments/contribute",
                    params: { nearby_key: key },
                  });
                }}
              />
            ) : null}
            <ActionButton
              label="搜索其他地址"
              onPress={() => router.push("/apartments")}
            />
            <Text style={{ fontSize: 11, color: tokens.color.textMuted }}>
              {temporary.attribution}
            </Text>
          </ScrollView>
        </View>
      ) : selected || providerSelected ? (
        (() => {
          const onCardHeight = expanded
            ? setPanelHeight
            : (h: number) => setPanelHeight(h + 38);
          const card = (height: (h: number) => void) =>
            selected ? (
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
                onRetry={() => void select(selected, "retry")}
                onBookmark={() => void save()}
                onFeedback={feedback}
                embedded={
                  !expanded &&
                  nearbyItems.some((c) => c.apartment?.id === selected.id)
                }
                onHeight={height}
              />
            ) : (
              <View
                style={{ padding: 22, minHeight: 220, gap: 14 }}
                onLayout={(e) => height(e.nativeEvent.layout.height)}
              >
                {providerSelected?.address ? (
                  <AddressLine line={providerSelected.address.address_line1} />
                ) : (
                  <Text style={styles.title}>公寓 · 地址待核对</Text>
                )}
                <Text style={styles.muted}>请核对地址后添加密码</Text>
                <ActionButton
                  label={providerSelected?.address ? "添加密码" : "核对地址"}
                  onPress={() => {
                    if (!providerSelected) return;
                    const key = randomUUID();
                    setNearbyContribution(
                      key,
                      session.user.id,
                      providerSelected,
                    );
                    router.push({
                      pathname: "/apartments/contribute",
                      params: { nearby_key: key },
                    });
                  }}
                />
              </View>
            );
          const key = selected?.id ?? providerSelected!.key;
          return !expanded &&
            nearbyItems.some(
              (c) => c.key === key || c.apartment?.id === key,
            ) ? (
            <NearbyCarousel
              items={nearbyItems}
              selectedKey={key}
              onSelect={(c) => void chooseNearby(c)}
              onSwipeStart={() => {
                manualLocked.current = true;
                generation.current++;
                setRecords([]);
                setLoaded(false);
                setBusy(true);
                setReadError(false);
              }}
              onHeight={setPanelHeight}
            >
              {(height) => card(height)}
            </NearbyCarousel>
          ) : (
            card(onCardHeight)
          );
        })()
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
            <HomeArrivalPanel
              state={
                locationNotice ? "location" : locating ? "loading" : lookupState
              }
              message={locationNotice ?? notice}
              candidates={candidates}
              onSelect={(p) => void select(p)}
              onContribute={openContributionMenu}
              onRetry={() =>
                locationNotice
                  ? blocked
                    ? void openLocationSettings()
                    : void locate(true)
                  : void locate(false, false)
              }
              blocked={blocked}
            />
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
