import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, Field, FormError } from "../auth/AuthControls";
import { SelectionField } from "../ui/SelectionField";
import { NativeDateField } from "../ui/NativeDateField";
import { Icon } from "../ui/Icon";
import { type DeliveryRequest } from "./presentation";
import { Choice } from "./RequestUi";
import type { SupportFields } from "./support-fields";
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        gap: 16,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          lineHeight: 26,
          fontWeight: "600",
          color: tokens.color.ink,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
const carriers = ["SwiftX", "GOFO", "SpeedX", "UniUni"];
export function SupportFormFields({
  kind,
  form,
  regions,
  disabled = false,
  onChange,
  regionError,
  onRetryRegions,
}: {
  kind: DeliveryRequest["kind"];
  form: SupportFields;
  regions: components["schemas"]["Region"][];
  disabled?: boolean;
  onChange: <K extends keyof SupportFields>(
    key: K,
    value: SupportFields[K],
  ) => void;
  regionError?: string | null;
  onRetryRegions?: () => void;
}) {
  const delivery = !["vehicle_help", "other_help"].includes(kind),
    [more, setMore] = useState(
      !!(form.description || form.terms || form.pickupEnd || form.deliveryEnd),
    ),
    other = !!form.carrier && !carriers.includes(form.carrier);
  const field = (
    key: "route" | "quantity" | "drivers" | "minimum" | "amount",
    label: string,
    numeric = false,
  ) => (
    <Field
      label={label}
      value={form[key]}
      onChangeText={(v) => onChange(key, v)}
      editable={!disabled}
      keyboardType={
        numeric ? (key === "amount" ? "decimal-pad" : "number-pad") : "default"
      }
    />
  );
  return (
    <View style={{ gap: 24 }}>
      <Section title={delivery ? "配送与取件" : "求助区域"}>
        {delivery ? (
          <>
            <SelectionField
              label="承运商"
              value={other ? "其他" : form.carrier}
              options={[
                ...carriers.map((c) => [c, c] as const),
                ["其他", "其他"],
              ]}
              onChange={(v) => onChange("carrier", v)}
              disabled={disabled}
            />
            {other ? (
              <Field
                label="承运商名称"
                value={form.carrier === "其他" ? "" : form.carrier}
                maxLength={80}
                onChangeText={(v) => onChange("carrier", v || "其他")}
                editable={!disabled}
              />
            ) : null}
          </>
        ) : null}
        <SelectionField
          label={delivery ? "配送区域" : "所在区域"}
          value={form.region}
          options={regions.map((r) => [r.id, r.label] as const)}
          onChange={(v) => onChange("region", v)}
          disabled={disabled || !regions.length}
        />
        {delivery ? (
          <>
            <SelectionField
              label="取件区域"
              value={form.pickup}
              options={regions.map((r) => [r.id, r.label] as const)}
              onChange={(v) => onChange("pickup", v)}
              disabled={disabled || !regions.length}
            />
            {field("route", "线路（选填）")}
          </>
        ) : null}
        <FormError message={regionError ?? null} />
        {regionError && onRetryRegions ? (
          <ActionButton
            label="重新读取区域"
            variant="text"
            onPress={onRetryRegions}
          />
        ) : null}
      </Section>
      <Section title={delivery ? "本次时间与数量" : "本次时间"}>
        <NativeDateField
          label={delivery ? "配送日期" : "求助日期"}
          mode="date"
          value={form.date}
          onChange={(v) => onChange("date", v)}
          disabled={disabled}
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <NativeDateField
              label={delivery ? "可开始取件" : "可开始时间"}
              mode="time"
              value={form.start}
              date={form.date}
              onChange={(v) => onChange("start", v)}
              disabled={disabled}
            />
          </View>
          <View style={{ flex: 1 }}>
            <NativeDateField
              label="需求有效至"
              mode="time"
              value={form.end}
              date={form.endDate}
              onChange={(v) => onChange("end", v)}
              disabled={disabled}
            />
          </View>
        </View>
        <NativeDateField
          label="截止日期"
          mode="date"
          value={form.endDate}
          onChange={(v) => onChange("endDate", v)}
          disabled={disabled}
        />
        {delivery ? (
          <>
            {field("quantity", "本次包裹数量（件）", true)}
            {kind === "extra_drivers"
              ? field("drivers", "本次需要几名司机（人）", true)
              : null}
            {kind !== "whole_route" ? (
              <>
                <Choice
                  disabled={disabled}
                  label="包裹分担"
                  value={form.partial}
                  options={[
                    ["yes", "可以分担"],
                    ["no", "整批接手"],
                  ]}
                  onChange={(v) => onChange("partial", v)}
                />
                {form.partial === "yes"
                  ? field("minimum", "每人最低承接量（选填）", true)
                  : null}
              </>
            ) : (
              <Text style={{ fontSize: 14, color: tokens.color.textSecondary }}>
                整条线路承接
              </Text>
            )}
          </>
        ) : null}
      </Section>
      {delivery ? (
        <Section title="报价与接手条件">
          <SelectionField
            label="报价单位"
            value={form.unit}
            options={[
              ["per_parcel", "美元 / 件"],
              ["per_route", "美元 / 线路"],
              ["negotiable", "联系议价"],
            ]}
            onChange={(v) => onChange("unit", v)}
            disabled={disabled}
          />
          {form.unit !== "negotiable"
            ? field("amount", "报价（USD）", true)
            : null}
          <SelectionField
            label="理货状态"
            value={form.sorted}
            options={[
              ["unknown", "待确认"],
              ["sorted", "已理货"],
              ["unsorted", "未理货"],
            ]}
            onChange={(v) => onChange("sorted", v)}
            disabled={disabled}
          />
          <SelectionField
            label="接手要求"
            value={form.handoff}
            options={[
              ["contact_confirm", "联系确认"],
              ["carrier_account", "需已有承运商账号"],
              ["dsp_approval", "需 DSP 确认转派"],
            ]}
            onChange={(v) => onChange("handoff", v)}
            disabled={disabled}
          />
          <SelectionField
            label="配送经验要求"
            value={form.experience}
            options={[
              ["any", "不限"],
              ["delivery_experience", "有配送经验"],
              ["carrier_experience", "熟悉该承运商"],
            ]}
            onChange={(v) => onChange("experience", v)}
            disabled={disabled}
          />
        </Section>
      ) : (
        <Field
          label="需要什么帮助"
          value={form.description}
          onChangeText={(v) => onChange("description", v)}
          multiline
          style={{ minHeight: 100, textAlignVertical: "top" }}
          maxLength={1000}
          editable={!disabled}
        />
      )}
      {delivery ? (
        <View style={{ gap: 16 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            disabled={disabled}
            onPress={() => setMore((x) => !x)}
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: tokens.color.ink,
              }}
            >
              补充条件（选填）
            </Text>
            <Icon name={more ? "up" : "down"} />
          </Pressable>
          {more ? (
            <>
              <Field
                label="补充说明"
                value={form.description}
                onChangeText={(v) => onChange("description", v)}
                editable={!disabled}
                multiline
                style={{ minHeight: 100, textAlignVertical: "top" }}
                maxLength={1000}
              />
              <Field
                label="付款约定"
                value={form.terms}
                onChangeText={(v) => onChange("terms", v)}
                editable={!disabled}
                maxLength={300}
              />
              <NativeDateField
                label="最晚取件"
                mode="time"
                value={form.pickupEnd}
                date={form.date}
                optional
                disabled={disabled}
                onChange={(v) => onChange("pickupEnd", v)}
              />
              <NativeDateField
                label="最晚送完"
                mode="time"
                value={form.deliveryEnd}
                date={form.endDate}
                optional
                disabled={disabled}
                onChange={(v) => onChange("deliveryEnd", v)}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
