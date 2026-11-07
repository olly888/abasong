import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  View,
} from "react-native";
import { randomUUID } from "expo-crypto";
import { tokens } from "@abasong/ui";
import { ActionButton, Field, FormError } from "../ui/Controls";
import {
  createContributionAddressSearch,
  type AddressChoices,
  type ContributionRequest,
} from "../apartments/contribution-address-search";
import type { WarehouseFields } from "./delivery-fields";
import { emptyWarehouse } from "./delivery-fields";
import { requestStyles as s } from "./RequestUi";
export function ConfirmRow({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        minHeight: 48,
      }}
    >
      <Text style={{ color: tokens.color.brandText, fontSize: 24 }}>
        {checked ? "☑" : "□"}
      </Text>
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
export function WarehouseAddressField({
  value,
  onChange,
  request,
  disabled,
}: {
  value: WarehouseFields;
  onChange: (v: WarehouseFields) => void;
  request: ContributionRequest;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(""),
    [manual, setManual] = useState(false),
    [choices, setChoices] = useState<AddressChoices | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const search = useMemo(
    () => createContributionAddressSearch(request, randomUUID, Date.now, false),
    [request],
  );
  useEffect(() => {
    if (manual || value.line || query.trim().length < 2) return;
    const timer = setTimeout(() => {
      setBusy(true);
      setError(null);
      void search
        .search(query)
        .then((r) => {
          if (r) {
            setChoices(r);
            if (r.providerUnavailable)
              setError("地址联想暂不可用，可重试或手动填写");
          }
        })
        .catch(() => setError("地址联想暂不可用，可手动填写"))
        .finally(() => setBusy(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      search.cancel();
    };
  }, [query, manual, value.line, search]);
  useEffect(() => () => search.cancel(), [search]);
  if (value.line && !manual)
    return (
      <View style={{ gap: 10 }}>
        <Text style={s.text}>
          {[value.line, value.city, value.state, value.postal]
            .filter(Boolean)
            .join(", ")}
        </Text>
        <ActionButton
          label="更换仓库地址"
          variant="text"
          disabled={disabled || busy}
          onPress={() => {
            search.cancel();
            setQuery("");
            setChoices(null);
            setError(null);
            onChange({ ...emptyWarehouse(), name: value.name });
          }}
        />
        <ConfirmRow
          checked={value.confirmed}
          onChange={(confirmed) => onChange({ ...value, confirmed })}
          disabled={disabled || busy}
          label="确认这是本次取件地址"
        />
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      {manual ? (
        <>
          {(
            [
              ["line", "门牌与街道"],
              ["city", "城市"],
              ["state", "州"],
              ["postal", "邮编"],
            ] as const
          ).map(([k, label]) => (
            <Field
              key={k}
              label={label}
              value={value[k]}
              editable={!disabled}
              autoCapitalize={k === "state" ? "characters" : "words"}
              maxLength={k === "state" ? 2 : k === "postal" ? 10 : 200}
              keyboardType={
                k === "postal" ? "numbers-and-punctuation" : "default"
              }
              onChangeText={(v) =>
                onChange({
                  ...value,
                  [k]: k === "state" ? v.toUpperCase() : v,
                  confirmed: false,
                })
              }
            />
          ))}
          <ConfirmRow
            checked={value.confirmed}
            onChange={(confirmed) => onChange({ ...value, confirmed })}
            disabled={disabled}
            label="确认这是本次取件地址"
          />
          <ActionButton
            label="改用地址搜索"
            variant="text"
            disabled={disabled}
            onPress={() => {
              setManual(false);
              setQuery("");
              setChoices(null);
              onChange({ ...emptyWarehouse(), name: value.name });
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="仓库地址"
            placeholder="门牌、街道、城市、州"
            value={query}
            editable={!disabled}
            onChangeText={(v) => {
              search.cancel();
              setQuery(v);
              setChoices(null);
              setError(null);
            }}
            autoCorrect={false}
          />
          {busy ? (
            <ActivityIndicator accessibilityLabel="正在查找仓库地址" />
          ) : null}
          {choices?.items.map((choice) =>
            choice.kind === "address" ? (
              <Pressable
                key={choice.suggestion.provider_result_id}
                accessibilityRole="button"
                disabled={disabled || busy}
                style={{
                  minHeight: 56,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: tokens.color.border,
                  gap: 4,
                }}
                onPress={() => {
                  setBusy(true);
                  setError(null);
                  Keyboard.dismiss();
                  void search
                    .retrieve(choice, choices)
                    .then((result) => {
                      if (!result) return;
                      const a = result.address;
                      if (!a?.address_line1 || !a.city || !a.state)
                        throw new Error("地址不完整，请重新选择或手动填写");
                      onChange({
                        ...value,
                        line: a.address_line1,
                        city: a.city,
                        state: a.state,
                        postal: a.postal_code ?? "",
                        source: "mapbox_suggestion",
                        confirmed: false,
                      });
                      setChoices(null);
                    })
                    .catch((e) =>
                      setError(
                        e instanceof Error ? e.message : "地址读取失败，请重试",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <Text style={s.text}>{choice.suggestion.label}</Text>
              </Pressable>
            ) : null,
          )}
          {choices?.attribution ? (
            <Text style={s.secondary}>{choices.attribution}</Text>
          ) : null}
          <FormError message={error} />
          <ActionButton
            label="手动填写地址"
            variant="text"
            disabled={disabled || busy}
            onPress={() => {
              search.cancel();
              setQuery("");
              setChoices(null);
              setError(null);
              setManual(true);
              onChange({ ...emptyWarehouse(), name: value.name });
            }}
          />
        </>
      )}
    </View>
  );
}
