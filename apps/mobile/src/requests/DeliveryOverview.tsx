import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { tokens } from "@abasong/ui";
import { typeStyles } from "../ui/foundation";
import {
  deliveryArrival,
  requestDriverNeed,
  requestPrice,
  requestQuantity,
  requestTitle,
  type DeliveryRequest,
} from "./presentation";
import { requestStyles as s } from "./RequestUi";

export function DeliveryFact({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string | null | undefined;
  valueStyle?: TextStyle;
}) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[s.secondary, styles.label]}>{label}</Text>
      <Text style={[s.text, styles.value, valueStyle]}>{value}</Text>
    </View>
  );
}

export function DeliveryOverview({
  request,
  regionLabel,
  compact = false,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  compact?: boolean;
}) {
  return (
    <DeliverySummaryBlock
      title={requestTitle(request)}
      region={regionLabel || "派送区域待确认"}
      price={requestPrice(request)}
      quantity={requestQuantity(request)}
      drivers={requestDriverNeed(request)}
      arrival={deliveryArrival(request)}
      compact={compact}
    />
  );
}

export function DeliverySummaryBlock({
  title,
  region,
  price,
  quantity,
  drivers,
  arrival,
  compact = false,
}: {
  title: string;
  region: string;
  price: string;
  quantity: string;
  drivers?: { label: string; value: string } | null;
  arrival?: string;
  compact?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.2;
  return (
    <View style={styles.card}>
      <Text style={typeStyles.secondary}>{title}</Text>
      <Text
        accessibilityRole="header"
        style={compact ? s.headline : styles.title}
      >
        {region}
      </Text>
      <View style={[styles.highlight, stacked && styles.stacked]}>
        <Text
          accessibilityLabel={`报价，${price}`}
          style={[styles.price, compact && styles.compactPrice]}
        >
          {price}
        </Text>
        <View style={[styles.workload, stacked && styles.workloadStacked]}>
          <Text style={[styles.quantity, !stacked && styles.alignEnd]}>
            {quantity}
          </Text>
          {drivers ? (
            <Text style={[typeStyles.secondary, !stacked && styles.alignEnd]}>
              {drivers.label} {drivers.value}
            </Text>
          ) : null}
        </View>
      </View>
      {arrival ? <DeliveryFact label="到场时间" value={arrival} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  highlight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tokens.color.brandSurface,
  },
  stacked: { flexDirection: "column", alignItems: "flex-start" },
  price: {
    color: tokens.color.brandText,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "700",
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  compactPrice: { fontSize: 22, lineHeight: 30 },
  workload: { gap: 2, flexShrink: 1, maxWidth: "48%" },
  workloadStacked: { maxWidth: "100%" },
  quantity: {
    ...typeStyles.body,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  alignEnd: { textAlign: "right" },
  title: {
    color: tokens.color.ink,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "700",
  },
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  label: { flexShrink: 1, width: "30%" },
  value: { flex: 1, textAlign: "left", fontVariant: ["tabular-nums"] },
});
