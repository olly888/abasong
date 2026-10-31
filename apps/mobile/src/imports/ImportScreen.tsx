import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import {
  ActionButton,
  ApartmentPage,
  AuthResolution,
  Field,
  FormError,
} from "../auth/AuthControls";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import { ListRow, SearchBox } from "../ui/Primitives";
import { extractCandidates } from "./extract";
import { recognize } from "./recognize";
import { exactApartment } from "./match";
import { createImageCache } from "./storage";
type S = components["schemas"];
type Source = {
  id: string;
  uri: string;
  state: "selected" | "processing" | "recognized" | "failed";
  error?: string;
};
type Candidate = {
  id: string;
  sourceId: string;
  address: string;
  value: string;
  scope: string;
  issues: string[];
  target: S["Apartment"] | null;
  selected: boolean;
  revision: number;
  privateId?: string;
  privateVersion?: number;
  shared?: boolean;
  status?: "private_saved" | "pending" | "active" | "same_value" | "failed";
  error?: string;
  entryKey: string;
  recordKey: string;
  shareKey: string;
};
function dispose(uri: string) {
  // Never delete a photo-library original or arbitrary URI.
  try {
    if (uri.startsWith(Paths.cache.uri.replace(/\/$/, "") + "/")) {
      const f = new File(uri);
      if (f.exists) f.delete();
    }
  } catch {
    /* cache cleanup retries belong to the draft storage phase */
  }
}
export default function ImportScreen() {
  const auth = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  if (!auth.session || !["ready", "loading-account"].includes(auth.phase))
    return <AuthResolution />;
  // System picker causes inactive state: cover, rather than unmounting its pending promise.
  return (
    <View style={{ flex: 1 }}>
      <Session key={auth.session.user.id} />
      {(!active || !focused || auth.phase !== "ready") && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <View style={{ flex: 1, backgroundColor: tokens.color.surface }} />
        </View>
      )}
    </View>
  );
}
function Session() {
  const auth = useAuth(),
    session = auth.session!;
  const params = useLocalSearchParams<{ mode?: string }>();
  const [sources, setSources] = useState<Source[]>([]),
    [rows, setRows] = useState<Candidate[]>([]),
    [stage, setStage] = useState<"select" | "review" | "result">("select"),
    [mode, setMode] = useState<"private_only" | "private_and_share">(
      params.mode === "private" ? "private_only" : "private_and_share",
    ),
    [locked, setLocked] = useState(false),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<S["Apartment"][]>([]),
    [searchBusy, setSearchBusy] = useState(false);
  const cache = useRef<ReturnType<typeof createImageCache> | null>(null);
  const live = useRef(true),
    running = useRef(false),
    abort = useRef(new AbortController()),
    allUris = useRef(new Set<string>()),
    rowsRef = useRef(rows),
    searchGeneration = useRef(0);
  rowsRef.current = rows;
  useEffect(() => {
    live.current = true;
    abort.current = new AbortController();
    return () => {
      live.current = false;
      abort.current.abort();
      for (const uri of allUris.current) dispose(uri);
      allUris.current.clear();
      cache.current?.dispose();
      cache.current = null;
    };
  }, []);
  const request = <T,>(
    path: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, { ...options, signal: abort.current.signal });
  const update = (id: string, patch: Partial<Candidate>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  function change(id: string, patch: Partial<Candidate>) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || row.privateId) return;
    update(id, {
      ...patch,
      revision: row.revision + 1,
      selected: false,
      entryKey: randomUUID(),
      recordKey: randomUUID(),
      shareKey: randomUUID(),
    });
    setAttested(false);
  }
  function candidate(
    sourceId: string,
    address = "",
    value = "",
    issues: string[] = [],
  ): Candidate {
    return {
      id: randomUUID(),
      sourceId,
      address,
      value,
      scope: "门别未注明",
      issues,
      target: null,
      selected: false,
      revision: 1,
      entryKey: randomUUID(),
      recordKey: randomUUID(),
      shareKey: randomUUID(),
    };
  }
  async function pick() {
    if (running.current) return;
    if (Platform.OS === "web") {
      setError("请在 iOS 或 Android 应用中选择截图");
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 10 - sources.length),
        allowsEditing: false,
        quality: 1,
        exif: false,
        base64: false,
        orderedSelection: true,
      });
      if (result.canceled) return;
      if (!live.current) {
        for (const a of result.assets) dispose(a.uri);
        return;
      }
      const next: Source[] = [];
      let bytes = sources.reduce((sum, s) => {
        try {
          return sum + new File(s.uri).size;
        } catch {
          return sum;
        }
      }, 0);
      for (const a of result.assets) {
        allUris.current.add(a.uri);
        if (
          sources.some((s) => s.uri === a.uri) ||
          next.some((s) => s.uri === a.uri)
        )
          continue;
        const size = new File(a.uri).size;
        if (
          size <= 0 ||
          size > 10 * 1024 * 1024 ||
          !a.width ||
          !a.height ||
          a.width * a.height > 24_000_000 ||
          bytes + size > 50 * 1024 * 1024 ||
          sources.length + next.length >= 10
        ) {
          dispose(a.uri);
          allUris.current.delete(a.uri);
          setError("最多10张，每张10MB、2400万像素，合计50MB");
          continue;
        }
        bytes += size;
        const id = randomUUID();
        cache.current ??= createImageCache(randomUUID());
        const uri = await cache.current.copy(a.uri, id);
        if (!live.current) {
          dispose(uri);
          return;
        }
        allUris.current.delete(a.uri);
        allUris.current.add(uri);
        next.push({ id, uri, state: "selected" });
      }
      setSources((old) => [...old, ...next]);
    } catch {
      if (live.current) setError("无法选择图片，请重试");
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function process() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      for (const source of sources.filter((s) => s.state !== "recognized")) {
        if (!live.current) break;
        setSources((old) =>
          old.map((s) =>
            s.id === source.id
              ? { ...s, state: "processing", error: undefined }
              : s,
          ),
        );
        try {
          const lines = await recognize(source.uri);
          const extracted = extractCandidates(lines); // Whole OCR text never persisted or uploaded.
          if (!live.current) break;
          const candidates: Candidate[] = [];
          for (const e of extracted) {
            const row = candidate(source.id, e.address, e.value, e.issues);
            if (e.address) {
              try {
                const page = await request<S["ApartmentPage"]>(
                  "/v1/apartments?query=" +
                    encodeURIComponent(e.address.split(",")[0].slice(0, 200)),
                );
                row.target = exactApartment(e.address, page.items);
                row.selected = !!row.target && !row.issues.length;
              } catch {
                /* Matching is recoverable in the confirmation editor. */
              }
            }
            candidates.push(row);
          }
          if (!live.current) break;
          setRows((old) => [
            ...old.filter((r) => r.sourceId !== source.id),
            ...candidates,
          ]);
          setSources((old) =>
            old.map((s) =>
              s.id === source.id
                ? {
                    ...s,
                    state: extracted.length ? "recognized" : "failed",
                    error: extracted.length ? undefined : "未识别到公寓密码",
                  }
                : s,
            ),
          );
        } catch {
          if (live.current)
            setSources((old) =>
              old.map((s) =>
                s.id === source.id
                  ? {
                      ...s,
                      state: "failed",
                      error: "识别失败，请重试或手动填写",
                    }
                  : s,
              ),
            );
        }
      }
      if (live.current) {
        setStage("review");
        setAttested(false);
      }
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function search() {
    if (query.trim().length < 2 || searchBusy) return;
    const version = ++searchGeneration.current;
    setSearchBusy(true);
    setError(null);
    try {
      const page = await request<S["ApartmentPage"]>(
        "/v1/apartments?query=" + encodeURIComponent(query.trim()),
      );
      if (live.current && version === searchGeneration.current)
        setMatches(page.items);
    } catch {
      if (live.current && version === searchGeneration.current)
        setError("搜索失败，请重试");
    } finally {
      if (live.current && version === searchGeneration.current)
        setSearchBusy(false);
    }
  }
  function leave() {
    if (running.current) return;
    Alert.alert(
      "离开截图导入？",
      "已保存的记录保留，未保存的识别结果将清除。",
      [
        { text: "继续核对", style: "cancel" },
        { text: "离开", style: "destructive", onPress: () => router.back() },
      ],
    );
  }
  async function submit() {
    if (running.current || !attested) return;
    const selected = rowsRef.current.filter(
      (r) =>
        r.selected &&
        r.value.trim() &&
        r.scope.trim() &&
        (r.target || (mode === "private_only" && r.address.trim())) &&
        (!r.privateId || (mode === "private_and_share" && !r.shared)),
    );
    if (!selected.length) return;
    running.current = true;
    setBusy(true);
    setLocked(true);
    setError(null);
    try {
      for (const row of selected) {
        if (!live.current) break;
        let privateId = row.privateId;
        let privateVersion = row.privateVersion;
        try {
          if (!privateId) {
            const entry = await request<S["LibraryEntry"]>(
              "/v1/me/apartment-library",
              {
                method: "POST",
                key: row.entryKey,
                body: row.target
                  ? { apartment_id: row.target.id }
                  : { address: row.address.trim() },
              },
            );
            const record = await request<S["PrivateRecord"]>(
              `/v1/me/apartment-library/${entry.id}/records`,
              {
                method: "POST",
                key: row.recordKey,
                body: {
                  value: row.value.trim(),
                  scope_label: row.scope.trim(),
                },
              },
            );
            privateId = record.id;
            privateVersion = record.version;
            if (live.current)
              update(row.id, {
                privateId,
                privateVersion,
                status: "private_saved",
                error: undefined,
              });
          }
          if (mode === "private_and_share" && !row.shared) {
            const result = await request<S["ContributionResult"]>(
              `/v1/me/private-access-records/${privateId}/share`,
              {
                method: "POST",
                key: row.shareKey,
                body: {
                  expected_version: privateVersion!,
                  source_attested: true,
                },
              },
            );
            if (live.current)
              update(row.id, {
                privateId,
                shared: true,
                status:
                  result.outcome === "same_value_validation"
                    ? "same_value"
                    : result.outcome === "created_active"
                      ? "active"
                      : "pending",
                error: undefined,
              });
          }
        } catch {
          if (live.current)
            update(row.id, {
              privateId,
              privateVersion,
              status: "failed",
              error: privateId
                ? "已保存，尚未共享；可重试"
                : "保存失败，可重试",
            });
        }
      }
      if (live.current) setStage("result");
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  const complete = (r: Candidate) =>
    !!r.value.trim() &&
    r.value.trim().length <= 32 &&
    !!r.scope.trim() &&
    !!(r.target || (mode === "private_only" && r.address.trim()));
  const pending = rows.filter(
    (r) =>
      r.selected &&
      complete(r) &&
      (!r.privateId || (mode === "private_and_share" && !r.shared)),
  );
  const editor = rows.find((r) => r.id === editing);
  return (
    <ApartmentPage
      title={
        editing
          ? "核对公寓"
          : stage === "select"
            ? "截图导入"
            : stage === "review"
              ? "确认识别结果"
              : "导入结果"
      }
      onBack={() => {
        if (editing) {
          setEditing(null);
          setMatches([]);
        } else if (stage === "review" && !locked) setStage("select");
        else leave();
      }}
      footer={
        <View style={{ gap: 12 }}>
          <FormError message={error} />
          {editing ? (
            <ActionButton
              label="完成核对"
              onPress={() => {
                setEditing(null);
                setMatches([]);
              }}
            />
          ) : stage === "select" ? (
            <ActionButton
              label={busy ? "正在处理…" : "识别截图"}
              busy={busy}
              disabled={!sources.length}
              onPress={() => void process()}
            />
          ) : (
            <ActionButton
              label={
                stage === "result"
                  ? pending.length
                    ? `重试 ${pending.length} 条`
                    : "完成"
                  : mode === "private_only"
                    ? `确认保存 ${pending.length} 条`
                    : `确认共享 ${pending.length} 条`
              }
              busy={busy}
              disabled={
                (stage !== "result" &&
                  (!pending.length ||
                    !attested ||
                    (mode === "private_and_share" &&
                      !auth.me?.capabilities.includes("access.contribute")))) ||
                (stage === "result" && pending.length > 0 && !attested)
              }
              onPress={() =>
                stage === "result" && !pending.length
                  ? router.back()
                  : void submit()
              }
            />
          )}
        </View>
      }
    >
      {stage === "select" ? (
        <>
          <Text style={styles.heading}>从截图整理公寓密码</Text>
          <ActionButton
            label="选择截图"
            secondary
            disabled={sources.length >= 10 || busy}
            onPress={() => void pick()}
          />
          <Text style={styles.meta}>已选 {sources.length} 张</Text>
          <View style={styles.tiles}>
            {sources.map((s, i) => (
              <View key={s.id} style={styles.tile}>
                <Image
                  source={{ uri: s.uri }}
                  style={styles.thumbnail}
                  accessibilityLabel={`截图 ${i + 1}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`移除截图 ${i + 1}`}
                  disabled={busy}
                  style={styles.remove}
                  onPress={() => {
                    dispose(s.uri);
                    allUris.current.delete(s.uri);
                    setSources((old) => old.filter((x) => x.id !== s.id));
                    setRows((old) => old.filter((r) => r.sourceId !== s.id));
                    setAttested(false);
                  }}
                >
                  <Text>移除</Text>
                </Pressable>
                <Text style={styles.meta}>
                  {s.state === "processing" ? "识别中" : (s.error ?? "")}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : editing && editor ? (
        <>
          <Image
            source={{ uri: sources.find((s) => s.id === editor.sourceId)?.uri }}
            style={styles.preview}
            resizeMode="contain"
            accessibilityLabel="原截图"
          />
          <Field
            label="截图地址"
            maxLength={300}
            value={editor.address}
            editable={!editor.privateId}
            onChangeText={(address) =>
              change(editor.id, { address, target: null })
            }
            autoCorrect={false}
          />
          <SearchBox
            value={query}
            onChange={(v) => {
              searchGeneration.current++;
              setSearchBusy(false);
              setQuery(v);
              setMatches([]);
            }}
            busy={searchBusy}
            onSearch={() => void search()}
          />
          {searchBusy ? <ActivityIndicator /> : null}
          {matches.map((p) => (
            <ListRow
              key={p.id}
              title={p.name ?? "公寓"}
              subtitle={`${p.address_line1}, ${p.city}, ${p.state}`}
              onPress={() => {
                change(editor.id, { target: p });
                setMatches([]);
              }}
            />
          ))}
          <Text style={styles.meta}>
            {editor.target
              ? `已选：${editor.target.address_line1}, ${editor.target.city}`
              : "请选择对应公寓；未收录地址可先私存"}
          </Text>
          <Field
            label="密码"
            value={editor.value}
            maxLength={32}
            editable={!editor.privateId}
            onChangeText={(value) => change(editor.id, { value })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="门别"
            value={editor.scope}
            maxLength={100}
            editable={!editor.privateId}
            placeholder="例如：行人门"
            onChangeText={(scope) => change(editor.id, { scope })}
          />
        </>
      ) : (
        <>
          {stage === "review" ? (
            <>
              <View style={styles.modeRow}>
                {(["private_and_share", "private_only"] as const).map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: mode === m,
                      disabled: locked || busy,
                    }}
                    disabled={locked || busy}
                    onPress={() => {
                      if (mode === m) return;
                      setMode(m);
                      setAttested(false);
                      setRows((old) =>
                        old.map((r) => ({ ...r, selected: false })),
                      );
                    }}
                    style={[styles.mode, mode === m && styles.chosen]}
                  >
                    <Text style={styles.label}>
                      {m === "private_only" ? "仅自己保存" : "共享并保存"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: attested, disabled: busy }}
                disabled={busy}
                style={styles.check}
                onPress={() => setAttested((x) => !x)}
              >
                <Text style={styles.label}>
                  {attested ? "☑" : "□"}{" "}
                  我已核对地址与密码，并有权保存或共享这些资料
                </Text>
              </Pressable>
            </>
          ) : null}
          {sources
            .filter((s) => s.state === "failed")
            .map((s) => (
              <View key={s.id} style={styles.card}>
                <Text>{s.error}</Text>
                <ActionButton
                  label="手动补充"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    const r = candidate(s.id);
                    setRows((old) => [...old, r]);
                    setEditing(r.id);
                    setQuery("");
                  }}
                />
                <ActionButton
                  label="重新识别"
                  secondary
                  disabled={busy || locked}
                  onPress={() => void process()}
                />
              </View>
            ))}
          {rows.map((r, index) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.label}>
                {r.target?.name ?? (r.address || `待核对 ${index + 1}`)}
              </Text>
              {r.target ? (
                <Text style={styles.meta}>
                  {r.target.address_line1}, {r.target.city}, {r.target.state}
                </Text>
              ) : null}
              <Text style={styles.code}>{r.value || "缺少密码"}</Text>
              <Text style={styles.meta}>{r.scope || "门别待确认"}</Text>
              {r.error ? (
                <Text style={styles.error}>{r.error}</Text>
              ) : r.status ? (
                <Text style={styles.meta}>
                  {r.status === "active"
                    ? "已私存 · 已共享"
                    : r.status === "pending"
                      ? "已私存 · 共享待审核"
                      : r.status === "same_value"
                        ? "已私存 · 同码记录"
                        : "已保存到我的公寓"}
                </Text>
              ) : stage === "result" ? (
                <Text style={styles.meta}>未提交</Text>
              ) : !r.target && mode === "private_and_share" ? (
                <Text style={styles.meta}>公寓待匹配</Text>
              ) : r.issues.length ? (
                <Text style={styles.meta}>{r.issues.join(" · ")}</Text>
              ) : null}
              <View style={styles.modeRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`选择第 ${index + 1} 条`}
                  accessibilityState={{
                    checked: r.selected,
                    disabled: busy || !complete(r) || !!r.privateId,
                  }}
                  disabled={busy || !complete(r) || !!r.privateId}
                  style={styles.check}
                  onPress={() => {
                    update(r.id, { selected: !r.selected });
                    setAttested(false);
                  }}
                >
                  <Text>{r.selected ? "☑" : "□"} 选择</Text>
                </Pressable>
                {!r.privateId ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={styles.check}
                    onPress={() => {
                      setEditing(r.id);
                      setQuery(r.address.split(",")[0]);
                      setMatches([]);
                    }}
                  >
                    <Text style={styles.link}>核对 / 修改</Text>
                  </Pressable>
                ) : null}
                {!r.privateId ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={styles.check}
                    onPress={() => {
                      setRows((old) => old.filter((x) => x.id !== r.id));
                      setAttested(false);
                    }}
                  >
                    <Text>移除</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {!rows.length ? (
            <Text style={styles.meta}>暂无可确认记录，请重试或手动补充。</Text>
          ) : null}
          {stage === "result" &&
          rows.some(
            (r) => !r.privateId || (mode === "private_and_share" && !r.shared),
          ) ? (
            <ActionButton
              label="继续确认未完成资料"
              secondary
              disabled={busy}
              onPress={() => setStage("review")}
            />
          ) : null}
          {stage === "review" && !locked ? (
            <ActionButton
              label="继续选图"
              secondary
              disabled={busy}
              onPress={() => setStage("select")}
            />
          ) : null}
        </>
      )}
    </ApartmentPage>
  );
}
const styles = StyleSheet.create({
  heading: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  meta: { fontSize: 14, lineHeight: 22, color: tokens.color.textMuted },
  label: { fontSize: 16, lineHeight: 24, color: tokens.color.ink },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "46%", gap: 6 },
  thumbnail: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: tokens.color.surfaceMuted,
  },
  remove: { minHeight: 44, justifyContent: "center" },
  preview: {
    width: "100%",
    height: 210,
    backgroundColor: tokens.color.surfaceMuted,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  mode: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  chosen: {
    backgroundColor: tokens.color.brandSurface,
    borderColor: tokens.color.brandPrimary,
  },
  check: { minHeight: 48, justifyContent: "center", paddingVertical: 8 },
  card: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  code: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  error: { fontSize: 14, color: tokens.color.danger },
  link: { color: tokens.color.brandPrimary },
});
