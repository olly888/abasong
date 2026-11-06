import { Text, View } from "react-native";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  requestPrice,
  requestTime,
  requestTitle,
  requestQuantity,
  statusLabels,
  isV2,
  type DeliveryRequest,
} from "./presentation";
import { requestStyles as s } from "./RequestUi";
import { WarehousePickup } from "./WarehousePickup";
export function DeliveryDetailBody({
  request: r,
  regions,
  transport,
}: {
  request: DeliveryRequest;
  regions: Record<string, string>;
  transport: ContributionRequest;
}) {
  const detail = (label: string, value: string | null | undefined) =>
    value ? (
      <View style={{ gap: 6 }} key={label}>
        <Text style={s.secondary}>{label}</Text>
        <Text style={s.text}>{value}</Text>
      </View>
    ) : null;
  const delivery = !["vehicle_help", "other_help"].includes(r.kind),
    v2 = isV2(r);
  return (
    <View style={{ gap: 24 }}>
      <View style={s.row}>
        <Text style={s.status}>{statusLabels[r.status]}</Text>
        <Text style={s.secondary}>
          {r.organization?.name ?? r.publisher.display_name}
        </Text>
      </View>
      <Text style={s.headline}>{requestTitle(r)}</Text>
      {detail("派送区域", regions[r.region_id ?? ""] ?? "未选择区域")}
      {delivery ? (
        <>
          {detail(
            "快递公司 / 线路",
            [r.carrier, r.route_label].filter(Boolean).join(" · "),
          )}
          <View style={s.row}>
            <Text style={[s.headline, { flexShrink: 1 }]}>
              {requestQuantity(r)}
            </Text>
            <Text style={[s.price, { flexShrink: 1 }]}>{requestPrice(r)}</Text>
          </View>
          {r.drivers_needed !== null
            ? detail(
                "需要司机",
                `${r.remaining_drivers ?? r.drivers_needed} 人`,
              )
            : null}
          {v2 && "pickup" in r && r.pickup?.kind === "warehouse" ? (
            <WarehousePickup pickup={r.pickup} request={transport} />
          ) : (
            <>
              {detail(
                "取件区域",
                r.pickup_area ??
                  regions[r.pickup_region_id ?? ""] ??
                  "联系确认",
              )}
              {v2 ? detail("途中交接", "具体交接位置联系后确认") : null}
            </>
          )}
          {detail(
            "承接方式",
            !r.accepts_partial
              ? "整批接手"
              : r.minimum_parcels
                ? `可以分担，每人至少 ${r.minimum_parcels} 件`
                : "可以分担",
          )}
        </>
      ) : null}
      {detail(
        "到场时间",
        v2 && r.handoff_mode === "asap"
          ? `${r.handoff_date ?? ""} · 尽快到场`
          : requestTime(r.starts_at),
      )}
      {detail(
        "最晚取件",
        r.pickup_deadline_at ? requestTime(r.pickup_deadline_at) : null,
      )}
      {v2
        ? detail(
            "送完要求",
            { same_day: "当天送完", next_day: "次日送完", contact: "联系确认" }[
              r.completion_mode ?? "contact"
            ],
          )
        : null}
      {detail(
        "最晚送完",
        r.delivery_deadline_at ? requestTime(r.delivery_deadline_at) : null,
      )}
      {delivery ? (
        <>
          {detail(
            "账号与转派",
            (
              {
                carrier_account: "需已有快递公司账号",
                dsp_approval: "需 DSP 确认转派",
                contact_confirm: "联系确认",
              } as Record<string, string>
            )[r.handoff_requirement ?? ""],
          )}
          {detail(
            "理货状态",
            (
              {
                sorted: "已理货",
                unsorted: "未理货",
                unknown: "联系确认",
              } as Record<string, string>
            )[r.sorted_state ?? ""],
          )}
          {detail(
            "配送经验",
            {
              any: "不限",
              delivery_experience: "有配送经验",
              carrier_experience: "熟悉该快递公司",
            }[r.experience_requirement],
          )}
          {detail("私下付款约定", r.private_payment_terms)}
        </>
      ) : null}
      {detail("说明", r.description)}
      {detail("需求有效至", r.expires_at ? requestTime(r.expires_at) : null)}
    </View>
  );
}
