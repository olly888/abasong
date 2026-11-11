import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { ListRow } from "../ui/Primitives";
import { typeStyles } from "../ui/foundation";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
import { locality } from "./address-presentation";
import {
  createContributionAddressSearch,
  privateAddressText,
  type AddressChoices,
  type ContributionAddress,
  type ContributionRequest,
} from "./contribution-address-search";
import type { SearchResult } from "./search-results";
type S = components["schemas"];
const emptyAddress = (): S["SearchAddress"] => ({
  address_line1: "",
  city: "",
  state: "CA",
  postal_code: null,
});
export function ContributionAddressField(p: {
  value: ContributionAddress;
  initialApartmentId?: string;
  initialQuery?: string;
  isPrivate: boolean;
  disabled: boolean;
  request: ContributionRequest;
  onChange: (value: ContributionAddress) => void;
  onEdit?: () => void;
}) {
  const latest = useRef(p);
  latest.current = p;
  const lookup = useRef(
    createContributionAddressSearch(
      (path, options) => latest.current.request(path, options),
      randomUUID,
    ),
  );
  const prefill = useRef<AbortController | null>(null);
  const selectionEpoch = useRef(0),
    previousMode = useRef(p.isPrivate);
  const initial = p.value.kind === "address" ? p.value.address : emptyAddress();
  const [view, setView] = useState<"search" | "manual" | "chosen">(
      p.value.kind === "pending" ? "search" : "chosen",
    ),
    [query, setQuery] = useState(p.initialQuery ?? ""),
    [draft, setDraft] = useState(initial),
    [privateDraft, setPrivateDraft] = useState(privateAddressText(p.value)),
    [choices, setChoices] = useState<AddressChoices | null>(null),
    [ambiguous, setAmbiguous] = useState<S["Apartment"][]>([]),
    [busy, setBusy] = useState(false),
    [selecting, setSelecting] = useState(false),
    [targetState, setTargetState] = useState<"none" | "loading" | "error">(
      p.initialApartmentId ? "loading" : "none",
    ),
    [error, setError] = useState<string | null>(null),
    [attribution, setAttribution] = useState(""),
    [retry, setRetry] = useState(0),
    [focus, setFocus] = useState(false);
  function changed(value: ContributionAddress, userEdit = true) {
    if (userEdit) latest.current.onEdit?.();
    latest.current.onChange(value);
  }
  function cancel() {
    selectionEpoch.current++;
    lookup.current.cancel();
    prefill.current?.abort();
    setChoices(null);
    setAmbiguous([]);
    setBusy(false);
    setSelecting(false);
    setError(null);
  }
  async function loadTarget(id: string) {
    prefill.current?.abort();
    const controller = new AbortController();
    prefill.current = controller;
    setTargetState("loading");
    setError(null);
    changed({ kind: "pending" }, false);
    try {
      const apartment = await latest.current.request<S["Apartment"]>(
        "/v1/apartments/" + encodeURIComponent(id),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (apartment.id !== id)
        throw new Error("公寓资料与所选地址不一致，请重新读取");
      changed({ kind: "apartment", apartment }, false);
      setView("chosen");
      setTargetState("none");
    } catch (e) {
      if (!controller.signal.aborted) {
        setTargetState("error");
        setError(e instanceof Error ? e.message : "无法确认公寓地址");
      }
    }
  }
  useEffect(() => {
    if (p.initialApartmentId) void loadTarget(p.initialApartmentId);
    return () => {
      prefill.current?.abort();
      lookup.current.cancel();
    };
  }, [p.initialApartmentId]);
  useEffect(() => {
    if (previousMode.current === p.isPrivate) return;
    previousMode.current = p.isPrivate;
    if (view !== "manual") return;
    if (p.isPrivate) {
      const text = privateAddressText({ kind: "address", address: draft });
      setPrivateDraft(text);
      changed({ kind: "private", address: text });
    } else {
      const next = {
        ...emptyAddress(),
        address_line1: privateDraft.split(",")[0]!.trim(),
      };
      setDraft(next);
      changed({ kind: "address", address: next });
    }
  }, [p.isPrivate]);
  useEffect(() => {
    lookup.current.cancel();
    setChoices(null);
    setBusy(false);
    if (
      view !== "search" ||
      targetState !== "none" ||
      query.trim().length < 2 ||
      p.disabled
    )
      return;
    const timer = setTimeout(() => {
      setBusy(true);
      setError(null);
      void lookup.current.search(query).then((result) => {
        if (!result) return;
        setChoices(result);
        setAttribution(result.attribution);
        setBusy(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      lookup.current.cancel();
    };
  }, [query, view, targetState, retry, p.disabled]);
  function editQuery(v: string) {
    cancel();
    setQuery(v);
    setAttribution("");
    changed({ kind: "pending" });
  }
  function chooseApartment(apartment: S["Apartment"]) {
    cancel();
    setTargetState("none");
    setAttribution("");
    changed({ kind: "apartment", apartment });
    setView("chosen");
    Keyboard.dismiss();
  }
  async function choose(item: SearchResult) {
    if (p.disabled || selecting) return;
    if (item.kind === "apartment") {
      chooseApartment(item.apartment);
      return;
    }
    if (!choices) return;
    const epoch = ++selectionEpoch.current;
    setSelecting(true);
    setError(null);
    try {
      const result = await lookup.current.retrieve(item, choices);
      if (!result || epoch !== selectionEpoch.current) return;
      setAttribution(result.attribution);
      setChoices(null);
      if (result.match_status === "matched" && result.apartments.length === 1) {
        changed({ kind: "apartment", apartment: result.apartments[0]! });
        setView("chosen");
      } else if (result.match_status === "ambiguous") {
        changed({ kind: "pending" });
        setAmbiguous(result.apartments);
        setView("search");
      } else if (result.address) {
        setDraft(result.address);
        changed({ kind: "address", address: result.address });
        setView("chosen");
      } else {
        setDraft(emptyAddress());
        changed({ kind: "pending" });
        setView("manual");
      }
      Keyboard.dismiss();
    } catch (e) {
      if (epoch === selectionEpoch.current)
        setError(e instanceof Error ? e.message : "地址暂不可用，请重试");
    } finally {
      if (epoch === selectionEpoch.current) setSelecting(false);
    }
  }
  function manual() {
    const current =
      p.value.kind === "apartment"
        ? p.value.apartment
        : p.value.kind === "address"
          ? p.value.address
          : null;
    cancel();
    setTargetState("none");
    setFocus(true);
    const next = current ?? {
      ...emptyAddress(),
      address_line1: query.split(",")[0]!.trim(),
    };
    setDraft(next);
    const text = current
      ? [current.address_line1, locality(current)].filter(Boolean).join(", ")
      : query;
    setPrivateDraft(text);
    setView("manual");
    changed(
      p.isPrivate
        ? { kind: "private", address: text }
        : { kind: "address", address: next },
    );
  }
  function changeAddress() {
    const current =
      p.value.kind === "apartment"
        ? p.value.apartment
        : p.value.kind === "address"
          ? p.value.address
          : null;
    cancel();
    setTargetState("none");
    setView("search");
    setFocus(true);
    setQuery(
      current
        ? [current.address_line1, locality(current)].filter(Boolean).join(", ")
        : privateAddressText(p.value),
    );
    setAttribution("");
    changed({ kind: "pending" });
  }
  function editPart(key: keyof S["SearchAddress"], value: string) {
    const next = {
      ...draft,
      [key]:
        key === "postal_code"
          ? value || null
          : key === "state"
            ? value.toUpperCase()
            : value,
    };
    setDraft(next);
    changed({ kind: "address", address: next });
  }
  const selected =
    p.value.kind === "apartment"
      ? p.value.apartment
      : p.value.kind === "address"
        ? p.value.address
        : null;
  return (
    <View style={{ gap: 8 }}>
      {targetState !== "none" ? (
        <>
          <Text style={typeStyles.label}>公寓地址</Text>
          {targetState === "loading" ? (
            <ActivityIndicator color={tokens.color.brandPrimary} />
          ) : (
            <ActionButton
              label="重新读取公寓"
              secondary
              disabled={p.disabled}
              onPress={() => void loadTarget(p.initialApartmentId!)}
            />
          )}
          <ActionButton
            label="更换地址"
            variant="text"
            disabled={p.disabled}
            onPress={changeAddress}
          />
        </>
      ) : view === "chosen" && selected ? (
        <>
          <Text style={typeStyles.label}>公寓地址</Text>
          <View
            style={{
              gap: 4,
              padding: 14,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: 12,
            }}
          >
            <AddressLine line={selected.address_line1} expanded compact />
            <Text style={typeStyles.secondary}>{locality(selected)}</Text>
            {p.value.kind === "apartment" && p.value.apartment.name ? (
              <Text style={typeStyles.secondary}>{p.value.apartment.name}</Text>
            ) : null}
          </View>
          <ActionButton
            label="更换地址"
            variant="text"
            disabled={p.disabled}
            onPress={changeAddress}
          />
        </>
      ) : view === "manual" ? (
        <>
          {p.isPrivate ? (
            <Field
              label="公寓英文地址"
              autoFocus={focus}
              value={privateDraft}
              editable={!p.disabled}
              onChangeText={(v) => {
                setPrivateDraft(v);
                changed({ kind: "private", address: v });
              }}
              maxLength={300}
            />
          ) : (
            <>
              <Field
                label="门牌号与街道"
                autoFocus={focus}
                value={draft.address_line1}
                editable={!p.disabled}
                onChangeText={(v) => editPart("address_line1", v)}
                maxLength={200}
                autoCorrect={false}
              />
              <Field
                label="城市"
                value={draft.city}
                editable={!p.disabled}
                onChangeText={(v) => editPart("city", v)}
                maxLength={100}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="州"
                    value={draft.state}
                    editable={!p.disabled}
                    onChangeText={(v) => editPart("state", v)}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Field
                    label="邮编（选填）"
                    value={draft.postal_code ?? ""}
                    editable={!p.disabled}
                    onChangeText={(v) => editPart("postal_code", v)}
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </>
          )}
          <ActionButton
            label="使用地址联想"
            variant="text"
            disabled={p.disabled}
            onPress={changeAddress}
          />
        </>
      ) : (
        <>
          <Field
            label="公寓地址"
            placeholder="输入门牌号和街道"
            value={query}
            onChangeText={editQuery}
            editable={!p.disabled}
            autoFocus={focus}
            autoCorrect={false}
            maxLength={200}
            returnKeyType="search"
            onSubmitEditing={() => setRetry((v) => v + 1)}
          />
          {busy || selecting ? (
            <ActivityIndicator
              accessibilityLabel={selecting ? "正在确认地址" : "正在查找地址"}
              color={tokens.color.brandPrimary}
            />
          ) : null}
          {ambiguous.length ? (
            <Text style={typeStyles.secondary}>请核对要共享的公寓</Text>
          ) : null}
          {ambiguous.map((a) => (
            <ListRow
              key={a.id}
              title={<AddressLine line={a.address_line1} compact />}
              subtitle={[locality(a), a.name].filter(Boolean).join(" · ")}
              disabled={p.disabled || selecting}
              onPress={() => chooseApartment(a)}
            />
          ))}
          {choices?.items.map((r) => (
            <ListRow
              key={
                r.kind === "apartment"
                  ? r.apartment.id
                  : r.suggestion.provider_result_id
              }
              title={
                r.kind === "apartment" ? (
                  <AddressLine line={r.apartment.address_line1} compact />
                ) : (
                  r.suggestion.title
                )
              }
              subtitle={
                r.kind === "apartment"
                  ? locality(r.apartment)
                  : r.suggestion.subtitle
              }
              disabled={p.disabled || selecting}
              onPress={() => void choose(r)}
            />
          ))}
          {choices?.localUnavailable ? (
            <Text style={typeStyles.secondary}>公寓资料暂不可用</Text>
          ) : null}
          {choices?.providerUnavailable ? (
            <Text style={typeStyles.secondary}>地址联想暂不可用</Text>
          ) : null}
          {choices &&
          !choices.items.length &&
          !choices.localUnavailable &&
          !choices.providerUnavailable ? (
            <Text style={typeStyles.secondary}>没有匹配的地址</Text>
          ) : null}
          {error ||
          choices?.localUnavailable ||
          choices?.providerUnavailable ? (
            <ActionButton
              label="重新搜索"
              variant="text"
              disabled={p.disabled || busy || selecting}
              onPress={() => setRetry((v) => v + 1)}
            />
          ) : null}
          <ActionButton
            label="手动填写完整地址"
            variant="text"
            disabled={p.disabled || selecting}
            onPress={manual}
          />
        </>
      )}
      <FormError message={error} />
      {attribution ? (
        <Text style={typeStyles.metadata}>{attribution}</Text>
      ) : null}
    </View>
  );
}
