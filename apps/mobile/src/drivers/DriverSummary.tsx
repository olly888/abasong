import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { typeStyles } from "../ui/foundation";
import { requestTime } from "../requests/presentation";
export function DriverSummary({
  driver: d,
  compact = false,
}: {
  driver: components["schemas"]["Driver"];
  compact?: boolean;
}) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const now = Date.now(),
      boundaries = [
        Date.parse(d.availability?.starts_at ?? ""),
        Date.parse(d.availability?.ends_at ?? ""),
      ].filter((t) => Number.isFinite(t) && t > now);
    if (!boundaries.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.min(...boundaries) - now + 25),
    );
    return () => clearTimeout(timer);
  }, [d.availability?.starts_at, d.availability?.ends_at, clock]);
  const av = d.availability,
    valid = av?.enabled && Date.parse(av.ends_at) > Date.now();
  if (compact && valid)
    return (
      <View style={{ gap: 8 }}>
        <Text style={typeStyles.title}>{d.profile.display_name}</Text>
        <Text style={typeStyles.secondary}>
          {Date.parse(av.starts_at) > Date.now() ? "稍后可接 · " : ""}
          {requestTime(av.starts_at)} – {requestTime(av.ends_at)}
        </Text>
        <Text style={typeStyles.body}>
          {d.regions.map((r) => r.label).join(" / ")} ·{" "}
          {av.capacity_parcels ? `${av.capacity_parcels}件` : "件数联系确认"}
        </Text>
        <Text style={typeStyles.secondary}>
          {d.profile.experience.length
            ? d.profile.experience.map((e) => e.carrier).join(" / ") +
              " · 自报经验"
            : "暂未填写配送经验"}
        </Text>
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      <Text style={typeStyles.title}>{d.profile.display_name}</Text>
      <Text style={typeStyles.body}>
        {valid
          ? Date.parse(av.starts_at) <= Date.now()
            ? "可接临时支援"
            : "稍后可接临时支援"
          : "暂未声明可接活时段"}
      </Text>
      {valid ? (
        <>
          <Text style={typeStyles.secondary}>
            {requestTime(av.starts_at)} – {requestTime(av.ends_at)}
          </Text>
          <Text style={typeStyles.secondary}>
            {d.regions.map((r) => r.label).join(" / ")}
          </Text>
          <Text style={typeStyles.body}>
            {av.capacity_parcels
              ? `可接 ${av.capacity_parcels} 件`
              : "可接件数联系确认"}
            {d.profile.vehicle_type ? ` · ${d.profile.vehicle_type}` : ""}
          </Text>
        </>
      ) : null}
    </View>
  );
}
