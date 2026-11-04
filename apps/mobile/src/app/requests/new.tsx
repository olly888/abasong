import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListRow } from "../../ui/Primitives";
import { useAuth } from "../../auth/AuthProvider";
import {
  AuthPage,
  Field,
  ActionButton,
  FormError,
} from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import {
  Choice,
  RequestGate,
  requestStyles as s,
} from "../../requests/RequestUi";
import {
  kindLabels,
  centsInput,
  laInstant,
  localDateTime,
  type DeliveryRequest,
} from "../../requests/presentation";
type S = components["schemas"];
type Fields = {
  region: string;
  pickup: string;
  carrier: string;
  route: string;
  date: string;
  start: string;
  end: string;
  endDate: string;
  pickupEnd: string;
  deliveryEnd: string;
  quantity: string;
  drivers: string;
  minimum: string;
  amount: string;
  unit: "per_parcel" | "per_route" | "negotiable";
  sorted: "sorted" | "unsorted" | "unknown";
  handoff: "carrier_account" | "dsp_approval" | "contact_confirm";
  experience: "any" | "delivery_experience" | "carrier_experience";
  partial: "yes" | "no";
  description: string;
  terms: string;
};
function defaults(): Fields {
  const now = localDateTime(null),
    later = localDateTime(new Date(Date.now() + 2 * 3600000).toISOString());
  return {
    region: "",
    pickup: "",
    carrier: "",
    route: "",
    date: now.date,
    start: now.time,
    end: later.time,
    endDate: later.date,
    pickupEnd: "",
    deliveryEnd: "",
    quantity: "",
    drivers: "",
    minimum: "",
    amount: "",
    unit: "per_parcel",
    sorted: "unknown",
    handoff: "contact_confirm",
    experience: "any",
    partial: "yes",
    description: "",
    terms: "",
  };
}
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
    [picker, setPicker] = useState<"region" | "pickup" | null>(null),
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
    setForm((old) => ({ ...old, [key]: value }));
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
  const section = (name: string) => (
    <Text style={{ ...s.headline, fontSize: 18, marginTop: 8 }}>{name}</Text>
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
          backgroundColor: "rgba(0,0,0,.3)",
          justifyContent: "flex-end",
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: tokens.color.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 22,
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
                icon={k === "vehicle_help" ? "settings" : "message"}
                onPress={() => {
                  setKind(k);
                  setDirty(true);
                }}
              />
            ))}
            <FormError message={error} />
            <ActionButton
              label="取消"
              secondary
              onPress={() => router.back()}
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  const footer = (
    <View
      style={{
        padding: 16,
        gap: 10,
        backgroundColor: tokens.color.surface,
        borderTopWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <FormError message={error} />
      <ActionButton
        label={editingPublished ? "保存修改" : "预览发布"}
        busy={busy}
        disabled={loading || !kind}
        onPress={() => void submit(true)}
      />
      {!editingPublished ? (
        <ActionButton
          label="保存草稿"
          secondary
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
      ) : (
        <>
          {section("区域")}
          {(
            ["region", ...(delivery ? ["pickup"] : [])] as Array<
              "region" | "pickup"
            >
          ).map((k) => (
            <View key={k} style={{ gap: 10 }}>
              <Text style={s.label}>
                {k === "region" ? "配送区域" : "取件区域"}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPicker(k)}
                style={s.choice}
              >
                <Text style={s.text}>
                  {regions.find((r) => r.id === form[k])?.label ??
                    "选择城市或区域"}
                </Text>
              </Pressable>
            </View>
          ))}
          <FormError message={regionError} />
          {regionError || !regions.length ? (
            <ActionButton
              label="重新读取区域"
              secondary
              onPress={() => void loadRegions()}
            />
          ) : null}
          {delivery ? (
            <>
              <Field
                label="承运商"
                value={form.carrier}
                maxLength={80}
                onChangeText={(v) => update("carrier", v)}
                placeholder="如 SwiftX、GOFO"
              />
              <Field
                label="线路（选填）"
                value={form.route}
                maxLength={80}
                onChangeText={(v) => update("route", v)}
              />
            </>
          ) : null}
          {section("时间")}
          <Field
            label="配送日期"
            value={form.date}
            onChangeText={(v) => update("date", v)}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <Field
            label="有效截止日期"
            value={form.endDate}
            onChangeText={(v) => update("endDate", v)}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="开始时间"
                value={form.start}
                onChangeText={(v) => update("start", v)}
                placeholder="15:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="有效截止"
                value={form.end}
                onChangeText={(v) => update("end", v)}
                placeholder="19:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          {delivery ? (
            <>
              {section("数量与报价")}
              <Field
                label="本次包裹件数"
                value={form.quantity}
                onChangeText={(v) => update("quantity", v)}
                keyboardType="number-pad"
              />
              {kind === "extra_drivers" ? (
                <Field
                  label="本次需要几人"
                  value={form.drivers}
                  onChangeText={(v) => update("drivers", v)}
                  keyboardType="number-pad"
                />
              ) : null}
              {kind !== "whole_route" ? (
                <>
                  <Choice
                    label="是否允许分担"
                    value={form.partial}
                    options={[
                      ["yes", "可以分担"],
                      ["no", "整批接手"],
                    ]}
                    onChange={(v) => update("partial", v)}
                  />
                  <Field
                    label="每人最低件数（选填）"
                    value={form.minimum}
                    onChangeText={(v) => update("minimum", v)}
                    keyboardType="number-pad"
                  />
                </>
              ) : null}
              <Choice
                label="报价单位"
                value={form.unit}
                options={[
                  ["per_parcel", "每件"],
                  ["per_route", "每线路"],
                  ["negotiable", "联系议价"],
                ]}
                onChange={(v) => update("unit", v)}
              />
              {form.unit !== "negotiable" ? (
                <Field
                  label="报价（美元）"
                  value={form.amount}
                  onChangeText={(v) => update("amount", v)}
                  keyboardType="decimal-pad"
                  placeholder="1.85"
                />
              ) : null}
              {section("接手条件")}
              <Choice
                label="理货状态"
                value={form.sorted}
                options={[
                  ["sorted", "已理货"],
                  ["unsorted", "未理货"],
                  ["unknown", "联系确认"],
                ]}
                onChange={(v) => update("sorted", v)}
              />
              <Choice
                label="包裹转交"
                value={form.handoff}
                options={[
                  ["carrier_account", "须有承运商账号"],
                  ["dsp_approval", "须 DSP 确认"],
                  ["contact_confirm", "联系后确认"],
                ]}
                onChange={(v) => update("handoff", v)}
              />
              <Choice
                label="配送经验"
                value={form.experience}
                options={[
                  ["any", "不限"],
                  ["delivery_experience", "有配送经验"],
                  ["carrier_experience", "熟悉该承运商"],
                ]}
                onChange={(v) => update("experience", v)}
              />
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="最晚取件（选填）"
                    value={form.pickupEnd}
                    onChangeText={(v) => update("pickupEnd", v)}
                    placeholder="16:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="配送截止（选填）"
                    value={form.deliveryEnd}
                    onChangeText={(v) => update("deliveryEnd", v)}
                    placeholder="20:00"
                  />
                </View>
              </View>
              <Field
                label="私下付款约定（选填）"
                value={form.terms}
                onChangeText={(v) => update("terms", v)}
                maxLength={300}
              />
            </>
          ) : null}
          <Field
            label={delivery ? "其他说明（选填）" : "需要什么帮助"}
            value={form.description}
            onChangeText={(v) => update("description", v)}
            multiline
            maxLength={1000}
            style={{ minHeight: 100, textAlignVertical: "top" }}
          />
        </>
      )}
      <Modal
        visible={picker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,.35)",
          }}
        >
          <View
            style={{
              maxHeight: "75%",
              backgroundColor: tokens.color.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 22,
              gap: 16,
            }}
          >
            <Text style={s.headline}>选择区域</Text>
            <ScrollView>
              {regions.map((r) => (
                <Pressable
                  key={r.id}
                  style={[s.choice, { marginVertical: 4 }]}
                  accessibilityRole="button"
                  onPress={() => {
                    if (picker) update(picker, r.id);
                    setPicker(null);
                  }}
                >
                  <Text style={s.text}>{r.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ActionButton
              label="取消"
              secondary
              onPress={() => setPicker(null)}
            />
          </View>
        </View>
      </Modal>
    </AuthPage>
  );
}
