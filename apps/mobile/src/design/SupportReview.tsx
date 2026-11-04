import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import type { components } from "@abasong/contracts";
import { AuthPage, ActionButton } from "../auth/AuthControls";
import { ApplicationFields } from "../requests/ApplicationFields";
import { SupportFormFields } from "../requests/SupportForm";
import { RequestSheet } from "../requests/RequestUi";
import {
  defaultSupportFields,
  changeSupportField,
  type SupportFields,
} from "../requests/support-fields";
import { type DeliveryRequest } from "../requests/presentation";
type S = components["schemas"];
const region: S["Region"] = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "TEST · Pasadena",
  timezone: "America/Los_Angeles",
  display_point: { lng: -118.1445, lat: 34.1478 },
};
const request: DeliveryRequest = {
  id: region.id,
  publisher: {
    user_id: region.id,
    display_name: "TEST 阿杰",
    bio: null,
    vehicle_type: null,
    experience: [],
  },
  organization: null,
  kind: "partial_route",
  status: "open",
  version: 1,
  region_id: region.id,
  pickup_area: null,
  carrier: "SwiftX",
  route_label: "TEST-01",
  description: null,
  starts_at: null,
  expires_at: null,
  pickup_deadline_at: null,
  delivery_deadline_at: null,
  timezone: region.timezone,
  parcel_count: 150,
  drivers_needed: null,
  remaining_parcels: 150,
  remaining_drivers: null,
  price_cents: 180,
  price_unit: "per_parcel",
  currency: "USD",
  sorted_state: "sorted",
  handoff_requirement: "contact_confirm",
  private_payment_terms: null,
  stop_count: null,
  accepts_partial: true,
  minimum_parcels: 50,
  experience_requirement: "any",
  pickup_region_id: region.id,
};
// Reuses actual production form components. Never posts or grants capabilities.
export default function SupportReview() {
  const [form, setForm] = useState(() => ({
      ...defaultSupportFields(),
      region: region.id,
      pickup: region.id,
      carrier: "SwiftX",
    })),
    [applying, setApplying] = useState(false),
    [date, setDate] = useState(form.date),
    [time, setTime] = useState(form.start),
    [capacity, setCapacity] = useState(""),
    [notice, setNotice] = useState("");
  const update = <K extends keyof SupportFields>(k: K, v: SupportFields[K]) =>
    setForm((old) => changeSupportField(old, k, v));
  return (
    <View style={{ flex: 1 }}>
      <AuthPage
        compact
        title="部分包裹代跑"
        headerRight={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="预览报名面板"
            onPress={() => setApplying(true)}
            style={{ minHeight: 48, minWidth: 48, justifyContent: "center" }}
          >
            <Text style={{ color: tokens.color.brandPrimary }}>报名</Text>
          </Pressable>
        }
        footer={
          <View style={{ gap: 10 }}>
            <ActionButton
              label="核对并发布"
              onPress={() => setNotice("样板不发布")}
            />
            <ActionButton
              label="保存草稿"
              variant="text"
              onPress={() => setNotice("样板不保存")}
            />
          </View>
        }
      >
        <Text style={{ fontSize: 12, color: tokens.color.textSecondary }}>
          TEST · UI样板 · 不提交{notice ? ` · ${notice}` : ""}
        </Text>
        <SupportFormFields
          kind="partial_route"
          form={form}
          regions={[
            region,
            {
              ...region,
              id: "22222222-2222-4222-8222-222222222222",
              label: "TEST · Chino",
            },
          ]}
          onChange={update}
        />
      </AuthPage>
      {applying ? (
        <RequestSheet onRequestClose={() => setApplying(false)}>
          <Text
            style={{ fontSize: 22, fontWeight: "700", color: tokens.color.ink }}
          >
            报名支援
          </Text>
          <ApplicationFields
            request={request}
            regionLabel={region.label}
            date={date}
            time={time}
            capacity={capacity}
            onDate={setDate}
            onTime={setTime}
            onCapacity={setCapacity}
          />
          <ActionButton
            label="提交报名"
            onPress={() => setNotice("样板不报名")}
          />
          <ActionButton
            label="取消"
            variant="text"
            onPress={() => setApplying(false)}
          />
        </RequestSheet>
      ) : null}
    </View>
  );
}
