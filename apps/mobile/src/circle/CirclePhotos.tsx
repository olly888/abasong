import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaModal } from "../ui/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
import { AccountError } from "../auth/api-client";
import { photoLimit, type CirclePhoto } from "./photo-input";
import type { Circle, CircleRequest } from "./session";

type Source = { uri: string } | { path: string; request: CircleRequest };
function asImageUri(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return "data:image/jpeg;base64," + globalThis.btoa(text);
}

function Photo({
  source,
  full = false,
  style,
  onOpen,
  label = "查看大图",
}: {
  source: Source;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  onOpen?: () => void;
  label?: string;
}) {
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<
    { uri: string } | "error" | "denied" | null
  >(null);
  const path = "path" in source ? source.path : null;
  const request = "request" in source ? source.request : null;
  const local = "uri" in source ? source.uri : null;
  useEffect(() => {
    if (!path || !request) return;
    const c = new AbortController();
    setResult(null);
    void request<ArrayBuffer>(path, { signal: c.signal, acceptJpeg: true })
      .then((data) => {
        if (!c.signal.aborted) setResult({ uri: asImageUri(data) });
      })
      .catch((error) => {
        if (!c.signal.aborted)
          setResult(
            error instanceof AccountError &&
              [401, 403, 404].includes(error.status)
              ? "denied"
              : "error",
          );
      });
    return () => c.abort();
  }, [path, request, attempt]);
  const uri = typeof result === "object" ? (result?.uri ?? local) : null;
  const image = uri ? (
    <Image
      source={{ uri, cache: "reload" }}
      resizeMode={full ? "contain" : "cover"}
      fadeDuration={0}
      accessible={false}
      style={StyleSheet.absoluteFill}
      onError={() => setResult("error")}
    />
  ) : null;
  const foreground = full ? tokens.color.surface : tokens.color.ink;
  return (
    <View style={[s.photo, full && s.fullPhoto, style]}>
      {image ? (
        onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            style={StyleSheet.absoluteFill}
            onPress={onOpen}
          >
            {image}
          </Pressable>
        ) : (
          image
        )
      ) : result === "denied" ? (
        <Text style={[s.help, { color: foreground }]}>图片不可查看</Text>
      ) : result === "error" ? (
        <View style={s.center}>
          <Text style={[s.help, { color: foreground }]}>图片无法加载</Text>
          {!local ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重试加载图片"
              style={s.touch}
              onPress={() => retry((n) => n + 1)}
            >
              <Text
                style={{ color: full ? foreground : tokens.color.brandText }}
              >
                重试
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ActivityIndicator
          color={foreground}
          accessibilityLabel="正在加载图片"
        />
      )}
    </View>
  );
}

function pinchSpan(event: GestureResponderEvent) {
  const [a, b] = event.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
}
function PhotoViewer({
  count,
  index,
  source,
  onSelect,
  onClose,
}: {
  count: number;
  index: number;
  source: Source;
  onSelect: (n: number) => void;
  onClose: () => void;
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const current = useRef(transform);
  const change = (v: typeof transform) => {
    current.current = v;
    setTransform(v);
  };
  const reset = () => change({ scale: 1, x: 0, y: 0 });
  const switchBy = (n: number) => {
    const target = index + n;
    if (target >= 0 && target < count) {
      reset();
      onSelect(target);
    }
  };
  const pan = useMemo(() => {
    let span = 0;
    let start = current.current;
    let pinched = false;
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => !!pinchSpan(e),
      onMoveShouldSetPanResponderCapture: (e, g) =>
        !!pinchSpan(e) || Math.max(Math.abs(g.dx), Math.abs(g.dy)) > 12,
      onPanResponderGrant: (e) => {
        start = current.current;
        span = pinchSpan(e);
        pinched = span > 0;
      },
      onPanResponderMove: (e, g) => {
        const distance = pinchSpan(e);
        if (distance > 0) {
          if (!span) {
            start = current.current;
            span = distance;
          }
          pinched = true;
          const scale = Math.max(
            1,
            Math.min(4, (start.scale * distance) / span),
          );
          change({ scale, x: 0, y: 0 });
        } else if (!pinched && start.scale > 1) {
          change({
            scale: start.scale,
            x: Math.max(-400, Math.min(400, start.x + g.dx)),
            y: Math.max(-550, Math.min(550, start.y + g.dy)),
          });
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (
          !pinched &&
          start.scale === 1 &&
          Math.abs(g.dx) > Math.max(48, Math.abs(g.dy))
        )
          switchBy(g.dx < 0 ? 1 : -1);
      },
    });
  }, [index, count, onSelect]);
  const toggleZoom = () =>
    transform.scale > 1 ? reset() : change({ scale: 2, x: 0, y: 0 });
  const white = tokens.color.surface;
  return (
    <SafeAreaModal
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <SafeAreaView accessibilityViewIsModal style={s.viewer}>
        <StatusBar style="light" />
        <View style={s.viewerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭图片"
            style={s.touch}
            onPress={onClose}
          >
            <Icon name="close" color={white} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={s.counter}>
            {index + 1} / {count}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={s.touch}
            onPress={toggleZoom}
          >
            <Text style={s.counter}>
              {transform.scale > 1 ? "缩小" : "放大"}
            </Text>
          </Pressable>
        </View>
        <View style={s.viewerBody} {...pan.panHandlers}>
          <Photo
            key={index}
            source={source}
            full
            label="放大或缩小图片"
            onOpen={toggleZoom}
            style={{
              transform: [
                { translateX: transform.x },
                { translateY: transform.y },
                { scale: transform.scale },
              ],
            }}
          />
        </View>
        {count > 1 ? (
          <View style={s.viewerHeader}>
            <Pressable
              disabled={index === 0}
              accessibilityRole="button"
              style={s.touch}
              onPress={() => switchBy(-1)}
            >
              <Text style={[s.counter, index === 0 && s.dim]}>上一张</Text>
            </Pressable>
            <Pressable
              disabled={index === count - 1}
              accessibilityRole="button"
              style={s.touch}
              onPress={() => switchBy(1)}
            >
              <Text style={[s.counter, index === count - 1 && s.dim]}>
                下一张
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaModal>
  );
}

export function CirclePhotoGallery({
  post,
  request,
}: {
  post: Circle["Post"];
  request: CircleRequest;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const media = post.media ?? [];
  useFocusEffect(
    useCallback(() => {
      setActive(
        AppState.currentState !== "background" &&
          AppState.currentState !== "inactive",
      );
      const listener = AppState.addEventListener("change", (state) => {
        setActive(state === "active");
        if (state !== "active") setIndex(null);
      });
      return () => {
        listener.remove();
        setActive(false);
        setIndex(null);
      };
    }, [request, post.id]),
  );
  const selected = index === null ? undefined : media[index];
  const path = (id: string, variant: "thumb" | "full") =>
    `/v1/posts/${post.id}/media/${id}/${variant}`;
  return (
    <>
      <View style={s.row}>
        {media.map(({ id }, n) =>
          active ? (
            <Photo
              key={id}
              source={{ request, path: path(id, "thumb") }}
              style={media.length === 1 ? s.single : s.square}
              label={`查看第${n + 1}张图片`}
              onOpen={() => setIndex(n)}
            />
          ) : (
            <View
              key={id}
              style={[s.photo, media.length === 1 ? s.single : s.square]}
            />
          ),
        )}
      </View>
      {active && selected && index !== null ? (
        <PhotoViewer
          index={index}
          count={media.length}
          source={{ request, path: path(selected.id, "full") }}
          onSelect={setIndex}
          onClose={() => setIndex(null)}
        />
      ) : null}
    </>
  );
}

export function CirclePhotoEditor({
  photos,
  failed,
  disabled,
  onAdd,
  onRemove,
}: {
  photos: CirclePhoto[];
  failed: string | null;
  disabled: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const selected = index === null ? undefined : photos[index];
  return (
    <View style={{ gap: 7 }}>
      <View style={s.editorHeader}>
        <Text style={s.editorTitle}>
          图片 <Text style={s.help}>选填</Text>
        </Text>
        <Text style={s.help}>
          {photos.length}/{photoLimit}
        </Text>
      </View>
      <View style={s.row}>
        {photos.map((photo, i) => (
          <View key={photo.upload} style={{ flex: 1, gap: 1 }}>
            <View style={{ aspectRatio: 1 }}>
              <Photo
                source={photo}
                style={StyleSheet.absoluteFill}
                label={`预览第${i + 1}张图片`}
                onOpen={disabled ? undefined : () => setIndex(i)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`移除第${i + 1}张图片`}
                disabled={disabled}
                onPress={() => onRemove(i)}
                style={s.remove}
              >
                <View style={s.removeIcon}>
                  <Icon name="close" size={18} color={tokens.color.surface} />
                </View>
              </Pressable>
            </View>
            {failed === photo.uri ? (
              <Text style={s.failed}>上传失败</Text>
            ) : null}
          </View>
        ))}
        {photos.length < photoLimit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加图片"
            disabled={disabled}
            onPress={onAdd}
            style={s.add}
          >
            <Icon name="plus" size={22} color={tokens.color.brandPrimary} />
            <Text style={s.help}>添加图片</Text>
          </Pressable>
        ) : null}
        {Array.from(
          { length: Math.max(0, photoLimit - photos.length - 1) },
          (_, i) => (
            <View key={i} style={s.square} />
          ),
        )}
      </View>
      <Text style={[s.help, { textAlign: "left" }]}>
        请避开门禁码、面单和住户信息
      </Text>
      {selected && index !== null ? (
        <PhotoViewer
          index={index}
          count={photos.length}
          source={selected}
          onSelect={setIndex}
          onClose={() => setIndex(null)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  square: { flex: 1, aspectRatio: 1 },
  single: { flex: 1, aspectRatio: 16 / 9, maxHeight: 220 },
  photo: {
    borderRadius: 12,
    backgroundColor: tokens.color.surfaceMuted,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fullPhoto: {
    flex: 1,
    alignSelf: "stretch",
    borderRadius: 0,
    backgroundColor: tokens.color.ink,
  },
  viewer: { flex: 1, backgroundColor: tokens.color.ink },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 48,
  },
  viewerBody: { flex: 1, overflow: "hidden" },
  touch: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: { fontSize: 15, fontWeight: "600", color: tokens.color.surface },
  dim: { opacity: 0.45 },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  editorTitle: { fontSize: 15, fontWeight: "600", color: tokens.color.ink },
  help: { fontSize: 12, color: tokens.color.textMuted, textAlign: "center" },
  remove: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: { backgroundColor: "#141414dd", borderRadius: 14, padding: 4 },
  add: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 48,
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: tokens.color.border,
    borderRadius: 12,
  },
  center: { alignItems: "center", justifyContent: "center" },
  failed: { color: tokens.color.danger, fontSize: 12 },
});
