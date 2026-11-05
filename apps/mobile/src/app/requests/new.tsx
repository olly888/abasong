import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListRow } from "../../ui/Primitives";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import { RequestGate, requestStyles as s } from "../../requests/RequestUi";
import {
  kindLabels,
  centsInput,
  laInstant,
  localDateTime,
  type DeliveryRequest,
} from "../../requests/presentation";
import { SupportFormFields } from "../../requests/SupportForm";
import {
  defaultSupportFields as defaults,
  changeSupportField,
  type SupportFields as Fields,
} from "../../requests/support-fields";
type S = components["schemas"];
export default function NewRequest() {
  return (
    <RequestGate>
      <Form />
    </RequestGate>
  );
}
function Form() {
  const { session } = useAuth(),
    params = useLocalSearchParams<{ edit?: string; copy?: string }>();
  const [kind, setKind] = useState<S["Request"]["kind"] | null>(null),
    [form, setForm] = useState(defaults),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [regionError, setRegionError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [dirty, setDirty] = useState(false);
  const saved = useRef(false),
    edit = useRef<DeliveryRequest | null>(null),
    working = useRef(false),
    createAttempt = useRef({ signature: "", key: randomUUID() });
  const update = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setForm((old) => changeSupportField(old, key, value));
    setDirty(true);
    setError(null);
  };
  async function loadRegions(signal?: AbortSignal) {
    if (!session) return;
    setRegionError(null);
    try {
      const page = await dataRequest<S["RegionPage"]>(
        session,
        "/v1/regions?limit=100",
        { signal },
      );
      if (!signal?.aborted) setRegions(page.items);
    } catch (e) {
      if (!signal?.aborted)
        setRegionError(e instanceof Error ? e.message : "区域读取失败");
    }
  }
  useEffect(() => {
    const c = new AbortController();
    void loadRegions(c.signal);
    return () => c.abort();
  }, [session?.access_token]);
  useEffect(() => {
    const target = params.edit ?? params.copy;
    if (!target || !session) return;
    const c = new AbortController();
    setLoading(true);
    void dataRequest<DeliveryRequest>(
      session,
      "/v1/requests/" + encodeURIComponent(target),
      { signal: c.signal },
    )
      .then((r) => {
        if (c.signal.aborted) return;
        if (r.publisher.user_id !== session.user.id)
          throw new Error("当前需求不能编辑");
        edit.current = params.copy ? null : r;
        setKind(r.kind);
        const begin = params.copy
            ? localDateTime(null)
            : localDateTime(r.starts_at),
          end =
            !params.copy && r.expires_at
              ? localDateTime(r.expires_at).time
              : defaults().end;
        setForm({
          region: r.region_id ?? "",
          pickup: r.pickup_region_id ?? "",
          carrier: r.carrier ?? "",
          route: r.route_label ?? "",
          date: begin.date,
          start: begin.time,
          end,
          endDate:
            !params.copy && r.expires_at
              ? localDateTime(r.expires_at).date
              : defaults().endDate,
          pickupEnd:
            !params.copy && r.pickup_deadline_at
              ? localDateTime(r.pickup_deadline_at).time
              : "",
          deliveryEnd:
            !params.copy && r.delivery_deadline_at
              ? localDateTime(r.delivery_deadline_at).time
              : "",
          quantity: r.parcel_count?.toString() ?? "",
          drivers: r.drivers_needed?.toString() ?? "",
          minimum: r.minimum_parcels?.toString() ?? "",
          amount: r.price_cents === null ? "" : String(r.price_cents / 100),
          unit: r.price_unit ?? "per_parcel",
          sorted: (r.sorted_state as Fields["sorted"]) ?? "unknown",
          handoff:
            (r.handoff_requirement as Fields["handoff"]) ?? "contact_confirm",
          experience: r.experience_requirement,
          partial: r.accepts_partial ? "yes" : "no",
          description: r.description ?? "",
          terms: r.private_payment_terms ?? "",
        });
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "草稿读取失败");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [session?.access_token, params.edit, params.copy]);
  const delivery = kind && !["vehicle_help", "other_help"].includes(kind);
  function body(): S["RequestDraftInput"] {
    if (!kind) throw new Error("请选择需求类型");
    const number = (value: string) => {
      if (
        !/^\d+$/.test(value) ||
        Number(value) < 1 ||
        Number(value) > 2147483647
      )
        throw new Error("件数与人数请填写正整数");
      return Number(value);
    };
    return {
      kind,
      timezone: "America/Los_Angeles",
      ...(form.region ? { region_id: form.region } : {}),
      starts_at: laInstant(form.date, form.start),
      expires_at: laInstant(form.endDate, form.end),
      description: form.description,
      ...(delivery
        ? {
            ...(form.pickup ? { pickup_region_id: form.pickup } : {}),
            carrier: form.carrier,
            route_label: form.route,
            ...(form.quantity ? { parcel_count: number(form.quantity) } : {}),
            ...(kind === "extra_drivers" && form.drivers
              ? { drivers_needed: number(form.drivers) }
              : {}),
            price_unit: form.unit,
            ...(form.unit !== "negotiable" && form.amount
              ? { price_cents: centsInput(form.amount) }
              : {}),
            sorted_state: form.sorted,
            handoff_requirement: form.handoff,
            experience_requirement: form.experience,
            accepts_partial:
              kind === "whole_route" ? false : form.partial === "yes",
            minimum_parcels:
              kind === "whole_route"
                ? form.quantity
                  ? number(form.quantity)
                  : null
                : form.minimum
                  ? number(form.minimum)
                  : null,
            private_payment_terms: form.terms,
            ...(form.pickupEnd
              ? { pickup_deadline_at: laInstant(form.date, form.pickupEnd) }
              : {}),
            ...(form.deliveryEnd
              ? {
                  delivery_deadline_at: laInstant(
                    form.endDate,
                    form.deliveryEnd,
                  ),
                }
              : {}),
          }
        : {}),
    };
  }
  async function saveDraft() {
    if (!session || working.current) return null;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = body();
      let result: DeliveryRequest;
      if (edit.current) {
        const { kind: _kind, ...fields } = data;
        void _kind;
        result = await dataRequest<DeliveryRequest>(
          session,
          `/v1/requests/${edit.current.id}`,
          {
            method: "PATCH",
            body: {
              ...fields,
              parcel_count: form.quantity ? Number(form.quantity) : null,
              drivers_needed:
                kind === "extra_drivers" && form.drivers
                  ? Number(form.drivers)
                  : null,
              price_cents:
                form.unit !== "negotiable" && form.amount
                  ? centsInput(form.amount)
                  : null,
              pickup_deadline_at: form.pickupEnd
                ? laInstant(form.date, form.pickupEnd)
                : null,
              delivery_deadline_at: form.deliveryEnd
                ? laInstant(form.endDate, form.deliveryEnd)
                : null,
              expected_version: edit.current.version,
            },
          },
        );
      } else {
        const signature = JSON.stringify(data);
        if (createAttempt.current.signature !== signature)
          createAttempt.current = { signature, key: randomUUID() };
        result = await dataRequest<DeliveryRequest>(session, "/v1/requests", {
          method: "POST",
          body: data,
          key: createAttempt.current.key,
        });
      }
      edit.current = result;
      saved.current = true;
      setDirty(false);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
      return null;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const editingPublished = !!edit.current && edit.current.status !== "draft";
  usePreventRemove(dirty || busy, ({ repeat }) => {
    if (saved.current) {
      repeat();
      return;
    }
    if (working.current) return;
    Alert.alert("保留这次填写？", undefined, [
      { text: "继续编辑", style: "cancel" },
      {
        text: "放弃修改",
        style: "destructive",
        onPress: () => {
          saved.current = true;
          repeat();
        },
      },
      {
        text: editingPublished ? "保存修改" : "保存草稿",
        onPress: () => {
          void saveDraft().then((r) => {
            if (r) repeat();
          });
        },
      },
    ]);
  });
  async function submit(preview: boolean) {
    const r = await saveDraft();
    if (r)
      router.replace(
        preview
          ? { pathname: "/requests/[id]", params: { id: r.id } }
          : { pathname: "/requests", params: { mine: "1" } },
      );
  }
  const section = (title: string) => (
    <Text
      style={{
        fontSize: 18,
        lineHeight: 26,
        fontWeight: "600",
        color: tokens.color.ink,
        marginTop: 16,
      }}
    >
      {title}
    </Text>
  );
  if (!kind && !loading && (params.edit || params.copy))
    return (
      <AuthPage compact title="编辑草稿">
        <FormError message={error} />
        <ActionButton
          label="返回需求"
          secondary
          onPress={() => router.back()}
        />
      </AuthPage>
    );
  if (!kind && !loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tokens.color.overlay,
          justifyContent: "flex-end",
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: tokens.color.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            maxHeight: "85%",
          }}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
            <Text style={s.headline}>发需求</Text>
            {section("配送找人")}
            {(["partial_route", "whole_route", "extra_drivers"] as const).map(
              (k) => (
                <ListRow
                  key={k}
                  title={kindLabels[k]}
                  icon={k === "extra_drivers" ? "people" : "box"}
                  onPress={() => {
                    setKind(k);
                    setDirty(true);
                  }}
                />
              ),
            )}
            {section("其他配送求助")}
            {(["vehicle_help", "other_help"] as const).map((k) => (
              <ListRow
                key={k}
                title={kindLabels[k]}
                icon={k === "vehicle_help" ? "car" : "message"}
                onPress={() => {
                  setKind(k);
                  setDirty(true);
                }}
              />
            ))}
            <FormError message={error} />
            <ActionButton
              label="取消"
              variant="text"
              onPress={() => router.back()}
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  const footer = (
    <View
      style={{
        gap: 10,
      }}
    >
      <FormError message={error} />
      <ActionButton
        label={editingPublished ? "保存修改" : "核对并发布"}
        busy={busy}
        disabled={loading || !kind}
        onPress={() => void submit(true)}
      />
      {!editingPublished ? (
        <ActionButton
          label="保存草稿"
          variant="text"
          disabled={busy || loading}
          onPress={() => void submit(false)}
        />
      ) : null}
    </View>
  );
  return (
    <AuthPage
      compact
      title={kind ? kindLabels[kind] : "编辑草稿"}
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator />
      ) : kind ? (
        <SupportFormFields
          kind={kind}
          form={form}
          regions={regions}
          disabled={busy}
          onChange={update}
          regionError={regionError}
          onRetryRegions={() => void loadRegions()}
        />
      ) : null}
    </AuthPage>
  );
}
