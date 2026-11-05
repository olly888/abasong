import { Fragment, type ReactNode } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { AuthPage, AuthResolution, ActionButton } from "../auth/AuthControls";
import {
  kindLabels,
  statusLabels,
  requestPrice,
  requestTime,
  type DeliveryRequest,
} from "./presentation";
export { BottomSheet as RequestSheet } from "../ui/BottomSheet";
export function RequestGate({
  children,
  title = "临时配送支援",
}: {
  children: ReactNode;
  title?: string;
}) {
  const auth = useAuth();
  if (auth.phase === "ready" && auth.session)
    return <Fragment key={auth.session.user.id}>{children}</Fragment>;
  if (auth.phase === "guest" || auth.phase === "needs-profile")
    return (
      <AuthPage compact title={title}>
        <ActionButton
          label={auth.phase === "guest" ? "登录" : "完善资料"}
          onPress={() =>
            router.push(
              auth.phase === "guest" ? "/auth/phone" : "/auth/profile",
            )
          }
        />
      </AuthPage>
    );
  return <AuthResolution />;
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={requestStyles.label}>{label}</Text>
      <View style={requestStyles.choices}>
        {options.map(([v, name]) => (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === v, disabled }}
            disabled={disabled}
            onPress={() => onChange(v)}
            style={[
              requestStyles.choice,
              value === v && requestStyles.selected,
            ]}
          >
            <Text
              style={[
                requestStyles.choiceText,
                value === v && requestStyles.selectedText,
              ]}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function RequestCard({
  request: r,
  region,
  pickupRegion,
  onPress,
}: {
  request: DeliveryRequest;
  region?: string;
  pickupRegion?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={requestStyles.card}
    >
      <View style={requestStyles.row}>
        <Text style={requestStyles.label}>{kindLabels[r.kind]}</Text>
        <Text style={requestStyles.status}>{statusLabels[r.status]}</Text>
      </View>
      <Text style={requestStyles.headline}>
        {region ?? r.carrier ?? "配送求助"}
      </Text>
      <View style={requestStyles.row}>
        <Text style={requestStyles.text}>
          {r.parcel_count
            ? `剩余 ${r.remaining_parcels ?? r.parcel_count} 件`
            : r.description || ""}
          {r.drivers_needed
            ? ` · 需 ${r.remaining_drivers ?? r.drivers_needed} 人`
            : ""}
        </Text>
        <Text style={requestStyles.price}>
          {["vehicle_help", "other_help"].includes(r.kind)
            ? ""
            : requestPrice(r)}
        </Text>
      </View>
      {r.parcel_count ? (
        <Text style={requestStyles.secondary}>
          {pickupRegion ? `取件 ${pickupRegion} · ` : ""}
          {r.accepts_partial
            ? r.minimum_parcels
              ? `最低 ${r.minimum_parcels} 件`
              : "可拆分承接"
            : "整批承接"}
          {r.carrier ? ` · ${r.carrier}` : ""}
        </Text>
      ) : null}
      <Text style={requestStyles.secondary}>
        {requestTime(r.starts_at)} · {r.publisher.display_name}
      </Text>
    </Pressable>
  );
}
export const requestStyles = StyleSheet.create({
  label: { color: tokens.color.ink, fontSize: 15, fontWeight: "600" },
  headline: { fontSize: 20, fontWeight: "700", color: tokens.color.ink },
  text: {
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
  },
  secondary: {
    color: tokens.color.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 16,
    gap: 12,
    backgroundColor: tokens.color.surface,
  },
  status: { color: tokens.color.brandPrimary, fontSize: 13, fontWeight: "600" },
  price: { color: tokens.color.brandPrimary, fontSize: 19, fontWeight: "700" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 12,
    minHeight: 46,
  },
  selected: {
    borderColor: tokens.color.brandPrimary,
    backgroundColor: tokens.color.brandSurface,
  },
  choiceText: { fontSize: 14, color: tokens.color.textSecondary },
  selectedText: { color: tokens.color.brandPrimary, fontWeight: "600" },
});
