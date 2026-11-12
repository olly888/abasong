import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Text,
  View,
} from "react-native";
import { usePreventRemove } from "expo-router";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { BottomSheet } from "../ui/BottomSheet";
import { CirclePhotoEditor } from "./CirclePhotos";
import {
  disposePhoto,
  photoLimit,
  PhotoInputError,
  selectCirclePhotos,
  uploadCirclePhoto,
} from "./photo-input";
import { PageFrame } from "../ui/PageFrame";
import { ChoiceChip } from "../ui/ChoiceChip";
import { ComposerOption } from "./ComposerOption";
import { typeStyles } from "../ui/foundation";
import { SelectionField } from "../ui/SelectionField";
import { AccountError } from "../auth/api-client";
import {
  requestTitle,
  statusLabels,
  type DeliverySummary,
} from "../requests/presentation";
import {
  circleTopics,
  forgetPostDraft,
  getPostDraft,
  newPostIntent,
  savePostDraft,
  type Circle,
  type CircleRequest,
} from "./session";

export function CircleComposer({
  actor,
  request,
  onBack,
  onDone,
  onPickerActorChange,
}: {
  actor: string;
  request: CircleRequest;
  onBack: () => void;
  onDone: (post: Circle["Post"]) => void;
  onPickerActorChange?: (actor: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => getPostDraft(actor));
  const [regions, setRegions] = useState<Circle["Region"][]>([]);
  const [requests, setRequests] = useState<DeliverySummary[]>([]);
  const [regionOpen, setRegionOpen] = useState(!!draft.fields.region_id);
  const [requestOpen, setRequestOpen] = useState(!!draft.fields.request_id);
  const [regionWanted, wantRegions] = useState(
    !!(draft.fields.region_id || draft.fields.request_id),
  );
  const [requestWanted, wantRequests] = useState(!!draft.fields.request_id);
  const [regionError, setRegionError] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [regionRevision, retryRegions] = useState(0);
  const [requestRevision, retryRequests] = useState(0);
  const [regionLoading, setRegionLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const picker = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = useRef<AbortController | null>(null);
  const canLeave = useRef(false);
  const fields = draft.fields;
  const editsLocked = busy || picking || !!draft.submission;

  // Optional data is loaded independently on demand; failures never block text.
  useEffect(() => {
    if (!regionWanted) return;
    const c = new AbortController();
    setRegionLoading(true);
    setRegionError(false);
    void request<Circle["RegionPage"]>("/v1/regions?limit=100", {
      signal: c.signal,
    })
      .then((page) => {
        if (!c.signal.aborted) setRegions(page.items);
      })
      .catch(() => {
        if (!c.signal.aborted) setRegionError(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setRegionLoading(false);
      });
    return () => c.abort();
  }, [request, regionWanted, regionRevision]);
  useEffect(() => {
    if (!requestWanted) return;
    const c = new AbortController();
    setRequestLoading(true);
    setRequestError(false);
    void Promise.allSettled(
      [1, 2].map((v) =>
        request<{ items: DeliverySummary[] }>(
          `/v1/me/requests?request_schema_version=${v}&limit=50`,
          { signal: c.signal },
        ),
      ),
    ).then((pages) => {
      if (c.signal.aborted) return;
      const items = pages.flatMap((p) =>
        p.status === "fulfilled" ? p.value.items : [],
      );
      setRequests(
        items.filter(
          (r, i) =>
            r.status !== "draft" && items.findIndex((x) => x.id === r.id) === i,
        ),
      );
      setRequestError(pages.some((p) => p.status === "rejected"));
      setRequestLoading(false);
    });
    return () => c.abort();
  }, [request, requestWanted, requestRevision]);
  useEffect(
    () => () => {
      working.current?.abort();
      if (picker.current) {
        picker.current.abort();
        onPickerActorChange?.(null);
      }
    },
    [onPickerActorChange],
  );
  const dirty = !!(
    fields.body ||
    fields.topic ||
    fields.region_id ||
    fields.request_id ||
    draft.photos.length
  );
  const leave = (resume: () => void) => {
    if (working.current || picker.current) return;
    if (canLeave.current || !dirty) {
      resume();
      return;
    }
    Alert.alert("离开发布动态？", undefined, [
      { text: "继续编辑", style: "cancel" },
      {
        text: "保留草稿并返回",
        onPress: () => {
          canLeave.current = true;
          resume();
        },
      },
      {
        text: "放弃草稿",
        style: "destructive",
        onPress: () => {
          forgetPostDraft(actor);
          canLeave.current = true;
          resume();
        },
      },
    ]);
  };
  const allowRemove = usePreventRemove(dirty || busy || picking, ({ repeat }) =>
    leave(repeat),
  );
  function change(next: Circle["PostInput"], photos = draft.photos) {
    if (editsLocked) return;
    setDraft(newPostIntent(actor, next, photos));
    setFailedPhoto(null);
    setError(null);
  }
  async function pick(camera: boolean) {
    if (editsLocked || picker.current || draft.photos.length >= photoLimit)
      return;
    const c = new AbortController();
    picker.current = c;
    onPickerActorChange?.(actor);
    setPicking(true);
    try {
      const { photos, rejected } = await selectCirclePhotos(
        camera,
        photoLimit - draft.photos.length,
        c.signal,
      );
      if (c.signal.aborted) {
        photos.forEach((p) => disposePhoto(p.uri));
        return;
      }
      if (photos.length) change(fields, [...draft.photos, ...photos]);
      if (rejected) setError("有图片无法读取或超过 5 MB，请换一张");
    } catch (e) {
      if (c.signal.aborted) return;
      if (e instanceof PhotoInputError && e.settings) {
        Alert.alert("无法使用相机", e.message, [
          { text: "取消", style: "cancel" },
          { text: "打开设置", onPress: () => void Linking.openSettings() },
        ]);
      } else {
        setError(
          e instanceof PhotoInputError ? e.message : "无法打开图片，请重试",
        );
      }
    } finally {
      picker.current = null;
      if (!c.signal.aborted) {
        setPicking(false);
        onPickerActorChange?.(null);
      }
    }
  }
  function openPhotoMenu() {
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "添加图片",
          options: ["拍照", "从相册选择", "取消"],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index < 2) void pick(index === 0);
        },
      );
    } else setChoosing(true);
  }
  async function publish() {
    if (working.current || picker.current) return;
    if (!fields.body.trim()) {
      setError("请输入动态内容");
      return;
    }
    const c = new AbortController();
    working.current = c;
    setBusy(true);
    setError(null);
    setFailedPhoto(null);
    Keyboard.dismiss();
    let current = draft;
    let uploading: string | null = null;
    try {
      let submission = current.submission;
      if (!submission) {
        const photos = current.photos.slice();
        const media: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i]!;
          if (photo.ready && Date.parse(photo.ready.expires_at) > Date.now()) {
            media.push(photo.ready.id);
            continue;
          }
          uploading = photo.uri;
          const prepared = await uploadCirclePhoto(request, photo, c.signal);
          if (c.signal.aborted) return;
          photos[i] = prepared;
          media.push(prepared.ready.id);
          current = savePostDraft(actor, {
            ...current,
            photos: photos.slice(),
          });
          setDraft(current);
        }
        uploading = null;
        submission = media.length ? { ...fields, media_ids: media } : fields;
        // Preserve the exact payload before POST. A lost response is an unknown
        // result and must be replayed before changing attachments or text.
        current = savePostDraft(actor, { ...current, submission });
        setDraft(current);
      }
      const post = await request<Circle["Post"]>("/v1/posts", {
        method: "POST",
        body: submission,
        key: current.key,
        signal: c.signal,
      });
      if (c.signal.aborted) return;
      forgetPostDraft(actor, current.key);
      canLeave.current = true;
      allowRemove();
      onDone(post);
    } catch (e) {
      if (c.signal.aborted) return;
      if (uploading) {
        setFailedPhoto(uploading);
        setError("图片未上传成功，请重试或移除");
      } else if (
        e instanceof AccountError &&
        [400, 403, 404, 409, 422].includes(e.status)
      ) {
        const photos =
          e.code === "MEDIA_NOT_READY"
            ? current.photos.map((p) => ({ ...p, ready: undefined }))
            : current.photos;
        setDraft(newPostIntent(actor, fields, photos));
        setError(e.message);
      } else {
        setError("发布结果未确认，请重试");
      }
    } finally {
      working.current = null;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  const regionLabel = (id: string | null) =>
    regions.find((r) => r.id === id)?.label;
  const regionOptions: [string, string][] = [
    ["", "不选择"],
    ...regions.map((r): [string, string] => [r.id, r.label]),
  ];
  const requestOptions: [string, string][] = [
    ["", "不关联"],
    ...requests.map((r): [string, string] => [
      r.id,
      [
        requestTitle(r),
        regionLabel(r.region_id) ?? (r.region_id ? "地区暂未加载" : ""),
        r.route_label,
        statusLabels[r.status],
      ]
        .filter(Boolean)
        .join(" · "),
    ]),
  ];
  if (
    fields.region_id &&
    !regionOptions.some(([id]) => id === fields.region_id)
  )
    regionOptions.push([fields.region_id, "已选区域，待重新核对"]);
  if (
    fields.request_id &&
    !requestOptions.some(([id]) => id === fields.request_id)
  )
    requestOptions.push([fields.request_id, "已选需求，待重新核对"]);
  return (
    <PageFrame
      compact
      title="发布动态"
      onBack={() =>
        leave(() => {
          allowRemove();
          onBack();
        })
      }
      footer={
        <>
          <FormError message={error} />
          <ActionButton
            label={
              busy ? "发布中" : error || draft.submission ? "重新发布" : "发布"
            }
            busy={busy}
            disabled={picking || !fields.body.trim()}
            onPress={() => void publish()}
          />
        </>
      }
    >
      <Field
        label="写一条动态"
        multiline
        maxLength={2000}
        style={{ minHeight: 156, textAlignVertical: "top" }}
        value={fields.body}
        editable={!editsLocked}
        placeholder="分享配送经验、提问或路上见闻"
        onChangeText={(body) => change({ ...fields, body })}
      />
      {fields.body.length >= 1800 ? (
        <Text style={typeStyles.secondary}>{fields.body.length}/2000</Text>
      ) : null}
      {Platform.OS !== "web" ? (
        <CirclePhotoEditor
          photos={draft.photos}
          failed={failedPhoto}
          disabled={editsLocked}
          onAdd={openPhotoMenu}
          onRemove={(i) => {
            const photo = draft.photos[i];
            if (!photo) return;
            change(
              fields,
              draft.photos.filter((_, at) => at !== i),
            );
            disposePhoto(photo.uri);
          }}
        />
      ) : null}
      {choosing ? (
        <BottomSheet onRequestClose={() => setChoosing(false)}>
          <Text accessibilityRole="header">添加图片</Text>
          <ActionButton
            label="拍照"
            onPress={() => {
              setChoosing(false);
              void pick(true);
            }}
          />
          <ActionButton
            label="从相册选择"
            variant="secondary"
            onPress={() => {
              setChoosing(false);
              void pick(false);
            }}
          />
          <ActionButton
            label="取消"
            variant="text"
            onPress={() => setChoosing(false)}
          />
        </BottomSheet>
      ) : null}
      <View style={{ gap: 8 }}>
        <Text style={typeStyles.label}>内容标签（选填）</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(circleTopics).map(([topic, label]) => (
            <ChoiceChip
              key={topic}
              label={label}
              selected={fields.topic === topic}
              disabled={editsLocked}
              onPress={() =>
                change({
                  ...fields,
                  topic:
                    fields.topic === topic
                      ? undefined
                      : (topic as NonNullable<Circle["PostInput"]["topic"]>),
                })
              }
            />
          ))}
        </View>
      </View>
      <View>
        <ComposerOption
          title="添加配送地区"
          open={regionOpen}
          disabled={editsLocked}
          summary={
            fields.region_id
              ? regionOptions.find(([id]) => id === fields.region_id)?.[1]
              : undefined
          }
          onToggle={() => {
            setRegionOpen(!regionOpen);
            wantRegions(true);
          }}
          onClear={() => {
            change({ ...fields, region_id: undefined });
            setRegionOpen(false);
          }}
        >
          {regionLoading ? (
            <Text style={typeStyles.secondary}>正在加载地区…</Text>
          ) : (
            <SelectionField
              label="配送地区（选填）"
              value={fields.region_id ?? ""}
              options={regionOptions}
              disabled={editsLocked}
              onChange={(id) => {
                change({ ...fields, region_id: id || undefined });
                setRegionOpen(false);
              }}
            />
          )}
          {regionError ? (
            <>
              <FormError message="地区暂时无法加载" />
              <ActionButton
                label="重试加载地区"
                variant="text"
                disabled={editsLocked}
                onPress={() => retryRegions((n) => n + 1)}
              />
            </>
          ) : null}
        </ComposerOption>
        <ComposerOption
          title="关联我发布的需求"
          open={requestOpen}
          disabled={editsLocked}
          summary={
            fields.request_id
              ? requestOptions.find(([id]) => id === fields.request_id)?.[1]
              : undefined
          }
          onToggle={() => {
            setRequestOpen(!requestOpen);
            wantRequests(true);
            wantRegions(true);
          }}
          onClear={() => {
            change({ ...fields, request_id: undefined });
            setRequestOpen(false);
          }}
        >
          {requestLoading ? (
            <Text style={typeStyles.secondary}>正在加载需求…</Text>
          ) : (
            <SelectionField
              label="我发布的需求（选填）"
              value={fields.request_id ?? ""}
              options={requestOptions}
              disabled={editsLocked}
              onChange={(id) => {
                change({ ...fields, request_id: id || undefined });
                setRequestOpen(false);
              }}
            />
          )}
          {requestError ? (
            <>
              <FormError message="部分需求暂时无法加载" />
              <ActionButton
                label="重试加载需求"
                variant="text"
                disabled={editsLocked}
                onPress={() => retryRequests((n) => n + 1)}
              />
            </>
          ) : null}
        </ComposerOption>
      </View>
    </PageFrame>
  );
}
