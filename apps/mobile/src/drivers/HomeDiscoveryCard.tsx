import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { HomeResultCard } from "../ui/MapCardFrame";
import { Icon } from "../ui/Icon";
import {
  requestTitle,
  requestQuantity,
  requestPrice,
  deliveryArrival,
  isV2,
} from "../requests/presentation";
import { homeAvailabilityLabel } from "./home-availability-label";
import type { DiscoveryItem } from "./discovery-model";

export function HomeDiscoveryCard(p: {
  item: DiscoveryItem;
  regions: components["schemas"]["Region"][];
  selected: boolean;
  label: string;
  onOpen: () => void;
}) {
  const large = useWindowDimensions().fontScale > 1.1;
  const lines = large ? undefined : 1;
  const arrow = (
    <Icon name="chevron" size={16} color={tokens.color.textMuted} />
  );
  if (p.item.kind === "request") {
    const r = p.item.request;
    const region =
      p.regions.find((v) => v.id === r.region_id)?.label ?? "配送区域待确认";
    const pickup =
      p.regions.find((v) => v.id === r.pickup_region_id)?.label ?? "联系确认";
    const pickupLabel = isV2(r)
      ? r.pickup_kind === "warehouse"
        ? `仓库取件 · ${pickup}`
        : r.pickup_kind === "contact_handoff"
          ? "途中交接 · 联系确认"
          : "取件方式待确认"
      : `取件区域 · ${pickup}`;
    return (
      <HomeResultCard
        selected={p.selected}
        label={[
          p.label,
          r.carrier,
          requestTitle(r),
          requestPrice(r),
          requestQuantity(r),
          r.drivers_needed !== null
            ? `还需 ${r.remaining_drivers ?? r.drivers_needed} 人`
            : null,
          deliveryArrival(r),
          pickupLabel,
        ]
          .filter(Boolean)
          .join("；")}
        onOpen={p.onOpen}
        title={
          <>
            <View style={s.titleRow}>
              <Text style={s.title} numberOfLines={lines}>
                {region}
              </Text>
              <Text style={s.tag} numberOfLines={lines}>
                {r.carrier}
              </Text>
            </View>
            <Text style={s.meta} numberOfLines={lines}>
              {requestTitle(r)}
            </Text>
          </>
        }
        core={
          <View style={s.row}>
            <Text
              style={[
                s.price,
                r.price_unit === "negotiable" && { color: tokens.color.ink },
              ]}
            >
              {requestPrice(r)}
            </Text>
            <View style={s.quantity}>
              <Text style={s.count}>{requestQuantity(r)}</Text>
              {r.drivers_needed !== null ? (
                <Text style={s.meta}>
                  还需 {r.remaining_drivers ?? r.drivers_needed} 人
                </Text>
              ) : null}
            </View>
          </View>
        }
        footer={
          <>
            <View style={s.flex}>
              <Text style={s.footerMeta}>{deliveryArrival(r)}</Text>
              <Text style={s.footerMeta} numberOfLines={lines}>
                {pickupLabel}
              </Text>
            </View>
            {arrow}
          </>
        }
      />
    );
  }
  const d = p.item.driver,
    av = d.availability;
  const availableLabel =
    av && Date.parse(av.starts_at) > Date.now() ? "待开始" : "可接活";
  const timeLabel = av
    ? homeAvailabilityLabel(av.starts_at, av.ends_at)
    : "时段待确认";
  return (
    <HomeResultCard
      selected={p.selected}
      label={[
        p.label,
        availableLabel,
        d.regions.map((r) => r.label).join(" / "),
        timeLabel.replace("\n", " "),
        av?.capacity_parcels
          ? `可接 ${av.capacity_parcels} 件`
          : "件数联系确认",
        d.profile.vehicle_type,
        d.profile.experience.length
          ? `${[...new Set(d.profile.experience.map((e) => e.carrier))].join(" / ")} · 自报经验`
          : "暂未填写配送经验",
      ]
        .filter(Boolean)
        .join("；")}
      onOpen={p.onOpen}
      title={
        <>
          <View style={s.titleRow}>
            <View style={s.avatar}>
              <Text style={s.initial}>
                {d.profile.display_name.slice(0, 1)}
              </Text>
            </View>
            <Text style={s.title} numberOfLines={lines}>
              {d.profile.display_name}
            </Text>
            <Text style={s.meta}>{availableLabel}</Text>
          </View>
          <Text style={s.meta} numberOfLines={lines}>
            {d.regions.map((r) => r.label).join(" / ")}
          </Text>
        </>
      }
      core={<Text style={s.time}>{timeLabel}</Text>}
      footer={
        <>
          <View style={s.flex}>
            <Text style={s.footerMeta} numberOfLines={lines}>
              {av?.capacity_parcels
                ? `可接 ${av.capacity_parcels} 件`
                : "件数联系确认"}
              {d.profile.vehicle_type ? ` · ${d.profile.vehicle_type}` : ""}
            </Text>
            <Text style={s.footerMeta} numberOfLines={lines}>
              {d.profile.experience.length
                ? `${[...new Set(d.profile.experience.map((e) => e.carrier))].join(" / ")} · 自报`
                : "暂未填写配送经验"}
            </Text>
          </View>
          {arrow}
        </>
      }
    />
  );
}
const s = StyleSheet.create({
  titleRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: tokens.color.ink,
    flex: 1,
  },
  tag: {
    maxWidth: "34%",
    fontSize: 12,
    lineHeight: 18,
    color: tokens.color.textSecondary,
  },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textSecondary },
  footerMeta: { fontSize: 12, lineHeight: 17, color: tokens.color.textMuted },
  flex: { flex: 1, minWidth: 0 },
  price: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: tokens.color.brandText,
    flexShrink: 1,
  },
  quantity: { alignItems: "flex-end", flexShrink: 1 },
  count: { fontSize: 13, lineHeight: 17, color: tokens.color.inkSoft },
  time: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  avatar: {
    minWidth: 24,
    minHeight: 24,
    borderRadius: 6,
    backgroundColor: tokens.color.brandSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontSize: 13, color: tokens.color.brandText },
});
