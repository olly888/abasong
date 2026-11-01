import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { ApartmentPage, FormError } from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { dataRequest } from "../../apartments/client";
import { ListRow, SearchBox } from "../../ui/Primitives";
import { tokens } from "@abasong/ui";
type S = components["schemas"];
export default function Apartments() {
  const auth = useAuth();
  return (
    <SensitiveScreen>
      <Search key={auth.session?.user.id} />
    </SensitiveScreen>
  );
}
function Search() {
  const auth = useAuth(),
    params = useLocalSearchParams<{ apartment_id?: string }>(),
    control = useRef(new AbortController()),
    generation = useRef(0);
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<S["Apartment"][]>([]),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [searched, setSearched] = useState(false),
    [error, setError] = useState<string | null>(null);
  const choose = (id: string) =>
    router.dismissTo({ pathname: "/", params: { apartment_id: id } });
  useEffect(() => {
    control.current = new AbortController();
    if (params.apartment_id) choose(params.apartment_id);
    return () => {
      control.current.abort();
      generation.current++;
    };
  }, [params.apartment_id]);
  useEffect(() => {
    control.current.abort();
    const controller = new AbortController();
    control.current = controller;
    const version = ++generation.current;
    const session = auth.session;
    setItems([]);
    setSearched(false);
    setError(null);
    setBusy(false);
    if (!session || query.trim().length < 2) return () => controller.abort();
    const timer = setTimeout(() => {
      setBusy(true);
      void dataRequest<S["ApartmentPage"]>(
        session,
        "/v1/apartments?query=" + encodeURIComponent(query.trim()),
        { signal: controller.signal },
      )
        .then((page) => {
          if (controller.signal.aborted || version !== generation.current)
            return;
          setItems(page.items);
          setSearched(true);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted || version !== generation.current)
            return;
          setError(e instanceof Error ? e.message : "搜索失败，请重试");
        })
        .finally(() => {
          if (!controller.signal.aborted && version === generation.current)
            setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry, auth.session]);
  return (
    <ApartmentPage
      title="搜索"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SearchBox
        value={query}
        onChange={(v) => {
          generation.current++;
          control.current.abort();
          setQuery(v);
          setItems([]);
          setSearched(false);
          setBusy(false);
          setError(null);
        }}
        busy={busy}
        onSearch={() => setRetry((v) => v + 1)}
      />
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="正在搜索"
          color={tokens.color.brandPrimary}
        />
      ) : null}
      <FormError message={error} />
      {searched && !items.length && !busy ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: "600" }}>
            未找到匹配公寓
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.textMuted }}>
            试试公寓名称或门牌号
          </Text>
        </View>
      ) : null}
      {items.map((p) => (
        <ListRow
          key={p.id}
          title={p.name ?? "公寓"}
          subtitle={`${p.address_line1}, ${p.city}, ${p.state}`}
          onPress={() => choose(p.id)}
        />
      ))}
    </ApartmentPage>
  );
}
