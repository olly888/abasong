import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";
import { usePreventRemove } from "expo-router";
import { ActionButton, Field, FormError } from "../ui/Controls";
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
  setPostDraft,
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
  const [error, setError] = useState<string | null>(null);
  const working = useRef<AbortController | null>(null);
  const canLeave = useRef(false);
  const fields = draft.fields;

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
  useEffect(() => () => working.current?.abort(), []);
  const dirty = !!(
    fields.body ||
    fields.topic ||
    fields.region_id ||
    fields.request_id
  );
  const leave = (resume: () => void) => {
    if (working.current) return;
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
  const allowRemove = usePreventRemove(dirty || busy, ({ repeat }) =>
    leave(repeat),
  );
  function change(next: Circle["PostInput"]) {
    setDraft(setPostDraft(actor, next));
    setError(null);
  }
  async function publish() {
    if (working.current) return;
    if (!fields.body.trim()) {
      setError("请输入动态内容");
      return;
    }
    const c = new AbortController();
    working.current = c;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const post = await request<Circle["Post"]>("/v1/posts", {
        method: "POST",
        body: fields,
        key: draft.key,
        signal: c.signal,
      });
      if (c.signal.aborted) return;
      forgetPostDraft(actor, draft.key);
      canLeave.current = true;
      allowRemove();
      onDone(post);
    } catch (e) {
      if (!c.signal.aborted) {
        const validation =
          e instanceof AccountError && [400, 404, 409, 422].includes(e.status);
        setError(validation ? e.message : "发布未成功，填写内容已保留");
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
            label={busy ? "发布中" : error ? "重新发布" : "发布"}
            busy={busy}
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
        editable={!busy}
        placeholder="分享配送经验、提问或路上见闻"
        onChangeText={(body) => change({ ...fields, body })}
      />
      <SelectionField
        label="内容标签（选填）"
        value={fields.topic ?? ""}
        options={topicOptions}
        disabled={busy}
        onChange={(topic) => change({ ...fields, topic: topic || undefined })}
      />
      <SelectionField
        label="配送区域（选填）"
        value={fields.region_id ?? ""}
        options={regionOptions}
        disabled={busy || optionsLoading}
        onChange={(region) =>
          change({ ...fields, region_id: region || undefined })
        }
      />
      <SelectionField
        label="关联我的支援需求（选填）"
        value={fields.request_id ?? ""}
        options={requestOptions}
        disabled={busy || optionsLoading}
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
