import { StyleSheet, Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { typeStyles } from "../ui/foundation";
import {
  requestTitle,
  requestQuantity,
  requestPrice,
  requestTime,
} from "../requests/presentation";
import type { DiscoveryItem } from "./discovery-model";
type Region = components["schemas"]["Region"];

// One content component for the map rail and natural-height list. No nested
// card surface, automatic application/contact, location or new request fields.
export function DiscoveryCardContent(p: {
  item: DiscoveryItem;
  regions: Region[];
}) {
  const item = p.item;
  if (item.kind === "request") {
    const r = item.request;
    const region =
      p.regions.find((x) => x.id === r.region_id)?.label ?? "配送区域待确认";
    const pickup =
      p.regions.find((x) => x.id === r.pickup_region_id)?.label ?? "联系确认";
    const delivery = !["vehicle_help", "other_help"].includes(r.kind);
    return (
      <View style={s.body}>
        <View style={s.row}>
          <Text style={[typeStyles.metadata, s.tag]}>{requestTitle(r)}</Text>
          <Text style={[typeStyles.metadata, s.shrink]}>
            {requestTime(r.starts_at)}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={[typeStyles.title, s.shrink]}>{region}</Text>
          {delivery ? <Text style={s.price}>{requestPrice(r)}</Text> : null}
        </View>
        {delivery ? (
          <Text style={typeStyles.body}>
            {requestQuantity(r)}
            {r.drivers_needed !== null
              ? ` · 需 ${r.remaining_drivers ?? r.drivers_needed} 人`
              : ""}
            {r.accepts_partial && r.minimum_parcels
              ? ` · 最低 ${r.minimum_parcels} 件`
              : ""}
          </Text>
        ) : (
          <Text style={typeStyles.body}>{r.description ?? "查看求助详情"}</Text>
        )}
        {delivery ? (
          <Text style={typeStyles.secondary}>取件 {pickup}</Text>
        ) : null}
        <Text style={typeStyles.secondary}>
          {[r.carrier, r.publisher.display_name].filter(Boolean).join(" · ")}
        </Text>
      </View>
    );
  }
  const d = item.driver,
    av = d.availability;
  return (
    <View style={s.body}>
      <View style={s.row}>
        <View style={s.avatar}>
          <Text style={s.initial}>{d.profile.display_name.slice(0, 1)}</Text>
        </View>
        <View style={s.shrink}>
          <Text style={typeStyles.title}>{d.profile.display_name}</Text>
          <Text style={typeStyles.secondary}>
            {av
              ? `${Date.parse(av.starts_at) > Date.now() ? "稍后可接 · " : ""}${requestTime(av.starts_at)} – ${requestTime(av.ends_at)}`
              : "时段待确认"}
          </Text>
        </View>
      </View>
      <Text style={typeStyles.body}>
        {d.regions.map((r) => r.label).join(" / ")}
      </Text>
      <Text style={typeStyles.secondary}>
        {av?.capacity_parcels
          ? `最多 ${av.capacity_parcels} 件`
          : "件数联系确认"}
      </Text>
      <Text style={typeStyles.secondary}>
        {d.profile.experience.length
          ? `${[...new Set(d.profile.experience.map((e) => e.carrier))].join(" / ")} · 自报经验`
          : "暂未填写配送经验"}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 5 },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  shrink: { flex: 1, flexShrink: 1 },
  price: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: tokens.color.brandPrimary,
    flexShrink: 1,
  },
  tag: { color: tokens.color.textSecondary },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.brandSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontSize: 18,
    fontWeight: "600",
    color: tokens.color.brandPrimary,
  },
});
