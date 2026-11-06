import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { Field } from "../ui/Controls";
import { NativeDateField } from "../ui/NativeDateField";
import { SelectionField } from "../ui/SelectionField";
import { Icon } from "../ui/Icon";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  dayAfter,
  type DeliveryFields,
  type Scenario,
} from "./delivery-fields";
import { localDateTime } from "./presentation";
import { Choice, requestStyles as s } from "./RequestUi";
import { WarehouseAddressField } from "./WarehouseAddressField";
const carriers = ["SwiftX", "GOFO", "SpeedX", "UniUni"];
function Group({
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
      <Text style={[s.headline, { fontSize: 18 }]}>{title}</Text>
      {children}
    </View>
  );
}
export function DeliveryForm({
  scenario,
  form: f,
  regions,
  onChange,
  request,
  disabled = false,
}: {
  scenario: Scenario;
  form: DeliveryFields;
  regions: components["schemas"]["Region"][];
  onChange: <K extends keyof DeliveryFields>(
    key: K,
    value: DeliveryFields[K],
  ) => void;
  request: ContributionRequest;
  disabled?: boolean;
}) {
  const [more, setMore] = useState(false),
    today = localDateTime(null).date;
  const field = (
    key:
      | "quantity"
      | "drivers"
      | "amount"
      | "minimum"
      | "route"
      | "terms"
      | "description",
    label: string,
    numeric = false,
  ) => (
    <Field
      label={label}
      value={f[key]}
      editable={!disabled}
      onChangeText={(v) => onChange(key, v)}
      keyboardType={
        numeric ? (key === "amount" ? "decimal-pad" : "number-pad") : "default"
      }
      maxLength={key === "description" ? 1000 : key === "terms" ? 300 : 80}
      multiline={key === "description"}
    />
  );
  const regionOptions = regions.map((r) => [r.id, r.label] as const);
  return (
    <View style={{ gap: 24 }}>
      <Group title="派送到哪里">
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <SelectionField
              label="派送区域"
              value={f.region}
              options={regionOptions}
              onChange={(v) => onChange("region", v)}
              disabled={disabled || !regions.length}
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectionField
              label="快递公司"
              value={
                carriers.includes(f.carrier)
                  ? f.carrier
                  : f.carrier
                    ? "其他"
                    : ""
              }
              options={[
                ...carriers.map((v) => [v, v] as const),
                ["其他", "其他"],
              ]}
              onChange={(v) => onChange("carrier", v)}
              disabled={disabled}
            />
          </View>
        </View>
        {f.carrier && !carriers.includes(f.carrier) ? (
          <Field
            label="快递公司名称"
            value={f.carrier === "其他" ? "" : f.carrier}
            maxLength={80}
            editable={!disabled}
            onChangeText={(v) => onChange("carrier", v || "其他")}
          />
        ) : null}
      </Group>
      <Group title="到哪里取件">
        <Choice
          label="取件方式"
          value={f.pickupKind}
          options={[
            ["warehouse", "仓库取件"],
            ["contact_handoff", "途中交接"],
          ]}
          onChange={(v) => onChange("pickupKind", v)}
          disabled={disabled}
        />
        {f.pickupKind === "warehouse" ? (
          <WarehouseAddressField
            value={f.warehouse}
            onChange={(v) => {
              if (
                v.line !== f.warehouse.line ||
                v.city !== f.warehouse.city ||
                v.state !== f.warehouse.state ||
                v.postal !== f.warehouse.postal
              )
                onChange("pickupRegion", "");
              onChange("warehouse", v);
            }}
            request={request}
            disabled={disabled}
          />
        ) : (
          <Text style={s.secondary}>具体交接位置联系后确认</Text>
        )}
        <SelectionField
          label="取件区域"
          value={f.pickupRegion}
          options={regionOptions}
          onChange={(v) => onChange("pickupRegion", v)}
          disabled={disabled || !regions.length}
        />
      </Group>
      <Group title="什么时候接手">
        <Choice
          label="接手日期"
          value={
            f.date === today
              ? "today"
              : f.date === dayAfter(today)
                ? "tomorrow"
                : "other"
          }
          options={[
            ["today", "今天"],
            ["tomorrow", "明天"],
            ["other", "其他日期"],
          ]}
          disabled={disabled}
          onChange={(v) => {
            if (v !== "other")
              onChange("date", v === "today" ? today : dayAfter(today));
            else onChange("date", dayAfter(today, 2));
          }}
        />
        {f.date !== today && f.date !== dayAfter(today) ? (
          <NativeDateField
            label="接手日期"
            mode="date"
            value={f.date}
            onChange={(v) => onChange("date", v)}
            disabled={disabled}
          />
        ) : null}
        {f.date === today ? (
          <View style={s.row}>
            <Text style={s.text}>尽快到场</Text>
            <Switch
              accessibilityLabel="尽快到场"
              value={f.asap}
              onValueChange={(v) => onChange("asap", v)}
              disabled={disabled}
              trackColor={{ true: tokens.color.brandPrimary }}
            />
          </View>
        ) : null}
        {!f.asap ? (
          <NativeDateField
            label="希望到场"
            mode="time"
            date={f.date}
            value={f.start}
            onChange={(v) => onChange("start", v)}
            disabled={disabled}
          />
        ) : null}
      </Group>
      <Group title="任务量">
        <Choice
          label="包裹数量"
          value={f.quantityMode}
          options={[
            ["exact", "确定"],
            ["estimate", "约数"],
            ["unknown", "待确认"],
          ]}
          onChange={(v) => onChange("quantityMode", v)}
          disabled={disabled}
        />
        {f.quantityMode !== "unknown"
          ? field(
              "quantity",
              f.quantityMode === "estimate" ? "大约多少件" : "包裹件数",
              true,
            )
          : null}
        {scenario === "warehouse_shortage"
          ? field("drivers", "需要几名司机", true)
          : null}
      </Group>
      <Group title="报价">
        <SelectionField
          label="报价单位"
          value={f.unit}
          options={[
            ["per_parcel", "美元 / 件"],
            ["per_route", "美元 / 线路"],
            ["negotiable", "联系议价"],
          ]}
          onChange={(v) => onChange("unit", v)}
          disabled={disabled}
        />
        {f.unit !== "negotiable" ? field("amount", "报价（USD）", true) : null}
      </Group>
      <Group title="接手条件">
        <SelectionField
          label="账号与转派"
          value={f.handoff}
          options={[
            ["contact_confirm", "联系确认"],
            ["carrier_account", "需已有快递公司账号"],
            ["dsp_approval", "需 DSP 确认转派"],
          ]}
          onChange={(v) => onChange("handoff", v)}
          disabled={disabled}
        />
        <SelectionField
          label="送完要求"
          value={f.completion}
          options={[
            ["same_day", "当天送完"],
            ["next_day", "次日送完"],
            ["contact", "联系确认"],
          ]}
          onChange={(v) => onChange("completion", v)}
          disabled={disabled}
        />
      </Group>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: more, disabled }}
        disabled={disabled}
        onPress={() => setMore((v) => !v)}
        style={[s.row, { minHeight: 48 }]}
      >
        <Text style={s.label}>补充条件（选填）</Text>
        <Icon name={more ? "up" : "down"} />
      </Pressable>
      {more ? (
        <View style={{ gap: 20 }}>
          {f.pickupKind === "warehouse" ? (
            <Field
              label="仓库名称（选填）"
              value={f.warehouse.name}
              editable={!disabled}
              maxLength={120}
              onChangeText={(name) =>
                onChange("warehouse", { ...f.warehouse, name })
              }
            />
          ) : null}
          {field("route", "线路")}
          <NativeDateField
            label="最晚取件"
            mode="time"
            value={f.pickupEnd}
            date={f.date}
            optional
            disabled={disabled}
            onChange={(v) => onChange("pickupEnd", v)}
          />
          <Choice
            label="承接方式"
            value={f.scope}
            options={[
              ["partial", "可以分担"],
              ["whole_route", "整批接手"],
            ]}
            onChange={(v) => onChange("scope", v)}
            disabled={disabled}
          />
          {f.scope === "partial" && f.quantityMode !== "unknown"
            ? field("minimum", "每人最低件数", true)
            : null}
          <SelectionField
            label="配送经验"
            value={f.experience}
            options={[
              ["any", "不限"],
              ["delivery_experience", "有配送经验"],
              ["carrier_experience", "熟悉该快递公司"],
            ]}
            onChange={(v) => onChange("experience", v)}
            disabled={disabled}
          />
          <SelectionField
            label="理货状态"
            value={f.sorted}
            options={[
              ["unknown", "联系确认"],
              ["sorted", "已理货"],
              ["unsorted", "未理货"],
            ]}
            onChange={(v) => onChange("sorted", v)}
            disabled={disabled}
          />
          {f.completion !== "contact" ? (
            <NativeDateField
              label="最晚送完"
              mode="time"
              date={f.completion === "next_day" ? dayAfter(f.date) : f.date}
              value={f.deliveryEnd}
              optional
              onChange={(v) => onChange("deliveryEnd", v)}
              disabled={disabled}
            />
          ) : null}
          {field("terms", "私下付款约定")}
          {field("description", "补充说明")}
          <View style={s.row}>
            <Text style={s.text}>自定需求有效时间</Text>
            <Switch
              accessibilityLabel="自定需求有效时间"
              value={f.customExpiry}
              onValueChange={(v) => onChange("customExpiry", v)}
              disabled={disabled}
              trackColor={{ true: tokens.color.brandPrimary }}
            />
          </View>
          {f.customExpiry ? (
            <>
              <NativeDateField
                label="有效日期"
                mode="date"
                value={f.endDate}
                onChange={(v) => onChange("endDate", v)}
                disabled={disabled}
              />
              <NativeDateField
                label="有效至"
                mode="time"
                date={f.endDate}
                value={f.end}
                onChange={(v) => onChange("end", v)}
                disabled={disabled}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
