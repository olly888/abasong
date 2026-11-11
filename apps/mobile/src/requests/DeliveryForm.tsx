import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, Field } from "../ui/Controls";
import { NativeDateField } from "../ui/NativeDateField";
import { SelectionField } from "../ui/SelectionField";
import { Icon } from "../ui/Icon";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  dayAfter,
  type DeliveryAnchor,
  type DeliveryFields,
  type Scenario,
} from "./delivery-fields";
import {
  completionLabels,
  experienceLabels,
  handoffLabels,
  localDateTime,
  scopeLabels,
  sortedLabels,
} from "./presentation";
import { Choice, requestStyles as s } from "./RequestUi";
import { WarehouseAddressField } from "./WarehouseAddressField";
import { DeliverySection as Group } from "./DeliverySection";

export type DeliveryDisclosure =
  "identity" | "pickupKind" | "conditions" | "schedule" | "extra";
export type DeliveryAnchorWrap = (
  id: DeliveryAnchor,
  children: React.ReactNode,
  aliases?: DeliveryAnchor[],
) => React.ReactNode;
const carriers = ["SwiftX", "GOFO", "SpeedX", "UniUni", "其他"];
export function DeliveryDisclosureRow({
  title,
  summary,
  open,
  onToggle,
  disabled,
  collapsedAction = "更改",
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
  collapsedAction?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, summary].filter(Boolean).join("，")}
      accessibilityState={{ expanded: open, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        s.row,
        styles.disclosure,
        pressed && { backgroundColor: tokens.color.surfaceMuted },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.label}>{title}</Text>
        {summary ? <Text style={s.secondary}>{summary}</Text> : null}
      </View>
      {!open ? <Text style={styles.link}>{collapsedAction}</Text> : null}
      <Icon
        name={open ? "up" : "down"}
        size={18}
        color={tokens.color.textSecondary}
      />
    </Pressable>
  );
}
export function DeliveryForm({
  scenario,
  form: f,
  regions,
  onChange,
  request,
  disabled = false,
  open,
  toggle,
  anchor,
  today = localDateTime(null).date,
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
  open: Record<DeliveryDisclosure, boolean>;
  toggle: (section: DeliveryDisclosure) => void;
  anchor: DeliveryAnchorWrap;
  today?: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const inline = width >= 390 && fontScale <= 1.15;
  const paired = (left: React.ReactNode, right: React.ReactNode) =>
    left && right && inline ? (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
        <View style={{ width: Math.min(144, Math.max(112, width * 0.3)) }}>
          {right}
        </View>
      </View>
    ) : (
      <>
        {left}
        {right}
      </>
    );
  const warehouse = scenario === "warehouse_shortage";
  const tomorrow = dayAfter(today);
  const customDay = f.date !== today && f.date !== tomorrow;
  const expirySummary = f.customExpiry
    ? f.endDate && f.end
      ? `${f.endDate} ${f.end}`
      : "请选择下架日期和时间"
    : f.pickupEnd
      ? `${f.date} ${f.pickupEnd} · 随最迟接手时间`
      : f.date
        ? `${f.date} · 当天结束`
        : "请选择接手日期";
  const field = (
    key: "quantity" | "amount" | "minimum" | "route" | "terms" | "description",
    label: string,
    placeholder?: string,
  ) =>
    anchor(
      key,
      <Field
        label={label}
        value={f[key]}
        placeholder={placeholder}
        editable={!disabled}
        onChangeText={(v) => onChange(key, v)}
        keyboardType={
          key === "amount"
            ? "decimal-pad"
            : key === "quantity" || key === "minimum"
              ? "number-pad"
              : "default"
        }
        maxLength={
          key === "description"
            ? 1000
            : key === "terms"
              ? 300
              : key === "route"
                ? 80
                : 12
        }
        multiline={key === "description"}
      />,
    );
  const regionOptions = regions.map((r) => [r.id, r.label] as const);
  const regionField = (key: "pickupRegion" | "region", label: string) =>
    anchor(
      key,
      <SelectionField
        label={label}
        value={f[key]}
        options={regionOptions}
        onChange={(v) => onChange(key, v)}
        disabled={disabled || !regions.length}
      />,
    );
  const carrierChoice = carriers.includes(f.carrier)
    ? f.carrier
    : f.carrier
      ? "其他"
      : "";
  return (
    <View style={{ gap: 16 }}>
      {anchor(
        "places",
        <Group title={warehouse ? "取件与派送" : "交接与派送"}>
          {!warehouse || f.pickupKind !== "warehouse" || open.pickupKind ? (
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
          ) : null}
          {f.pickupKind === "warehouse" ? (
            <WarehouseAddressField
              value={f.warehouse}
              onChange={(v) => onChange("warehouse", v)}
              request={request}
              disabled={disabled}
              anchor={anchor}
            />
          ) : null}
          {regionField(
            "pickupRegion",
            f.pickupKind === "warehouse" ? "取件区域" : "交接地区",
          )}
          {f.pickupKind === "contact_handoff" ? (
            <Text style={s.secondary}>具体交接地点联系确认</Text>
          ) : null}
          {regionField("region", "派送区域")}
          {f.pickupKind === "contact_handoff" &&
          f.pickupRegion &&
          f.pickupRegion !== f.region ? (
            <ActionButton
              label="与交接地区相同"
              variant="text"
              disabled={disabled}
              onPress={() => onChange("region", f.pickupRegion)}
            />
          ) : null}
          {carrierChoice === "其他" ? (
            <>
              <Choice
                label="快递公司"
                value={carrierChoice}
                options={carriers.map((v) => [v, v] as const)}
                onChange={(v) => {
                  if (v !== carrierChoice) onChange("carrier", v);
                }}
                disabled={disabled}
              />
              {anchor(
                "carrier",
                <Field
                  label="快递公司名称"
                  value={f.carrier === "其他" ? "" : f.carrier}
                  maxLength={80}
                  editable={!disabled}
                  onChangeText={(v) => onChange("carrier", v || "其他")}
                />,
              )}
            </>
          ) : (
            anchor(
              "carrier",
              <Choice
                label="快递公司"
                value={carrierChoice}
                options={carriers.map((v) => [v, v] as const)}
                onChange={(v) => onChange("carrier", v)}
                disabled={disabled}
              />,
            )
          )}
          {warehouse && f.pickupKind === "warehouse" && !open.pickupKind ? (
            <ActionButton
              label="更改取件方式"
              variant="text"
              disabled={disabled}
              onPress={() => toggle("pickupKind")}
            />
          ) : null}
        </Group>,
      )}
      {anchor(
        "schedule",
        <Group title={warehouse ? "到场安排" : "接手时间"}>
          {anchor(
            "date",
            <View style={{ gap: 8 }}>
              <Text style={s.label}>
                接手日期{f.date ? ` · ${f.date}` : ""}
              </Text>
              <View style={s.choices}>
                {(
                  [
                    [today, "今天"],
                    [tomorrow, "明天"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: f.date === value, disabled }}
                    disabled={disabled}
                    onPress={() => onChange("date", value)}
                    style={[s.choice, f.date === value && s.selected]}
                  >
                    <Text
                      style={[s.choiceText, f.date === value && s.selectedText]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
                <NativeDateField
                  label="选择其他接手日期"
                  mode="date"
                  value={f.date}
                  inlineLabel={customDay ? f.date : "选日期"}
                  inlineSelected={customDay}
                  onChange={(v) => onChange("date", v)}
                  disabled={disabled}
                />
              </View>
            </View>,
          )}
          {paired(
            f.date === today ? (
              <Choice
                label="接手方式"
                compact={inline}
                value={f.asap ? "asap" : "scheduled"}
                options={[
                  ["asap", warehouse ? "尽快到场" : "尽快接手"],
                  ["scheduled", "约时间"],
                ]}
                onChange={(v) => onChange("asap", v === "asap")}
                disabled={disabled}
              />
            ) : null,
            !f.asap
              ? anchor(
                  "start",
                  <NativeDateField
                    label={warehouse ? "希望到场" : "希望接手"}
                    mode="time"
                    date={f.date}
                    value={f.start}
                    onChange={(v) => onChange("start", v)}
                    disabled={disabled}
                  />,
                )
              : null,
          )}
          <Text style={s.secondary}>洛杉矶时间</Text>
          <View style={styles.optional}>
            <DeliveryDisclosureRow
              title="需求下架"
              summary={expirySummary}
              open={open.schedule}
              onToggle={() => toggle("schedule")}
              disabled={disabled}
            />
            {open.schedule ? (
              <View style={styles.disclosed}>
                {anchor(
                  "pickupEnd",
                  <NativeDateField
                    label="最迟接手时间"
                    mode="time"
                    value={f.pickupEnd}
                    date={f.date}
                    optional
                    disabled={disabled}
                    onChange={(v) => onChange("pickupEnd", v)}
                  />,
                )}
                <View style={s.row}>
                  <Text style={[s.label, { flex: 1 }]}>自定义下架时间</Text>
                  <Switch
                    accessibilityLabel="自定义下架时间"
                    value={f.customExpiry}
                    onValueChange={(v) => onChange("customExpiry", v)}
                    disabled={disabled}
                    trackColor={{ true: tokens.color.brandPrimary }}
                  />
                </View>
                {f.customExpiry ? (
                  <>
                    {anchor(
                      "endDate",
                      <NativeDateField
                        label="下架日期"
                        mode="date"
                        value={f.endDate}
                        onChange={(v) => onChange("endDate", v)}
                        disabled={disabled}
                      />,
                    )}
                    {anchor(
                      "end",
                      <NativeDateField
                        label="下架时间"
                        mode="time"
                        date={f.endDate}
                        value={f.end}
                        onChange={(v) => onChange("end", v)}
                        disabled={disabled}
                      />,
                    )}
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </Group>,
      )}
      {anchor(
        "load",
        <Group title={warehouse ? "人数、件数与报价" : "剩余包裹与报价"}>
          {warehouse
            ? anchor(
                "drivers",
                <View style={s.row}>
                  <Text style={[s.label, { flex: 1 }]}>需要司机</Text>
                  <View style={[s.row, { gap: 8 }]}>
                    {([-1, 1] as const).map((delta) => {
                      const count = Number(f.drivers);
                      const inactive =
                        disabled ||
                        (delta === -1 ? count <= 1 : count >= 2147483647);
                      return (
                        <View
                          key={delta}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {delta === 1 ? (
                            <Text
                              style={styles.count}
                              accessibilityLabel={`需要 ${f.drivers || "0"} 名司机`}
                            >
                              {f.drivers || "—"}
                            </Text>
                          ) : null}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              delta < 0 ? "减少司机人数" : "增加司机人数"
                            }
                            accessibilityState={{ disabled: inactive }}
                            disabled={inactive}
                            onPress={() =>
                              onChange(
                                "drivers",
                                String(Math.max(1, count + delta)),
                              )
                            }
                            style={[styles.step, inactive && { opacity: 0.5 }]}
                          >
                            <Text style={styles.stepText}>
                              {delta < 0 ? "−" : "+"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>,
              )
            : null}
          {paired(
            anchor(
              "quantityMode",
              <Choice
                label="包裹件数"
                compact={inline}
                value={f.quantityMode}
                options={[
                  ["exact", "确定"],
                  ["estimate", "约数"],
                  ["unknown", "待确认"],
                ]}
                onChange={(v) => onChange("quantityMode", v)}
                disabled={disabled}
              />,
            ),
            f.quantityMode !== "unknown"
              ? field("quantity", warehouse ? "总待送件数" : "剩余件数", "件")
              : null,
          )}
          {paired(
            <Choice
              label="报价方式"
              compact={inline}
              value={f.unit}
              options={[
                ["per_parcel", "按件"],
                ["per_route", "按线路"],
                ["negotiable", "联系议价"],
              ]}
              onChange={(v) => onChange("unit", v)}
              disabled={disabled}
            />,
            f.unit !== "negotiable"
              ? field(
                  "amount",
                  f.unit === "per_route"
                    ? "报价 · USD / 线路"
                    : "报价 · USD / 件",
                  "如 1.85",
                )
              : null,
          )}
        </Group>,
      )}
      <View style={styles.optional}>
        {anchor(
          "conditions",
          <DeliveryDisclosureRow
            title="接手要求"
            summary={`${handoffLabels[f.handoff]} · ${completionLabels[f.completion]}${warehouse ? "" : ` · ${scopeLabels[f.scope]}`}`}
            open={open.conditions}
            onToggle={() => toggle("conditions")}
            disabled={disabled}
          />,
        )}
        {open.conditions ? (
          <View style={styles.disclosed}>
            {!warehouse || f.scope === "whole_route" ? (
              <Choice
                label="承接方式"
                value={f.scope}
                options={
                  Object.entries(scopeLabels) as [
                    DeliveryFields["scope"],
                    string,
                  ][]
                }
                onChange={(v) => onChange("scope", v)}
                disabled={disabled}
              />
            ) : null}
            <SelectionField
              label="账号与交接要求"
              value={f.handoff}
              options={
                Object.entries(handoffLabels) as [
                  DeliveryFields["handoff"],
                  string,
                ][]
              }
              onChange={(v) => onChange("handoff", v)}
              disabled={disabled}
            />
            <Choice
              label="送完要求"
              value={f.completion}
              options={[
                ["contact", "联系确认"],
                ["same_day", "当天送完"],
                ["next_day", "可次日送完"],
              ]}
              onChange={(v) => onChange("completion", v)}
              disabled={disabled}
            />
            {f.completion !== "contact"
              ? anchor(
                  "deliveryEnd",
                  <NativeDateField
                    label="最晚送完"
                    mode="time"
                    date={
                      f.completion === "next_day" ? dayAfter(f.date) : f.date
                    }
                    value={f.deliveryEnd}
                    optional
                    onChange={(v) => onChange("deliveryEnd", v)}
                    disabled={disabled}
                  />,
                )
              : null}
          </View>
        ) : null}
      </View>
      <View style={styles.optional}>
        {anchor(
          "extra",
          <DeliveryDisclosureRow
            title="补充条件"
            collapsedAction="选填"
            open={open.extra}
            onToggle={() => toggle("extra")}
            disabled={disabled}
          />,
        )}
        {open.extra ? (
          <View style={styles.disclosed}>
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
            {field("route", "线路编号（选填）")}
            {f.scope === "partial" && f.quantityMode !== "unknown"
              ? field("minimum", "每人最低件数（选填）")
              : null}
            <Choice
              label="配送经验"
              value={f.experience}
              options={
                Object.entries(experienceLabels) as [
                  DeliveryFields["experience"],
                  string,
                ][]
              }
              onChange={(v) => onChange("experience", v)}
              disabled={disabled}
            />
            <Choice
              label="理货状态"
              value={f.sorted}
              options={
                Object.entries(sortedLabels) as [
                  DeliveryFields["sorted"],
                  string,
                ][]
              }
              onChange={(v) => onChange("sorted", v)}
              disabled={disabled}
            />
            {field("terms", "私下付款约定（选填）")}
            {field("description", "其他说明（选填）")}
          </View>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  optional: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 14,
  },
  disclosure: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 48 },
  disclosed: {
    padding: 12,
    gap: 14,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
  },
  link: { fontSize: 14, color: tokens.color.brandText },
  step: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: 12,
  },
  stepText: { fontSize: 24, color: tokens.color.brandText },
  count: {
    minWidth: 30,
    textAlign: "center",
    color: tokens.color.ink,
    fontSize: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
