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
    start: "",
    asap: scenario === "delivery_handoff",
    pickupEnd: "",
    completion: "contact",
    deliveryEnd: "",
    quantityMode: scenario === "warehouse_shortage" ? "estimate" : "exact",
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
  if (key === "date" && value !== f.date) {
    next.start = "";
    if (value !== localDateTime(null, now).date) next.asap = false;
    if (f.endDate === f.date) next.endDate = String(value);
  }
  if (key === "pickupKind" && value !== f.pickupKind) {
    next.pickupRegion = "";
    next.warehouse = emptyWarehouse();
  }
  if (key === "unit" && value !== f.unit) next.amount = "";
  if (key === "warehouse") {
    const w = value as WarehouseFields;
    if (
      (["line", "city", "state", "postal"] as const).some(
        (part) => w[part] !== f.warehouse[part],
      )
    ) {
      next.pickupRegion = "";
      next.warehouse = { ...w, confirmed: false };
    }
  }
  if (key === "quantityMode" && value === "unknown") {
    next.quantity = "";
    next.minimum = "";
  }
  if (key === "scope" && value === "whole_route") next.minimum = "";
  if (key === "completion" && value !== f.completion) next.deliveryEnd = "";
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
  const date = r.handoff_date ?? localDateTime(r.starts_at, now).date;
  const automaticExpiry = r.pickup_deadline_at ?? laDayEnd(date);
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
      date: copy ? f.date : date,
      start: copy || !r.starts_at ? f.start : start.time,
      asap: copy ? f.asap : r.handoff_mode ? r.handoff_mode === "asap" : f.asap,
      pickupEnd: copy
        ? ""
        : r.pickup_deadline_at
          ? localDateTime(r.pickup_deadline_at).time
          : "",
      deliveryEnd:
        !copy &&
        r.delivery_deadline_at &&
        Date.parse(r.delivery_deadline_at) !==
          Date.parse(
            laDayEnd(r.completion_mode === "next_day" ? dayAfter(date) : date),
          )
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
      customExpiry:
        !copy &&
        !!r.expires_at &&
        Date.parse(r.expires_at) !== Date.parse(automaticExpiry),
      endDate: copy || !r.expires_at ? (copy ? f.endDate : date) : end.date,
      end: copy || !r.expires_at ? f.end : end.time,
    },
  };
}
export type DeliveryAnchor =
  | keyof DeliveryFields
  | "identity"
  | "places"
  | "schedule"
  | "load"
  | "conditions"
  | "extra"
  | "warehouseLine"
  | "warehouseCity"
  | "warehouseState"
  | "warehousePostal"
  | "warehouseConfirm";

export class DeliveryFieldError extends Error {
  constructor(
    public readonly field: DeliveryAnchor,
    message: string,
  ) {
    super(message);
  }
}
export function warehouseAddressIssue(w: WarehouseFields) {
  if (!/^\d\S*\s+.+$/.test(w.line.trim()))
    return new DeliveryFieldError("warehouseLine", "请填写门牌与街道");
  if (!w.city.trim())
    return new DeliveryFieldError("warehouseCity", "请填写城市");
  if (!/^[A-Z]{2}$/.test(w.state))
    return new DeliveryFieldError("warehouseState", "请输入两字母州名，如 CA");
  if (w.postal && !/^\d{5}(?:-\d{4})?$/.test(w.postal))
    return new DeliveryFieldError("warehousePostal", "请核对邮编");
  return null;
}
function invalid(field: DeliveryAnchor, message: string): never {
  throw new DeliveryFieldError(field, message);
}
export function laDayEnd(date: string) {
  return new Date(
    Date.parse(laInstant(dayAfter(date), "00:00")) - 1,
  ).toISOString();
}
type Draft = S["RequestDraftInputV2"];
export function effectiveDeliveryTimes(input: {
  handoff_date?: string | null;
  pickup_deadline_at?: string | null;
  delivery_deadline_at?: string | null;
  expires_at?: string | null;
  completion_mode?: Draft["completion_mode"] | null;
}) {
  const date = input.handoff_date;
  return {
    expiry:
      input.expires_at ??
      input.pickup_deadline_at ??
      (date ? laDayEnd(date) : null),
    completion:
      !input.completion_mode || input.completion_mode === "contact"
        ? null
        : (input.delivery_deadline_at ??
          (date
            ? laDayEnd(
                input.completion_mode === "next_day" ? dayAfter(date) : date,
              )
            : null)),
  };
}
function dateTime(
  field: DeliveryAnchor,
  date: string,
  time: string,
  original?: string | null,
) {
  try {
    if (original) {
      const local = localDateTime(original);
      if (date === local.date && time === local.time) return original;
    }
    return laInstant(date, time);
  } catch (e) {
    return invalid(field, e instanceof Error ? e.message : "请检查日期或时间");
  }
}
function positive(
  value: string,
  field: DeliveryAnchor,
  label: string,
  required: boolean,
) {
  if (!value.trim() && !required) return null;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647)
    return invalid(field, `请填写${label}的正整数`);
  return Number(value);
}
export function deliveryInput(
  scenario: Scenario,
  f: DeliveryFields,
  publish: boolean,
  original?: DeliveryRequest | null,
  now = Date.now(),
): Draft {
  const today = localDateTime(null, now).date;
  const old =
    original &&
    "request_schema_version" in original &&
    original.status !== "draft"
      ? original
      : null;
  const unchangedDay = old?.handoff_date === f.date;
  const unchangedAsap = unchangedDay && old?.handoff_mode === "asap";
  const w = f.warehouse;
  if (publish) {
    if (f.pickupKind === "warehouse") {
      const issue = warehouseAddressIssue(w);
      if (issue) throw issue;
      if (!w.confirmed)
        invalid("warehouseConfirm", "请确认这是本次仓库取件地址");
    }
    if (!f.pickupRegion)
      invalid(
        "pickupRegion",
        f.pickupKind === "warehouse" ? "请选择取件区域" : "请选择交接地区",
      );
    if (!f.region) invalid("region", "请选择派送区域");
    if (!f.carrier.trim()) invalid("carrier", "请选择快递公司");
    if (f.carrier === "其他") invalid("carrier", "请填写快递公司名称");
    if (f.date < today && !unchangedDay)
      invalid("date", "请选择今天或之后的接手日期");
  }
  if (f.asap && f.date !== today && !unchangedAsap)
    invalid("date", "尽快到场仅适用于今天，请重新选择日期和时间");
  if (publish && !f.asap && !f.start)
    invalid(
      "start",
      scenario === "warehouse_shortage"
        ? "请选择希望到场时间"
        : "请选择希望接手时间",
    );
  const start =
    f.asap || !f.start
      ? null
      : dateTime(
          "start",
          f.date,
          f.start,
          old?.handoff_mode === "scheduled" ? old.starts_at : null,
        );
  if (publish && start && Date.parse(start) < now && start !== old?.starts_at)
    invalid("start", "请选择尚未过去的到场时间");
  const arrival = f.asap
    ? unchangedAsap && old?.starts_at
      ? Date.parse(old.starts_at)
      : now
    : Date.parse(start ?? "");
  const drivers =
    scenario === "warehouse_shortage"
      ? positive(f.drivers, "drivers", "司机人数", publish)
      : null;
  if (publish && f.scope === "whole_route" && f.quantityMode !== "exact")
    invalid("quantityMode", "整批接手须先确认整批件数");
  const qty =
    f.quantityMode === "unknown"
      ? null
      : positive(f.quantity, "quantity", "包裹数量", publish);
  let price: number | null = null;
  if (f.unit !== "negotiable") {
    if (publish && !f.amount.trim())
      invalid("amount", "请填写报价，或选择联系议价");
    if (f.amount.trim()) {
      try {
        price = centsInput(f.amount);
      } catch (e) {
        invalid("amount", e instanceof Error ? e.message : "请检查报价");
      }
      if (price === 0 && !(old?.price_cents === 0 && old.price_unit === f.unit))
        invalid("amount", "请输入大于零的报价");
    }
  }
  const deliveryEnd =
    f.completion !== "contact" && f.deliveryEnd
      ? dateTime(
          "deliveryEnd",
          f.completion === "next_day" ? dayAfter(f.date) : f.date,
          f.deliveryEnd,
          old?.delivery_deadline_at,
        )
      : null;
  if (publish && deliveryEnd && Date.parse(deliveryEnd) < arrival)
    invalid("deliveryEnd", "送完时间不能早于到场时间");
  const pickupEnd = f.pickupEnd
    ? dateTime("pickupEnd", f.date, f.pickupEnd, old?.pickup_deadline_at)
    : null;
  if (publish && pickupEnd && Date.parse(pickupEnd) < arrival)
    invalid("pickupEnd", "最迟接手不能早于到场时间");
  const minimum =
    f.scope === "partial" && f.quantityMode !== "unknown"
      ? positive(f.minimum, "minimum", "最低件数", false)
      : null;
  if (
    qty !== null &&
    f.quantityMode === "exact" &&
    minimum !== null &&
    minimum > qty
  )
    invalid("minimum", "最低件数不能超过确定数量");
  if (publish && f.customExpiry && !f.endDate)
    invalid("endDate", "请选择下架日期");
  if (publish && f.customExpiry && !f.end) invalid("end", "请选择下架时间");
  const expiry =
    f.customExpiry && f.endDate && f.end
      ? dateTime("end", f.endDate, f.end, old?.expires_at)
      : null;
  if (publish) {
    const expires = Date.parse(expiry ?? pickupEnd ?? laDayEnd(f.date));
    const expiryField = f.customExpiry
      ? "end"
      : pickupEnd
        ? "pickupEnd"
        : "date";
    if (expires <= now) invalid(expiryField, "请选择尚未过去的下架时间");
    if (expiry && expires <= arrival) invalid("end", "下架时间需晚于到场时间");
    if (expiry && pickupEnd && expires > Date.parse(pickupEnd))
      invalid("end", "下架时间不能晚于最迟接手时间");
  }
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
    price_cents: price,
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
