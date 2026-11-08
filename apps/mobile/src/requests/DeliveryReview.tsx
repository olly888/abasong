import { Pressable, StyleSheet, Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import {
  completionLabels,
  experienceLabels,
  handoffLabels,
  scopeLabels,
  sortedLabels,
  deliveryQuantity,
  requestArrival,
  requestPrice,
  requestTime,
  scenarioLabels,
} from "./presentation";
import { effectiveDeliveryTimes, type DeliveryAnchor } from "./delivery-fields";
import { warehouseAddress } from "./warehouse";
import { DeliverySection } from "./DeliverySection";
import { DeliveryFact, DeliverySummaryBlock } from "./DeliveryOverview";
import { typeStyles } from "../ui/foundation";

type Draft = components["schemas"]["RequestDraftInputV2"];
type EditGroup = Extract<
  DeliveryAnchor,
  "identity" | "places" | "schedule" | "load" | "conditions" | "extra"
>;
export function DeliveryReview({
  input,
  identity,
  identityEditable,
  onEdit,
  regionLabel,
  disabled,
}: {
  input: Draft;
  identity: string;
  identityEditable: boolean;
  onEdit: (field: EditGroup) => void;
  regionLabel: (id: string) => string;
  disabled: boolean;
}) {
  const times = effectiveDeliveryTimes(input);
  const pickup = input.pickup;
  const warehouse = input.scenario === "warehouse_shortage";
  const row = (label: string, value: string) => (
    <DeliveryFact key={label} label={label} value={value} />
  );
  const group = (
    id: EditGroup,
    title: string,
    children: React.ReactNode,
    editable = true,
  ) => (
    <DeliverySection
      title={title}
      action={
        editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`修改${title}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onEdit(id)}
            style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
          >
            <Text style={styles.link}>修改</Text>
          </Pressable>
        ) : undefined
      }
    >
      {children}
    </DeliverySection>
  );
  const extra = [
    input.route_label ? row("线路编号", input.route_label) : null,
    input.experience_requirement && input.experience_requirement !== "any"
      ? row("配送经验", experienceLabels[input.experience_requirement])
      : null,
    input.sorted_state && input.sorted_state !== "unknown"
      ? row("理货状态", sortedLabels[input.sorted_state])
      : null,
    input.private_payment_terms
      ? row("私下付款约定", input.private_payment_terms)
      : null,
    input.description ? row("其他说明", input.description) : null,
  ];
  return (
    <View style={styles.container}>
      {group(
        "load",
        "任务量与报价",
        <>
          <DeliverySummaryBlock
            title={scenarioLabels[input.scenario]}
            region={regionLabel(input.region_id ?? "")}
            price={requestPrice({
              price_unit: input.price_unit ?? null,
              price_cents: input.price_cents ?? null,
            })}
            quantity={deliveryQuantity(
              input.quantity_mode ?? null,
              input.parcel_count ?? null,
            )}
            drivers={
              warehouse
                ? { label: "需要司机", value: `${input.drivers_needed} 人` }
                : null
            }
          />
          {!warehouse || input.task_scope === "whole_route"
            ? row("承接方式", scopeLabels[input.task_scope ?? "partial"])
            : null}
          {input.minimum_parcels
            ? row("每人最低件数", `${input.minimum_parcels} 件`)
            : null}
        </>,
      )}
      {group(
        "places",
        pickup?.kind === "warehouse" ? "取件与派送" : "交接与派送",
        <>
          {pickup?.kind === "warehouse" ? (
            <>
              <View style={styles.address}>
                <Text style={typeStyles.label}>
                  {pickup.name || "取件仓库"}
                </Text>
                <Text style={typeStyles.body}>{warehouseAddress(pickup)}</Text>
              </View>
              {row("取件区域", regionLabel(input.pickup_region_id ?? ""))}
            </>
          ) : (
            row(
              "交接地区",
              `${regionLabel(input.pickup_region_id ?? "")} · 具体地点联系确认`,
            )
          )}
          {row("派送区域", regionLabel(input.region_id ?? ""))}
          {row("快递公司", input.carrier ?? "")}
        </>,
      )}
      {group(
        "schedule",
        "到场与下架",
        <>
          {row("到场时间", requestArrival(input))}
          {input.pickup_deadline_at
            ? row("最迟接手", requestTime(input.pickup_deadline_at))
            : null}
          {row("需求下架", `${requestTime(times.expiry)} · 洛杉矶时间`)}
        </>,
      )}
      {group(
        "conditions",
        "接手要求",
        <>
          {row(
            "账号与交接",
            handoffLabels[input.handoff_requirement ?? "contact_confirm"],
          )}
          {row(
            "送完要求",
            `${completionLabels[input.completion_mode ?? "contact"]}${times.completion ? ` · ${requestTime(times.completion)}` : ""}`,
          )}
        </>,
      )}
      {extra.some(Boolean) ? group("extra", "补充条件", extra) : null}
      {group("identity", "发布身份", row("身份", identity), identityEditable)}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 20 },
  edit: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  pressed: { backgroundColor: tokens.color.brandSurface },
  link: { ...typeStyles.label, color: tokens.color.brandText },
  address: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
    backgroundColor: tokens.color.surfaceMuted,
  },
});
