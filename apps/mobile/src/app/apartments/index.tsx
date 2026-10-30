import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import {
  ActionButton,
  ApartmentPage,
  FormError,
} from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { ListRow, SearchBox } from "../../ui/Primitives";
import { dataRequest } from "../../apartments/client";
type S = components["schemas"];
export default function Apartments() {
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
    params = useLocalSearchParams<{ apartment_id?: string }>(),
    controller = useRef(new AbortController()),
    generation = useRef(0);
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<S["Apartment"][]>([]),
    [selected, setSelected] = useState<S["Apartment"] | null>(null),
    [records, setRecords] = useState<S["AccessRecord"][]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [searched, setSearched] = useState(false);
  const request = <T,>(
    p: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, p, {
      ...options,
      signal: controller.current.signal,
    });
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  async function open(p: S["Apartment"]) {
    const version = ++generation.current;
    setSelected(p);
    setRecords([]);
    setLoaded(false);
    setBusy(true);
    setError(null);
    try {
      if (a.me?.capabilities.includes("access.read")) {
        const result = await request<S["AccessList"]>(
          "/v1/apartments/" + p.id + "/access-records",
        );
        if (version !== generation.current || controller.current.signal.aborted)
          return;
        setRecords(result.items);
        setLoaded(true);
      }
    } catch (e) {
      if (version === generation.current && !controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (params.apartment_id)
      void request<S["Apartment"]>("/v1/apartments/" + params.apartment_id)
        .then((p) => open(p))
        .catch((e) => setError(e instanceof Error ? e.message : "读取失败"));
  }, [params.apartment_id]);
  async function search() {
    if (busy || query.trim().length < 2) return;
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const page = await request<S["ApartmentPage"]>(
        "/v1/apartments?query=" + encodeURIComponent(query),
      );
      if (version !== generation.current || controller.current.signal.aborted)
        return;
      setItems(page.items);
      setSearched(true);
    } catch (e) {
      if (version === generation.current && !controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function feedback(
    r: S["AccessRecord"],
    value: "useful" | "not_useful",
  ) {
    const version = generation.current;
    setBusy(true);
    setError(null);
    try {
      await request("/v1/access-records/" + r.id + "/feedback", {
        method: "PUT",
        body: { client_event_id: randomUUID(), value },
      });
      if (
        selected &&
        version === generation.current &&
        !controller.current.signal.aborted
      )
        await open(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "反馈失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ApartmentPage
      title={selected?.name ?? "搜索"}
      subtitle={
        selected
          ? `${selected.address_line1}, ${selected.city}, ${selected.state}`
          : undefined
      }
      onBack={() =>
        selected
          ? (() => {
              generation.current++;
              setSelected(null);
              setRecords([]);
              setBusy(false);
            })()
          : router.canGoBack()
            ? router.back()
            : router.replace("/")
      }
    >
      <FormError message={error} />
      {selected ? (
        <>
          <ActionButton
            label="添加密码"
            disabled={busy}
            onPress={() =>
              router.push({
                pathname: "/apartments/contribute",
                params: { apartment_id: selected.id },
              })
            }
          />
          {!a.me?.capabilities.includes("access.read") ? (
            <Text>公寓资料查看资格待审核</Text>
          ) : loaded && !records.length ? (
            <Text>暂无共享密码</Text>
          ) : null}
          {records.map((r) => (
            <View
              key={r.id}
              style={{
                padding: 18,
                borderRadius: 16,
                backgroundColor: "#F3F4F6",
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36, fontWeight: "700" }}>{r.value}</Text>
              <Text>{r.scope.label ?? "大门"}</Text>
              <Text>
                {r.effective_useful ? "有用反馈 · " : ""}
                {new Date(r.contributed_at).toLocaleString()}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <ActionButton
                  label="有用"
                  secondary
                  disabled={busy}
                  onPress={() => void feedback(r, "useful")}
                />
                <ActionButton
                  label="不能用"
                  secondary
                  disabled={busy}
                  onPress={() => void feedback(r, "not_useful")}
                />
              </View>
            </View>
          ))}
          <ActionButton
            label="收藏公寓"
            secondary
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void request("/v1/me/apartment-library", {
                method: "POST",
                key: randomUUID(),
                body: { apartment_id: selected.id },
              })
                .then(() => setError("已收藏"))
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "收藏失败"),
                )
                .finally(() => setBusy(false));
            }}
          />
          <ActionButton
            label="重新读取"
            secondary
            busy={busy}
            onPress={() => void open(selected)}
          />
        </>
      ) : (
        <>
          <SearchBox
            value={query}
            onChange={(v) => {
              generation.current++;
              setQuery(v);
              setSearched(false);
              setItems([]);
              setBusy(false);
            }}
            onSearch={() => void search()}
            busy={busy}
          />
          {searched && !items.length && !busy ? (
            <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: "600" }}>
                没有找到结果
              </Text>
              <Text style={{ fontSize: 14, color: "#686C73" }}>
                核对公寓名称或英文地址
              </Text>
            </View>
          ) : null}
          {items.map((p) => (
            <ListRow
              key={p.id}
              title={p.name ?? "公寓"}
              subtitle={`${p.address_line1}, ${p.city}, ${p.state}`}
              onPress={() => void open(p)}
            />
          ))}
        </>
      )}
    </ApartmentPage>
  );
}
