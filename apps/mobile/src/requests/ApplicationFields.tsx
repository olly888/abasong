import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { DeliverySection } from "./DeliverySection";
import { warehouseAddress } from "./warehouse";
import { Field, FormError } from "../auth/AuthControls";
import { NativeDateField } from "../ui/NativeDateField";
import { DeliveryFact, DeliveryOverview } from "./DeliveryOverview";
import {
  completionLabels,
  exactQuantity,
  isV2,
  requestHandoffRequirement,
  requestPickupRegion,
  requestTime,
  requestTitle,
  scopeLabels,
  type DeliveryRequest,
} from "./presentation";
import { requestStyles as s } from "./RequestUi";

export function ApplicationFields({
  request: r,
  regionLabel,
  pickupRegionLabel,
  date,
  time,
  capacity,
  arrivalError,
  capacityError,
  disabled = false,
  onDate,
  onTime,
  onCapacity,
  anchor = (_field, children) => children,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  pickupRegionLabel?: string;
  date: string;
  time: string;
  capacity: string;
  arrivalError?: string;
  capacityError?: string;
  disabled?: boolean;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onCapacity: (v: string) => void;
  anchor?: (field: "arrival" | "capacity", children: ReactNode) => ReactNode;
}) {
  const delivery = r.kind !== "vehicle_help" && r.kind !== "other_help";
  const handoff = isV2(r) && r.pickup_kind === "contact_handoff";
  const requirement = requestHandoffRequirement(r);
  const completion = isV2(r)
    ? completionLabels[r.completion_mode ?? "contact"]
    : null;
  const pickup =
    "pickup" in r && r.pickup?.kind === "warehouse" ? r.pickup : null;
  return (
    <View style={{ gap: 16 }}>
      {delivery ? (
        <>
          <DeliveryOverview request={r} regionLabel={regionLabel} compact />
          {pickup ? (
            <View style={{ gap: 4 }}>
              <Text style={s.secondary}>{pickup.name || "取件仓库"}</Text>
              <Text style={s.text}>{warehouseAddress(pickup)}</Text>
            </View>
          ) : (
            <DeliveryFact
              label="交接地区"
              value={`${pickupRegionLabel ?? requestPickupRegion(r, {})} · 具体地点联系确认`}
            />
          )}
        </>
      ) : (
        <Text style={s.label}>{regionLabel || requestTitle(r)}</Text>
      )}
      <DeliverySection title="本次可接活">
        {anchor(
          "arrival",
          <View style={{ gap: 10 }}>
            <NativeDateField
              label="可到日期"
              mode="date"
              value={date}
              disabled={disabled}
              onChange={onDate}
            />
            <NativeDateField
              label="预计到场时间"
              mode="time"
              date={date}
              value={time}
              disabled={disabled}
              onChange={onTime}
            />
            <FormError message={arrivalError ?? null} />
          </View>,
        )}
        {delivery
          ? anchor(
              "capacity",
              <Field
                label={
                  !exactQuantity(r)
                    ? "本次可接件数（选填）"
                    : r.accepts_partial
                      ? "本次可接件数"
                      : "整批件数"
                }
                value={capacity}
                onChangeText={onCapacity}
                keyboardType="number-pad"
                editable={!disabled && (r.accepts_partial || !exactQuantity(r))}
                error={capacityError}
              />,
            )
          : null}
      </DeliverySection>
      {delivery ? (
        <DeliverySection title="接手要求">
          <DeliveryFact
            label={handoff ? "交接地区" : "取件区域"}
            value={pickupRegionLabel ?? requestPickupRegion(r, {})}
          />
          <DeliveryFact
            label="快递公司 / 线路"
            value={[r.carrier, r.route_label].filter(Boolean).join(" · ")}
          />
          <DeliveryFact
            label="承接方式"
            value={scopeLabels[r.accepts_partial ? "partial" : "whole_route"]}
          />
          {r.accepts_partial && r.minimum_parcels ? (
            <DeliveryFact
              label="每人最低件数"
              value={`${r.minimum_parcels} 件`}
            />
          ) : null}
          <DeliveryFact label="账号与交接" value={requirement} />
          <DeliveryFact label="送完要求" value={completion} />
          <DeliveryFact
            label="最迟接手"
            value={r.pickup_deadline_at && requestTime(r.pickup_deadline_at)}
          />
        </DeliverySection>
      ) : null}
    </View>
  );
}
