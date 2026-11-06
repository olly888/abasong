import type { components } from "@abasong/contracts";
import {
  centsInput,
  laInstant,
  localDateTime,
  type DeliveryRequest,
} from "./presentation";
type S = components["schemas"];
export type Scenario = S["RequestDraftInputV2"]["scenario"];
export type WarehouseFields = {
  line: string;
  city: string;
  state: string;
  postal: string;
  name: string;
  source: "publisher_entered" | "mapbox_suggestion";
  confirmed: boolean;
};
export type DeliveryFields = {
  region: string;
  pickupRegion: string;
  carrier: string;
  route: string;
  pickupKind: "warehouse" | "contact_handoff";
  warehouse: WarehouseFields;
  date: string;
  start: string;
  asap: boolean;
  pickupEnd: string;
  completion: "same_day" | "next_day" | "contact";
  deliveryEnd: string;
  quantityMode: "exact" | "estimate" | "unknown";
  quantity: string;
  drivers: string;
  scope: "partial" | "whole_route";
  minimum: string;
  amount: string;
  unit: "per_parcel" | "per_route" | "negotiable";
  handoff: "carrier_account" | "dsp_approval" | "contact_confirm";
  sorted: "sorted" | "unsorted" | "unknown";
  experience: "any" | "delivery_experience" | "carrier_experience";
  terms: string;
  description: string;
  customExpiry: boolean;
  endDate: string;
  end: string;
};
export const emptyWarehouse = (): WarehouseFields => ({
  line: "",
  city: "",
  state: "CA",
  postal: "",
  name: "",
  source: "publisher_entered",
  confirmed: false,
});
export function defaultDeliveryFields(
  scenario: Scenario,
  now = Date.now(),
): DeliveryFields {
  const current = localDateTime(null, now);
  return {
    region: "",
    pickupRegion: "",
    carrier: "",
    route: "",
    pickupKind:
      scenario === "warehouse_shortage" ? "warehouse" : "contact_handoff",
    warehouse: emptyWarehouse(),
    date: current.date,
    start: current.time,
    asap: true,
    pickupEnd: "",
    completion: "contact",
    deliveryEnd: "",
    quantityMode: "estimate",
    quantity: "",
    drivers: scenario === "warehouse_shortage" ? "1" : "",
    scope: "partial",
    minimum: "",
    amount: "",
    unit: "per_parcel",
    handoff: "contact_confirm",
    sorted: "unknown",
    experience: "any",
    terms: "",
    description: "",
    customExpiry: false,
    endDate: current.date,
    end: "23:59",
  };
}
export function changeDeliveryField<K extends keyof DeliveryFields>(
  f: DeliveryFields,
  key: K,
  value: DeliveryFields[K],
  now = Date.now(),
): DeliveryFields {
  const next = { ...f, [key]: value };
  if (key === "date") {
    if (value !== localDateTime(null, now).date) next.asap = false;
    if (f.endDate === f.date) next.endDate = String(value);
  }
  if (key === "pickupKind" && value !== f.pickupKind) {
    next.pickupRegion = "";
    next.warehouse = emptyWarehouse();
  }
  if (key === "quantityMode" && value === "unknown") {
    next.quantity = "";
    next.minimum = "";
  }
  if (key === "scope" && value === "whole_route") next.minimum = "";
  if (key === "completion") next.deliveryEnd = "";
  return next;
}
export function dayAfter(date: string, count = 1) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function hydrateDelivery(
  r: DeliveryRequest,
  copy = false,
  now = Date.now(),
): { scenario: Scenario; fields: DeliveryFields } {
  if (!("request_schema_version" in r) || r.request_schema_version !== 2)
    throw new Error("这条历史需求请重新发布为两场景需求");
  const scenario = r.scenario;
  const f = defaultDeliveryFields(scenario, now);
  const start = localDateTime(r.starts_at, now),
    end = localDateTime(r.expires_at, now);
  const p = r.pickup;
  return {
    scenario,
    fields: {
      ...f,
      region: r.region_id ?? "",
      pickupRegion: r.pickup_region_id ?? "",
      carrier: r.carrier ?? "",
      route: r.route_label ?? "",
      pickupKind: p?.kind ?? f.pickupKind,
      warehouse:
        p?.kind === "warehouse"
          ? {
              line: p.address_line1 ?? "",
              city: p.city ?? "",
              state: p.state ?? "CA",
              postal: p.postal_code ?? "",
              name: p.name ?? "",
              source:
                p.address_source === "provider_permanent"
                  ? "mapbox_suggestion"
                  : "publisher_entered",
              confirmed:
                p.address_source !== "legacy_unclassified" &&
                p.address_confirmed,
            }
          : emptyWarehouse(),
      date: copy ? f.date : (r.handoff_date ?? start.date),
      start: copy ? f.start : start.time,
      asap: copy || r.handoff_mode === "asap",
      pickupEnd: copy
        ? ""
        : r.pickup_deadline_at
          ? localDateTime(r.pickup_deadline_at).time
          : "",
      deliveryEnd: copy
        ? ""
        : r.delivery_deadline_at
          ? localDateTime(r.delivery_deadline_at).time
          : "",
      completion: r.completion_mode ?? "contact",
      quantityMode: r.quantity_mode ?? "unknown",
      quantity: String(r.parcel_count ?? ""),
      drivers: String(r.drivers_needed ?? ""),
      scope: r.task_scope ?? "partial",
      minimum: String(r.minimum_parcels ?? ""),
      amount: r.price_cents !== null ? String(r.price_cents / 100) : "",
      unit: r.price_unit ?? "per_parcel",
      handoff:
        (r.handoff_requirement as DeliveryFields["handoff"]) ??
        "contact_confirm",
      sorted: (r.sorted_state as DeliveryFields["sorted"]) ?? "unknown",
      experience: r.experience_requirement,
      terms: r.private_payment_terms ?? "",
      description: r.description ?? "",
      customExpiry: !copy && !!r.expires_at,
      endDate: copy ? f.endDate : end.date,
      end: copy ? f.end : end.time,
    },
  };
}
function positive(value: string, label: string, required: boolean) {
  if (!value.trim() && !required) return null;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647)
    throw new Error(`请填写${label}的正整数`);
  return Number(value);
}
export function deliveryInput(
  scenario: Scenario,
  f: DeliveryFields,
  publish: boolean,
  original?: DeliveryRequest | null,
  now = Date.now(),
): S["RequestDraftInputV2"] {
  const today = localDateTime(null, now).date;
  const unchangedDay =
    !!original &&
    original.status !== "draft" &&
    "handoff_date" in original &&
    original.handoff_date === f.date;
  const unchangedAsap =
    unchangedDay &&
    "handoff_mode" in original! &&
    original.handoff_mode === "asap";
  if (f.asap && f.date !== today && !unchangedAsap)
    throw new Error("尽快接手仅适用于今天，请重新选择日期和时间");
  if (
    publish &&
    (!f.region || !f.carrier.trim() || f.carrier === "其他" || !f.pickupRegion)
  )
    throw new Error("请选择派送区域、快递公司和取件区域");
  if (publish && f.date < today && !unchangedDay)
    throw new Error("请选择今天或之后的接手日期");
  const starts = f.asap ? null : laInstant(f.date, f.start);
  // An unchanged published ASAP start must not be reset by editing its text.
  const oldAsap =
    original &&
    original.status !== "draft" &&
    "handoff_mode" in original &&
    original.handoff_mode === "asap" &&
    original.handoff_date === f.date;
  const start = starts;
  const effectiveStart = oldAsap && f.asap ? original.starts_at : starts;
  const qty =
    f.quantityMode === "unknown"
      ? null
      : positive(f.quantity, "包裹数量", publish);
  const drivers = positive(
    f.drivers,
    "司机人数",
    publish && scenario === "warehouse_shortage",
  );
  const minimum =
    f.scope === "partial" && f.quantityMode !== "unknown"
      ? positive(f.minimum, "最低件数", false)
      : null;
  if (publish && f.scope === "whole_route" && f.quantityMode !== "exact")
    throw new Error("整批接手须先确认整批件数");
  if (
    qty !== null &&
    f.quantityMode === "exact" &&
    minimum !== null &&
    minimum > qty
  )
    throw new Error("最低件数不能超过确定数量");
  if (publish && f.unit !== "negotiable" && !f.amount.trim())
    throw new Error("请填写报价，或选择联系议价");
  const w = f.warehouse;
  if (
    publish &&
    f.pickupKind === "warehouse" &&
    (!w.line.trim() ||
      !w.city.trim() ||
      !/^[A-Z]{2}$/.test(w.state) ||
      (!!w.postal && !/^\d{5}(?:-\d{4})?$/.test(w.postal)) ||
      !w.confirmed)
  )
    throw new Error("请补全仓库地址并确认取件地址");
  const pickupEnd = f.pickupEnd ? laInstant(f.date, f.pickupEnd) : null;
  const expiry = f.customExpiry ? laInstant(f.endDate, f.end) : null;
  if (
    publish &&
    pickupEnd &&
    Date.parse(pickupEnd) <=
      Math.max(now, Date.parse(effectiveStart ?? "") || 0)
  )
    throw new Error("最晚取件须晚于到场时间");
  if (
    publish &&
    expiry &&
    Date.parse(expiry) <= Math.max(now, Date.parse(effectiveStart ?? "") || 0)
  )
    throw new Error("需求有效时间须晚于到场时间");
  const deliveryEnd =
    f.completion !== "contact" && f.deliveryEnd
      ? laInstant(
          f.completion === "next_day" ? dayAfter(f.date) : f.date,
          f.deliveryEnd,
        )
      : null;
  return {
    request_schema_version: 2,
    scenario,
    task_scope: f.scope,
    quantity_mode: f.quantityMode,
    handoff_mode: f.asap ? "asap" : "scheduled",
    handoff_date: f.date,
    completion_mode: f.completion,
    timezone: "America/Los_Angeles",
    ...(f.region ? { region_id: f.region } : {}),
    ...(f.pickupRegion ? { pickup_region_id: f.pickupRegion } : {}),
    carrier: f.carrier.trim(),
    route_label: f.route.trim(),
    description: f.description.trim(),
    starts_at: start,
    pickup_deadline_at: pickupEnd,
    delivery_deadline_at: deliveryEnd,
    expires_at: expiry,
    parcel_count: qty,
    drivers_needed: drivers,
    minimum_parcels: minimum,
    price_unit: f.unit,
    price_cents:
      f.unit === "negotiable" || !f.amount.trim() ? null : centsInput(f.amount),
    sorted_state: f.sorted,
    handoff_requirement: f.handoff,
    experience_requirement: f.experience,
    private_payment_terms: f.terms.trim(),
    pickup:
      f.pickupKind === "contact_handoff"
        ? { kind: "contact_handoff" }
        : {
            kind: "warehouse",
            name: w.name.trim() || null,
            address_line1: w.line.trim() || null,
            city: w.city.trim() || null,
            state: w.state.trim() || null,
            postal_code: w.postal.trim() || null,
            address_confirmed: w.confirmed,
            address_source: w.source,
          },
  };
}
