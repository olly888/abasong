import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Text,
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
}: {
  actor: string;
  request: CircleRequest;
  onBack: () => void;
  onDone: (post: Circle["Post"]) => void;
}) {
  const [draft, setDraft] = useState(() => getPostDraft(actor));
  const [regions, setRegions] = useState<Circle["Region"][]>([]);
  const [requests, setRequests] = useState<DeliverySummary[]>([]);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsRevision, reloadOptions] = useState(0);
  const [optionsLoading, setOptionsLoading] = useState(true);
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

  useEffect(() => {
    const c = new AbortController();
    setOptionsLoading(true);
    setOptionsError(false);
    const signal = c.signal;
    void Promise.allSettled([
      request<Circle["RegionPage"]>("/v1/regions?limit=100", { signal }),
      request<{ items: DeliverySummary[] }>(
        "/v1/me/requests?request_schema_version=2&limit=50",
        { signal },
      ),
      request<{ items: DeliverySummary[] }>(
        "/v1/me/requests?request_schema_version=1&limit=50",
        { signal },
      ),
    ]).then(([regionPage, ...requestPages]) => {
      if (signal.aborted) return;
      setRegions(
        regionPage.status === "fulfilled" ? regionPage.value.items : [],
      );
      setRequests(
        requestPages
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value.items : [],
          )
          .filter((r) => r.status !== "draft"),
      );
      setOptionsError(
        regionPage.status === "rejected" ||
          requestPages.some((r) => r.status === "rejected"),
      );
      setOptionsLoading(false);
    });
    return () => c.abort();
  }, [request, optionsRevision]);
  useEffect(
    () => () => {
      working.current?.abort();
      picker.current?.abort();
    },
    [],
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
      if (!c.signal.aborted) setPicking(false);
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
  const topicOptions = [
    ["", "不选择"],
    ...Object.entries(circleTopics),
  ] as ReadonlyArray<
    readonly [NonNullable<Circle["PostInput"]["topic"]> | "", string]
  >;
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
        regionLabel(r.region_id),
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
            disabled={picking}
            onPress={() => void publish()}
          />
        </>
      }
    >
      <Field
        label="内容"
        multiline
        maxLength={2000}
        style={{ minHeight: 132 }}
        value={fields.body}
        editable={!editsLocked}
        placeholder="分享配送经验、提问或路上见闻"
        onChangeText={(body) => change({ ...fields, body })}
      />
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
      <SelectionField
        label="内容标签（选填）"
        value={fields.topic ?? ""}
        options={topicOptions}
        disabled={editsLocked}
        onChange={(topic) => change({ ...fields, topic: topic || undefined })}
      />
      <SelectionField
        label="配送区域（选填）"
        value={fields.region_id ?? ""}
        options={regionOptions}
        disabled={editsLocked || optionsLoading}
        onChange={(region) =>
          change({ ...fields, region_id: region || undefined })
        }
      />
      <SelectionField
        label="关联我的支援需求（选填）"
        value={fields.request_id ?? ""}
        options={requestOptions}
        disabled={editsLocked || optionsLoading}
        onChange={(id) => change({ ...fields, request_id: id || undefined })}
      />
      {optionsError ? (
        <ActionButton
          label="重新加载选项"
          variant="text"
          onPress={() => reloadOptions((n) => n + 1)}
        />
      ) : null}
    </PageFrame>
  );
}
