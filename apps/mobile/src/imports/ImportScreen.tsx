import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import {
  isEntranceScope,
  unconfirmedEntrance,
  type components,
} from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import {
  ActionButton,
  ApartmentPage,
  AuthResolution,
  FormError,
} from "../auth/AuthControls";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import { AccessCodeFields } from "../apartments/AccessCodeFields";
import { CheckField } from "../ui/CheckField";
import { AddressLine } from "../apartments/AddressLine";
import { ContributionAddressField } from "../apartments/ContributionAddressField";
import { EntranceScopeField } from "../apartments/EntranceScopeField";
import { ChoiceChip } from "../ui/ChoiceChip";
import {
  canShareCandidate,
  groupImportCandidates,
  importAddressLabel,
} from "./candidate-address";
import { importCommitPatch } from "./commit-patch";
import { inspectScreenshot } from "./extract";
import { runRecognitionBatch, RecognitionError } from "./recognition-work";
import { recognize } from "./recognize";
import { buildingAddress, exactApartment } from "./match";
import {
  hasUnsubmittedImportWork,
  savedImportDestination,
} from "./exit-policy";
import { ServerDraft } from "./server-draft";
import { exitImport } from "./navigation";
import { createImageCache } from "./storage";
import { keepImportSession } from "./session-gate";
import { needsScreenshotReview } from "./review-issues";
import type { ContributionRequest } from "../apartments/contribution-address-search";
type S = components["schemas"];
const issueLabels: Record<string, string> = {
  missing_address: "缺少地址",
  missing_value: "缺少门禁码",
  ambiguous_pair: "地址与密码对应不明",
  uncertain_characters: "请核对字符",
  uncertain_address: "请核对地址",
  unmatched_apartment: "请核对公寓地址",
  duplicate: "存在重复资料",
  unsupported_method: "暂不支持此进入方式",
};
export type { Candidate, Source } from "./types";
import type { Candidate, Source } from "./types";
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
  if (!keepImportSession(auth)) return <AuthResolution />;
  const covered = !active || !focused || auth.phase !== "ready";
  // System picker causes inactive state: cover, rather than unmounting its pending promise.
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={covered ? "none" : "auto"}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        <ImportSession
          key={auth.session!.user.id}
          session={auth.session!}
          canContribute={!!auth.me?.capabilities.includes("access.contribute")}
        />
      </View>
      {covered && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          {auth.phase === "error" ? (
            <AuthResolution />
          ) : (
            <View style={{ flex: 1, backgroundColor: tokens.color.surface }} />
          )}
        </View>
      )}
    </View>
  );
}
export function ImportSession(p: {
  session: AuthSession;
  canContribute: boolean;
  transport?: ContributionRequest;
  testControls?: ReactNode;
  initialReview?: { sources: Source[]; rows: Candidate[] };
  onCompleted?: (rows: Candidate[]) => void;
  onOpenLibrary?: (params: {
    tab: "saved";
    revision: string;
    entry_id?: string;
  }) => void;
}) {
  const { session } = p;
  const latest = useRef(p);
  latest.current = p;
  const [sources, setSources] = useState<Source[]>(
      p.initialReview?.sources ?? [],
    ),
    [rows, setRows] = useState<Candidate[]>(p.initialReview?.rows ?? []),
    [stage, setStage] = useState<"select" | "review" | "result">(
      p.initialReview ? "review" : "select",
    ),
    [mode, setMode] = useState<"private_only" | "private_and_share">(
      p.initialReview ? "private_and_share" : "private_only",
    ),
    [locked, setLocked] = useState(false),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [exitAccepted, setExitAccepted] = useState(false),
    [processing, setProcessing] = useState(false),
    [progress, setProgress] = useState({ finished: 0, total: 0 });
  const server = useRef<ServerDraft | null>(null);
  const cache = useRef<ReturnType<typeof createImageCache> | null>(null);
  const live = useRef(true),
    running = useRef(false),
    recognitionAbort = useRef<AbortController | null>(null),
    abort = useRef(new AbortController()),
    allUris = useRef(new Set<string>()),
    rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    live.current = true;
    abort.current = new AbortController();
    server.current = new ServerDraft(
      session,
      abort.current.signal,
      (path, options) => request(path, options),
    );
    return () => {
      live.current = false;
      abort.current.abort();
      recognitionAbort.current?.abort();
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
    (
      latest.current.transport ??
      ((path, options) => dataRequest(latest.current.session, path, options))
    )<T>(path, {
      ...options,
      signal: options.signal ?? abort.current.signal,
    });
  const update = (id: string, patch: Partial<Candidate>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  function change(id: string, patch: Partial<Candidate>) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || row.privateId) return;
    const addressChanged =
      ("address" in patch && patch.address !== row.address) ||
      ("target" in patch && patch.target?.id !== row.target?.id);
    update(id, {
      ...patch,
      ...(addressChanged && isEntranceScope(row.scope)
        ? { scope: unconfirmedEntrance }
        : {}),
      revision: row.revision + 1,
      selected: false,
      status: undefined,
      error: undefined,
      sharedApartmentId: undefined,
      needsAddressReview: false,
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
      sourceAddress: address,
      value,
      scope: unconfirmedEntrance,
      issues,
      target: null,
      selected: false,
      revision: 1,
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
        next.push({
          id,
          uri,
          state: "selected",
          width: a.width,
          height: a.height,
          bytes: size,
          mime:
            a.mimeType === "image/heic"
              ? "image/heic"
              : a.mimeType === "image/png"
                ? "image/png"
                : "image/jpeg",
        });
      }
      setSources((old) => [...old, ...next]);
    } catch {
      if (live.current) setError("无法选择图片，请重试");
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function process(sourceId?: string) {
    if (running.current || locked) return;
    const task = new AbortController();
    recognitionAbort.current = task;
    running.current = true;
    setBusy(true);
    setProcessing(true);
    setError(null);
    const valid = () => live.current && recognitionAbort.current === task;
    let anyRows = rows.length > 0;
    const sourceState = (id: string, patch: Partial<Source>) => {
      if (valid())
        setSources((old) =>
          old.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        );
    };
    try {
      const outcome = await runRecognitionBatch(
        sources.filter(
          (s) =>
            s.state !== "recognized" &&
            s.state !== "restricted" &&
            (!sourceId || sourceId === s.id),
        ),
        task.signal,
        async (source, signal) => {
          const lines = await recognize(
            source.uri,
            signal,
            undefined,
            "carrier",
          );
          const inspected = inspectScreenshot(lines);
          const candidates: Candidate[] = [];
          for (const e of inspected.candidates) {
            if (signal.aborted) break;
            const address = buildingAddress(e.address);
            const issues = [...e.issues];
            if (address.needsReview && !issues.includes("请核对地址"))
              issues.push("请核对地址");
            const row = candidate(source.id, address.address, e.value, issues);
            if (e.carrierDoorLabel) {
              row.carrierDoorLabel = e.carrierDoorLabel;
            }
            if (address.street && !address.needsReview) {
              try {
                const page = await request<S["ApartmentPage"]>(
                  "/v1/apartments?query=" +
                    encodeURIComponent(address.street.slice(0, 200)),
                  { signal },
                );
                row.target = exactApartment(address.address, page.items);
              } catch {
                /* Unavailable matching stays editable; cancellation is checked before publish. */
              }
            }
            row.selected =
              mode === "private_only" && !!row.address && !row.issues.length;
            candidates.push(row);
          }
          return { candidates, deliveryOnly: inspected.deliveryOnly };
        },
        {
          start: (s) =>
            sourceState(s.id, { state: "processing", error: undefined }),
          result: (s, { candidates, deliveryOnly }) => {
            if (!valid()) return;
            anyRows ||= candidates.length > 0;
            setRows((old) => [
              ...old.filter((r) => r.sourceId !== s.id),
              ...candidates,
            ]);
            sourceState(s.id, {
              state: deliveryOnly
                ? "restricted"
                : candidates.length
                  ? "recognized"
                  : "failed",
              error:
                deliveryOnly || candidates.length
                  ? undefined
                  : "未识别到公寓密码",
            });
          },
          failed: (s, e) =>
            sourceState(s.id, {
              state: "failed",
              error:
                e instanceof RecognitionError
                  ? e.message
                  : "识别失败，请重试或手动填写",
            }),
          paused: (s) =>
            sourceState(s.id, { state: "selected", error: undefined }),
          progress: (finished, total) => {
            if (valid()) setProgress({ finished, total });
          },
        },
      );
      if (valid()) {
        if (outcome.stopped && !task.signal.aborted)
          setError("上一张截图仍在处理，请稍后再试");
        setStage(task.signal.aborted && !anyRows ? "select" : "review");
        setAttested(false);
      }
    } finally {
      if (valid()) {
        recognitionAbort.current = null;
        running.current = false;
        setProcessing(false);
        setBusy(false);
      }
    }
  }
  function continueRemainingImages() {
    if (running.current) return;
    if (!locked) {
      void process();
      return;
    }
    // The previous submission fixed its scope and durable plans. Continue only
    // unfinished images in an explicit new draft; never append to that plan.
    const remaining = sources.filter(
      (s) => s.state !== "recognized" && s.state !== "restricted",
    );
    for (const source of sources.filter(
      (s) => s.state === "recognized" || s.state === "restricted",
    )) {
      dispose(source.uri);
      allUris.current.delete(source.uri);
    }
    server.current = new ServerDraft(
      session,
      abort.current.signal,
      (path, options) => request(path, options),
    );
    setSources(
      remaining.map((s) => ({ ...s, state: "selected", error: undefined })),
    );
    setRows([]);
    setLocked(false);
    setAttested(false);
    setStage("select");
    setError(null);
  }
  const exitPromptOpen = useRef(false);
  const reviewScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const reviewOffset = useRef(0);
  const returnOffset = useRef<number | null>(null);
  function openReviewEditor(id: string) {
    returnOffset.current = reviewOffset.current;
    setEditing(id);
  }
  useEffect(() => {
    if (editing || stage !== "review" || returnOffset.current === null) return;
    const offset = returnOffset.current;
    const timer = setTimeout(() => {
      reviewScroll.current?.scrollTo({ y: offset, animated: false });
      returnOffset.current = null;
    }, 50);
    return () => clearTimeout(timer);
  }, [editing, stage]);
  usePreventRemove(
    !exitAccepted && (busy || hasUnsubmittedImportWork(rows, sources, mode)),
    ({ repeat }) => {
      if (running.current || exitPromptOpen.current) return;
      exitPromptOpen.current = true;
      const dismiss = () => {
        exitPromptOpen.current = false;
      };
      Alert.alert(
        "离开截图添加？",
        "未提交的内容将清除，已保存或共享的资料会保留。",
        [
          { text: "继续添加", style: "cancel", onPress: dismiss },
          {
            text: "离开",
            style: "destructive",
            onPress: () => {
              dismiss();
              setExitAccepted(true);
              repeat();
            },
          },
        ],
        { cancelable: true, onDismiss: dismiss },
      );
    },
  );
  function finish() {
    const unfinished = hasUnsubmittedImportWork(rows, sources, mode);
    if (p.onCompleted && !unfinished) return p.onCompleted(rows);
    const params = savedImportDestination(rows, String(Date.now()));
    if (!params) return leave();
    if (p.onOpenLibrary && !unfinished) return p.onOpenLibrary(params);
    router.dismissTo({ pathname: "/apartments/library", params });
  }
  function leave() {
    if (!running.current) exitImport(router);
  }
  function backWithinImport() {
    if (processing) recognitionAbort.current?.abort();
    else if (running.current) return;
    else if (editing) {
      setEditing(null);
    } else if (stage === "review" && !locked) setStage("select");
    else leave();
  }
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        backWithinImport();
        return true;
      });
      return () => sub.remove();
    }, [processing, editing, stage, locked]),
  );
  async function submit() {
    if (running.current || !attested) return;
    const selected = pending;
    if (!selected.length) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await server.current!.commit(
        rows,
        selected,
        sources,
        mode,
      );
      if (live.current) {
        for (const { localId, out } of result)
          update(localId, importCommitPatch(out));
        setLocked(!!server.current!.batch?.mode_locked);
        setStage("result");
      }
    } catch (e) {
      if (live.current) {
        setLocked(!!server.current!.batch?.mode_locked);
        setError(e instanceof Error ? e.message : "提交失败，请重试");
      }
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  const complete = (r: Candidate) =>
    !!r.value.trim() &&
    r.value.trim().length <= 32 &&
    !!r.scope.trim() &&
    (mode === "private_only"
      ? !!r.address.trim()
      : canShareCandidate(r) &&
        (isEntranceScope(r.scope) ||
          (!!p.initialReview && r.scope !== unconfirmedEntrance)));
  const pending = rows.filter(
    (r) =>
      r.selected &&
      complete(r) &&
      !needsScreenshotReview(r) &&
      (!r.privateId || (mode === "private_and_share" && !r.shared)),
  );
  const editor = rows.find((r) => r.id === editing);
  const skippedScreenshots = sources.filter(
    (s) => s.state === "restricted",
  ).length;
  function chooseMode(next: typeof mode) {
    if (locked || busy || mode === next) return;
    setMode(next);
    setAttested(false);
    if (next === "private_and_share")
      setRows((old) =>
        old.map((r) =>
          r.selected && (!canShareCandidate(r) || !isEntranceScope(r.scope))
            ? { ...r, selected: false }
            : r,
        ),
      );
  }
  const addressReview = rows.find((r) => r.needsAddressReview && !r.privateId);
  const sharedRow = rows.find(
    (r) => r.shared && (r.sharedApartmentId || r.target),
  );
  const sharedApartmentId =
    sharedRow?.sharedApartmentId ?? sharedRow?.target?.id;
  function reviewAddress() {
    if (!addressReview) return;
    setAttested(false);
    setStage("review");
    openReviewEditor(addressReview.id);
  }
  return (
    <ApartmentPage
      key={editing ? "candidate" : stage}
      scrollRef={!editing && stage === "review" ? reviewScroll : undefined}
      onScroll={
        !editing && stage === "review"
          ? (offset) => {
              reviewOffset.current = offset;
            }
          : undefined
      }
      title={
        editing
          ? "核对公寓"
          : stage === "select"
            ? "从截图添加"
            : stage === "review"
              ? "确认识别结果"
              : "导入结果"
      }
      headerRight={
        stage === "review" && !editing && !processing && !locked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加截图"
            disabled={busy}
            onPress={() => setStage("select")}
            style={styles.headerAction}
          >
            <Text style={styles.link}>添加截图</Text>
          </Pressable>
        ) : undefined
      }
      onBack={backWithinImport}
      footer={
        <View style={{ gap: 12 }}>
          <FormError message={error} />
          {processing ? (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.meta}>
                已处理 {progress.finished} / {progress.total} 张
              </Text>
              <ActionButton
                label="停止识别"
                secondary
                onPress={() => recognitionAbort.current?.abort()}
              />
            </>
          ) : editing ? (
            <ActionButton
              label="完成核对"
              onPress={() => {
                if (editor && complete(editor))
                  update(editor.id, { reviewedRevision: editor.revision });
                setEditing(null);
              }}
            />
          ) : stage === "select" ? (
            <ActionButton
              label={
                sources.length ? `识别 ${sources.length} 张截图` : "选择截图"
              }
              busy={busy}
              onPress={() => (sources.length ? void process() : void pick())}
            />
          ) : (
            <>
              {stage === "review" ? (
                <>
                  {mode === "private_and_share" && !p.canContribute ? (
                    <Text style={styles.error}>共享资格待核验</Text>
                  ) : null}
                  {pending.length ? (
                    <CheckField
                      label={`我已核对，并有权${mode === "private_only" ? "保存" : "共享"}所选资料`}
                      checked={attested}
                      disabled={busy}
                      onChange={setAttested}
                    />
                  ) : null}
                </>
              ) : null}
              <ActionButton
                label={
                  stage === "result"
                    ? addressReview
                      ? "核对地址"
                      : pending.length
                        ? `重试 ${pending.length} 条`
                        : rows.some((r) => r.privateId) && !p.onCompleted
                          ? "查看我的公寓"
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
                      (mode === "private_and_share" && !p.canContribute))) ||
                  (stage === "result" &&
                    !addressReview &&
                    pending.length > 0 &&
                    !attested)
                }
                onPress={() =>
                  stage === "result" && addressReview
                    ? reviewAddress()
                    : stage === "result" && !pending.length
                      ? finish()
                      : void submit()
                }
              />
              {stage === "result" &&
              !p.onCompleted &&
              sharedApartmentId &&
              !pending.length &&
              !addressReview ? (
                <ActionButton
                  label="在地图查看"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    router.replace({
                      pathname: "/",
                      params: { apartment_id: sharedApartmentId },
                    })
                  }
                />
              ) : null}
            </>
          )}
        </View>
      }
    >
      {p.testControls}
      {stage === "select" ? (
        <>
          <View style={styles.scopeRow}>
            <Text style={styles.label}>
              {sources.length
                ? `已选 ${sources.length} 张`
                : "添加公寓地址和门禁码截图"}
            </Text>
            {sources.length > 0 && sources.length < 10 ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void pick()}
                style={styles.check}
              >
                <Text style={styles.link}>继续添加</Text>
              </Pressable>
            ) : null}
          </View>
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
          <ContributionAddressField
            key={editor.id}
            value={
              editor.target
                ? { kind: "apartment", apartment: editor.target }
                : editor.confirmedAddress
                  ? { kind: "address", address: editor.confirmedAddress }
                  : mode === "private_only"
                    ? { kind: "private", address: editor.address }
                    : { kind: "pending" }
            }
            initialQuery={editor.address}
            isPrivate={mode === "private_only"}
            disabled={busy || !!editor.privateId}
            request={request}
            onChange={(value) => {
              if (value.kind === "apartment")
                change(editor.id, {
                  target: value.apartment,
                  confirmedAddress: null,
                  address: importAddressLabel(value.apartment),
                });
              else if (value.kind === "address")
                change(editor.id, {
                  target: null,
                  confirmedAddress: value.address,
                  address: importAddressLabel(value.address),
                });
              else if (value.kind === "private")
                change(editor.id, {
                  target: null,
                  confirmedAddress: null,
                  address: value.address,
                  sourceAddress: value.address,
                });
              else change(editor.id, { target: null, confirmedAddress: null });
            }}
          />
          <AccessCodeFields
            value={editor.value}
            address={
              editor.target ? importAddressLabel(editor.target) : editor.address
            }
            scope={editor.scope}
            hideScope
            disabled={busy || !!editor.privateId}
            onValueChange={(value) => change(editor.id, { value })}
            onScopeChange={(scope) =>
              change(editor.id, {
                scope: scope || unconfirmedEntrance,
              })
            }
          />
          <EntranceScopeField
            value={editor.scope}
            sourceLabel={editor.carrierDoorLabel}
            disabled={busy || !!editor.privateId}
            onChange={(scope) =>
              change(editor.id, { scope: scope || unconfirmedEntrance })
            }
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.check}
            onPress={() => {
              setRows((old) => old.filter((x) => x.id !== editor.id));
              setEditing(null);
              setAttested(false);
            }}
          >
            <Text style={styles.error}>移除这条资料</Text>
          </Pressable>
        </>
      ) : (
        <>
          {stage === "review" ? (
            <>
              <Text style={styles.label}>保存方式</Text>
              <View style={styles.modeRow}>
                <ChoiceChip
                  label="仅自己保存"
                  selected={mode === "private_only"}
                  disabled={locked || busy}
                  onPress={() => chooseMode("private_only")}
                />
                <ChoiceChip
                  label="共享并保存"
                  selected={mode === "private_and_share"}
                  disabled={locked || busy}
                  onPress={() => chooseMode("private_and_share")}
                />
              </View>
              <Text style={styles.meta}>
                {mode === "private_only"
                  ? "存入「我的公寓」，以后随时查。你也可以之后再决定是否共享。"
                  : "同时存入「我的公寓」。有资格的司机可查阅，并可反馈这条码是否有用。"}
              </Text>
              <Text style={styles.label}>
                {rows.length} 条资料
                {rows.length ? ` · 已选 ${pending.length} 条` : ""}
              </Text>
            </>
          ) : null}
          {stage === "review" && skippedScreenshots > 0 ? (
            <Text style={styles.meta}>
              已跳过 {skippedScreenshots} 张仅供本次派送的截图
            </Text>
          ) : null}
          {sources.some(
            (s) => s.state === "selected" || (locked && s.state === "failed"),
          ) ? (
            <ActionButton
              label="继续处理剩余截图"
              secondary
              disabled={busy}
              onPress={continueRemainingImages}
            />
          ) : null}
          {sources
            .filter((s) => !locked && s.state === "failed")
            .map((s) => (
              <View key={s.id} style={styles.card}>
                <Text>{s.error}</Text>
                <ActionButton
                  label="手动补充"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    const r = candidate(s.id);
                    setSources((old) =>
                      old.map((source) =>
                        source.id === s.id
                          ? { ...source, state: "recognized", error: undefined }
                          : source,
                      ),
                    );
                    setRows((old) => [...old, r]);
                    openReviewEditor(r.id);
                  }}
                />
                <ActionButton
                  label="重新识别"
                  secondary
                  disabled={busy || locked}
                  onPress={() => void process(s.id)}
                />
              </View>
            ))}
          {groupImportCandidates(rows).map(([key, group]) => {
            const first = group[0]!;
            return (
              <View
                key={key}
                style={[
                  styles.card,
                  group.some(({ row }) => row.selected) &&
                    stage === "review" &&
                    styles.selectedCard,
                ]}
              >
                <AddressLine
                  line={
                    first.row.target
                      ? importAddressLabel(first.row.target)
                      : first.row.address || `待核对 ${first.index + 1}`
                  }
                  expanded
                  compact
                />
                {group.map(({ row: r, index }, position) => (
                  <View
                    key={r.id}
                    style={[
                      styles.entryRow,
                      position > 0 && styles.entryDivider,
                    ]}
                  >
                    <View style={styles.codeBand}>
                      <Text style={[styles.code, { flexShrink: 1 }]}>
                        {r.value || "缺少门禁码"}
                      </Text>
                      <Text style={styles.door}>{r.scope}</Text>
                    </View>
                    {r.carrierDoorLabel && r.carrierDoorLabel !== r.scope ? (
                      <Text style={styles.meta}>
                        截图标注 · {r.carrierDoorLabel}
                      </Text>
                    ) : null}
                    {r.error ? (
                      <Text style={styles.error}>{r.error}</Text>
                    ) : r.status ? (
                      <Text style={styles.meta}>
                        {r.status === "active"
                          ? "已私存 · 已共享"
                          : r.status === "pending"
                            ? "已私存 · 共享尚未发布"
                            : r.status === "same_value"
                              ? "已私存 · 同码记录"
                              : "已保存到我的公寓"}
                      </Text>
                    ) : stage === "result" ? (
                      <Text style={styles.meta}>未提交</Text>
                    ) : !canShareCandidate(r) &&
                      mode === "private_and_share" ? (
                      <Text style={styles.meta}>公寓待匹配</Text>
                    ) : null}
                    {stage === "review" &&
                    mode === "private_and_share" &&
                    !r.privateId &&
                    r.scope === unconfirmedEntrance ? (
                      <Text style={styles.meta}>共享前请确认入口归属</Text>
                    ) : null}
                    {stage === "review" &&
                    !r.status &&
                    needsScreenshotReview(r) ? (
                      <Text style={styles.meta}>
                        {r.issues
                          .map(
                            (i) =>
                              issueLabels[i] ??
                              (/^[a-z_]+$/.test(i) ? "请核对识别结果" : i),
                          )
                          .join(" · ")}
                      </Text>
                    ) : null}
                    {stage === "review" ? (
                      <View style={styles.modeRow}>
                        <CheckField
                          label="选择"
                          accessibilityLabel={`选择第 ${index + 1} 条`}
                          checked={r.selected}
                          disabled={
                            busy ||
                            !complete(r) ||
                            needsScreenshotReview(r) ||
                            !!r.privateId
                          }
                          onChange={(selected) => {
                            update(r.id, { selected });
                            setAttested(false);
                          }}
                        />
                        {!r.privateId ? (
                          <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            style={styles.check}
                            onPress={() => openReviewEditor(r.id)}
                          >
                            <Text style={styles.link}>核对</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })}
          {!rows.length ? (
            <Text style={styles.meta}>暂无待确认记录</Text>
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
        </>
      )}
    </ApartmentPage>
  );
}
const styles = StyleSheet.create({
  entryRow: { gap: 8 },
  entryDivider: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border,
  },
  headerAction: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
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
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  check: { minHeight: 48, justifyContent: "center", paddingVertical: 8 },
  card: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  selectedCard: { borderColor: tokens.color.brandPrimary },
  codeBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.color.surfaceMuted,
  },
  door: { color: tokens.color.textSecondary, fontSize: 13, lineHeight: 20 },
  code: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  error: { fontSize: 14, color: tokens.color.danger },
  link: { color: tokens.color.brandText },
});
