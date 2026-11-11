import { Text, View } from "react-native";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  completionLabels,
  deliveryArrival,
  experienceLabels,
  isV2,
  requestHandoffRequirement,
  requestPickupRegion,
  requestTime,
  requestTitle,
  scopeLabels,
  sortedLabels,
  statusLabels,
  type DeliveryRequest,
} from "./presentation";
import { DeliveryFact, DeliveryOverview } from "./DeliveryOverview";
import { effectiveDeliveryTimes } from "./delivery-fields";
import { requestStyles as s } from "./RequestUi";
import { RelatedTeam } from "../teams/RelatedTeam";
import { WarehousePickup } from "./WarehousePickup";
import { DeliverySection as Section } from "./DeliverySection";

export function DeliveryDetailBody({
  request: r,
  regions,
  transport,
}: {
  request: DeliveryRequest;
  regions: Record<string, string>;
  transport: ContributionRequest;
}) {
  const delivery = r.kind !== "vehicle_help" && r.kind !== "other_help";
  const v2 = isV2(r);
  const region = regions[r.region_id ?? ""];
  const pickupArea = requestPickupRegion(r, regions);
  const warehouse =
    "pickup" in r && r.pickup?.kind === "warehouse" ? r.pickup : null;
  const handoff = v2 && r.pickup_kind === "contact_handoff";
  const times =
    v2 && r.status === "draft"
      ? effectiveDeliveryTimes(r)
      : { expiry: r.expires_at, completion: r.delivery_deadline_at };
  const sorting = r.sorted_state;
  const publisher = r.organization?.name ?? r.publisher.display_name;
  return (
    <View style={{ gap: 20 }}>
      <Text style={s.status}>{statusLabels[r.status]}</Text>
      {delivery ? (
        <>
          <DeliveryOverview request={r} regionLabel={region} />
          <Section title={handoff ? "交接与派送" : "取件与派送"}>
            {warehouse ? (
              <WarehousePickup pickup={warehouse} request={transport} />
            ) : null}
            <DeliveryFact
              label={handoff ? "交接地区" : "取件区域"}
              value={pickupArea}
            />
            {handoff ? (
              <Text style={s.secondary}>具体交接地点联系确认</Text>
            ) : null}
            <DeliveryFact label="派送区域" value={region ?? "待确认"} />
            <DeliveryFact label="快递公司" value={r.carrier} />
            <DeliveryFact label="线路编号" value={r.route_label} />
          </Section>
          <Section title="接手要求">
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
            <DeliveryFact
              label="账号与交接"
              value={requestHandoffRequirement(r)}
            />
            {v2 ? (
              <DeliveryFact
                label="送完要求"
                value={completionLabels[r.completion_mode ?? "contact"]}
              />
            ) : null}
            <DeliveryFact
              label="理货状态"
              value={
                sorting && Object.hasOwn(sortedLabels, sorting)
                  ? sortedLabels[sorting as keyof typeof sortedLabels]
                  : null
              }
            />
            <DeliveryFact
              label="配送经验"
              value={experienceLabels[r.experience_requirement]}
            />
          </Section>
        </>
      ) : (
        <Section title={requestTitle(r)}>
          <DeliveryFact label="区域" value={region ?? "待确认"} />
          <DeliveryFact label="到场时间" value={deliveryArrival(r)} />
        </Section>
      )}
      {r.pickup_deadline_at || times.completion || times.expiry ? (
        <Section title="截止时间 · 洛杉矶">
          <DeliveryFact
            label="最迟接手"
            value={r.pickup_deadline_at && requestTime(r.pickup_deadline_at)}
          />
          <DeliveryFact
            label="最晚送完"
            value={times.completion && requestTime(times.completion)}
          />
          <DeliveryFact
            label="需求下架"
            value={times.expiry && requestTime(times.expiry)}
          />
        </Section>
      ) : null}
      {r.description || (delivery && r.private_payment_terms) ? (
        <Section title="补充条件">
          {delivery && r.private_payment_terms ? (
            <>
              <Text style={s.secondary}>私下付款约定</Text>
              <Text style={s.text}>{r.private_payment_terms}</Text>
            </>
          ) : null}
          {r.description ? <Text style={s.text}>{r.description}</Text> : null}
        </Section>
      ) : null}
      <Section title="发布身份">
        <Text style={s.text}>{publisher}</Text>
        {r.organization && r.status !== "draft" ? (
          <RelatedTeam
            key={r.id}
            path={`/v1/requests/${r.id}/team`}
            request={transport}
          />
        ) : null}
      </Section>
    </View>
  );
}
