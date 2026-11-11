import Mapbox from "@rnmapbox/maps";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import HomeMap from "../components/HomeMap";
import { AddressLine } from "../apartments/AddressLine";
import { watchDevicePosition } from "../apartments/location-stream";
import { IconButton } from "../ui/Primitives";
import { reviewPoint } from "./review-position";
import data from "./woodside.public.json";
type Point = { lng: number; lat: number };
export function FieldReview() {
  return (
    <SafeAreaProvider>
      <Review />
    </SafeAreaProvider>
  );
}
function Review() {
  const [active, setActive] = useState(AppState.currentState === "active");
  const [point, setPoint] = useState<Point>();
  const [target, setTarget] = useState<Point>(data.gates[0]!.point);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("G1");
  const [message, setMessage] = useState("点击定位，核对蓝点位置");
  const [blocked, setBlocked] = useState(false);
  const [permissionRun, setPermissionRun] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<{ point: Point; at: number } | null>(null);
  const shouldAsk = useRef(false);
  const followFirst = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active) {
      setPoint(undefined);
      latest.current = null;
      return;
    }
    const task = new AbortController();
    controller.current = task;
    const ask = shouldAsk.current;
    shouldAsk.current = false;
    const mark = (reason: string) => {
      if (task.signal.aborted) return;
      latest.current = null;
      setPoint(undefined);
      setBlocked(reason === "blocked");
      setMessage(
        reason === "blocked"
          ? "位置权限已关闭"
          : reason === "permission"
            ? "允许定位，核对蓝点"
            : reason === "services_off"
              ? "请开启系统定位服务"
              : "暂时无法获取位置",
      );
    };
    void watchDevicePosition(
      (fix, approximate) => {
        if (task.signal.aborted) return;
        const p = reviewPoint(fix, Date.now());
        if (!p) return;
        latest.current = { point: p, at: fix.timestamp };
        setPoint(p);
        if (followFirst.current) {
          setTarget(p);
          setRevision((n) => n + 1);
          setSelected("");
          followFirst.current = false;
        }
        setBlocked(false);
        setMessage(
          approximate ? "目前是大致位置，请开启精确位置" : "位置已更新",
        );
      },
      mark,
      task.signal,
      ask,
    ).catch(() => mark("unavailable"));
    const timer = setInterval(() => {
      if (latest.current && Date.now() - latest.current.at > 20000) {
        latest.current = null;
        setPoint(undefined);
        setMessage("位置需要更新");
      }
    }, 2000);
    return () => {
      task.abort();
      clearInterval(timer);
    };
  }, [active, permissionRun]);
  const locate = () => {
    if (latest.current && Date.now() - latest.current.at <= 20000) {
      setTarget({ ...latest.current.point });
      setRevision((n) => n + 1);
      setSelected("");
      return;
    }
    if (blocked) {
      void Linking.openSettings().catch(() =>
        setMessage("请在系统设置中开启位置权限"),
      );
      return;
    }
    followFirst.current = true;
    shouldAsk.current = true;
    controller.current?.abort();
    setPermissionRun((n) => n + 1);
  };
  if (!active) return <View style={s.page} />;
  return (
    <SafeAreaView style={s.page}>
      <View style={s.heading}>
        <Text style={s.tag}>现场核对版</Text>
        <Text style={s.title}>Woodside 入口核对</Text>
        <AddressLine line={data.address} compact />
        <Text style={s.muted}>
          {data.city}, {data.state} {data.postal_code}
        </Text>
      </View>
      <View style={s.map}>
        <HomeMap
          point={target}
          location={point}
          cameraRevision={revision}
          cameraZoom={17}
          bottomInset={0}
          topInset={44}
          overlay={
            <>
              <Mapbox.ShapeSource
                id="review-public-buildings"
                shape={{
                  type: "Feature",
                  properties: {},
                  geometry: data.buildings as GeoJSON.MultiPolygon,
                }}
              >
                <Mapbox.LineLayer
                  id="review-public-building-line"
                  style={{ lineColor: "#88929E", lineWidth: 1 }}
                />
              </Mapbox.ShapeSource>
              {data.gates.map((g) => (
                <Mapbox.PointAnnotation
                  key={g.id}
                  id={"review-" + g.id}
                  coordinate={[g.point.lng, g.point.lat]}
                  anchor={{ x: 0.5, y: 1 }}
                  onSelected={() => {
                    setSelected(g.id);
                  }}
                >
                  <View style={s.markerOffset}>
                    <View style={s.marker}>
                      <Text style={s.markerText}>{g.id}</Text>
                    </View>
                  </View>
                </Mapbox.PointAnnotation>
              ))}
            </>
          }
        />
        <View style={s.locate}>
          <IconButton name="locate" label="回到我的位置" onPress={locate} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>
          {selected ? `${selected} · 候选入口` : "核对入口与蓝点"}
        </Text>
        <Text style={s.muted}>G1/G2 尚未核实，不代表公寓已自动识别</Text>
        <View style={s.buttons}>
          {data.gates.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={"查看" + g.id}
              style={[s.button, selected === g.id && s.active]}
              onPress={() => {
                setTarget(g.point);
                setSelected(g.id);
                setRevision((n) => n + 1);
              }}
            >
              <Text style={selected === g.id ? s.white : s.buttonText}>
                查看 {g.id}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          style={s.position}
          onPress={locate}
        >
          <Text style={s.buttonText}>{message}</Text>
        </Pressable>
        <Text style={s.foot}>公开入口资料已内置 · 底图联网加载</Text>
        <Text style={s.foot}>{data.attribution}</Text>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: tokens.color.surface },
  heading: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 3 },
  tag: { color: tokens.color.brandText, fontSize: 12, fontWeight: "600" },
  title: { fontSize: 23, fontWeight: "700", color: tokens.color.ink },
  muted: { fontSize: 13, lineHeight: 19, color: tokens.color.textSecondary },
  map: { flex: 1, minHeight: 160 },
  locate: { position: "absolute", right: 16, bottom: 24 },
  card: {
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
  },
  cardTitle: { fontSize: 19, fontWeight: "600", color: tokens.color.ink },
  buttons: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    backgroundColor: tokens.color.brandPrimary,
    borderColor: tokens.color.brandPrimary,
  },
  buttonText: {
    color: tokens.color.brandText,
    fontSize: 15,
    fontWeight: "600",
  },
  white: { color: "#fff", fontSize: 15, fontWeight: "600" },
  position: { minHeight: 44, justifyContent: "center" },
  foot: { fontSize: 11, lineHeight: 16, color: tokens.color.textMuted },
  markerOffset: { paddingBottom: 24 },
  marker: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#B56816",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  markerText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
