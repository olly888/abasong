import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, ScrollView, Text, View } from "react-native";
import { router, usePreventRemove } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AuthPage, ActionButton, FormError } from "../auth/AuthControls";
import { AccountError } from "../auth/api-client";
import { ListRow } from "../ui/Primitives";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  changeDeliveryField,
  defaultDeliveryFields,
  deliveryInput,
  hydrateDelivery,
  type DeliveryFields,
  type Scenario,
} from "./delivery-fields";
import { createDeliveryWriter } from "./delivery-writer";
import { DeliveryForm } from "./DeliveryForm";
import { requestStyles as s } from "./RequestUi";
import {
  requestPrice,
  scenarioLabels,
  type DeliveryRequest,
} from "./presentation";
type S = components["schemas"];
export function DeliveryEditor({
  request,
  regions,
  identity,
  initial = null,
  copy = false,
  onDone,
  onReload,
  testNotice,
  testControls,
}: {
  request: ContributionRequest;
  regions: S["Region"][];
  identity: string;
  initial?: DeliveryRequest | null;
  copy?: boolean;
  onDone: (r: S["RequestDetailV2"], published: boolean) => void;
  onReload: () => void;
  testNotice?: string;
  testControls?: React.ReactNode;
}) {
  const seed = useMemo(
    () => (initial ? hydrateDelivery(initial, copy) : null),
    [initial, copy],
  );
  const [scenario, setScenario] = useState<Scenario | null>(
      seed?.scenario ?? null,
    ),
    [form, setForm] = useState<DeliveryFields>(
      seed?.fields ?? defaultDeliveryFields("warehouse_shortage"),
    ),
    [review, setReview] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false);
  const writer = useMemo(
    () =>
      createDeliveryWriter(
        request,
        randomUUID,
        !copy && initial && "request_schema_version" in initial
          ? initial
          : null,
      ),
    [request, initial, copy],
  );
  const lock = useRef(false),
    mounted = useRef(true),
    leaving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disablePrevention = usePreventRemove(
    dirty || review || busy,
    ({ repeat }) => {
      if (leaving.current) {
        repeat();
        return;
      }
      if (lock.current) return;
      if (review) {
        setReview(false);
        return;
      }
      Alert.alert("离开这次填写？", undefined, [
        { text: "继续填写", style: "cancel" },
        {
          text: "放弃修改",
          style: "destructive",
          onPress: () => {
            leaving.current = true;
            repeat();
          },
        },
      ]);
    },
  );
  const update = <K extends keyof DeliveryFields>(
    key: K,
    value: DeliveryFields[K],
  ) => {
    setForm((f) => changeDeliveryField(f, key, value));
    setDirty(true);
    setError(null);
  };
  const published = !copy && initial?.status !== "draft" && !!initial;
  function check() {
    if (!scenario) return;
    try {
      deliveryInput(scenario, form, true, writer.current());
      Keyboard.dismiss();
      setError(null);
      setReview(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查本次填写");
    }
  }
  async function save(publish: boolean) {
    if (!scenario || lock.current || conflict) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const result = await writer.save(
        deliveryInput(scenario, form, publish, writer.current()),
        publish,
      );
      if (!mounted.current) return;
      leaving.current = true;
      setDirty(false);
      disablePrevention();
      onDone(result, publish);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof AccountError && e.code === "VERSION_CONFLICT")
        setConflict(true);
      setError(e instanceof Error ? e.message : "保存失败，填写内容已保留");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const regionLabel = (id: string) =>
    regions.find((r) => r.id === id)?.label ?? "未选择";
  const fact = (label: string, value: string) => (
    <View style={{ gap: 6 }} key={label}>
      <Text style={s.secondary}>{label}</Text>
      <Text style={s.text}>{value}</Text>
    </View>
  );
  if (!scenario)
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
            maxHeight: "85%",
            paddingHorizontal: 20,
            paddingTop: 24,
          }}
        >
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
            {testControls}
            <Text style={s.headline}>发需求</Text>
            {testNotice ? <Text style={s.secondary}>{testNotice}</Text> : null}
            <ListRow
              title={scenarioLabels.warehouse_shortage}
              subtitle="临时缺人或包裹多，需要司机到仓库取件"
              icon="people"
              onPress={() => {
                setScenario("warehouse_shortage");
                setForm(defaultDeliveryFields("warehouse_shortage"));
              }}
            />
            <ListRow
              title={scenarioLabels.delivery_handoff}
              subtitle="把送不完的包裹交给同行代送"
              icon="box"
              onPress={() => {
                setScenario("delivery_handoff");
                setForm(defaultDeliveryFields("delivery_handoff"));
              }}
            />
            <ActionButton
              label="取消"
              variant="text"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/")
              }
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  return (
    <AuthPage
      key={review ? "review" : "form"}
      compact
      title={review ? "核对本次需求" : scenarioLabels[scenario]}
      footer={
        <View style={{ gap: 10 }}>
          <FormError message={error} />
          {conflict ? (
            <ActionButton
              label="重新读取当前需求"
              onPress={() => {
                leaving.current = true;
                disablePrevention();
                onReload();
              }}
            />
          ) : (
            <>
              <ActionButton
                label={
                  review
                    ? published
                      ? "确认保存"
                      : "确认发布"
                    : published
                      ? "核对并保存"
                      : "核对并发布"
                }
                disabled={busy}
                busy={busy}
                onPress={() => (review ? void save(true) : check())}
              />
              {review ? (
                <ActionButton
                  label="返回修改"
                  variant="text"
                  disabled={busy}
                  onPress={() => setReview(false)}
                />
              ) : !published ? (
                <ActionButton
                  label="保存草稿"
                  variant="text"
                  disabled={busy}
                  onPress={() => void save(false)}
                />
              ) : null}
            </>
          )}
        </View>
      }
    >
      {testControls}
      {testNotice ? <Text style={s.secondary}>{testNotice}</Text> : null}
      <View
        style={{
          padding: 14,
          backgroundColor: tokens.color.surfaceMuted,
          borderRadius: 12,
        }}
      >
        <Text style={s.secondary}>
          发布身份 ·{" "}
          {initial?.organization && !copy
            ? initial.organization.name
            : identity}
        </Text>
      </View>
      {review ? (
        <View style={{ gap: 24 }}>
          <Text style={s.headline}>{scenarioLabels[scenario]}</Text>
          {fact("派送", `${regionLabel(form.region)} · ${form.carrier}`)}
          {fact(
            "取件",
            form.pickupKind === "warehouse"
              ? [
                  form.warehouse.name,
                  form.warehouse.line,
                  form.warehouse.city,
                  form.warehouse.state,
                  form.warehouse.postal,
                ]
                  .filter(Boolean)
                  .join(", ")
              : `${regionLabel(form.pickupRegion)} · 联系确认具体交接位置`,
          )}
          {fact(
            "接手时间",
            `${form.date} · ${form.asap ? "尽快到场" : form.start}${form.pickupEnd ? ` · 最晚 ${form.pickupEnd}` : ""}`,
          )}
          {fact(
            "任务量",
            `${form.quantityMode === "unknown" ? "件数待确认" : `${form.quantityMode === "estimate" ? "约 " : ""}${form.quantity} 件`}${form.drivers ? ` · 需 ${form.drivers} 人` : ""} · ${form.scope === "partial" ? "可以分担" : "整批接手"}${form.minimum && form.scope === "partial" ? ` · 最低 ${form.minimum} 件` : ""}`,
          )}
          {fact(
            "报价",
            requestPrice({
              price_unit: form.unit,
              price_cents:
                form.unit === "negotiable"
                  ? null
                  : Math.round(Number(form.amount) * 100),
            }),
          )}
          {fact(
            "接手条件",
            `${{ carrier_account: "需已有快递公司账号", dsp_approval: "需 DSP 确认转派", contact_confirm: "联系确认" }[form.handoff]} · ${{ same_day: "当天送完", next_day: "次日送完", contact: "送完时间联系确认" }[form.completion]}${form.deliveryEnd && form.completion !== "contact" ? ` ${form.deliveryEnd}` : ""}`,
          )}
          {form.description ? fact("补充说明", form.description) : null}
          {form.terms ? fact("私下付款约定", form.terms) : null}
          {form.customExpiry
            ? fact("有效至", `${form.endDate} ${form.end}`)
            : null}
        </View>
      ) : (
        <DeliveryForm
          scenario={scenario}
          form={form}
          regions={regions}
          onChange={update}
          request={request}
          disabled={busy || conflict}
        />
      )}
    </AuthPage>
  );
}
