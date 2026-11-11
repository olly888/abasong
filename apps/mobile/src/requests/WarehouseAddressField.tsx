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
import type { DeliveryAnchor, WarehouseFields } from "./delivery-fields";
import { emptyWarehouse, warehouseAddressIssue } from "./delivery-fields";
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
  anchor = (_field, child) => child,
}: {
  value: WarehouseFields;
  onChange: (v: WarehouseFields) => void;
  request: ContributionRequest;
  disabled: boolean;
  anchor?: (
    field: DeliveryAnchor,
    child: React.ReactNode,
    fallback?: DeliveryAnchor[],
  ) => React.ReactNode;
}) {
  const [query, setQuery] = useState(""),
    [manual, setManual] = useState(
      () =>
        value.source === "publisher_entered" &&
        !value.confirmed &&
        Boolean(
          value.line || value.city || value.postal || value.state !== "CA",
        ),
    ),
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
        {anchor(
          "warehouseLine",
          <View style={{ gap: 8 }}>
            <Text style={s.label}>仓库地址</Text>
            <Text style={s.text}>
              {[
                value.line,
                value.city,
                [value.state, value.postal].filter(Boolean).join(" "),
              ]
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
          </View>,
          ["warehouseCity", "warehouseState", "warehousePostal"],
        )}
        {anchor(
          "warehouseConfirm",
          <ConfirmRow
            checked={value.confirmed}
            onChange={(confirmed) => onChange({ ...value, confirmed })}
            disabled={disabled || busy}
            label="确认这是本次取件地址"
          />,
        )}
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      {manual ? (
        <>
          {(
            [
              ["line", "门牌与街道", "warehouseLine"],
              ["city", "城市", "warehouseCity"],
              ["state", "州", "warehouseState"],
              ["postal", "邮编（选填）", "warehousePostal"],
            ] as const
          ).map(([k, label, id]) => (
            <View key={k}>
              {anchor(
                id,
                <Field
                  label={label}
                  value={value[k]}
                  editable={!disabled}
                  autoCapitalize={k === "state" ? "characters" : "words"}
                  maxLength={
                    k === "state"
                      ? 2
                      : k === "postal"
                        ? 10
                        : k === "city"
                          ? 100
                          : 200
                  }
                  keyboardType={
                    k === "postal" ? "numbers-and-punctuation" : "default"
                  }
                  onChangeText={(v) => {
                    setError(null);
                    onChange({
                      ...value,
                      [k]: k === "state" ? v.toUpperCase() : v,
                      confirmed: false,
                    });
                  }}
                />,
              )}
            </View>
          ))}
          <FormError message={error} />
          {anchor(
            "warehouseConfirm",
            <ActionButton
              label="使用此地址"
              variant="secondary"
              disabled={disabled}
              onPress={() => {
                const issue = warehouseAddressIssue(value);
                if (issue) return setError(issue.message);
                Keyboard.dismiss();
                setError(null);
                setManual(false);
              }}
            />,
          )}
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
          {anchor(
            "warehouseLine",
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
            />,
            [
              "warehouseCity",
              "warehouseState",
              "warehousePostal",
              "warehouseConfirm",
            ],
          )}
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
