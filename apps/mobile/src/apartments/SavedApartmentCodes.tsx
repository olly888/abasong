import {
  entranceScopes,
  isEntranceScope,
  type components,
} from "@abasong/contracts";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { typeStyles } from "../ui/foundation";

type Record = components["schemas"]["PrivateRecord"];

export function SavedApartmentCodes({ records }: { records: Record[] }) {
  const recentByEntrance = entranceScopes.flatMap((scope) => {
    const record = records.find((item) => item.scope_label === scope);
    return record ? [record] : [];
  });
  const other = records.find((record) => !isEntranceScope(record.scope_label));
  const preview = other ? [...recentByEntrance, other] : recentByEntrance;
  return (
    <>
      {preview.map((record) => (
        <View key={record.id} style={styles.line}>
          <Text style={typeStyles.secondary}>{record.scope_label}</Text>
          <Text style={styles.code}>{record.value}</Text>
        </View>
      ))}
      {records.length > preview.length ? (
        <Text style={typeStyles.secondary}>
          另有 {records.length - preview.length} 条 · 查看详情
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  code: {
    color: tokens.color.ink,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
});
