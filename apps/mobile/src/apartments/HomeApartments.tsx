import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
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
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "./client";
type S = components["schemas"];
export function HomeApartments() {
  const auth = useAuth();
  const [focused, setFocused] = useState(false),
    [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  if (!focused || !active || auth.phase !== "ready" || !auth.session)
    return (
      <View style={styles.root}>
        <HomeMap />
        <View style={styles.panel}>
          <Text style={styles.title}>附近公寓</Text>
          <Button
            label="搜索公寓或地址"
            onPress={() => router.push("/apartments")}
          />
        </View>
      </View>
    );
  return <Content key={auth.session.access_token} />;
}
function Content() {
  const auth = useAuth(),
    session = auth.session!;
  const control = useRef(new AbortController()),
    generation = useRef(0),
    locationGeneration = useRef(0);
  const [point, setPoint] = useState<S["Point"]>(),
    [candidates, setCandidates] = useState<S["Apartment"][]>([]),
    [selected, setSelected] = useState<S["Apartment"] | null>(null),
    [records, setRecords] = useState<S["AccessRecord"][]>([]),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [loaded, setLoaded] = useState(false),
    [saved, setSaved] = useState(false),
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
    void locate(false);
    return () => {
      control.current.abort();
      locationGeneration.current++;
      generation.current++;
    };
  }, []);
  async function locate(ask: boolean) {
    const current = ++locationGeneration.current;
    const valid = () => alive() && current === locationGeneration.current;
    generation.current++;
    setSelected(null);
    setRecords([]);
    setCandidates([]);
    setExpanded(false);
    setLoaded(false);
    setBusy(false);
    setError(null);
    setLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (ask && !permission.granted)
        permission = await Location.requestForegroundPermissionsAsync();
      if (!valid()) return;
      if (!permission.granted) {
        setNotice("开启定位，或搜索公寓地址");
        return;
      }
      // One foreground fix per visit/explicit refresh; never a background tracker.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("定位超时，请重试或搜索地址")),
            20000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      if (!valid()) return;
      const p = { lng: fix.coords.longitude, lat: fix.coords.latitude };
      setPoint(p);
      if (fix.coords.accuracy === null) {
        setNotice("定位精度不足，请搜索地址");
        return;
      }
      const result = await request<S["ResolveResult"]>(
        "/v1/apartments/resolve",
        {
          method: "POST",
          body: {
            point: p,
            observed_at: new Date(fix.timestamp).toISOString(),
            accuracy_m: fix.coords.accuracy,
            accuracy_permission:
              permission.ios?.accuracy === "reduced" ||
              permission.android?.accuracy === "coarse"
                ? "approximate"
                : "precise",
          },
        },
      );
      if (!valid()) return;
      setCandidates(result.candidates);
      setNotice(
        result.status === "stale_location"
          ? "位置已过期，请重新定位"
          : result.candidates.length
            ? "确认你所在的公寓"
            : "附近暂无已收录公寓，请搜索地址",
      );
    } catch (e) {
      if (valid())
        setError(e instanceof Error ? e.message : "定位失败，请重试");
    } finally {
      if (valid()) setLocating(false);
    }
  }
  async function select(p: S["Apartment"]) {
    // An explicit building choice locks selection until the driver relocates.
    const version = ++generation.current;
    locationGeneration.current++;
    setLocating(false);
    setSelected(p);
    setSaved(false);
    setRecords([]);
    setLoaded(false);
    setExpanded(false);
    setError(null);
    setBusy(true);
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
      if (alive() && version === generation.current)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (alive() && version === generation.current) setBusy(false);
    }
  }
  async function feedback(
    r: S["AccessRecord"],
    value: "useful" | "not_useful",
  ) {
    const version = generation.current;
    setBusy(true);
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
        if (alive() && version === generation.current) setRecords(result.items);
      }
    } catch (e) {
      if (alive() && version === generation.current)
        setError(e instanceof Error ? e.message : "反馈失败");
    } finally {
      if (alive() && version === generation.current) setBusy(false);
    }
  }
  async function save() {
    if (!selected) return;
    const version = generation.current;
    setBusy(true);
    setError(null);
    try {
      await request("/v1/me/apartment-library", {
        method: "POST",
        key: randomUUID(),
        body: { apartment_id: selected.id },
      });
      if (alive() && version === generation.current) setSaved(true);
    } catch (e) {
      if (alive() && version === generation.current)
        setError(e instanceof Error ? e.message : "收藏失败");
    } finally {
      if (alive() && version === generation.current) setBusy(false);
    }
  }
  const canRead = auth.me?.capabilities.includes("access.read");
  return (
    <View style={styles.root}>
      <HomeMap
        point={selected?.point ?? point}
        location={point}
        apartments={candidates}
        selectedId={selected?.id}
        onSelect={(p) => void select(p)}
      />
      <View style={styles.locate}>
        <Button
          label={locating ? "定位中…" : "我的位置"}
          disabled={locating}
          onPress={() => void locate(true)}
        />
      </View>
      <View style={styles.panel}>
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: tokens.color.danger }}
            >
              {error}
            </Text>
          ) : null}
          {selected ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="展开公寓密码"
                accessibilityState={{ expanded }}
                onPress={() => setExpanded((v) => !v)}
                style={{ minHeight: 48, gap: 6 }}
              >
                <Text style={styles.title}>
                  {selected.name ?? "公寓"} {expanded ? "⌄" : "⌃"}
                </Text>
                <Text>
                  {selected.address_line1}, {selected.city}, {selected.state}
                </Text>
                {!expanded && records[0] ? (
                  <Text style={styles.code}>{records[0].value}</Text>
                ) : null}
                {!expanded && records[0] ? (
                  <Text style={styles.muted}>
                    {new Date(records[0].contributed_at).toLocaleString()}
                  </Text>
                ) : null}
              </Pressable>
              {busy ? <Text style={styles.muted}>正在读取…</Text> : null}
              {!canRead ? (
                <Text>公寓资料查看资格待审核</Text>
              ) : loaded && !records.length ? (
                <Text>暂无共享密码</Text>
              ) : null}
              {expanded || (loaded && !records.length) ? (
                <Button
                  label="添加密码"
                  onPress={() =>
                    router.push({
                      pathname: "/apartments/contribute",
                      params: { apartment_id: selected.id },
                    })
                  }
                />
              ) : null}
              {expanded ? (
                <>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Button
                      label={saved ? "★" : "☆"}
                      accessibilityLabel="收藏公寓"
                      disabled={busy}
                      onPress={() => void save()}
                    />
                    <Button
                      label="不是这栋"
                      onPress={() => {
                        generation.current++;
                        setSelected(null);
                        setRecords([]);
                        setBusy(false);
                        setNotice("确认你所在的公寓");
                      }}
                    />
                  </View>
                  {records.map((r) => (
                    <View key={r.id} style={styles.record}>
                      <Text style={styles.code}>{r.value}</Text>
                      <Text>{r.scope.label ?? "大门"}</Text>
                      <Text style={styles.muted}>
                        {r.effective_useful ? "有用反馈 · " : ""}
                        {new Date(r.contributed_at).toLocaleString()}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <Button
                          label={r.my_feedback === "useful" ? "✓ 有用" : "有用"}
                          disabled={busy}
                          onPress={() => void feedback(r, "useful")}
                        />
                        <Button
                          label={
                            r.my_feedback === "not_useful"
                              ? "✓ 不能用"
                              : "不能用"
                          }
                          disabled={busy}
                          onPress={() => void feedback(r, "not_useful")}
                        />
                      </View>
                    </View>
                  ))}
                  <Button
                    label="重新读取"
                    disabled={busy}
                    onPress={() => void select(selected)}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.title}>{notice}</Text>
              {candidates.map((p) => (
                <Button
                  key={p.id}
                  label={`${p.name ?? "公寓"} · ${p.address_line1}`}
                  onPress={() => void select(p)}
                />
              ))}
            </>
          )}
          <Button
            label="搜索公寓或地址"
            onPress={() => router.push("/apartments")}
          />
        </ScrollView>
      </View>
    </View>
  );
}
function Button({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={{ fontWeight: "600", color: tokens.color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "55%",
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.surface,
  },
  title: { fontSize: 19, fontWeight: "600", color: tokens.color.ink },
  code: { fontSize: 34, fontWeight: "700", color: tokens.color.ink },
  muted: { color: tokens.color.textSecondary, fontSize: 12 },
  button: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: tokens.color.surfaceMuted,
  },
  locate: { position: "absolute", top: 16, right: 16 },
  record: {
    backgroundColor: tokens.color.canvas,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
});
