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
  async function search() {
    if (busy || query.trim().length < 2) return;
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const page = await dataRequest<S["ApartmentPage"]>(
        auth.session!,
        "/v1/apartments?query=" + encodeURIComponent(query),
        { signal: control.current.signal },
      );
      if (!control.current.signal.aborted && version === generation.current) {
        setItems(page.items);
        setSearched(true);
      }
    } catch (e) {
      if (!control.current.signal.aborted && version === generation.current)
        setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  return (
    <ApartmentPage
      title="搜索"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SearchBox
        value={query}
        onChange={(v) => {
          generation.current++;
          setQuery(v);
          setItems([]);
          setSearched(false);
          setBusy(false);
          setError(null);
        }}
        busy={busy}
        onSearch={() => void search()}
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
          <Text style={{ fontSize: 20, fontWeight: "600" }}>没有找到结果</Text>
          <Text style={{ fontSize: 14, color: tokens.color.textMuted }}>
            核对公寓名称或英文地址
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
