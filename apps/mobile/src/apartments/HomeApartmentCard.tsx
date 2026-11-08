import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
import { contributionMeta, methodLabel } from "./presentation";
import {
  distanceHint,
  type NearbyCardCandidate,
} from "./distance-presentation";
import type { DiscoveryObservation } from "./nearby-policy";
import type { AccessRowState } from "./visible-access-reader";
import { ActionButton } from "../ui/Controls";
import { Icon } from "../ui/Icon";
import { HomeResultCard } from "../ui/MapCardFrame";

export function HomeApartmentCard(p: {
  candidate: NearbyCardCandidate;
  observation: DiscoveryObservation | null;
  state?: AccessRowState;
  selected: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onRetry: () => void;
}) {
  const a = p.candidate.apartment ?? p.candidate.address;
  const distance = distanceHint(p.candidate, p.observation);
  const status = p.state?.status ?? "loading";
  const r = status === "ready" ? p.state?.records[0] : undefined;
  const pendingAddress = !p.candidate.apartment;
  return (
    <HomeResultCard selected={p.selected} style={{ minHeight: 164 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看${[a?.address_line1 ?? "公寓", a?.city ?? "地址待核对", a?.state, a?.postal_code].filter(Boolean).join("，")}`}
        accessibilityState={{ selected: p.selected }}
        onPress={p.onOpen}
      >
        <View style={s.heading}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AddressLine
              line={a?.address_line1 ?? "公寓 · 地址待核对"}
              compact
            />
          </View>
          {distance ? <Text style={s.distance}>{distance}</Text> : null}
        </View>
        {a?.city ? <Text style={s.meta}>{a.city}</Text> : null}
        {r ? (
          <View style={s.codeStrip}>
            <Text style={s.code}>
              {r.method === "keypad" ? r.value : methodLabel(r)}
            </Text>
            {r.scope.label &&
            !["大门", "门别未注明", "门别未标注"].includes(r.scope.label) ? (
              <Text style={s.door}>{r.scope.label}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={s.status}>
            {pendingAddress
              ? "核对地址后共享门禁码"
              : status === "loading"
                ? "正在读取门禁码"
                : status === "error"
                  ? "门禁码暂时无法加载"
                  : status === "denied"
                    ? "暂未开通资料查看资格"
                    : status === "paused"
                      ? "该公寓暂不共享门禁码"
                      : "暂无共享门禁码"}
          </Text>
        )}
        {r && r.method !== "keypad" ? (
          <Text style={s.meta}>{r.value}</Text>
        ) : null}
        <View style={s.footer}>
          <Text numberOfLines={2} style={[s.meta, { flex: 1 }]}>
            {r ? contributionMeta(r) : "查看公寓详情"}
          </Text>
          {r ? <Text style={s.meta}>{p.state!.records.length} 条</Text> : null}
          <Icon name="chevron" size={16} color={tokens.color.textMuted} />
        </View>
      </Pressable>
      {pendingAddress || (status === "ready" && !r) ? (
        <ActionButton
          label={pendingAddress && !a ? "核对地址" : "添加门禁码"}
          variant="text"
          onPress={p.onAdd}
        />
      ) : status === "error" ? (
        <ActionButton label="重新读取" variant="text" onPress={p.onRetry} />
      ) : null}
    </HomeResultCard>
  );
}
const s = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  distance: {
    fontSize: 12,
    color: tokens.color.brandText,
    fontWeight: "600",
    flexShrink: 1,
  },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textMuted },
  codeStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: tokens.color.surfaceMuted,
    marginTop: 10,
  },
  code: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: tokens.color.ink,
    flex: 1,
    fontVariant: ["tabular-nums"],
  },
  door: {
    fontSize: 12,
    lineHeight: 18,
    color: tokens.color.textSecondary,
    maxWidth: 64,
  },
  status: {
    fontSize: 14,
    lineHeight: 22,
    color: tokens.color.textSecondary,
    paddingVertical: 10,
  },
  footer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
  },
});
