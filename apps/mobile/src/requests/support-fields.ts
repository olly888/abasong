import { localDateTime } from "./presentation";
export type SupportFields = {
  region: string;
  pickup: string;
  carrier: string;
  route: string;
  date: string;
  start: string;
  end: string;
  endDate: string;
  pickupEnd: string;
  deliveryEnd: string;
  quantity: string;
  drivers: string;
  minimum: string;
  amount: string;
  unit: "per_parcel" | "per_route" | "negotiable";
  sorted: "sorted" | "unsorted" | "unknown";
  handoff: "carrier_account" | "dsp_approval" | "contact_confirm";
  experience: "any" | "delivery_experience" | "carrier_experience";
  partial: "yes" | "no";
  description: string;
  terms: string;
};
export function defaultSupportFields(at = Date.now()): SupportFields {
  const now = localDateTime(null, at),
    later = localDateTime(new Date(at + 2 * 3600000).toISOString());
  return {
    region: "",
    pickup: "",
    carrier: "",
    route: "",
    date: now.date,
    start: now.time,
    end: later.time,
    endDate: later.date,
    pickupEnd: "",
    deliveryEnd: "",
    quantity: "",
    drivers: "",
    minimum: "",
    amount: "",
    unit: "per_parcel",
    sorted: "unknown",
    handoff: "contact_confirm",
    experience: "any",
    partial: "yes",
    description: "",
    terms: "",
  };
}
export function changeSupportField<K extends keyof SupportFields>(
  form: SupportFields,
  key: K,
  value: SupportFields[K],
): SupportFields {
  return {
    ...form,
    [key]: value,
    ...(key === "date" && form.endDate === form.date
      ? { endDate: value as string }
      : {}),
    ...(key === "partial" && value === "no" ? { minimum: "" } : {}),
  };
}
