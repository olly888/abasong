import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import {
  distanceHint,
  type NearbyCardCandidate,
} from "./distance-presentation";
import type { DiscoveryObservation } from "./nearby-policy";
export function ApartmentMeta(p: {
  city: string;
  candidate?: NearbyCardCandidate;
  observation?: DiscoveryObservation | null;
}) {
  const [now, setNow] = useState(Date.now);
  // Even a manually locked card must stop displaying an expired distance.
  useEffect(() => {
    if (!p.candidate?.distance_reference) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [p.candidate?.distance_reference]);
  const label = distanceHint(
    p.candidate,
    p.observation ?? null,
    Math.max(now, Date.now()),
  );
  return (
    <View style={s.row}>
      <Text style={s.city} numberOfLines={1}>
        {p.city}
      </Text>
      {label ? (
        <Text style={s.distance} accessibilityLabel={`位置参考，${label}`}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 18 },
  city: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.color.textSecondary,
  },
  distance: { fontSize: 12, lineHeight: 18, color: tokens.color.textSecondary },
});
