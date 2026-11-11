import { entranceScopes } from "@abasong/contracts";
import { StyleSheet, Text, View } from "react-native";
import { ChoiceChip } from "../ui/ChoiceChip";
import { metrics, typeStyles } from "../ui/foundation";

export function EntranceScopeField(p: {
  value: string;
  sourceLabel?: string;
  disabled?: boolean;
  onChange: (scope: string) => void;
}) {
  return (
    <View style={{ gap: metrics.fieldGap }}>
      <Text style={typeStyles.label}>入口归属</Text>
      {p.sourceLabel ? (
        <Text style={typeStyles.secondary}>截图标注 · {p.sourceLabel}</Text>
      ) : null}
      <View style={styles.choices}>
        {entranceScopes.map((scope) => (
          <ChoiceChip
            key={scope}
            label={scope}
            selected={p.value === scope}
            disabled={p.disabled}
            onPress={() => p.onChange(p.value === scope ? "" : scope)}
          />
        ))}
      </View>
      <Text style={typeStyles.secondary}>
        {p.value === "社区通用"
          ? "已确认这条码适用于该社区多个入口。"
          : "确定多个入口都适用时，才选「社区通用」。不确定可先私存。"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
