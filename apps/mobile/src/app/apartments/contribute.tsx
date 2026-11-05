import { getNearbyContribution } from "../../apartments/nearby-contribution";
import { createContributionAttempt } from "../../apartments/contribution-attempt";
import { AddressLine } from "../../apartments/AddressLine";
import { locality } from "../../apartments/address-presentation";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import {
  ActionButton,
  ApartmentPage,
  Field,
  FormError,
} from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { tokens } from "@abasong/ui";
import { ListRow, SearchBox } from "../../ui/Primitives";
import { dataRequest } from "../../apartments/client";
type S = components["schemas"];
export default function Contribute() {
  const a = useAuth();
  return (
    <SensitiveScreen>
      <Content key={a.session?.user.id} />
    </SensitiveScreen>
  );
}
function Content() {
  const a = useAuth(),
    session = a.session!,
    params = useLocalSearchParams<{
      mode?: string;
      apartment_id?: string;
      nearby_key?: string;
    }>(),
    isPrivate = params.mode === "private",
    controller = useRef(new AbortController());
  const initial = useRef(
    getNearbyContribution(params.nearby_key, session.user.id),
  );
  const [newAddress, setNewAddress] = useState<S["SearchAddress"]>(
    initial.current?.address ?? {
      address_line1: "",
      city: "",
      state: "CA",
      postal_code: null,
    },
  );
  const validNew =
    !!newAddress.address_line1.trim() &&
    !!newAddress.city.trim() &&
    /^[A-Z]{2}$/.test(newAddress.state) &&
    (!newAddress.postal_code ||
      /^\d{5}(?:-\d{4})?$/.test(newAddress.postal_code));
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<S["Apartment"][]>([]),
    [target, setTarget] = useState<S["Apartment"] | null>(null),
    [address, setAddress] = useState(""),
    [value, setValue] = useState(""),
    [scope, setScope] = useState("大门"),
    [confirmed, setConfirmed] = useState(false),
    [requestedTarget, setRequestedTarget] = useState(params.apartment_id),
    [targetLoading, setTargetLoading] = useState(!!params.apartment_id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const attempt = useRef(createContributionAttempt(randomUUID));
  const targetEpoch = useRef(0);
  const locked = busy || targetLoading;
  const request = <T,>(
    path: string,
    opts: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, {
      ...opts,
      signal: controller.current.signal,
    });
  useEffect(() => {
    controller.current = new AbortController();
    attempt.current = createContributionAttempt(randomUUID);
    return () => {
      controller.current.abort();
      attempt.current.dispose();
      targetEpoch.current++;
    };
  }, []);
  function chooseTarget(item: S["Apartment"] | null) {
    targetEpoch.current++;
    setRequestedTarget(undefined);
    setTargetLoading(false);
    setTarget(item);
    setConfirmed(false);
    setError(null);
  }
  async function loadTarget(id: string) {
    const version = ++targetEpoch.current;
    setRequestedTarget(id);
    setTarget(null);
    setTargetLoading(true);
    setConfirmed(false);
    setError(null);
    try {
      const item = await request<S["Apartment"]>(
        "/v1/apartments/" + encodeURIComponent(id),
      );
      if (controller.current.signal.aborted || version !== targetEpoch.current)
        return;
      if (item.id !== id)
        throw new Error("公寓资料与所选地址不一致，请重新读取");
      setTarget(item);
    } catch (e) {
      if (!controller.current.signal.aborted && version === targetEpoch.current)
        setError(e instanceof Error ? e.message : "无法确认公寓");
    } finally {
      if (!controller.current.signal.aborted && version === targetEpoch.current)
        setTargetLoading(false);
    }
  }
  useEffect(() => {
    if (!params.apartment_id) return;
    void loadTarget(params.apartment_id);
    return () => {
      targetEpoch.current++;
    };
  }, [params.apartment_id]);

  async function search() {
    if (locked || query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const page = await request<S["ApartmentPage"]>(
        "/v1/apartments?query=" + encodeURIComponent(query),
      );
      if (controller.current.signal.aborted) return;
      setMatches(page.items);
      if (!page.items.length) setError("未找到已收录公寓；可先保存私人记录。");
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  async function submit() {
    if (
      locked ||
      (requestedTarget && !target) ||
      !value.trim() ||
      !scope.trim()
    )
      return;
    if (
      !isPrivate &&
      (!confirmed ||
        !a.me?.capabilities.includes("access.contribute") ||
        (!target && !validNew))
    )
      return;
    if (isPrivate && !target && !address.trim()) return;
    const body = isPrivate
      ? { target: target?.id ?? null, address, value, scope }
      : {
          target: target?.id ?? null,
          value,
          scope,
          confirmed,
          ...(target ? {} : { address: newAddress }),
        };
    const intent = attempt.current.begin(
      JSON.stringify({
        isPrivate,
        target: target?.id ?? null,
        address: target ? null : isPrivate ? address : newAddress,
      }),
      JSON.stringify(body),
    );
    if (!intent) return;
    setBusy(true);
    setError(null);
    let committed = false;
    try {
      if (isPrivate) {
        const entry = await request<S["LibraryEntry"]>(
          "/v1/me/apartment-library",
          {
            method: "POST",
            key: intent.entryKey,
            body: target ? { apartment_id: target.id } : { address },
          },
        );
        await request("/v1/me/apartment-library/" + entry.id + "/records", {
          method: "POST",
          key: intent.recordKey,
          body: { value, scope_label: scope },
        });
        if (controller.current.signal.aborted) return;
        committed = true;
        router.replace("/apartments/library");
      } else {
        if (!confirmed || (!target && !validNew))
          throw new Error("请核对公寓并确认共享来源");
        let registered: S["AddressContributionResult"] | undefined;
        if (!target)
          registered = await request<S["AddressContributionResult"]>(
            "/v1/apartments/address-contributions",
            {
              method: "POST",
              key: intent.recordKey,
              body: {
                address: newAddress,
                address_confirmed: true,
                method: "keypad",
                value,
                scope: { label: scope },
                source_attested: true,
              },
            },
          );
        const result =
          registered?.contribution ??
          (await request<S["ContributionResult"]>(
            "/v1/apartments/" + target!.id + "/access-records",
            {
              method: "POST",
              key: intent.recordKey,
              body: {
                method: "keypad",
                value,
                scope: { label: scope },
                source_attested: true,
              },
            },
          ));
        if (controller.current.signal.aborted) return;
        committed = true;
        setValue("");
        setConfirmed(false);
        Alert.alert(
          result.outcome === "created_pending" ? "历史贡献尚未发布" : "已共享",
          result.outcome === "same_value_validation"
            ? "已有相同密码，已记录你的贡献。"
            : undefined,
        );
        router.replace({
          pathname: "/",
          params: { apartment_id: registered?.apartment.id ?? target!.id },
        });
      }
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      attempt.current.finish(committed);
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <ApartmentPage
      title={isPrivate ? "添加私人记录" : "添加密码"}
      footer={
        <>
          <FormError message={error} />
          <ActionButton
            label={isPrivate ? "仅自己保存" : "确认共享"}
            busy={busy}
            disabled={
              !value.trim() ||
              !scope.trim() ||
              targetLoading ||
              !!(requestedTarget && !target) ||
              (!target && (isPrivate ? !address.trim() : !validNew)) ||
              (!isPrivate &&
                (!confirmed ||
                  !a.me?.capabilities.includes("access.contribute")))
            }
            onPress={() => void submit()}
          />
          {!isPrivate ? (
            <Pressable
              accessibilityRole="button"
              disabled={locked}
              accessibilityState={{ disabled: locked }}
              onPress={() =>
                router.replace("/apartments/contribute?mode=private")
              }
              style={{
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, color: tokens.color.brandPrimary }}>
                改为添加私人记录
              </Text>
            </Pressable>
          ) : null}
        </>
      }
    >
      <ActionButton
        label="从截图添加"
        secondary
        disabled={locked}
        onPress={() =>
          router.push({
            pathname: "/apartments/import",
            params: { mode: isPrivate ? "private" : "shared" },
          })
        }
      />
      {!isPrivate && !a.me?.capabilities.includes("access.contribute") ? (
        <Text>暂未开通共享资格</Text>
      ) : null}
      {target ? (
        <View style={{ gap: 12 }}>
          <AddressLine line={target.address_line1} expanded />
          <Text>
            {[locality(target), target.name].filter(Boolean).join(" · ")}
          </Text>
          <ActionButton
            label="更换公寓"
            secondary
            disabled={locked}
            onPress={() => chooseTarget(null)}
          />
        </View>
      ) : requestedTarget ? (
        <View style={{ gap: 12 }}>
          {targetLoading ? (
            <Text>正在读取公寓</Text>
          ) : (
            <ActionButton
              label="重新读取公寓"
              secondary
              onPress={() => void loadTarget(requestedTarget)}
            />
          )}
          <ActionButton
            label="选择其他公寓"
            secondary
            disabled={locked}
            onPress={() => chooseTarget(null)}
          />
        </View>
      ) : (
        <>
          <SearchBox
            value={query}
            onChange={setQuery}
            onSearch={() => void search()}
            busy={locked}
            editable={!locked}
          />
          {matches.map((p) => (
            <ListRow
              key={p.id}
              title={<AddressLine line={p.address_line1} compact />}
              subtitle={[locality(p), p.name].filter(Boolean).join(" · ")}
              disabled={locked}
              onPress={() => chooseTarget(p)}
            />
          ))}
        </>
      )}
      {!isPrivate && !target && !requestedTarget ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>核对公寓地址</Text>
          <Field
            label="门牌号与街道"
            value={newAddress.address_line1}
            onChangeText={(v) => {
              setNewAddress((x) => ({ ...x, address_line1: v }));
              setConfirmed(false);
            }}
            maxLength={200}
            editable={!locked}
          />
          <Field
            label="城市"
            value={newAddress.city}
            onChangeText={(v) => {
              setNewAddress((x) => ({ ...x, city: v }));
              setConfirmed(false);
            }}
            maxLength={100}
            editable={!locked}
          />
          <Field
            label="州"
            value={newAddress.state}
            onChangeText={(v) => {
              setNewAddress((x) => ({ ...x, state: v.toUpperCase() }));
              setConfirmed(false);
            }}
            maxLength={2}
            editable={!locked}
          />
          <Field
            label="邮编（选填）"
            value={newAddress.postal_code ?? ""}
            onChangeText={(v) => {
              setNewAddress((x) => ({ ...x, postal_code: v || null }));
              setConfirmed(false);
            }}
            maxLength={10}
            editable={!locked}
          />
        </View>
      ) : null}
      {isPrivate && !target && !requestedTarget ? (
        <Field
          label="未收录公寓的英文地址"
          value={address}
          onChangeText={setAddress}
          maxLength={300}
          editable={!locked}
        />
      ) : null}
      <Field
        label="密码"
        placeholder="保留 #、* 和开头的 0"
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setConfirmed(false);
        }}
        maxLength={32}
        editable={!locked}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label="门别"
        value={scope}
        onChangeText={(v) => {
          setScope(v);
          setConfirmed(false);
        }}
        maxLength={100}
        editable={!locked}
      />
      {!isPrivate ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed, disabled: locked }}
          disabled={locked}
          onPress={() => setConfirmed((v) => !v)}
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            minHeight: 48,
          }}
        >
          <View
            style={{
              height: 20,
              width: 20,
              borderWidth: 1.5,
              borderColor: confirmed
                ? tokens.color.brandPrimary
                : tokens.color.controlBorder,
              borderRadius: 4,
              backgroundColor: confirmed
                ? tokens.color.brandPrimary
                : tokens.color.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {confirmed ? (
              <Text style={{ color: tokens.color.onBrand, fontSize: 14 }}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 22,
              color: tokens.color.ink,
              flex: 1,
            }}
          >
            我已核对公寓，并有权共享
          </Text>
        </Pressable>
      ) : null}
    </ApartmentPage>
  );
}
