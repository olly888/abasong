import { Pressable, Switch, Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { NativeDateField } from "../ui/NativeDateField";
import { PageFrame } from "../ui/PageFrame";
import { typeStyles } from "../ui/foundation";
import { nextDate, type AvailabilityFields } from "./availability-fields";
export function AvailabilityEditor(p: {
  form: AvailabilityFields;
  regions: components["schemas"]["Region"][];
  busy: boolean;
  saveDisabled?: boolean;
  error: string | null;
  status?: string;
  onChange: (f: AvailabilityFields) => void;
  onSave: () => void;
  onReload: () => void;
  onBack?: () => void;
}) {
  const f = p.form;
  return (
    <PageFrame
      compact
      onBack={p.onBack}
      title="可接活设置"
      footer={
        <>
          <FormError message={p.error} />
          <ActionButton
            label="保存可接活状态"
            disabled={p.saveDisabled}
            busy={p.busy}
            onPress={p.onSave}
          />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Text style={[typeStyles.body, { flex: 1 }]}>开启本次可接活时段</Text>
        <Switch
          accessibilityLabel="开启本次可接活时段"
          value={f.enabled}
          disabled={p.busy}
          trackColor={{ true: tokens.color.brandPrimary }}
          onValueChange={(enabled) => p.onChange({ ...f, enabled })}
        />
      </View>
      {p.status ? <Text style={typeStyles.secondary}>{p.status}</Text> : null}
      {f.enabled ? (
        <>
          <NativeDateField
            label="可接日期"
            mode="date"
            value={f.date}
            onChange={(date) => p.onChange({ ...f, date })}
            disabled={p.busy}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <NativeDateField
                label="开始时间"
                mode="time"
                date={f.date}
                value={f.start}
                onChange={(start) => p.onChange({ ...f, start })}
                disabled={p.busy}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NativeDateField
                label="结束时间"
                mode="time"
                date={f.date}
                value={f.end}
                onChange={(end) => p.onChange({ ...f, end })}
                disabled={p.busy}
              />
            </View>
          </View>
          {f.end <= f.start ? (
            <Text style={typeStyles.secondary}>
              结束于 {nextDate(f.date)}（次日）
            </Text>
          ) : null}
          <Text style={typeStyles.label}>我愿意去的区域</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {p.regions.map((r) => {
              const selected = f.regions.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={r.label}
                  accessibilityState={{ checked: selected, disabled: p.busy }}
                  disabled={p.busy || (!selected && f.regions.length >= 5)}
                  onPress={() =>
                    p.onChange({
                      ...f,
                      regions: selected
                        ? f.regions.filter((id) => id !== r.id)
                        : [...f.regions, r.id],
                    })
                  }
                  style={{
                    minHeight: 48,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: selected
                      ? tokens.color.brandPrimary
                      : tokens.color.controlBorder,
                    borderRadius: 10,
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
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="最多可接包裹（选填）"
            value={f.capacity}
            onChangeText={(capacity) => p.onChange({ ...f, capacity })}
            keyboardType="number-pad"
            editable={!p.busy}
            placeholder="留空，联系时商量"
          />
          <Text style={typeStyles.secondary}>
            在声明时段内展示，关闭 App 不影响可接活状态。
          </Text>
        </>
      ) : null}
      <ActionButton
        label="读取最新状态"
        variant="text"
        disabled={p.busy}
        onPress={p.onReload}
      />
    </PageFrame>
  );
}
