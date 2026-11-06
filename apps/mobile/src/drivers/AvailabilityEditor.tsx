import { Platform, Pressable, Switch, Text, View } from "react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { NativeDateField } from "../ui/NativeDateField";
import { PageFrame } from "../ui/PageFrame";
import { StatusPanel } from "../ui/Feedback";
import { typeStyles } from "../ui/foundation";
import { Choice } from "../requests/RequestUi";
import { localDateTime } from "../requests/presentation";
import {
  availabilityEndDate,
  changeAvailabilityField,
  nextDate,
  type AvailabilityFields,
} from "./availability-fields";
export function AvailabilityEditor(p: {
  form: AvailabilityFields;
  regions: components["schemas"]["Region"][];
  busy: boolean;
  loading?: boolean;
  ready?: boolean;
  saveDisabled?: boolean;
  conflict?: boolean;
  regionError?: string | null;
  error: string | null;
  status?: string;
  testControls?: ReactNode;
  onChange: (f: AvailabilityFields) => void;
  onSave: () => void;
  onReload: () => void;
  onBack?: () => void;
}) {
  const f = p.form,
    today = localDateTime(null).date;
  const back =
    p.onBack ??
    (() => (router.canGoBack() ? router.back() : router.replace("/profile")));
  const endDate = availabilityEndDate(f);
  const disabled = p.busy || !!p.conflict;
  const change = <K extends keyof AvailabilityFields>(
    key: K,
    value: AvailabilityFields[K],
  ) => p.onChange(changeAvailabilityField(f, key, value));
  const missing = f.regions.filter((id) => !p.regions.some((r) => r.id === id));
  return (
    <PageFrame
      compact
      onBack={p.onBack}
      title="可接活设置"
      footer={
        <View style={{ gap: 10 }}>
          <FormError message={p.error} />
          {p.ready !== false ? (
            <ActionButton
              label={p.conflict ? "读取最新状态" : "保存可接活状态"}
              disabled={p.saveDisabled}
              busy={p.busy}
              onPress={p.conflict ? p.onReload : p.onSave}
            />
          ) : null}
          <ActionButton
            label="取消"
            variant="text"
            disabled={p.busy}
            onPress={back}
          />
        </View>
      }
    >
      {p.testControls}
      {p.loading ? (
        <StatusPanel state="loading" title="正在读取接活状态" />
      ) : p.ready === false ? (
        <ActionButton label="重新读取状态" onPress={p.onReload} />
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              minHeight: 48,
            }}
          >
            <Text style={[typeStyles.body, { flex: 1, fontWeight: "600" }]}>
              开启本次可接活时段
            </Text>
            <Switch
              accessibilityLabel="开启本次可接活时段"
              value={f.enabled}
              disabled={disabled}
              trackColor={{ true: tokens.color.brandPrimary }}
              thumbColor={
                Platform.OS === "android" ? tokens.color.surface : undefined
              }
              onValueChange={(enabled) => change("enabled", enabled)}
            />
          </View>
          {p.status ? (
            <Text style={typeStyles.secondary}>当前：{p.status}</Text>
          ) : null}
          <Text style={typeStyles.secondary}>
            保存后生效，关闭后停止推荐，已有会话保留
          </Text>
          {f.enabled ? (
            <>
              <View style={section}>
                <Text style={typeStyles.title}>本次时段</Text>
                <Choice
                  label="可接日期"
                  value={
                    f.date === today
                      ? "today"
                      : f.date === nextDate(today)
                        ? "tomorrow"
                        : "other"
                  }
                  options={[
                    ["today", "今天"],
                    ["tomorrow", "明天"],
                  ]}
                  onChange={(v) =>
                    change("date", v === "today" ? today : nextDate(today))
                  }
                  disabled={disabled}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <NativeDateField
                      label="开始日期"
                      compactDate
                      mode="date"
                      value={f.date}
                      onChange={(date) => change("date", date)}
                      disabled={disabled}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <NativeDateField
                      label="开始时间"
                      mode="time"
                      date={f.date}
                      value={f.start}
                      onChange={(start) => change("start", start)}
                      disabled={disabled}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <NativeDateField
                      label="结束日期"
                      compactDate
                      mode="date"
                      value={endDate}
                      onChange={(date) => change("endDate", date)}
                      disabled={disabled}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <NativeDateField
                      label="结束时间"
                      mode="time"
                      date={endDate}
                      value={f.end}
                      onChange={(end) => change("end", end)}
                      disabled={disabled}
                    />
                  </View>
                </View>
                {endDate > f.date ? (
                  <Text style={typeStyles.secondary}>
                    结束于 {endDate}
                    {endDate === nextDate(f.date) ? "（次日）" : ""}
                  </Text>
                ) : null}
              </View>
              <View style={section}>
                <Text style={typeStyles.title}>我愿意去的区域</Text>
                <Text style={typeStyles.secondary}>选择1–5个区域</Text>
                <FormError message={p.regionError ?? null} />
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {[
                    ...p.regions,
                    ...missing.map((id) => ({ id, label: "暂不可用的区域" })),
                  ].map((r) => {
                    const selected = f.regions.includes(r.id),
                      blocked =
                        disabled || (!selected && f.regions.length >= 5);
                    return (
                      <Pressable
                        key={r.id}
                        accessibilityRole="checkbox"
                        accessibilityLabel={r.label}
                        accessibilityState={{
                          checked: selected,
                          disabled: blocked,
                        }}
                        disabled={blocked}
                        onPress={() =>
                          change(
                            "regions",
                            selected
                              ? f.regions.filter((id) => id !== r.id)
                              : [...f.regions, r.id],
                          )
                        }
                        style={{
                          minHeight: 48,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: selected
                            ? tokens.color.brandPrimary
                            : tokens.color.controlBorder,
                          borderRadius: 10,
                          opacity: blocked && !selected ? 0.5 : 1,
                          backgroundColor: selected
                            ? tokens.color.brandSurface
                            : tokens.color.surface,
                        }}
                      >
                        <Text
                          style={[
                            typeStyles.body,
                            {
                              color: selected
                                ? tokens.color.brandPrimary
                                : tokens.color.ink,
                            },
                          ]}
                        >
                          {selected ? "✓ " : ""}
                          {r.label}
                          {missing.includes(r.id) ? " ×" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field
                label="最多可接包裹（选填）"
                value={f.capacity}
                onChangeText={(capacity) => change("capacity", capacity)}
                keyboardType="number-pad"
                editable={!disabled}
                maxLength={5}
                placeholder="留空，联系时商量"
              />
              <Text style={typeStyles.secondary}>
                关闭 App 不影响本次状态，到期停止推荐。
              </Text>
            </>
          ) : null}
          {!p.conflict ? (
            <ActionButton
              label="读取最新状态"
              variant="text"
              disabled={p.busy}
              onPress={p.onReload}
            />
          ) : null}
        </>
      )}
    </PageFrame>
  );
}
const section = {
  gap: 16,
  borderBottomWidth: 1,
  borderColor: tokens.color.border,
  paddingBottom: 20,
};
