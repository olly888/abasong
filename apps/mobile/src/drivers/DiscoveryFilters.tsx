import { useState } from "react";
import { Text } from "react-native";
import type { components } from "@abasong/contracts";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionButton, Field } from "../ui/Controls";
import { SelectionField } from "../ui/SelectionField";
import { typeStyles } from "../ui/foundation";
import { localDateTime, kindLabels } from "../requests/presentation";
import { nextDate } from "./availability-fields";
import {
  defaultFilters,
  type Filters,
  type SupportMode,
} from "./discovery-model";
export function DiscoveryFilters(p: {
  mode: SupportMode;
  filters: Filters;
  regions: components["schemas"]["Region"][];
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(p.filters),
    today = localDateTime(null).date;
  return (
    <BottomSheet onRequestClose={p.onClose}>
      <Text style={typeStyles.title}>
        {p.mode === "找活" ? "筛选临时支援" : "筛选可用司机"}
      </Text>
      <SelectionField
        label="服务区域"
        value={draft.region}
        options={[
          ["", "全部区域"],
          ...p.regions.map((r) => [r.id, r.label] as const),
        ]}
        onChange={(region) => setDraft({ ...draft, region })}
      />
      <SelectionField
        label="日期"
        value={draft.day}
        options={[
          ["", "不限日期"],
          [today, "今天"],
          [nextDate(today), "明天"],
        ]}
        onChange={(day) => setDraft({ ...draft, day })}
      />
      {p.mode === "找活" ? (
        <SelectionField
          label="支援类型"
          value={draft.kind}
          options={[["", "全部类型"], ...Object.entries(kindLabels)]}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
      ) : null}
      <Field
        label={
          p.mode === "找活"
            ? "承运商、线路或区域（选填）"
            : "承运商经验（选填）"
        }
        value={draft.text}
        maxLength={80}
        onChangeText={(text) => setDraft({ ...draft, text })}
      />
      <ActionButton label="查看结果" onPress={() => p.onApply(draft)} />
      <ActionButton
        label="清除筛选"
        variant="text"
        onPress={() => setDraft(defaultFilters())}
      />
      <ActionButton label="取消" variant="text" onPress={p.onClose} />
    </BottomSheet>
  );
}
