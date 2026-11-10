import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
import { contributionMeta, methodLabel } from "./presentation";
import {
  distanceHint,
  type NearbyCardCandidate,
} from "./distance-presentation";
import type { DiscoveryObservation } from "./nearby-policy";
import type { AccessRowState } from "./visible-access-reader";
import { Icon } from "../ui/Icon";
import { HomeResultCard } from "../ui/MapCardFrame";
import { apartmentCardLabel, apartmentCardStatus } from "./card-accessibility";

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
  const large = useWindowDimensions().fontScale > 1.1;
  return (
    <HomeResultCard
      selected={p.selected}
      label={apartmentCardLabel({
        address: [
          a?.address_line1 ?? "公寓",
          a?.city ?? "地址待核对",
          a?.state,
          a?.postal_code,
        ]
          .filter(Boolean)
          .join("，"),
        distance,
        pendingAddress,
        state: p.state,
      })}
      onOpen={p.onOpen}
      title={
        <>
          <View style={s.heading}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AddressLine
                line={a?.address_line1 ?? "公寓 · 地址待核对"}
                compact
                homeResult
                expanded={large}
              />
            </View>
            {distance ? <Text style={s.distance}>{distance}</Text> : null}
          </View>
          <Text numberOfLines={large ? undefined : 1} style={s.meta}>
            {a?.city ?? "地址待核对"}
          </Text>
        </>
      }
      core={
        r ? (
          <>
            <View style={s.codeStrip}>
              <Text style={s.code}>
                {r.method === "keypad" ? r.value : methodLabel(r)}
              </Text>
              {r.scope.label &&
              !["大门", "门别未注明", "门别未标注"].includes(r.scope.label) ? (
                <Text style={s.door}>{r.scope.label}</Text>
              ) : null}
            </View>
            {r.method !== "keypad" ? (
              <Text style={s.meta}>{r.value}</Text>
            ) : null}
          </>
        ) : (
          <Text style={s.status}>
            {status === "error"
              ? "读取失败"
              : apartmentCardStatus(pendingAddress, status)}
          </Text>
        )
      }
      footer={
        <>
          <Text
            numberOfLines={large ? undefined : 2}
            style={[s.footerMeta, { flex: 1 }]}
          >
            {r ? contributionMeta(r) : "查看公寓详情"}
          </Text>
          {r ? (
            <Text style={s.footerMeta}>{p.state!.records.length} 条</Text>
          ) : null}
          <Icon name="chevron" size={16} color={tokens.color.textMuted} />
        </>
      }
      action={
        pendingAddress || (status === "ready" && !r)
          ? {
              label: pendingAddress ? "核对地址" : "添加门禁码",
              onPress: p.onAdd,
            }
          : status === "error"
            ? { label: "重试", onPress: p.onRetry }
            : undefined
      }
    />
  );
}
const s = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  distance: {
    fontSize: 12,
    lineHeight: 18,
    color: tokens.color.textSecondary,
    flexShrink: 0,
  },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textMuted },
  footerMeta: { fontSize: 12, lineHeight: 17, color: tokens.color.textMuted },
  codeStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  status: { fontSize: 14, lineHeight: 22, color: tokens.color.textSecondary },
});
