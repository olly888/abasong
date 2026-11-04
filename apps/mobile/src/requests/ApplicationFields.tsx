import { Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Field } from "../auth/AuthControls";
import { NativeDateField } from "../ui/NativeDateField";
import { kindLabels, requestPrice, type DeliveryRequest } from "./presentation";

export function ApplicationFields({
  request: r,
  regionLabel,
  date,
  time,
  capacity,
  disabled = false,
  onDate,
  onTime,
  onCapacity,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  date: string;
  time: string;
  capacity: string;
  disabled?: boolean;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onCapacity: (v: string) => void;
}) {
  const delivery = !["vehicle_help", "other_help"].includes(r.kind);
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          gap: 8,
          backgroundColor: tokens.color.surfaceMuted,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <Text
          style={{ fontSize: 17, fontWeight: "600", color: tokens.color.ink }}
        >
          {regionLabel || kindLabels[r.kind]}
        </Text>
        {delivery ? (
          <>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                color: tokens.color.textSecondary,
              }}
            >
              {[r.carrier, r.route_label].filter(Boolean).join(" · ")}
            </Text>
            <Text
              style={{
                fontSize: 24,
                lineHeight: 32,
                fontWeight: "700",
                color: tokens.color.ink,
              }}
            >
              {requestPrice(r)}
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                color: tokens.color.textSecondary,
              }}
            >
              剩余 {r.remaining_parcels} 件
              {r.minimum_parcels ? ` · 最低 ${r.minimum_parcels} 件` : ""}
            </Text>
          </>
        ) : null}
      </View>
      <NativeDateField
        label="可到日期"
        mode="date"
        value={date}
        disabled={disabled}
        onChange={onDate}
      />
      <NativeDateField
        label={delivery ? "预计到达取件时间" : "预计可到时间"}
        mode="time"
        date={date}
        value={time}
        disabled={disabled}
        onChange={onTime}
      />
      {delivery ? (
        <Field
          label={r.accepts_partial ? "本次可接件数" : "整批件数"}
          value={capacity}
          onChangeText={onCapacity}
          keyboardType="number-pad"
          editable={!disabled && r.accepts_partial}
        />
      ) : null}
    </View>
  );
}
